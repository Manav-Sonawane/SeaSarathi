# Deploying the SeaSarathi backend on AWS (24×7)

One small server runs the API **and** its background jobs (Copernicus grid every
6 h, IMD scrapers every 1–6 h), so data keeps refreshing even when nobody uses
the app. HTTPS comes from Caddy; the permanent URL goes into the app build once.

```
phone app ──https──► Caddy (443) ──► FastAPI (uvicorn, 1 worker) ── background loops
                                         └─ volumes: grid, profiles (SQLite), weather cache
```

## 1. Create the server (Amazon Lightsail, Mumbai)

Lightsail is EC2 with a flat monthly price and a static IP included — the
simplest option. (Plain EC2 works identically: Ubuntu 24.04, `t3.small`+.)

1. Lightsail console → **Create instance**.
2. Region **Mumbai (ap-south-1)** — IMD/Sarvam/Copernicus are reached from India,
   and IMD sometimes blocks or slows foreign IPs.
3. Platform **Linux/Unix**, blueprint **OS Only → Ubuntu 24.04 LTS**.
4. Plan: **$12/mo (2 GB RAM)** is enough to start; **$24/mo (4 GB)** if you see
   out-of-memory restarts (`docker compose logs api`, `free -h`).
5. Name it `seasarathi-api` → **Create**.
6. **Networking → Create static IP** and attach it (so the address survives reboots).
7. **Networking → IPv4 Firewall**: keep SSH (22), add **HTTP (80)** and **HTTPS (443)**.
   Optionally restrict SSH to your own IP.

Check **Billing → Credits** that your credits apply to Lightsail (they normally do),
and add a **Budget alert** (Billing → Budgets) so a surprise never eats them silently.

## 2. Get a hostname

Certificates need a name, not a bare IP. Either:

- **Free:** [duckdns.org](https://www.duckdns.org) → create e.g. `seasarathi` →
  point it at the static IP → your host is `seasarathi.duckdns.org`.
- **Your own domain:** add an **A record** `api.yourdomain.com` → the static IP.

Wait until `nslookup <your-host>` returns the static IP.

## 3. Set up the server

Open the instance's **Connect using SSH** (browser terminal), then:

```bash
# Docker + a 2 GB swap file (safety net for the memory-hungry geo libraries)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
exit        # log out and back in so the docker group applies
```

Reconnect, then:

```bash
git clone https://github.com/Manav-Sonawane/SeaSarathi.git
cd SeaSarathi

# API keys (same names as your local backend/.env)
cp backend/.env.example backend/.env
nano backend/.env          # fill SARVAM_API_KEY, COPERNICUS_*, etc.
```

Also add a shared secret to `backend/.env` so strangers can't spend your Sarvam
credits (generate with `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`):

```
API_KEY="<the generated value>"
```

Then start everything:

```bash
cd deploy
echo "DOMAIN=seasarathi.duckdns.org" > .env      # your hostname from step 2
docker compose up -d --build
```

(A private repo needs a [personal access token](https://github.com/settings/tokens)
in the clone URL, or copy the folder up with `scp`.)

## 4. Check it

```bash
docker compose ps                       # both "running"; api becomes "healthy"
curl https://<your-host>/health         # {"status": ...}
curl https://<your-host>/health/ready   # "ready": true after ~90 s (first grid download)
docker compose logs -f api              # watch the Copernicus + IMD refresh loops
```

## 5. Point the app at it (once)

```bash
npx eas-cli env:create --environment production --name EXPO_PUBLIC_API_URL \
    --value https://<your-host> --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_API_KEY \
    --value <the same API_KEY> --visibility plaintext
```

Rebuild the app. The URL is now permanent — no more ngrok. (Use the same
`--environment` your EAS build profile uses; see `mobile/.env.example`.)

## Day-to-day

| Task | Command (in `SeaSarathi/deploy`) |
|---|---|
| Deploy new code | `git pull && docker compose up -d --build` |
| Logs | `docker compose logs -f api` |
| Restart | `docker compose restart api` |
| Rotate the API key | edit `backend/.env`, `docker compose up -d`, rebuild the app with the new value |

**Backups:** user profiles live in the `profiles` Docker volume. Turn on
Lightsail **automatic snapshots** for the instance (a few $/month, or cents).

**Cost:** Lightsail $12–24/mo ⇒ your ~$138 credit lasts roughly 6–11 months.
When credits end it bills your card, so watch the budget alert.
