#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env. Create it and fill in the required values first." >&2
  exit 1
fi

COMPOSE=(docker compose --env-file .env -f docker-compose.yml)

echo "Validating debug Compose configuration..."
"${COMPOSE[@]}" config >/dev/null

echo "Building debug images..."
"${COMPOSE[@]}" build

echo "Starting debug services..."
"${COMPOSE[@]}" up -d

echo "Debug stack is running. Grafana/Loki are not included."
"${COMPOSE[@]}" ps
