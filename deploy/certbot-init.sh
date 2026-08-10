#!/usr/bin/env bash
set -euo pipefail

COMPOSE=(docker compose --env-file .env.prod -f docker-compose.prod.yml)
VDS_IP="${VDS_IP:-${1:-}}"

if [[ -z "$VDS_IP" ]]; then
  echo "Usage: VDS_IP=203.0.113.10 ./deploy/certbot-init.sh"
  exit 1
fi

"${COMPOSE[@]}" up -d frontend backend nginx

if [[ -n "${CERTBOT_EMAIL:-}" ]]; then
  EMAIL_ARGS=(--email "$CERTBOT_EMAIL")
else
  EMAIL_ARGS=(--register-unsafely-without-email)
fi

"${COMPOSE[@]}" --profile certbot run --rm certbot certonly \
  --non-interactive --agree-tos \
  --preferred-profile shortlived \
  --webroot --webroot-path /var/www/certbot \
  --cert-name trainbet-ip \
  --ip-address "$VDS_IP" \
  "${EMAIL_ARGS[@]}"

"${COMPOSE[@]}" restart nginx
echo "HTTPS is enabled for https://$VDS_IP/"
