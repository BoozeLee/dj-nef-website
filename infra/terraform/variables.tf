variable "cloud" {
  type        = string
  default     = "runpod"

  validation {
    condition     = contains(["runpod", "scaleway", "vultr"], var.cloud)
    error_message = "Invalid cloud provider. Must be one of: runpod, scaleway, vultr."
  }
}

variable "gpu_type" {
  type        = string
  default     = "l4"

  validation {
    condition     = contains(["l4", "h100"], var.gpu_type)
    error_message = "Invalid GPU type. Must be one of: l4, h100."
  }
}

variable "gpu_count" {
  type        = number
  default     = 1
  description = "Number of GPU instances to provision."
}

variable "ssh_key_name" {
  type        = string
  default     = ""
  description = "Name of SSH key pair for root access (must exist in RunPod)."
}

variable "hf_token" {
  type        = string
  default     = ""
  description = "HuggingFace API token for gated model access and uploads."
  sensitive   = true
}

variable "region" {
  type        = string
  default     = "US-CA-1"
  description = "Region for the GPU VPS. Defaults to 'US-CA-1' for RunPod."
}

variable "runpod_api_key" {
  type        = string
  default     = ""
  description = "RunPod API key (required for RunPod)."
  sensitive   = true
}

variable "vultr_api_key" {
  type        = string
  default     = ""
  description = "Vultr API key (required for Vultr)."
  sensitive   = true
}

variable "scaleway_access_key" {
  type        = string
  default     = ""
  description = "Scaleway access key (required for Scaleway)."
  sensitive   = true
}

variable "scaleway_secret_key" {
  type        = string
  default     = ""
  description = "Scaleway secret key (required for Scaleway)."
  sensitive   = true
}

variable "scaleway_project_id" {
  type        = string
  default     = ""
  description = "Scaleway project ID for deployment."
}
