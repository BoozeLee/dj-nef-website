#!/bin/bash
# Cloud-init: bootstrap Docker + NVIDIA drivers on GPU VPS
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive

# Update and install essentials
apt-get update
apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    htop \
    jq \
    unzip \
    ufw \
    python3-pip

# Install Docker
apt-get remove -y docker docker-engine docker.io containerd runc || true
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
sudo -i
sub menu
apt-get update

# Install NVIDIA drivers
if ! nvidia-smi &> /dev/null; then
    apt-get install -y nvidia-driver-535
    apt-get install -y nvidia-utils-535
fi

# Enable services
systemctl enable docker
systemctl start docker

# Configure firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 8000/tcp
ufw allow 11434/tcp
ufw --force enable

# Create app directory
mkdir -p /opt/nefke
chown -R 1000:1000 /opt/nefke

echo "GPU VPS bootstrap complete" > /tmp/cloud-init-done
