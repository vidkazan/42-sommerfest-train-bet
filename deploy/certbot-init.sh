#!/usr/bin/env bash
set -euo pipefail

if [[ -f .env.prod ]]; then
  set -a
  source .env.prod
  set +a
fi

COMPOSE=(docker compose --env-file .env.prod -f docker-compose.prod.yml)
CERTBOT_DOMAIN="${CERTBOT_DOMAIN:-fcody.de}"

"${COMPOSE[@]}" up -d frontend backend nginx

if [[ -n "${CERTBOT_EMAIL:-}" ]]; then
  EMAIL_ARGS=(--email "$CERTBOT_EMAIL")
else
  EMAIL_ARGS=(--register-unsafely-without-email)
fi

"${COMPOSE[@]}" --profile certbot run --rm certbot certonly \
  --non-interactive --agree-tos \
  --webroot --webroot-path /var/www/certbot \
  --cert-name fcody-de \
  --domain "$CERTBOT_DOMAIN" \
  "${EMAIL_ARGS[@]}"

"${COMPOSE[@]}" restart nginx
echo "HTTPS is enabled for https://$CERTBOT_DOMAIN/delayrace/"
