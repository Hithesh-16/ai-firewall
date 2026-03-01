#!/usr/bin/env bash
set -euo pipefail

CA_DIR="${CA_DIR:-$(cd "$(dirname "$0")" && pwd)/certs}"
CA_KEY="$CA_DIR/ai-firewall-ca.key"
CA_CERT="$CA_DIR/ai-firewall-ca.crt"
DAYS="${CA_DAYS:-825}"
SUBJ="/CN=AI Firewall Local CA/O=AI Firewall/OU=Development"

cat <<'BANNER'
╔══════════════════════════════════════════════════╗
║        AI Firewall — CA Certificate Generator    ║
╠══════════════════════════════════════════════════╣
║  This script generates a local root CA keypair   ║
║  used for optional TLS interception (MITM proxy) ║
║  of AI provider traffic.                         ║
║                                                  ║
║  The generated CA is LOCAL ONLY.                 ║
║  No data leaves your machine.                    ║
╚══════════════════════════════════════════════════╝
BANNER

echo ""
read -rp "Do you want to proceed? [yes/no]: " CONSENT
if [[ "$CONSENT" != "yes" ]]; then
  echo "Aborted."
  exit 0
fi

mkdir -p "$CA_DIR"

if [[ -f "$CA_KEY" ]]; then
  echo ""
  echo "WARNING: CA key already exists at $CA_KEY"
  read -rp "Overwrite? [yes/no]: " OVERWRITE
  if [[ "$OVERWRITE" != "yes" ]]; then
    echo "Keeping existing CA. Exiting."
    exit 0
  fi
fi

echo ""
echo "Generating CA private key..."
openssl genrsa -out "$CA_KEY" 4096

echo "Generating CA certificate (valid for $DAYS days)..."
openssl req -new -x509 -key "$CA_KEY" -out "$CA_CERT" -days "$DAYS" -subj "$SUBJ"

echo ""
echo "CA generated successfully:"
echo "  Key:  $CA_KEY"
echo "  Cert: $CA_CERT"
echo ""
echo "Next steps:"
echo "  macOS:  ./install-ca-macos.sh"
echo "  Linux:  ./install-ca-linux.sh"
