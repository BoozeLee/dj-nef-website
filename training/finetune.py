#!/usr/bin/env python3
"""
QLoRA fine-tune nvidia/Nemotron-Research-Reasoning-Qwen-1.5B on Nefke personality dataset.
Produces a GGUF file ready for llama.cpp.

Usage:
    export HUGGINGFACE_TOKEN=your_token_here  # optional, for gated models
    python finetune.py                         # fine-tune
    python finetune.py --convert-only          # just convert existing adapter to GGUF
    python finetune.py --gguf-only            # skip training, convert existing

Requires: pip install -r requirements.txt
          A GPU with >=8GB VRAM (your GTX 1080 works with --load-in-4bit)
"""

import os
import sys
import json
import argparse
import subprocess
from pathlib import Path

import torch
from datasets import Dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTTrainer

MODEL_ID = "nvidia/Nemotron-Research-Reasoning-Qwen-1.5B"
DATASET_PATH = Path(__file__).parent / "nefke_dataset_full.jsonl"
OUTPUT_DIR = Path(__file__).parent / "nefke-lora-adapter"
GGUF_OUTPUT = Path(__file__).parent / "nefke-gguf" / "nefke-q4_k_m.gguf"

def format_example(example):
    msgs = example["messages"]
    system = msgs[0]["content"]
    user = msgs[1]["content"]
    assistant = msgs[2]["content"]

    if "Nemotron" in MODEL_ID or "Qwen" in MODEL_ID:
        text = f"<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n{assistant}<|im_end|>"
    else:
        text = f"<s>[INST] <<SYS>>\n{system}\n<</SYS>>\n\n{user} [/INST] {assistant} </s>"

    return {"text": text}


def load_dataset(path):
    examples = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                examples.append(json.loads(line))

    formatted = [format_example(ex) for ex in examples]
    dataset = Dataset.from_list(formatted)
    return dataset, examples


def get_tokenizer():
    tokenizer = AutoTokenizer.from_pretrained(
        MODEL_ID,
        trust_remote_code=True,
        use_fast=False,
    )
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"
    return tokenizer


def get_model():
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
    )

    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
        torch_dtype=torch.bfloat16,
    )

    model = prepare_model_for_kbit_training(model)
    model.gradient_checkpointing_enable()

    return model


def get_lora_config():
    return LoraConfig(
        r=16,
        lora_alpha=32,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )


def train(args):
    print(f"🚀 Loading dataset from {DATASET_PATH}")
    dataset, raw = load_dataset(DATASET_PATH)
    print(f"   {len(dataset)} training examples")

    print(f"📦 Loading model: {MODEL_ID}")
    tokenizer = get_tokenizer()
    model = get_model()
    lora_config = get_lora_config()

    split = dataset.train_test_split(test_size=0.05, seed=42)
    train_dataset = split["train"]
    eval_dataset = split["test"]

    training_args = TrainingArguments(
        output_dir=str(OUTPUT_DIR),
        per_device_train_batch_size=4,
        per_device_eval_batch_size=4,
        gradient_accumulation_steps=4,
        num_train_epochs=3,
        learning_rate=2e-4,
        logging_steps=10,
        save_strategy="epoch",
        evaluation_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True,
        bf16=True,
        tf32=True,
        optim="adamw_8bit",
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        report_to="none",
        remove_unused_columns=False,
        dataloader_num_workers=2,
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        max_seq_length=1024,
        dataset_text_field="text",
        packing=False,
    )

    print("🏋️  Starting training (GTX 1080 ~2-4 hours)...")
    trainer.train()

    print(f"💾 Saving LoRA adapter to {OUTPUT_DIR}")
    trainer.save_model(str(OUTPUT_DIR))
    tokenizer.save_pretrained(str(OUTPUT_DIR))

    print("✅ Fine-tuning complete!")


def merge_and_convert(args):
    print("🔄 Merging LoRA adapter with base model...")

    merge_dir = OUTPUT_DIR / "merged"
    merge_script = """
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
import sys

base = "{model_id}"
adapter = "{adapter}"
out = "{out_dir}"

print("Loading base model in 8-bit for merge...")
tokenizer = AutoTokenizer.from_pretrained(base, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(
    base,
    torch_dtype=torch.bfloat16,
    device_map="auto",
    trust_remote_code=True,
)

print("Loading LoRA adapter...")
model = PeftModel.from_pretrained(model, adapter)

print("Merging...")
model = model.merge_and_unload()

print(f"Saving to {{out}}...")
model.save_pretrained(out)
tokenizer.save_pretrained(out)
print("Merge complete!")
""".format(
        model_id=MODEL_ID,
        adapter=str(OUTPUT_DIR),
        out_dir=str(merge_dir),
    )

    os.makedirs(str(merge_dir), exist_ok=True)
    subprocess.run([sys.executable, "-c", merge_script], check=True)

    print(f"📦 Merged model saved to {merge_dir}")

    print("🔄 Converting to GGUF (Q4_K_M)...")
    gguf_dir = GGUF_OUTPUT.parent
    os.makedirs(str(gguf_dir), exist_ok=True)

    cmd = [
        sys.executable, "-m", "llama_cpp.convert",
        "--outtype", "q4_k_m",
        "--output", str(GGUF_OUTPUT),
        str(merge_dir),
    ]

    try:
        subprocess.run(cmd, check=True)
        print(f"✅ GGUF saved to {GGUF_OUTPUT}")
        print(f"   Size: {GGUF_OUTPUT.stat().st_size / 1024 / 1024:.1f} MB")
    except FileNotFoundError:
        print("⚠️  llama.cpp convert script not found. Install with: pip install llama-cpp-python")
        print("   Or manually convert using llama.cpp's convert.py script:")
        print(f"   python llama.cpp/convert.py {merge_dir} --outtype q4_k_m --outfile {GGUF_OUTPUT}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--convert-only", action="store_true", help="Skip training, just merge+convert")
    parser.add_argument("--gguf-only", action="store_true", help="Skip training and merge, convert existing merged model")
    parser.add_argument("--dataset", default=str(DATASET_PATH))
    parser.add_argument("--output-dir", default=str(OUTPUT_DIR))
    args = parser.parse_args()

    if args.gguf_only:
        merge_and_convert(args)
        return

    if not args.convert_only:
        if not os.path.exists(args.dataset):
            print(f"Dataset not found: {args.dataset}")
            print("Run expand_dataset.py first to generate the full dataset.")
            sys.exit(1)

        train(args)

    if args.convert_only or not args.convert_only:
        merge_and_convert(args)

    print("\n✨ All done! Your fine-tuned Nefke model is ready.")
    print(f"   GGUF: {GGUF_OUTPUT}")
    print("   Upload to HuggingFace with:")
    print(f"     huggingface-cli upload your-username/nefke-nemotron-1.5b {GGUF_OUTPUT.parent}")
    print("   Or serve locally with:")
    print(f"     cd ../serve && docker compose up")


if __name__ == "__main__":
    main()
