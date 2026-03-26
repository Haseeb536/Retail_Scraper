# Retail Scraper (Realtor.com)

A cyberpunk-styled Chrome extension for automated Realtor.com agent data extraction — built with Manifest V3, a Next.js backend, and local auth fallback for offline use.

**Author:** [Muhammad Haseeb Ramzan (Haseeb536)](https://github.com/Haseeb536)

## Features

### Chrome Extension
- **Cyberpunk UI** — animated popup and professional dashboard
- **Smart scraper** — collects agent name, phone, address, and profile URL
- **URL-based pagination** — reliable first-page reset and `/pg-N` navigation
- **Local auth fallback** — works when the remote backend is unavailable
- **CSV export** — automatic download when scraping completes
- **Live progress** — page count and valid rows in the popup

### Backend (Next.js 15)
- Admin dashboard and user approval workflow
- JWT authentication with Prisma + PostgreSQL
- Scraping session logging API

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Extension | Manifest V3, Vanilla JavaScript |
| Backend | Next.js 15, React 19, Prisma |
| Database | PostgreSQL |
| Styling | Custom cyberpunk CSS |

## Quick Start — Extension Only

1. Open `chrome://extensions/` → enable **Developer mode**
2. Click **Load unpacked** → select the `chrome-extension` folder
3. Open a Realtor.com agent page, e.g. `https://www.realtor.com/realestateagents/new-york_ny`
4. **Refresh the tab**, then open the extension popup
5. Log in with `admin@retailscraper.com` / `admin123` (local mode when server is down)
6. Click **Quick Scrape Current**

## Full Stack Setup

### Backend

```bash
cd backend
cp .env.example .env   # set DATABASE_URL and JWT_SECRET
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

Admin panel: `http://localhost:3000/admin/login`

To use your local backend, set in `chrome-extension/config.js`:

```javascript
USE_LOCAL_BACKEND: true,
```

### Run tests

```bash
node test-scraper.mjs
```

## Project Structure

```
├── chrome-extension/   # Chrome extension (load this in Chrome)
│   ├── content.js      # Scraper engine
│   ├── popup/          # Login & controls
│   ├── dashboard/      # Full dashboard UI
│   └── lib/            # Local auth fallback
├── backend/            # Next.js API + admin panel
└── test-scraper.mjs    # Node test harness
```

## License

Open source — maintained by [Haseeb536](https://github.com/Haseeb536).
