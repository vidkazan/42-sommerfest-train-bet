#!/usr/bin/env bash
set -euo pipefail

sudo certbot renew --webroot --webroot-path /var/www/certbot --quiet
sudo nginx -t
sudo systemctl reload nginx
