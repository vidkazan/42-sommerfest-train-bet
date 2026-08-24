# VDS deployment with host Nginx

This deployment serves the app at `https://fcody.de/delayrace/`. Shared Nginx and Let’s Encrypt certificate management is owned by the sibling `fcody-de-core` project.

The production app is served at `https://fcody.de/delayrace/`. Set `VITE_BASE_PATH=/delayrace/` when building the frontend; the production Compose configuration does this by default.

## First deployment

Copy the production environment file and set the secrets:

```bash
cp .env.prod.example .env.prod
```

Initialize `fcody-de-core` first. Point the required DNS records to the VDS IP and open TCP ports 80 and 443 in the VDS firewall. Then run the application deployment:

```bash
sudo install -m 0644 deploy/nginx/sites-available/choochoo-delayrace.conf /etc/nginx/sites-available/choochoo-delayrace.conf
sudo ln -sfn /etc/nginx/sites-available/choochoo-delayrace.conf /etc/nginx/sites-enabled/choochoo-delayrace.conf
sudo nginx -t
sudo systemctl reload nginx
./scripts/prod-up.sh
```

The application deployment starts the localhost services and installs its HTTPS route. `fcody-de-core` must already provide the shared certificate and port-80 ACME/redirect site.

The application containers listen only on localhost ports 5173 (frontend) and 3001 (backend). Host Nginx owns ports 80 and 443. Centralized analytics runs in the separate `fcody-analytics` project.

The backend is also published on localhost port 3001 for direct debugging. The public frontend API is served at `/delayrace/api/`; Nginx strips `/delayrace` before forwarding to the backend's `/api/` routes.

## Centralized analytics

Grafana, Loki, and Alloy are deployed from the sibling `fcody-analytics` project. Grafana remains available at `https://fcody.de/grafana/`; see that project for analytics credentials, dashboards, retention, and log collection operations.
