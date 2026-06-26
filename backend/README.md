# Retail Scraper Backend

Next.js 15 API server for authentication, user management, and scraping session logs.

## Quick Start (Windows / Mac / Linux)

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Environment file

Copy the example env file (already done if you cloned this repo):

```bash
copy .env.example .env
```

Default `.env` uses **SQLite** — no PostgreSQL installation required.

### 3. Create database and seed admin user

```bash
npx prisma db push
npm run prisma:seed
```

### 4. Start the server

```bash
npm run dev
```

Server runs at: **http://localhost:3001**

| URL | Purpose |
|-----|---------|
| http://localhost:3001 | API home |
| http://localhost:3001/admin/login | Admin panel |
| http://localhost:3001/api/auth/login | Extension login API |
| http://localhost:3001/api/auth/register | Extension register API |

### 5. Default admin credentials

| Field | Value |
|-------|-------|
| Email | `admin@retailscraper.com` |
| Password | `admin123` |

### 6. Connect the Chrome extension

In `chrome-extension/config.js` set:

```javascript
USE_LOCAL_BACKEND: true,
```

Reload the extension in `chrome://extensions/`, then log in through the popup.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user (pending approval) |
| POST | `/api/auth/login` | Login → returns JWT token |
| POST | `/api/auth/verify` | Verify JWT token |
| POST | `/api/scraping/log` | Log scraping session |
| POST | `/api/admin/login` | Admin login |
| GET | `/api/admin/users` | List users (admin) |
| POST | `/api/admin/users/[id]/approve` | Approve user |
| POST | `/api/admin/users/[id]/revoke` | Revoke user |

---

## Production (PostgreSQL)

For production deployment (Render, Railway, etc.):

1. Change `prisma/schema.prisma` provider back to `postgresql`
2. Set `DATABASE_URL` to your PostgreSQL connection string
3. Run `npx prisma migrate deploy`
4. Run `npm run prisma:seed`
5. Set a strong `JWT_SECRET` in environment variables

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Internal server error` on login | Run `npx prisma db push` and `npm run prisma:seed` |
| Port 3000 in use | Stop other apps or run `npx next dev -p 3001` |
| Prisma client error | Run `npx prisma generate` |
| Extension can't connect | Set `USE_LOCAL_BACKEND: true` in extension config |

---

Based on [1Khizar/Retail_Scraper](https://github.com/1Khizar/Retail_Scraper) — maintained by [Haseeb536](https://github.com/Haseeb536).
