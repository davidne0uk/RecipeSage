#!/usr/bin/env bash
# Bootstraps a fresh Raspberry Pi OS Lite (64-bit) install as a pantry
# scanner station: Docker, host packages for the webcam scanner, and the
# Grocy + Barcode Buddy station stack. Idempotent — safe to re-run.
set -euo pipefail

echo "==> Updating system packages"
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

echo "==> Installing host packages (git, curl, jq, zbar, sox, alsa)"
sudo apt-get install -y git curl jq zbar-tools sox alsa-utils

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
sudo usermod -aG docker "$USER"

echo "==> Starting station stack (Grocy + Barcode Buddy)"
cd "$(dirname "$0")"
sudo docker compose -f docker-compose.station.yml up -d

echo
echo "Done. Next steps:"
echo "  1. Grocy:          http://$(hostname).local:9283  (admin/admin - change it)"
echo "     Create an API key (wrench icon > Manage API keys), then:"
echo "       echo 'GROCY_API_KEY=<key>' > .env"
echo "       sudo docker compose -f docker-compose.station.yml up -d barcodebuddy"
echo "  2. Seed locations: GROCY_URL=http://localhost:9283/ GROCY_API_KEY=<key> ./seed-grocy.sh"
echo "  3. Barcode Buddy:  http://$(hostname).local:9284  (create its API key under API menu)"
echo "  4. Webcam scanner: BBUDDY_URL=http://localhost:9284/ BBUDDY_API_KEY=<key> ./scan-webcam.sh"
