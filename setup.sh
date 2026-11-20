#!/bin/bash
set -euo pipefail

# 1. Install Docker runtime
apt-get update
apt-get install -y docker.io

# 2. Start and enable Docker service
systemctl start docker
systemctl enable docker

# 3. Pull container image from GitHub Container Registry
docker pull ghcr.io/basavarajmuttagi/hono-url-shortner:latest

# 4. Fetch secrets into RAM tmpfs (zero physical disk writes)
gcloud secrets versions access latest --secret="hono-env" > /dev/shm/hono.env
chmod 600 /dev/shm/hono.env

# 5. Launch container with secrets from RAM
docker run -d \
  --name hono-app \
  --restart=always \
  --network=host \
  --env-file /dev/shm/hono.env \
  ghcr.io/basavarajmuttagi/hono-url-shortner:latest

# 6. Immediately wipe secrets from RAM once Docker has ingested them
rm -f /dev/shm/hono.env
