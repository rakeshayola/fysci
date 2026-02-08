# Developer Guide

This guide covers the architecture, local development workflow, and conventions for contributing to the Stock Dashboard project.

## Architecture Overview

The application runs as five Docker containers:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │     │   Backend    │     │  PostgreSQL   │
│  React/Vite  │────▶│   FastAPI    │────▶│    :5432      │
│   :3000      │/api │   :8000      │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                     ┌──────────────┐            │
                     │   Scraper    │────────────┤
                     │ Yahoo Finance│            │
                     │ (scheduled)  │            │
                     └──────────────┘            │
                     ┌──────────────┐            │
                     │ News Scraper │────────────┘
                     │ Google/Twitter│
                     │ + VADER      │
                     └──────────────┘
```

**Request flow:**
1. Browser loads the React SPA from the Vite dev server on port 3000
2. All `/api/*` requests are proxied by Vite to the FastAPI backend on port 8000
3. FastAPI uses SQLAlchemy to query PostgreSQL
4. Responses flow back as JSON to the React frontend
5. Scraper services run independently, writing data directly to the database on a schedule

**Data flow:**
- **Scraper** → Yahoo Finance chart API (prices) + quoteSummary API (financials) → `stock_prices` + `stock_financials` tables
- **News Scraper** → Google News RSS + Twitter API v2 → VADER sentiment → `stock_news` table
- **Backend** reads all tables and serves them to the frontend via REST endpoints

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (v20+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2+)
- **Optional for local-only development (without Docker):**
  - Python 3.12+
  - Node.js 20+
  - PostgreSQL 16

## Getting Started

### Docker (recommended)

```bash
docker compose up --build
```

All five services start with hot-reload enabled — edit any file and see changes immediately.

### Running Services Individually (without Docker)

If you prefer running outside Docker, start each service manually:

**Database:**

```bash
# Use a local PostgreSQL instance or start just the db container:
docker compose up db
```

**Backend:**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export DATABASE_URL=postgresql://stockuser:stockpass@localhost:5432/stockdb
uvicorn app.main:app --reload --port 8000
```

**Scraper:**

```bash
cd scraper
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export DATABASE_URL=postgresql://stockuser:stockpass@localhost:5432/stockdb
python main.py
```

**News Scraper:**

```bash
cd news-scraper
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export DATABASE_URL=postgresql://stockuser:stockpass@localhost:5432/stockdb
# Optional: export TWITTER_BEARER_TOKEN=your_token_here
python main.py
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

> When running outside Docker, update `vite.config.js` to proxy to `http://localhost:8000` instead of `http://backend:8000`.

## Project Layout

### Backend (`/backend`)

```
backend/
├── Dockerfile
├── requirements.txt          # FastAPI, SQLAlchemy, curl_cffi, etc.
└── app/
    ├── main.py               # FastAPI app, middleware, 6 router mounts
    ├── database.py           # Engine, session factory, get_db dependency
    ├── models.py             # ORM: Stock, StockPrice, StockFinancials, StockNews, Widget
    ├── schemas.py            # Pydantic schemas for all models
    └── routers/
        ├── stocks.py         # GET/POST stocks, GET prices (limit up to 1300)
        ├── widgets.py        # CRUD for dashboard widgets
        ├── financials.py     # GET /api/financials/{symbol}
        ├── scraper.py        # POST /api/scraper/run — on-demand Yahoo scrape
        ├── status.py         # GET /api/status — market hours, exchange direction
        └── news.py           # GET /api/news/{symbol}, GET .../sentiment
```

**Key patterns:**
- **Dependency injection** — `get_db()` yields a SQLAlchemy session per request and closes it automatically.
- **Router organisation** — each domain has its own router file under `routers/`, mounted with a URL prefix in `main.py`.
- **Schema separation** — `schemas.py` defines `*Create` (input) and `*Out` (output) models. ORM objects are converted via `model_config = {"from_attributes": True}`.
- **On-demand scraper** — `scraper.py` uses `curl_cffi` with Chrome TLS impersonation to call Yahoo Finance APIs directly (no yfinance), with cookie+crumb authentication.

### Scraper (`/scraper`)

```
scraper/
├── Dockerfile
├── requirements.txt          # curl_cffi, sqlalchemy, schedule
└── main.py                   # Scheduled Yahoo Finance scraper
```

**How it works:**
1. On startup, waits for the database to be ready
2. Obtains a Yahoo Finance cookie + crumb via `fc.yahoo.com` → `/v1/test/getcrumb`
3. Fetches OHLCV price data from `/v8/finance/chart/{symbol}` for each stock (5Y history)
4. Fetches financial data from `/v10/finance/quoteSummary/{symbol}` (P/E, debt, revenue, employees, etc.)
5. Upserts all data into `stock_prices` and `stock_financials` tables
6. Repeats every 60 minutes (configurable via `SCRAPE_INTERVAL_MINUTES`)

**Why curl_cffi instead of yfinance:**
Yahoo Finance blocks requests that don't match a real browser's TLS fingerprint. `curl_cffi` with `impersonate="chrome"` provides the correct TLS handshake. The `yfinance` library's internal cookie handling is incompatible with `curl_cffi` sessions, so we call Yahoo's APIs directly.

### News Scraper (`/news-scraper`)

```
news-scraper/
├── Dockerfile
├── requirements.txt          # feedparser, vaderSentiment, curl_cffi, schedule
└── main.py                   # Google News + Twitter scraper with VADER
```

**How it works:**
1. On startup, ensures the `stock_news` unique constraint exists (migration-safe)
2. For each stock symbol, fetches Google News RSS (`https://news.google.com/rss/search?q={symbol}+stock`)
3. Parses headlines, extracts source names, and publication dates
4. Runs VADER sentiment analysis on each headline → compound score + label (positive/negative/neutral)
5. Upserts articles into `stock_news` table
6. If `TWITTER_BEARER_TOKEN` is set, also queries Twitter API v2 for recent tweets about each stock
7. Repeats every 30 minutes (configurable via `NEWS_INTERVAL_MINUTES`)

**VADER sentiment scoring:**
- Score >= 0.05 → **positive**
- Score <= -0.05 → **negative**
- Between → **neutral**
- Compound score ranges from -1.0 (most negative) to +1.0 (most positive)

**Enabling Twitter/X:**
Set `TWITTER_BEARER_TOKEN` in `docker-compose.yml` or as an environment variable. Requires a Twitter API v2 bearer token (paid tier).

### Frontend (`/frontend`)

```
frontend/
├── Dockerfile
├── package.json              # react, recharts, vite
├── vite.config.js
└── src/
    ├── main.jsx              # React root
    ├── App.jsx               # Top-level state, tabs (Dashboard/Finances/News)
    ├── App.css               # Dark theme, all component styles
    ├── api/
    │   └── stocks.js         # fetchStocks, fetchStockPrices, fetchWidgets,
    │                         # createWidget, deleteWidget, triggerScrape,
    │                         # fetchMarketStatus, fetchNews, fetchSentiment,
    │                         # fetchFinancials
    └── components/
        ├── StockSidebar.jsx  # Left pane — stock list with multi-select
        ├── Dashboard.jsx     # Toolbar (timeframe, scrape, add widget) + widget grid
        ├── Widget.jsx        # Recharts LineChart/BarChart + table/metric renderers
        ├── FinancesPanel.jsx # 4 financial analysis cards per stock
        ├── NewsPanel.jsx     # Sentiment gauges + news feed with filter
        └── StatusBar.jsx     # Fixed bottom bar — clock, scrape time, exchanges
```

**Key patterns:**
- **State lives in App.jsx** — `stocks`, `selectedSymbols`, and `activeTab` are passed down as props.
- **API layer** — `src/api/stocks.js` centralises every backend call. Components never call `fetch()` directly.
- **Widget rendering** — `Widget.jsx` fetches price data based on the selected timeframe, then delegates to `WidgetContent` which switches on `widget_type`.
- **Timeframe** — Dashboard manages a `timeframe` state (1W/1M/6M/1Y/5Y) and passes the corresponding day count to each Widget, which uses it as the `limit` parameter.
- **Tabs** — Three tabs: Dashboard (charts+widgets), Finances (fundamental data), News (headlines+sentiment).
- **StatusBar** — Polls `/api/status` every 60 seconds, runs a local clock every second.

### Database (`/database`)

```
database/
└── init.sql     # DDL (5 tables) + seed data, auto-runs on first container start
```

**Tables:** `stocks`, `stock_prices`, `stock_financials`, `stock_news`, `widgets`

The init script runs only when the PostgreSQL data volume is empty (first `docker compose up`). To re-seed, remove the volume:

```bash
docker compose down -v    # removes the pgdata volume
docker compose up --build
```

## Adding New Features

### Adding a New Widget Type

1. **Database** — insert a row into the `widgets` table (or use `POST /api/widgets`):
   ```sql
   INSERT INTO widgets (name, widget_type, config, position_x, position_y, width, height)
   VALUES ('My Widget', 'my_widget_type', '{}', 0, 2, 1, 1);
   ```

2. **Frontend** — add a template entry in `Dashboard.jsx` → `WIDGET_TEMPLATES` and a rendering branch in `Widget.jsx` → `WidgetContent`:
   ```jsx
   if (type === "my_widget_type") {
     return <div>/* your custom render */</div>;
   }
   ```

3. No backend changes needed unless the widget requires a new data endpoint.

### Adding a New API Endpoint

1. Create a new router file in `backend/app/routers/` or add to an existing one.
2. If it's a new router, mount it in `main.py`:
   ```python
   from app.routers import my_router
   app.include_router(my_router.router, prefix="/api/my-resource", tags=["my-resource"])
   ```
3. Add Pydantic schemas to `schemas.py` for request/response validation.
4. Add the corresponding fetch function in `frontend/src/api/stocks.js`.

### Adding a New Database Table

1. Add the SQLAlchemy model in `backend/app/models.py` (include any `UniqueConstraint` in `__table_args__`).
2. Add the DDL to `database/init.sql` so fresh environments get the table.
3. The backend auto-creates tables on startup via `Base.metadata.create_all()`, so existing environments pick up new tables too.
4. For adding constraints to existing tables, use `CREATE UNIQUE INDEX IF NOT EXISTS` in the service that needs it (see `news-scraper/main.py` → `ensure_unique_constraint()` as an example).

### Adding a New Tab

1. Create a new component in `frontend/src/components/`.
2. Import it in `App.jsx` and add a tab button + conditional render:
   ```jsx
   {activeTab === "mytab" && <MyPanel selectedSymbols={selectedSymbols} />}
   ```
3. Add any needed API functions in `frontend/src/api/stocks.js`.

### Adding a New Scraper Source

1. Add the scraping function to `news-scraper/main.py` (or create a new scraper service).
2. Use `curl_cffi` with `impersonate="chrome"` for sites that block bots.
3. Store results with `feed_source` set to your source name for filtering in the UI.
4. The `NewsPanel` feed filter can be extended by adding entries to the filter button array.

## Environment Variables

| Variable                  | Service       | Default   | Description                        |
| ------------------------- | ------------- | --------- | ---------------------------------- |
| `DATABASE_URL`            | backend, scrapers | `postgresql://stockuser:stockpass@db:5432/stockdb` | PostgreSQL connection |
| `POSTGRES_USER`           | db            | `stockuser`   | Database user                  |
| `POSTGRES_PASSWORD`       | db            | `stockpass`   | Database password              |
| `POSTGRES_DB`             | db            | `stockdb`     | Database name                  |
| `HISTORY_PERIOD`          | scraper       | `5y`          | Price history range (yfinance-style: 1d, 5d, 1mo, 3mo, 6mo, 1y, 5y, max) |
| `SCRAPE_INTERVAL_MINUTES` | scraper       | `60`          | Minutes between price scrapes  |
| `NEWS_INTERVAL_MINUTES`   | news-scraper  | `30`          | Minutes between news scrapes   |
| `TWITTER_BEARER_TOKEN`    | news-scraper  | *(empty)*     | Twitter API v2 bearer token (optional) |

