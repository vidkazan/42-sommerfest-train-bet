#!/usr/bin/env bash
set -euo pipefail

COMPOSE=(docker compose --env-file .env.prod -f docker-compose.prod.yml)

"${COMPOSE[@]}" --profile certbot run --rm certbot renew --webroot --webroot-path /var/www/certbot --quiet
"${COMPOSE[@]}" exec nginx nginx -s reload
