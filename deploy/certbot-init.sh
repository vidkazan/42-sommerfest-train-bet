#!/usr/bin/env bash
set -euo pipefail

if [[ -f .env.prod ]]; then
  set -a
  source .env.prod
  set +a
fi

COMPOSE=(docker compose --env-file .env.prod -f docker-compose.prod.yml)
CERTBOT_DOMAIN="${CERTBOT_DOMAIN:-fcody.de}"

"${COMPOSE[@]}" up -d frontend backend grafana

sudo install -d -m 0755 /var/www/certbot /etc/nginx/sites-available /etc/nginx/sites-enabled
sudo install -m 0644 deploy/nginx/sites-available/choochoo-delayrace-http.conf /etc/nginx/sites-available/choochoo-delayrace.conf
sudo ln -sfn /etc/nginx/sites-available/choochoo-delayrace.conf /etc/nginx/sites-enabled/choochoo-delayrace.conf
sudo nginx -t
sudo systemctl reload nginx

if [[ -n "${CERTBOT_EMAIL:-}" ]]; then
  EMAIL_ARGS=(--email "$CERTBOT_EMAIL")
else
  EMAIL_ARGS=(--register-unsafely-without-email)
fi

sudo certbot certonly \
  --non-interactive --agree-tos --webroot --webroot-path /var/www/certbot \
  --cert-name fcody-de \
  --domain "$CERTBOT_DOMAIN" \
  "${EMAIL_ARGS[@]}"

sudo install -m 0644 deploy/nginx/sites-available/choochoo-delayrace.conf /etc/nginx/sites-available/choochoo-delayrace.conf
sudo nginx -t
sudo systemctl reload nginx
echo "HTTPS is enabled for https://$CERTBOT_DOMAIN/delayrace/"
