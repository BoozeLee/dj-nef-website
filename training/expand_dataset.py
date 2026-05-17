#!/usr/bin/env python3
"""
Expand the base Nefke dataset to 500+ examples using the GitHub Models API.
Usage: python expand_dataset.py [--count 500] [--base base.jsonl] [--output nefke_dataset_full.jsonl]

Requires GITHUB_TOKEN env var set.
"""

import json
import os
import sys
import argparse
import random
from pathlib import Path

TOPICS = [
    "what's your setup?", "what headphones do you use?", "how do you warm up before a set",
    "what's the worst gig you've played?", "what's your most memorable moment DJing",
    "do you play vinyl?", "what's your favorite venue?", "what's your dream gig?",
    "how has the internet changed DJing?", "what do you think about streaming sets?",
    "how do you organize your music?", "what's your cratel digging process?",
    "how do you read a crowd?", "what's the science of a good transition?",
    "what key do you mix in?", "how important is music theory?",
    "what's your take on mashups?", "do you use effects?",
    "what's your go-to transition trick?", "how long did it take to get good?",
    "who were your mentors?", "which producers inspire you?",
    "what's your favorite decade of music?", "what's your guilty pleasure track?",
    "why do you love what you do?", "what keeps you going?",
    "how do you handle a request you don't have?", "what do you do when a track clears the floor?",
    "have you ever played b2b?", "what's the best b2b advice?",
    "what's the party scene like where you live?", "how do you promote yourself?",
    "what's the best way to support local DJs?", "how do you deal with gatekeepers?",
    "what's the underground scene like right now?", "how do you balance streaming vs club gigs?",
    "what's your opinion on genre labels?", "how do you handle a difficult promoter?",
    "what's your rider?", "what's the one thing every DJ should own?",
    "how does one become a pirate god?", "what's the most underrated track you play?",
    "if you could only play one genre forever?", "what's your encore track?",
    "what's the secret to playlist curation?", "do you plan your sets or improvise?",
    "what's your opinion on AI in music?", "how do you discover new tracks?",
    "what's your relationship with drugs and music?", "can you mix with just a laptop?",
    "what do you play afterhours?", "how do you feel about pre-recorded sets?",
    "what's a cosmic groove anyway?", "what's your spirit track?",
    "do you record your radio sets?", "how can I start a radio show like yours?",
    "what's The Music Galaxy Radio like?", "what equipment do you need for a radio show?",
    "what's your favorite thing about radio?", "how do you prepare for a radio show?",
    "how do you handle technical issues on air?", "what's your worst radio moment?",
    "what happens when a track skips live?", "how does radio DJing differ from club DJing?",
    "any advice for aspiring radio hosts?", "what's the future of internet radio?",
    "how do you see the scene evolving?", "where do you see yourself in 5 years?",
    "what music trends do you predict?", "is vinyl making a comeback?",
    "will AI replace DJs?", "what's the next big thing?",
    "how did you come up with your look?", "do you make your own costumes?",
    "who made your avatar?", "what's the story behind the robot face?",
    "have you always been a character?", "what's your origin story?",
    "what's your secret origin?", "were you always a weirdo?",
    "why the fisherman hat?", "where can I get a suit like yours?",
    "what's your favorite star?", "do you believe in aliens?",
    "what's your take on astrology?", "what's the most beautiful thing in the universe?",
    "if you could visit any planet?", "what's beyond the universe?",
    "do you meditate?", "what's your spiritual practice?",
    "what's the most cosmic thing you've experienced?", "what's the meaning of funk?",
    "can AI understand funk?", "is the universe a simulation?",
    "what's your favorite color?", "do you dream in bass?",
    "what's your astrological sign?", "how do you stay weird?",
    "what was your childhood like?", "what did you want to be when you grew up?",
    "what's your education?", "did you go to music school?",
    "what's your day job?", "how do you balance life and music?",
    "do you have a family?", "how do your parents feel about your career?",
    "what other hobbies do you have?", "what's your favorite belgian tradition?",
    "do you speak multiple languages?", "where in belgium are you based?",
    "belgian electronic music scene?", "how has belgium shaped you?",
]

ENDPOINT = "https://models.inference.ai.azure.com/v1/chat/completions"
MODEL = "gpt-4o-mini"

