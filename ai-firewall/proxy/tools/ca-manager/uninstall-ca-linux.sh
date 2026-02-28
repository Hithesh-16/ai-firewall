#!/usr/bin/env bash
set -euo pipefail

SYSTEM_CERT="/usr/local/share/ca-certificates/ai-firewall-ca.crt"

cat <<'BANNER'
╔══════════════════════════════════════════════════╗
║  AI Firewall — Remove CA from Linux              ║
╠══════════════════════════════════════════════════╣
║  This removes the AI Firewall root CA from       ║
║  the system certificate store.                   ║
║                                                  ║
║  Requires sudo.                                  ║
╚══════════════════════════════════════════════════╝
BANNER

echo ""
read -rp "Remove the AI Firewall CA from Linux trust store? [yes/no]: " CONSENT
if [[ "$CONSENT" != "yes" ]]; then
  echo "Aborted."
  exit 0
fi

if [[ ! -f "$SYSTEM_CERT" ]]; then
  echo "AI Firewall CA not found at $SYSTEM_CERT. Nothing to remove."
  exit 0
fi

echo "Removing certificate (requires sudo)..."
sudo rm -f "$SYSTEM_CERT"

echo "Updating system certificate store..."
if command -v update-ca-certificates &>/dev/null; then
  sudo update-ca-certificates --fresh
elif command -v update-ca-trust &>/dev/null; then
  sudo update-ca-trust extract
else
  echo "WARNING: Could not find update-ca-certificates or update-ca-trust."
fi

echo ""
echo "AI Firewall CA removed from Linux trust store."
