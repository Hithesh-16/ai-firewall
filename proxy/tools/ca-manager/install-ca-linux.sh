#!/usr/bin/env bash
set -euo pipefail

CA_DIR="${CA_DIR:-$(cd "$(dirname "$0")" && pwd)/certs}"
CA_CERT="$CA_DIR/ai-firewall-ca.crt"
SYSTEM_CERT_DIR="/usr/local/share/ca-certificates"

cat <<'BANNER'
╔══════════════════════════════════════════════════╗
║   AI Firewall — Install CA on Linux              ║
╠══════════════════════════════════════════════════╣
║  This will copy the AI Firewall CA certificate   ║
║  to the system trust store and update the        ║
║  certificate bundle.                             ║
║                                                  ║
║  Requires sudo.                                  ║
║  You can remove it anytime with uninstall.       ║
╚══════════════════════════════════════════════════╝
BANNER

if [[ ! -f "$CA_CERT" ]]; then
  echo "ERROR: CA certificate not found at $CA_CERT"
  echo "Run generate-ca.sh first."
  exit 1
fi

echo ""
echo "Certificate to install: $CA_CERT"
echo "Destination: $SYSTEM_CERT_DIR/ai-firewall-ca.crt"
echo ""
read -rp "Do you want to trust this CA certificate? [yes/no]: " CONSENT
if [[ "$CONSENT" != "yes" ]]; then
  echo "Aborted."
  exit 0
fi

echo "Copying certificate (requires sudo)..."
sudo mkdir -p "$SYSTEM_CERT_DIR"
sudo cp "$CA_CERT" "$SYSTEM_CERT_DIR/ai-firewall-ca.crt"

echo "Updating system certificate store..."
if command -v update-ca-certificates &>/dev/null; then
  sudo update-ca-certificates
elif command -v update-ca-trust &>/dev/null; then
  sudo update-ca-trust extract
else
  echo "WARNING: Could not find update-ca-certificates or update-ca-trust."
  echo "You may need to manually update your certificate store."
fi

echo ""
echo "CA certificate installed on Linux."
echo "To remove: ./uninstall-ca-linux.sh"
