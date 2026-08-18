# VDS deployment without DNS

This deployment serves the app at `https://fcody.de/delayrace/` using a Let’s Encrypt domain certificate.

The production app is served at `https://fcody.de/delayrace/`. Set `VITE_BASE_PATH=/delayrace/` when building the frontend; the production Compose configuration does this by default.

## First deployment

Copy the production environment file and set the secrets:

```bash
cp .env.prod.example .env.prod
```

Point the `fcody.de` DNS `A` record to the VDS IP, open TCP ports 80 and 443 in the VDS firewall, then run:

```bash
./deploy/certbot-init.sh
```

The script starts the app, obtains the certificate, and restarts Nginx with HTTPS enabled.

## Renewal

Run renewal regularly:

```bash
./deploy/certbot-renew.sh
```

Example cron entry:

```cron
15 3 * * * cd /opt/trainbet && ./deploy/certbot-renew.sh >> /var/log/trainbet-certbot.log 2>&1
```

The backend is also published on port 3001 for direct debugging/API access. For the HTTPS frontend, keep `VITE_API_BASE_URL` empty so browser requests use the secure same-origin `/api` route.

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

Open `https://fcody.de/grafana/` and sign in with `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD`. Grafana, Loki, and Alloy remain internal to the Docker network; Alloy collects Docker container logs and forwards them to Loki.
