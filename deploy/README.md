# VDS deployment without DNS

This deployment serves the app at `https://<VDS_IP>/` using a short-lived Let’s Encrypt IP certificate.

## First deployment

Copy the production environment file and set the secrets:

```bash
cp .env.prod.example .env.prod
```

Open TCP ports 80 and 443 in the VDS firewall, then run:

```bash
VDS_IP=203.0.113.10 ./deploy/certbot-init.sh
```

The script starts the app, obtains the certificate, and restarts Nginx with HTTPS enabled.

## Renewal

Run renewal at least once per day because IP certificates are short-lived:

```bash
./deploy/certbot-renew.sh
```

Example cron entry:

```cron
15 3 * * * cd /opt/trainbet && ./deploy/certbot-renew.sh >> /var/log/trainbet-certbot.log 2>&1
```

The backend is also published on port 3001 for direct debugging/API access. For the HTTPS frontend, keep `VITE_API_BASE_URL` empty so browser requests use the secure same-origin `/api` route; direct `http://<VDS_IP>:3001` requests are only suitable when the frontend itself is served over HTTP.