## Docker Details

### Services

| Service       | Build Context   | Ports | Restart Policy   |
| ------------- | --------------- | ----- | ---------------- |
| db            | postgres:16-alpine | 5432 | *(default)*     |
| backend       | ./backend       | 8000  | *(default)*      |
| scraper       | ./scraper       | —     | unless-stopped   |
| news-scraper  | ./news-scraper  | —     | unless-stopped   |
| frontend      | ./frontend      | 3000  | *(default)*      |

### DNS Configuration

The `backend`, `scraper`, and `news-scraper` services use Google DNS (`8.8.8.8`, `8.8.4.4`) to ensure external API calls resolve correctly from inside Docker containers.

### Volumes

| Volume                  | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `pgdata`                | Persists database data across restarts              |
| `./backend:/app`        | Hot-reload for backend code changes                 |
| `./scraper:/app`        | Hot-reload for scraper code changes                 |
| `./news-scraper:/app`   | Hot-reload for news scraper code changes            |
| `./frontend:/app`       | Hot-reload for frontend code changes                |
| `/app/node_modules`     | Anonymous volume — prevents host overriding container's node_modules |

### Health Checks

The `db` service has a health check (`pg_isready`) — all dependent services wait for it before starting, ensuring the database is ready to accept connections.

## Useful Commands

