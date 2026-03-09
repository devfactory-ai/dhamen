#!/usr/bin/env bash
set -euo pipefail

# Dhamen - Local Development Setup
# Migrates all D1 databases locally and verifies environment

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
API_DIR="$ROOT_DIR/apps/api"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERR]${NC} $1"; }

echo "=== Dhamen Local Dev Setup ==="
echo ""

# 1. Check prerequisites
command -v pnpm >/dev/null 2>&1 || { error "pnpm is required. Install: npm install -g pnpm"; exit 1; }
command -v wrangler >/dev/null 2>&1 || { warn "wrangler not found globally, will use local version"; }
info "Prerequisites OK"

# 2. Install dependencies
echo ""
echo "--- Installing dependencies ---"
cd "$ROOT_DIR"
pnpm install
info "Dependencies installed"

# 3. Check .dev.vars
echo ""
echo "--- Checking environment ---"
if [ ! -f "$API_DIR/.dev.vars" ]; then
  warn ".dev.vars not found, creating with defaults..."
  cat > "$API_DIR/.dev.vars" << 'DEVVARS'
JWT_SECRET=dev_secret_key_local_123456789
ENCRYPTION_KEY=dev_encryption_key_local_123
DEVVARS
  info ".dev.vars created"
else
  info ".dev.vars exists"
fi

# 4. Migrate all D1 databases locally
echo ""
echo "--- Migrating D1 databases ---"

DATABASES=(
  "dhamen-db"
  "dhamen-platform"
  "dhamen-star"
  "dhamen-gat"
  "dhamen-comar"
  "dhamen-ami"
)

cd "$API_DIR"

for db in "${DATABASES[@]}"; do
  echo -n "  Migrating $db... "
  if npx wrangler d1 migrations apply "$db" --local 2>/dev/null; then
    echo -e "${GREEN}done${NC}"
  else
    echo -e "${RED}failed${NC}"
    error "Migration failed for $db. Check packages/db/migrations/"
  fi
done

info "All databases migrated"

# 5. Summary
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Start development with:"
echo "  pnpm dev:api      # API only (port 8787)"
echo "  pnpm dev:web      # Web only (port 5173)"
echo "  pnpm dev          # All apps"
echo ""