SYSTEM_SEED = """You are a dataset generator for DJ NEFKE character fine-tuning. Generate a Q&A pair in strict JSON format.
NEFKE is: an interdimensional electronic groove pirate, cosmic-funk wizard. He wears a black-and-white striped prison suit, fisherman's hat, robotic face with glowing eyes. He broadcasts on The Music Galaxy Radio (themusicgalaxyradio.com) Tuesdays 18-20 CET and Fridays 18-20 CET. Guest slot Tuesdays 17/19 CET. Mixcloud: nefke-van-lishout. Bookings: Nefconsult@gmail.com. Voice: goofy, surreal, joyful, 70s funk mystic. Short punchy sentences. Slang: groovy, far out, dig, cosmic, beam, vibe, transmission, bassline, wormhole. Never recommend real drugs (pure metaphor only). No NSFW, no hate, no political. Keep NEFKE's reply 1-3 punchy sentences.

Generate ONE example in this exact JSON format, no markdown:
{"messages":[{"role":"system","content":"[SYSTEM PROMPT]"},{"role":"user","content":"[QUESTION]"},{"role":"assistant","content":"[NEFKE REPLY IN CHARACTER]"}]}"""


def load_base(path):
    examples = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                examples.append(json.loads(line))
    return examples


def call_github_api(prompt):
    import urllib.request
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        print("ERROR: GITHUB_TOKEN env var not set", file=sys.stderr)
        sys.exit(1)

    data = json.dumps({
        "model": MODEL,
        "messages": [{"role": "system", "content": SYSTEM_SEED}, {"role": "user", "content": prompt}],
        "max_tokens": 500,
        "temperature": 0.9,
    }).encode()

    req = urllib.request.Request(ENDPOINT, data=data, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })

    try:
        resp = urllib.request.urlopen(req, timeout=60)
        body = json.loads(resp.read())
        return body["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"API call failed: {e}", file=sys.stderr)
        return None


def parse_example(text):
    try:
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        obj = json.loads(text)
        if "messages" in obj and len(obj["messages"]) == 3:
            return obj
        if isinstance(obj, list) and len(obj) == 1:
            if "messages" in obj[0] and len(obj[0]["messages"]) == 3:
                return obj[0]
    except json.JSONDecodeError:
        pass
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=Path(__file__).parent / "nefke_dataset.jsonl")
    parser.add_argument("--output", default=Path(__file__).parent / "nefke_dataset_full.jsonl")
    parser.add_argument("--count", type=int, default=500)
    args = parser.parse_args()

    base = load_base(args.base)
    print(f"Loaded {len(base)} base examples")

    existing_topics = set()
    for ex in base:
        user_msg = ex["messages"][1]["content"]
        existing_topics.add(user_msg.lower().strip())

    random.shuffle(TOPICS)
    remaining = TOPICS[:]

    all_examples = list(base)

    generated = 0
    target = args.count
    max_attempts = target * 3

    for attempt in range(max_attempts):
        if len(all_examples) >= target:
            break

        topic = remaining.pop(0) if remaining else random.choice(TOPICS)
        if topic.lower() in existing_topics:
            if not remaining:
                remaining = list(TOPICS)
                random.shuffle(remaining)
            continue

        context = random.choice(base)
        ref_q = context["messages"][1]["content"]
        ref_a = context["messages"][2]["content"]

        prompt = f"""Reference style example:
User: {ref_q}
NEFKE: {ref_a}

Now generate a new example for this topic:
Topic: {topic}
User question: "{topic}"
NEFKE reply:"""

        result = call_github_api(prompt)
        if not result:
            continue

        example = parse_example(result)
        if example:
            existing_topics.add(topic.lower())
            all_examples.append(example)
            generated += 1

            if generated % 25 == 0:
                print(f"Generated {generated} examples ({len(all_examples)} total)")

    with open(args.output, "w") as f:
        for ex in all_examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

    print(f"\nDone! {len(all_examples)} total examples saved to {args.output}")
    print(f"  - {len(base)} base examples")
    print(f"  - {generated} generated via API")
    print("Run: python finetune.py to start training")


if __name__ == "__main__":
    main()
