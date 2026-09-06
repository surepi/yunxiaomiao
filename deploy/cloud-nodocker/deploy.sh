#!/usr/bin/env bash
# Run this ON the cloud server, with the repo placed at /opt/mcsm-shop.
# It builds the gateway + portal, prepares the SQLite DB + seed, and installs
# the systemd service for the gateway. It does NOT install Node/Caddy/panel
# (do those per README first).
set -euo pipefail

REPO=/opt/mcsm-shop
GW=$REPO/gateway
PORTAL=$REPO/portal

echo "== [1/4] Gateway: install deps, generate Prisma client, build =="
cd "$GW"
npm install
npx prisma generate
npx prisma db push --skip-generate
npm run build

echo "== [2/4] Gateway: seed (admin + sample packages/cards) =="
mkdir -p "$GW/data"
if [ ! -f "$GW/data/.seeded" ]; then
  node dist/prisma/seed.js && touch "$GW/data/.seeded"
fi

echo "== [3/4] Portal: install deps, build static files =="
cd "$PORTAL"
npm install
npm run build    # outputs $PORTAL/dist

echo "== [4/4] Install systemd service for gateway =="
cp "$REPO/deploy/cloud-nodocker/mcsm-gateway.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mcsm-gateway

echo "Done. Gateway: http://127.0.0.1:8080/health  Portal dist: $PORTAL/dist"
echo "Next: put Caddyfile in place and reload Caddy (see README), then finish panel setup."
