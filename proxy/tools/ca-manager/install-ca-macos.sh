#!/usr/bin/env bash
set -euo pipefail

CA_DIR="${CA_DIR:-$(cd "$(dirname "$0")" && pwd)/certs}"
CA_CERT="$CA_DIR/ai-firewall-ca.crt"

cat <<'BANNER'
╔══════════════════════════════════════════════════╗
║   AI Firewall — Install CA on macOS Keychain     ║
╠══════════════════════════════════════════════════╣
║  This will add the AI Firewall CA certificate    ║
║  to your macOS System Keychain as a trusted      ║
║  root certificate.                               ║
║                                                  ║
║  Requires sudo (Keychain modification).          ║
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
echo ""
read -rp "Do you want to trust this CA certificate? [yes/no]: " CONSENT
if [[ "$CONSENT" != "yes" ]]; then
  echo "Aborted."
  exit 0
fi

echo "Installing to System Keychain (requires sudo)..."
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$CA_CERT"

echo ""
echo "CA certificate installed and trusted on macOS."
echo "To remove: ./uninstall-ca-macos.sh"
