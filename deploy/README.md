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

The application containers listen only on localhost ports 5173 (frontend), 3001 (backend), and 3000 (Grafana). Host Nginx owns ports 80 and 443.

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

## Grafana logs over HTTPS

Grafana is available at `https://fcody.de/grafana/` and requires login. Set the required admin credentials in `.env.prod`:

```dotenv
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=replace-with-a-long-random-password
```

Rebuild and restart the production stack after changing the deployment configuration:

```bash
./scripts/prod-up.sh
```

The production helper starts the production stack with its required `.env.prod` configuration.

Open `https://fcody.de/grafana/` and sign in with `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD`. Grafana is bound to localhost and exposed publicly only through host Nginx; Loki and Alloy remain internal to the Docker network.
