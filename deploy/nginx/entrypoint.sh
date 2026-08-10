#!/bin/sh
set -eu

if [ -f /etc/letsencrypt/live/trainbet-ip/fullchain.pem ] && [ -f /etc/letsencrypt/live/trainbet-ip/privkey.pem ]; then
  cp /etc/nginx/templates/trainbet-https.conf /etc/nginx/conf.d/default.conf
else
  cp /etc/nginx/templates/trainbet-http.conf /etc/nginx/conf.d/default.conf
fi

exec nginx -g "daemon off;"
