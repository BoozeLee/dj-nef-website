terraform {
  required_version = ">= 1.15.0"
  required_providers {
    runpod = {
      source  = "RunPod/runpod"
      version = "~> 1.9"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

locals {
  gpu_map = {
    "l4"   = "NVIDIA RTX A5000"
    "h100" = "NVIDIA H100 PCIe"
  }
}
