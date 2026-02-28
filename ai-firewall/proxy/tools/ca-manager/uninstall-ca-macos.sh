#!/usr/bin/env bash
set -euo pipefail

cat <<'BANNER'
╔══════════════════════════════════════════════════╗
║  AI Firewall — Remove CA from macOS Keychain     ║
╠══════════════════════════════════════════════════╣
║  This removes the AI Firewall root CA from       ║
║  your System Keychain.                           ║
║                                                  ║
║  Requires sudo.                                  ║
╚══════════════════════════════════════════════════╝
BANNER

echo ""
read -rp "Remove the AI Firewall CA from macOS Keychain? [yes/no]: " CONSENT
if [[ "$CONSENT" != "yes" ]]; then
  echo "Aborted."
  exit 0
fi

echo "Searching for AI Firewall CA in System Keychain..."
CERT_HASH=$(security find-certificate -c "AI Firewall Local CA" -Z /Library/Keychains/System.keychain 2>/dev/null | grep "SHA-1" | head -1 | awk '{print $NF}')

if [[ -z "$CERT_HASH" ]]; then
  echo "AI Firewall CA not found in System Keychain. Nothing to remove."
  exit 0
fi

echo "Found certificate with hash: $CERT_HASH"
echo "Removing (requires sudo)..."
sudo security delete-certificate -Z "$CERT_HASH" /Library/Keychains/System.keychain

echo ""
echo "AI Firewall CA removed from macOS Keychain."
