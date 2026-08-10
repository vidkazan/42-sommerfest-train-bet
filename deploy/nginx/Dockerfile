FROM nginx:1.27-alpine

COPY http.conf /etc/nginx/templates/trainbet-http.conf
COPY https.conf /etc/nginx/templates/trainbet-https.conf
COPY entrypoint.sh /usr/local/bin/trainbet-nginx-entrypoint

RUN chmod +x /usr/local/bin/trainbet-nginx-entrypoint

ENTRYPOINT ["/usr/local/bin/trainbet-nginx-entrypoint"]
