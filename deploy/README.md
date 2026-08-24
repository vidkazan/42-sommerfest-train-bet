# VDS deployment with host Nginx

This deployment serves the app at `https://fcody.de/delayrace/` using a Let’s Encrypt domain certificate.

The production app is served at `https://fcody.de/delayrace/`. Set `VITE_BASE_PATH=/delayrace/` when building the frontend; the production Compose configuration does this by default.

## First deployment

Copy the production environment file and set the secrets:

```bash
cp .env.prod.example .env.prod
```

Install Nginx and Certbot on the host, point the `fcody.de` DNS `A` record to the VDS IP, open TCP ports 80 and 443 in the VDS firewall, then run:

```bash
./deploy/certbot-init.sh
```

The script starts the app, installs the project site in `/etc/nginx/sites-available/`, enables it through `/etc/nginx/sites-enabled/`, obtains the certificate, and reloads host Nginx with HTTPS enabled.

The application containers listen only on localhost ports 5173 (frontend) and 3001 (backend). Host Nginx owns ports 80 and 443. Centralized analytics runs in the separate `fcody-analytics` project.

## Renewal

Run renewal regularly on the host:

```bash
./deploy/certbot-renew.sh
```

Example cron entry:

```cron
15 3 * * * cd /opt/trainbet && ./deploy/certbot-renew.sh >> /var/log/trainbet-certbot.log 2>&1
```

The backend is also published on localhost port 3001 for direct debugging. The public frontend API is served at `/delayrace/api/`; Nginx strips `/delayrace` before forwarding to the backend's `/api/` routes.

## Centralized analytics

Grafana, Loki, and Alloy are deployed from the sibling `fcody-analytics` project. Grafana remains available at `https://fcody.de/grafana/`; see that project for analytics credentials, dashboards, retention, and log collection operations.
