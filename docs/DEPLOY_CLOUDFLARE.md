# Cloudflare deployment

The Alchemy stack deploys the static frontend from `app/static` to a
Cloudflare Worker. Requests under `/api` are proxied to a separately hosted
FastAPI backend, configured with `API_ORIGIN`.

## Requirements

- Node.js 24.11.1 or 25.1+
- A Cloudflare account
- A reachable FastAPI backend with a managed PostgreSQL database (`DATABASE_URL`)

The current backend uses Python packages including NumPy, SciPy, pandas, and
statsmodels, plus PostgreSQL. Keep that backend on a Python host that supports
these dependencies; Cloudflare receives the frontend
and proxies API traffic.

## Deploy

1. Copy `.env.example` to `.env` and set `API_ORIGIN` to the backend's public
   root URL, without a path suffix.
2. Install dependencies with `npm install`.
3. Authenticate Alchemy with `npx alchemy profile edit --add Cloudflare`.
4. Preview the changes with `npm run cf:plan`.
5. Deploy with `npm run cf:deploy`.

For local Worker development, run `npm run cf:dev`. Set `API_ORIGIN` to a
reachable backend in `.env`.

The Python backend should set a stable `APP_SECRET` and set `DATABASE_URL` to a
managed PostgreSQL database. Otherwise, restarts can invalidate login tokens or
lose user and analysis data (without `DATABASE_URL` the app falls back to a
local SQLite file).

Start the backend with:

```sh
uvicorn app.api.main:app --host 0.0.0.0 --port 8000
```

Configure the Python host to provide the port expected by its platform.