```bash
# Start everything
docker compose up --build

# Start in background
docker compose up -d --build

# View logs for a single service
docker compose logs -f backend
docker compose logs -f scraper
docker compose logs -f news-scraper

# Rebuild a single service
docker compose build news-scraper

# Open a psql shell
docker compose exec db psql -U stockuser -d stockdb

# Check news data
docker compose exec db psql -U stockuser -d stockdb -c \
  "SELECT symbol, count(*) FROM stock_news n JOIN stocks s ON s.id=n.stock_id GROUP BY symbol;"

# Reset database (drops data volume)
docker compose down -v && docker compose up --build

# Stop everything
docker compose down
```

## Code Conventions

- **Backend**: Python, FastAPI style — type hints on all function signatures, Pydantic for validation.
- **Frontend**: Functional React components with hooks. No class components.
- **Naming**: snake_case in Python, camelCase in JavaScript. Database columns use snake_case.
- **API paths**: Always prefixed with `/api/`. RESTful resource naming (plural nouns).
- **Styles**: Single `App.css` file with BEM-like class naming (`.widget-header`, `.stock-item--active`).
- **Scraping**: Use `curl_cffi` with `impersonate="chrome"` for external APIs that block automated requests.

## Troubleshooting

### Yahoo Finance errors ("Expecting value", 401, TLS errors)
The scraper uses `curl_cffi` to impersonate Chrome's TLS fingerprint. If Yahoo changes their anti-bot measures, check that `curl_cffi` is up to date and the crumb flow still works.

### News scraper "no unique constraint" error
The `stock_news` table needs a `UNIQUE(stock_id, url)` constraint. The news scraper creates it automatically on startup (`ensure_unique_constraint()`). If you see this error, restart the news-scraper container.

### Docker DNS resolution failures
External API calls (Yahoo, Google News) require DNS resolution from inside containers. The `dns: [8.8.8.8, 8.8.4.4]` config in `docker-compose.yml` handles this. If your network blocks external DNS, update these to your local DNS server.

### Database re-seeding
`init.sql` only runs on first database creation. To re-run it: `docker compose down -v && docker compose up --build`.
