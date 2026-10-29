#!/usr/bin/env bash
# Builds with a canary API key and proves it never reaches browser bundles or HTTP responses.
set -euo pipefail
cd "$(dirname "$0")/.."
CANARY="sk-ant-CANARY-$(date +%s)-do-not-leak"
PORT=3199

echo "1. Build with canary key"
ANTHROPIC_API_KEY="$CANARY" GEMINI_API_KEY="$CANARY-gm" npx next build >/dev/null

echo "2. Scan client bundles (.next/static)"
if grep -rl "$CANARY" .next/static; then echo "FAIL: canary in client bundle"; exit 1; fi
if grep -rlE "ANTHROPIC_API_KEY|GEMINI_API_KEY" .next/static; then echo "FAIL: env var name referenced in client bundle"; exit 1; fi
echo "   clean"

echo "3. Scan source for NEXT_PUBLIC_ secrets"
if grep -rn "NEXT_PUBLIC_" src; then echo "FAIL: NEXT_PUBLIC_ usage found"; exit 1; fi
echo "   clean"

echo "4. Scan live responses"
ANTHROPIC_API_KEY="$CANARY" GEMINI_API_KEY="$CANARY-gm" COMPASS_AGENT_MODE=fixture COMPASS_DATA_DIR=.e2e-data/secrets npx next start -p $PORT >/dev/null 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -sf "http://localhost:$PORT/" >/dev/null && break; sleep 0.5; done
OUT=$(mktemp)
for p in / /about /guides/github /guides/slack /guides/google-gmail /guides/notion /api/guides/github /guides/nope; do
  curl -s -D - "http://localhost:$PORT$p" >>"$OUT" || true
done
curl -s -X POST -H 'content-type: application/json' -d '{"query":"Acme Notes"}' "http://localhost:$PORT/api/generate" >>"$OUT"
curl -s -X POST -H 'content-type: application/json' -d '{nope' "http://localhost:$PORT/api/generate" >>"$OUT"
if grep -q "$CANARY" "$OUT"; then echo "FAIL: canary in HTTP response"; exit 1; fi
if grep -qi "x-powered-by" "$OUT"; then echo "FAIL: x-powered-by header present"; exit 1; fi
echo "   clean ($(wc -c <"$OUT") bytes scanned)"
rm -f "$OUT"
echo "PASS: API key never left the server"
