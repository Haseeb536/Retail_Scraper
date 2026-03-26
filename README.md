# Retail Scraper (Realtor.com)

**Author:** [Muhammad Haseeb Ramzan (Haseeb536)](https://github.com/Haseeb536)

A full-stack data extraction platform built around a cyberpunk-styled Chrome extension that automates the collection of real estate agent contact information from [Realtor.com](https://www.realtor.com). The system combines a high-performance in-browser scraper, secure user authentication, an admin control panel, and structured CSV export — designed for teams that need reliable lead data without manual copy-paste work.

---

## Table of Contents

1. [Why This System Exists](#why-this-system-exists)
2. [What the System Does](#what-the-system-does)
3. [System Architecture](#system-architecture)
4. [Chrome Extension — Complete Breakdown](#chrome-extension--complete-breakdown)
5. [Scraper Engine — How It Works](#scraper-engine--how-it-works)
6. [Data Collected](#data-collected)
7. [Backend API & Admin Panel](#backend-api--admin-panel)
8. [Authentication System](#authentication-system)
9. [Database Schema](#database-schema)
10. [User Interfaces](#user-interfaces)
11. [Configuration](#configuration)
12. [Installation & Setup](#installation--setup)
13. [How to Use (Step by Step)](#how-to-use-step-by-step)
14. [Testing](#testing)
15. [Project Structure](#project-structure)
16. [Technology Stack](#technology-stack)
17. [Troubleshooting](#troubleshooting)
18. [Security & Responsible Use](#security--responsible-use)

---

## Why This System Exists

### The Problem

Real estate professionals, marketing teams, and researchers often need **agent contact data** (names, phone numbers, office addresses) from Realtor.com search results. Doing this manually means:

- Opening dozens or hundreds of agent profile pages one by one
- Copy-pasting details into spreadsheets
- Losing hours on repetitive work
- Introducing human errors in phone numbers and addresses
- Having no audit trail of who extracted what and when

### The Solution

Retail Scraper automates this entire workflow inside the browser. Instead of manual data entry, the system:

1. **Scans** Realtor.com agent listing pages automatically
2. **Enriches** each agent profile via Realtor.com's official GraphQL API
3. **Paginates** through multiple result pages without user intervention
4. **Exports** a clean CSV file ready for CRM import, outreach, or analysis
5. **Controls access** through authentication so only approved users can run extractions
6. **Logs activity** to the backend so administrators can monitor usage

### Who Benefits

| User | Benefit |
|------|---------|
| **Real estate teams** | Build targeted agent contact lists for partnerships or recruiting |
| **Marketing agencies** | Generate lead databases for campaigns in specific cities or ZIP codes |
| **Researchers & analysts** | Collect structured agent market data at scale |
| **Developers / automation engineers** | Extend or integrate the scraper into larger workflows |
| **Administrators** | Approve users, track sessions, and maintain system security |

### Why a Full Stack (Extension + Backend)?

The extension alone could scrape data, but the backend adds **enterprise value**:

- **Access control** — not everyone who installs the extension should scrape immediately
- **Admin approval workflow** — new users register and wait for admin approval
- **Session logging** — every scrape is recorded with record count and status
- **Centralized auth** — JWT tokens tie extension usage to verified accounts
- **Scalability** — multiple users can share one backend with consistent policies

When the remote backend is unavailable, the extension includes a **local auth fallback** so scraping still works for development and offline use.

---

## What the System Does

At a high level, Retail Scraper performs these jobs:

| Component | Responsibility |
|-----------|----------------|
| **Content Script (`content.js`)** | Runs on Realtor.com pages; finds agents, fetches details, paginates, exports CSV |
| **Popup UI** | Login, registration, quick-scrape button, live progress stats |
| **Dashboard UI** | Full-screen terminal-style interface for URL-based scraping sessions |
| **Background Worker** | Service worker for extension lifecycle and message routing |
| **Backend API** | User auth, token verification, scraping session logs |
| **Admin Panel** | Approve/revoke users, view registered accounts |
| **Local Auth Module** | Offline login/register when the cloud server is down |
| **Test Harness** | Node.js script to validate agent ID parsing and GraphQL API |

---

## System Architecture

```mermaid
flowchart TB
    subgraph Browser["Chrome Browser"]
        Popup["Extension Popup\n(Login + Quick Scrape)"]
        Dashboard["Extension Dashboard\n(Full Terminal UI)"]
        Content["Content Script\n(Scraper Engine)"]
        Storage["Chrome Local Storage\n(Progress + Auth)"]
    end

    subgraph Realtor["Realtor.com"]
        ListPage["Agent Listing Pages\n/realestateagents/..."]
        GraphQL["GraphQL API\n/frontdoor/graphql"]
    end

    subgraph Backend["Next.js Backend"]
        AuthAPI["Auth API\n/login /register /verify"]
        LogAPI["Scraping Log API"]
        Admin["Admin Panel"]
        DB[(PostgreSQL)]
    end

    Popup --> Content
    Dashboard --> Content
    Content --> ListPage
    Content --> GraphQL
    Content --> Storage
    Popup --> AuthAPI
    Dashboard --> AuthAPI
    AuthAPI --> DB
    LogAPI --> DB
    Admin --> DB
    Content --> CSV["CSV Download"]
```

---

## Chrome Extension — Complete Breakdown

### Core Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension metadata, permissions, content script registration (Manifest V3) |
| `content.js` | **Main scraper engine** — injected on all `realtor.com` pages |
| `scraper.js` | Mirror of `content.js` for manual re-injection if needed |
| `background.js` | Background service worker for extension lifecycle |
| `config.js` | API URL settings (remote vs local backend) |
| `lib/local-auth.js` | Offline authentication stored in Chrome storage |

### Popup (`popup/`)

The popup is the primary control panel attached to the extension icon:

- **Login form** — email/password authentication against the backend (or local fallback)
- **Registration form** — new user signup with first name, last name, email, password
- **Dashboard view** — shown after login with user name and approval status
- **Quick Scrape Current** — starts scraping on the active Realtor.com tab immediately
- **Live stats** — displays current page number and count of valid rows collected
- **Stop & Download** — sends stop signal; finalizes and downloads CSV
- **Launch Dashboard** — opens the full-screen dashboard in a new tab
- **Status indicator** — ONLINE/OFFLINE connection status to backend
- **Toast notifications** — success/error feedback for all actions

### Dashboard (`dashboard/`)

A professional full-page interface for longer scraping sessions:

- **Target URL input** — paste any Realtor.com agent search URL
- **Start button** — opens the URL in a background tab and auto-starts scraping
- **Terminal output** — live log of scrape events with timestamps
- **Progress bar** — visual indicator of records collected
- **Stop button** — terminates the active session
- **Session stats** — total scraped records and session count (persisted locally)

### Permissions Explained

| Permission | Why It's Needed |
|------------|-----------------|
| `activeTab` | Interact with the currently open Realtor.com tab |
| `scripting` | Inject content script when auto-load fails |
| `storage` | Save auth tokens, scrape progress, and local users |
| `tabs` | Query active tab URL and open dashboard/scrape tabs |
| `host_permissions: realtor.com` | Run content script and call GraphQL from the page context |
| `host_permissions: backend` | Communicate with auth and logging APIs |

---

## Scraper Engine — How It Works

The scraper runs entirely inside the browser on Realtor.com pages. Here is the complete pipeline:

### Step 1 — Session Start

When you click **Quick Scrape Current** or start from the dashboard:

1. Popup verifies you are logged in (JWT token exists)
2. Confirms the active tab is a `realtor.com` page
3. Pings the content script (or injects it if missing)
4. Sends `executeScraperInContent` message with your auth token
5. Content script sets `retail_scraper_active = true` and begins the loop

### Step 2 — First Page Guarantee

Before scraping, the engine ensures you start from **page 1**:

- Reads current page from URL (`/pg-N` suffix)
- If you are on page 3 but starting fresh, it navigates back to page 1
- Keeps the storage page counter synced with the actual browser URL

### Step 3 — Agent Discovery

On each page, the scraper finds agent profile links:

- Primary: `[data-testid="component-agentCard"]` agent cards
- Fallback: all links matching `/realestateagents/` and `/agentprofile/`
- **Smart ID filtering** — accepts 24-character hex profile IDs; rejects city slugs like `new-york_ny`
- Scrolls and retries if the page is still loading (JavaScript-rendered content)

### Step 4 — Profile Enrichment (GraphQL)

For each unique agent ID found, the scraper calls Realtor.com's GraphQL API:

```
POST https://www.realtor.com/frontdoor/graphql
Operation: AgentBrandingProfile
```

This returns:

- Full name
- Phone number(s)
- Office address (formatted lines, city, state, ZIP)

Agents **without a phone number** are skipped (only contactable leads are kept).

Processing runs in **batches of 5** concurrent requests for speed without overloading the API.

### Step 5 — Progress Persistence

After each batch:

- Collected rows are saved to `chrome.storage.local`
- Popup and dashboard read this storage for live progress updates
- If the browser tab reloads mid-scrape, the session **auto-resumes** from saved state

### Step 6 — Pagination

After finishing the current page:

1. Tries clicking the pagination "Next" button
2. If click fails, navigates directly via URL (`.../pg-2`, `.../pg-3`, etc.)
3. Waits for the new page to load
4. Repeats the loop until no next page exists

### Step 7 — CSV Export

When scraping completes (or you click Stop):

- All collected rows are written to a CSV file
- Columns: **Profile ID, Name, Phone, Address, URL**
- File downloads automatically as `retail_scraper_complete_{count}.csv`
- Storage is cleared and session marked inactive

---

## Data Collected

Each row in the exported CSV contains:

| Column | Description | Example |
|--------|-------------|---------|
| **Profile ID** | Realtor.com unique agent identifier | `5673e3debb954c010067f9da` |
| **Name** | Agent full name from branding profile | `John Smith` |
| **Phone** | Primary phone number | `(555) 123-4567` |
| **Address** | Office address (formatted) | `123 Main St, New York, NY, 10001` |
| **URL** | Direct link to agent profile page | `https://www.realtor.com/realestateagents/...` |

---

## Backend API & Admin Panel

The backend is a **Next.js 15** application with REST API routes and an admin interface.

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register new user (pending approval) |
| `POST` | `/api/auth/login` | Login and receive JWT token |
| `POST` | `/api/auth/verify` | Validate token and return user profile |
| `POST` | `/api/scraping/log` | Log a completed scraping session |
| `POST` | `/api/admin/login` | Admin panel login |
| `GET` | `/api/admin/users` | List all registered users |
| `POST` | `/api/admin/users/[id]/approve` | Approve a pending user |
| `POST` | `/api/admin/users/[id]/revoke` | Revoke user access |

### Admin Panel

Available at `http://localhost:3000/admin/login` when running locally.

**Default admin credentials** (created by seed script):

- Email: `admin@retailscraper.com`
- Password: `admin123`

Administrators can:

- View all registered users
- Approve or revoke access
- Monitor who is allowed to use the scraper

### Scraping Session Logging

When connected to the backend, each scrape can be logged with:

- User ID
- Number of records collected (`dataCount`)
- Status (`completed` or `failed`)
- Timestamp

This creates an audit trail for compliance and usage tracking.

---

## Authentication System

Retail Scraper uses a **dual-mode** authentication system:

### Mode 1 — Remote Backend (Production)

1. User registers via extension popup
2. Account stored in PostgreSQL with `isApproved = false`
3. Admin approves user in admin panel
4. User logs in → receives JWT token (7-day expiry)
5. Token stored in Chrome storage and sent with API requests
6. Content script requires token before starting scrape

### Mode 2 — Local Auth Fallback (Development / Offline)

When the remote server returns HTTP 500 or is unreachable:

1. Extension automatically falls back to **local authentication**
2. Users are stored in `chrome.storage.local` (hashed passwords)
3. Registration and login work without any server
4. Default local admin: `admin@retailscraper.com` / `admin123`
5. All local users are auto-approved for scraping

This ensures the tool remains usable even when the cloud backend (e.g. Render.com) is down or misconfigured.

---

## Database Schema

PostgreSQL database managed by **Prisma ORM**:

### `users` table

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique user ID (CUID) |
| `email` | String | Unique email address |
| `password` | String | Bcrypt-hashed password |
| `firstName` | String | User first name |
| `lastName` | String | User last name |
| `isApproved` | Boolean | Admin approval status (default: false) |
| `isAdmin` | Boolean | Admin privileges (default: false) |
| `createdAt` | DateTime | Registration timestamp |

### `scraping_sessions` table

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Session ID |
| `userId` | String | Foreign key to users |
| `dataCount` | Int | Number of records scraped |
| `status` | String | `completed` or `failed` |
| `createdAt` | DateTime | Session timestamp |

---

## User Interfaces

### Cyberpunk Theme

Both the popup and dashboard use a custom **cyberpunk aesthetic**:

- Dark background with neon cyan/green accents
- Grid overlay and glow effects
- Monospace terminal fonts in the dashboard
- Animated buttons with glow borders
- Toast notifications for feedback
- Status dots (green = online, red = offline)

This design makes the tool feel like a professional data extraction terminal rather than a generic browser plugin.

---

## Configuration

Edit `chrome-extension/config.js`:

```javascript
const EXTENSION_CONFIG = {
  REMOTE_API_URL: "https://retail-scraper-backend.onrender.com/api",
  LOCAL_API_URL: "http://localhost:3000/api",
  USE_LOCAL_BACKEND: false,        // set true when running backend locally
  ENABLE_LOCAL_AUTH_FALLBACK: true // allow offline login when server is down
};
```

| Setting | Description |
|---------|-------------|
| `REMOTE_API_URL` | Production backend on Render.com |
| `LOCAL_API_URL` | Local Next.js dev server |
| `USE_LOCAL_BACKEND` | Switch extension to use localhost API |
| `ENABLE_LOCAL_AUTH_FALLBACK` | Enable offline login when server fails |

---

## Installation & Setup

### Option A — Extension Only (Fastest)

No backend required. Uses local auth fallback.

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder from this repository
5. Pin the extension to your toolbar

### Option B — Full Stack (Extension + Backend)

#### Prerequisites

- **Node.js** 18+
- **PostgreSQL** installed and running
- **npm** or **yarn**

#### Database

```sql
CREATE DATABASE retail_scraper;
```

#### Backend Setup

```bash
cd backend
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/retail_scraper"
JWT_SECRET="your-long-random-secret-string"
```

Then run:

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed    # Creates admin@retailscraper.com / admin123
npm run dev            # Starts on http://localhost:3000
```

#### Connect Extension to Local Backend

In `chrome-extension/config.js`:

```javascript
USE_LOCAL_BACKEND: true,
```

Reload the extension in `chrome://extensions/`.

---

## How to Use (Step by Step)

### Quick Scrape (Popup)

1. **Install** the extension (see above)
2. **Navigate** to a Realtor.com agent listing page, for example:  
   `https://www.realtor.com/realestateagents/new-york_ny`
3. **Refresh the tab** (ensures content script is loaded)
4. **Click** the extension icon in the toolbar
5. **Log in**:
   - If server is up: use your registered account
   - If server is down: use `admin@retailscraper.com` / `admin123`, or register locally
6. **Click** **Quick Scrape Current**
7. **Watch** live progress (page number + valid row count)
8. **Wait** for automatic CSV download, or click **Stop & Download** to finish early

### Dashboard Scrape (Full UI)

1. Log in via the popup
2. Click **Launch Dashboard**
3. Paste a Realtor.com agent URL in the input field
4. Click **Start**
5. Monitor the terminal log and progress bar
6. CSV downloads automatically when complete

### Supported URLs

Any Realtor.com agent search page, including filtered URLs:

```
https://www.realtor.com/realestateagents/new-york_ny
https://www.realtor.com/realestateagents/los-angeles_ca/intent-buy/sort-relevantagents/agenttype-all
https://www.realtor.com/realestateagents/miami_fl/pg-2
```

The scraper always resets to **page 1** at the start of a new session, regardless of which page you are currently viewing.

---

## Testing

A Node.js test harness validates core scraper logic without Chrome:

```bash
node test-scraper.mjs
```

**What it tests:**

| Test | Validates |
|------|-----------|
| `extractAgentId` | Correctly identifies agent profile IDs vs city slugs |
| Pagination URL helpers | `getPageFromUrl` and `buildPageUrl` for `/pg-N` paths |
| GraphQL API | Live call to Realtor.com returns name + phone |
| `scraper.js` syntax | No JavaScript parse errors |

> Note: Live page fetch may return HTTP 429 (rate limited) from Node.js — this is expected. The extension runs in the browser and is not affected.

---

## Project Structure

```
Retail_Scraper/
├── chrome-extension/              # Chrome extension (load this in Chrome)
│   ├── manifest.json              # Extension config & permissions
│   ├── content.js                 # Main scraper engine (auto-injected)
│   ├── scraper.js                 # Manual injection copy of content.js
│   ├── background.js              # Service worker
│   ├── config.js                  # API URL & feature flags
│   ├── lib/
│   │   └── local-auth.js          # Offline login/register module
│   ├── popup/
│   │   ├── popup.html             # Login + quick scrape UI
│   │   ├── popup.js               # Popup logic & auth flow
│   │   └── popup.css              # Cyberpunk popup styles
│   ├── dashboard/
│   │   ├── dashboard.html         # Full-screen dashboard UI
│   │   ├── dashboard.js           # Dashboard scrape controller
│   │   └── dashboard.css          # Dashboard styles
│   └── icons/                     # Extension icons (16, 48, 128px)
│
├── backend/                       # Next.js 15 backend
│   ├── prisma/
│   │   ├── schema.prisma          # Database models
│   │   ├── seed.js                # Default admin user seed
│   │   └── migrations/            # Database migration history
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── auth/          # login, register, verify routes
│   │   │   │   ├── admin/         # user management routes
│   │   │   │   └── scraping/      # session logging route
│   │   │   └── admin/             # Admin panel pages
│   │   └── lib/
│   │       └── auth.js            # JWT, bcrypt, Prisma helpers
│   ├── .env.example               # Environment variable template
│   └── package.json
│
├── test-scraper.mjs               # Node.js test harness
└── README.md                      # This file
```

---

## Technology Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **Extension** | Chrome Manifest V3 | Modern extension platform |
| **Extension** | Vanilla JavaScript | Scraper engine, UI logic |
| **Extension** | Chrome Storage API | Progress persistence, local auth |
| **Extension** | Chrome Scripting API | Content script injection |
| **Backend** | Next.js 15 (App Router) | API routes + admin pages |
| **Backend** | React 19 | Admin panel UI |
| **Backend** | Prisma ORM | Database access layer |
| **Database** | PostgreSQL | User accounts & session logs |
| **Auth** | JWT (jsonwebtoken) | Token-based authentication |
| **Auth** | bcryptjs | Password hashing |
| **Data Source** | Realtor.com GraphQL | Agent profile enrichment |
| **Export** | CSV (client-side Blob) | Downloadable output file |
| **Styling** | Custom CSS | Cyberpunk theme |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Internal server error on login** | Remote backend is down. Use local auth: `admin@retailscraper.com` / `admin123`, or register locally |
| **Communication error on scrape** | Refresh the Realtor.com tab, reload extension, try again |
| **No agents found** | Ensure you are on an agent **listing** page, not a single profile |
| **Scrape button disabled** | Account pending approval (remote mode). Use local auth or ask admin to approve |
| **Extension not loading** | Check `chrome://extensions` for errors; ensure you selected the `chrome-extension` folder |
| **Backend won't start** | Verify PostgreSQL is running and `DATABASE_URL` in `.env` is correct |
| **CSV not downloading** | Check browser download permissions; ensure pop-ups are not blocked |

---

## Security & Responsible Use

- **Passwords** are bcrypt-hashed on the backend; locally hashed with SHA-256 in offline mode
- **JWT tokens** expire after 7 days
- **Admin approval** prevents unauthorized scraping in production mode
- **Session logging** creates an audit trail of extraction activity
- Only scrape data you have the **legal right** to collect; respect Realtor.com's Terms of Service and applicable data privacy laws
- This tool is intended for **legitimate business research**, not spam or unauthorized data resale

---

## Author

**Muhammad Haseeb Ramzan** — [GitHub: Haseeb536](https://github.com/Haseeb536)

AI Engineer | Python Developer | Machine Learning | Automation

---

## License

Open source — maintained by [Haseeb536](https://github.com/Haseeb536).
