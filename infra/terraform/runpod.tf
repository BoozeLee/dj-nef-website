# RunPod GPU Pod for DJ NEFKE inference stack
# Uses community provider: terraform init -upgrade

resource "runpod_pod" "nefke" {
  count        = var.gpu_count
  name         = "nefke-inference-${count.index + 1}"
  gpu_type_id  = var.gpu_type == "l4" ? "NVIDIA RTX A5000" : "NVIDIA H100 PCIe"
  image_name   = "runpod/pytorch:2.2-py3.11-cuda12.1-devel-ubuntu22.04"
  env          = "{\"HF_TOKEN\": \"${var.hf_token}\", \"OLLAMA_HOST\": \"0.0.0.0:11434\"}"
  ports        = "8000/http,11434/http,22/tcp"
  volume_mount_path  = "/workspace"
}

# Exposed outputs
output "vps_ip" {
  description = "Public IP of the GPU VPS"
  value       = runpod_pod.nefke[0].runtime.ports[0].ip
}

output "vps_id" {
  description = "RunPod pod ID"
  value       = runpod_pod.nefke[0].id
}

output "ssh_command" {
  description = "SSH command to connect to the VPS"
  value       = "ssh root@${runpod_pod.nefke[0].runtime.ports[0].ip} -p ${runpod_pod.nefke[0].runtime.ports[2].publicPort}"
}

output "api_url" {
  description = "FastAPI gateway URL"
  value       = "http://${runpod_pod.nefke[0].runtime.ports[0].ip}:8000"
}
