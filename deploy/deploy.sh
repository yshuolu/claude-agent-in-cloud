#!/usr/bin/env bash
set -euo pipefail

# Deploy to GCP VM via SSH
# Usage: ./deploy/deploy.sh [--build]
#
# Prerequisites on VM: docker, docker compose, git

VM_IP="34.135.237.167"
VM_USER="${VM_USER:-darren_lu}"
REMOTE_DIR="/home/${VM_USER}/claude-agent-in-cloud"
COMPOSE_FILE="docker/docker-compose.prod.yml"

BUILD_FLAG=""
if [[ "${1:-}" == "--build" ]]; then
  BUILD_FLAG="--build"
fi

echo "=== Deploying to ${VM_IP} ==="

# Sync project files (exclude node_modules, dist, .git)
echo "--- Syncing files ---"
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.git' \
  --exclude 'ts/data' \
  --exclude '.sl' \
  ./ "${VM_USER}@${VM_IP}:${REMOTE_DIR}/"

# Build and start on remote
echo "--- Starting services ---"
ssh "${VM_USER}@${VM_IP}" bash -s <<EOF
cd ${REMOTE_DIR}

# Build agent image first (needed by server at runtime)
docker compose -f ${COMPOSE_FILE} build ${BUILD_FLAG} agent-py

# Start server + web
docker compose -f ${COMPOSE_FILE} up -d ${BUILD_FLAG} server web

echo "--- Done ---"
docker compose -f ${COMPOSE_FILE} ps
EOF

echo ""
echo "=== Deployed to http://${VM_IP} ==="
