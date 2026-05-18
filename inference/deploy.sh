#!/bin/bash
# deploy.sh — Deploy DJ NEFKE inference stack to GPU VPS
# Usage: ./deploy.sh [plan|apply|destroy|status]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="${SCRIPT_DIR}/../../infra/terraform"
ANSIBLE_DIR="${SCRIPT_DIR}/../../infra/ansible"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log() {
    echo -e "${CYAN}[DEPLOY]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Read secrets from local files
read_secret() {
    local path="$1"
    if [[ -f "${PROJECT_ROOT}/${path}" ]]; then
        cat "${PROJECT_ROOT}/${path}"
    else
        echo ""
    fi
}

# Validate tooling
check_tools() {
    log "Checking required tools..."
    for tool in terraform ansible; do
        if ! command -v "$tool" &> /dev/null; then
            error "Missing tool: $tool. Install with: pip install ansible terraform"
        fi
    done
}

# Terraform plan/plan
plan() {
    log "Planning Terraform infrastructure..."
    cd "${INFRA_DIR}"
    terraform init
    terraform plan -out=tfplan
}

# Terraform apply
apply() {
    log "Applying Terraform infrastructure..."
    cd "${INFRA_DIR}"
    if [[ ! -f "tfplan" ]]; then
        terraform plan -out=tfplan
    fi
    terraform apply tfplan
    log "Terraform apply complete."
}

# Extract outputs from Terraform
get_output() {
    local key="$1"
    cd "${INFRA_DIR}"
    terraform output -raw "$key" 2>/dev/null || true
}

# Deploy inference stack via Ansible
ansible_deploy() {
    local vps_ip
    vps_ip=$(get_output "vps_ip")
    if [[ -z "$vps_ip" ]]; then
        error "VPS IP not found. Run 'terraform apply' first."
    fi

    log "Deploying inference stack to ${vps_ip}..."

    # Write inventory
    echo "[nefke_vps]" > "${ANSIBLE_DIR}/inventory.ini"
    echo "${vps_ip} ansible_user=root ansible_ssh_private_key_file=~/.ssh/id_rsa" >> "${ANSIBLE_DIR}/inventory.ini"

    # Run Ansible
    cd "${ANSIBLE_DIR}"
    ansible-playbook -i inventory.ini deploy-inference.yml --private-key ~/.ssh/id_rsa
}

# Show status
status() {
    local vps_ip api_url
    vps_ip=$(get_output "vps_ip")
    api_url=$(get_output "api_url")
    
    log "VPS IP: ${vps_ip:-unknown}"
    log "API URL: ${api_url:-unknown}"
    
    if [[ -n "$api_url" ]]; then
        curl -s "${api_url}/healthz" 2>/dev/null | jq . || warn "Cannot reach /healthz"
    fi
}

# Destroy
destroy() {
    log "Destroying infrastructure..."
    cd "${INFRA_DIR}"
    terraform destroy -auto-approve
}

# Update vercel.json
update_vercel_json() {
    local vps_ip
    vps_ip=$(get_output "vps_ip")
    if [[ -z "$vps_ip" ]]; then
        warn "VPS IP not available, skipping vercel.json update"
        return
    fi

    log "Updating vercel.json with VPS IP: ${vps_ip}"
    
    cat > "${PROJECT_ROOT}/vercel.json" << EOF
{
  "\$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "functions": {
    "api/chat.ts": {
      "maxDuration": 60
    }
  },
  "routes": [
    {
      "src": "/api/chat",
      "dest": "http://${vps_ip}:8000/chat"
    }
  ]
}
EOF
    
    log "vercel.json updated. Commit and push to deploy."
}

# Main
main() {
    local cmd="${1:-help}"

    case "$cmd" in
        plan)
            check_tools
            plan
            ;;
        apply)
            check_tools
            apply
            ansible_deploy
            update_vercel_json
            status
            ;;
        destroy)
            check_tools
            read -rp "Are you sure? This deletes the GPU VPS! [y/N] " confirm
            if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
                destroy
            else
                log "Cancelled."
            fi
            ;;
        status)
            status
            ;;
        update-vercel)
            update_vercel_json
            ;;
        help|*)
            cat << 'EOF'
Usage: ./deploy.sh <command>

Commands:
  plan          Show what Terraform would do (dry run)
  apply         Provision VPS and deploy inference stack
  destroy       Tear down all infrastructure
  status        Show current status
  update-vercel Update vercel.json with VPS IP
  help          Show this help message

Prerequisites:
  - terraform, ansible installed
  - ~/.ssh/id_rsa (or specify via SSH_KEY env var)
  - RunPod API key in RUNPOD_API_KEY env var
  - HF_TOKEN env var set (for gated model access)

Examples:
  export RUNPOD_API_KEY="your-key-here"
  export HF_TOKEN="your-hf-token-here"
  ./deploy.sh plan
  ./deploy.sh apply
EOF
            ;;
    esac
}

main "$@"
