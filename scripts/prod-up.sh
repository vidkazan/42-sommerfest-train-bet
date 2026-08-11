#!/usr/bin/env sh
set -eu

compose_file="docker-compose.prod.yml"
env_file=".env.prod"

if [ ! -f "$env_file" ]; then
  echo "Missing $env_file. Copy .env.prod.example and fill in the required values." >&2
  exit 1
fi

docker compose --env-file "$env_file" -f "$compose_file" up -d --build
