# Stock Dashboard

A full-stack stock dashboard application with a widget-based UI for analysing equities. Select stocks from a sidebar and view live-updating widgets — interactive charts, financial metrics, news feeds with sentiment analysis — across a tabbed interface.

Built with **React**, **FastAPI**, and **PostgreSQL**, with dedicated scraper services for market data and news, each running in its own Docker container.

![Architecture: 5 containers](https://img.shields.io/badge/containers-5-blue)

## Quick Start

**Prerequisites:** [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

```bash
# Clone and start all services
git clone <repo-url> && cd fysci
docker compose up --build
```

| Service        | URL                                  |
| -------------- | ------------------------------------ |
| Frontend       | http://localhost:3000                 |
| Backend API    | http://localhost:8000/api             |
| API Docs       | http://localhost:8000/docs            |
| Database       | `localhost:5432` (stockuser/stockpass)|

The database is seeded with 10 sample stocks, 5 days of price history, and 5 default widgets. The scrapers begin pulling real data on startup.

## Features

### Dashboard Tab
- **Interactive charts** — historic close price (line chart) and volume history (bar chart) powered by Recharts
- **Timeframe selector** — toggle between 1W, 1M, 6M, 1Y, and 5Y of price history
- **Toolbar** — "Scrape Now" button for on-demand data refresh, "+ Add Widget" dropdown to add/remove widgets
- **Widget types** — history_chart, volume_bar_chart, price_chart (table), key_metrics, volume_chart

### Finances Tab
- **Financial cards** — P/E Ratio, CAPEX & OPEX, Debt & Revenue, Employees & Earnings
- **Computed metrics** — revenue per employee, estimated median salary
- Data sourced from Yahoo Finance quoteSummary API

### News Tab
- **Sentiment analysis** — per-stock sentiment gauge (bullish/bearish/neutral) with stacked bar visualization
- **Live news feed** — merged headlines from Google News RSS with sentiment badges and time-ago timestamps
- **Feed filter** — toggle between All, Google News, and Twitter/X sources
- **Twitter/X integration** — ready to activate with a `TWITTER_BEARER_TOKEN` environment variable

### Floating Status Bar
- **Live clock** — local date and time, ticking every second
- **Last data pull** — timestamp of most recent scrape
- **Exchange status** — NASDAQ/NYSE open/closed indicator with direction arrows
- **Market direction** — aggregate change percentage for selected stocks

## Project Structure

```
fysci/
├── docker-compose.yml                # Orchestrates all 5 containers
├── database/
│   └── init.sql                      # Schema (5 tables), seed data
├── backend/                          # Python / FastAPI
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py                   # App entry, CORS, router registration
│       ├── database.py               # SQLAlchemy engine & session
│       ├── models.py                 # ORM models
│       ├── schemas.py                # Pydantic request/response schemas
│       └── routers/
│           ├── stocks.py             # /api/stocks endpoints
│           ├── widgets.py            # /api/widgets endpoints
│           ├── financials.py         # /api/financials endpoints
│           ├── scraper.py            # /api/scraper on-demand scrape
│           ├── status.py             # /api/status market status
│           └── news.py               # /api/news headlines & sentiment
├── scraper/                          # Price & financials scraper service
│   ├── Dockerfile
│   ├── requirements.txt
│   └── main.py                       # Yahoo Finance chart + quoteSummary API
├── news-scraper/                     # News & sentiment scraper service
│   ├── Dockerfile
│   ├── requirements.txt
│   └── main.py                       # Google News RSS + Twitter + VADER
└── frontend/                         # React / Vite
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js                # Dev server + API proxy
    └── src/
        ├── App.jsx                   # Root layout, tabs, stock selection
        ├── App.css                   # Dark theme styles
        ├── api/stocks.js             # All fetch helpers
        └── components/
            ├── StockSidebar.jsx      # Left pane stock list
            ├── Dashboard.jsx         # Toolbar + widget grid
            ├── Widget.jsx            # Chart/table widget cards (Recharts)
            ├── FinancesPanel.jsx     # Financial analysis cards
            ├── NewsPanel.jsx         # News feed + sentiment gauges
            └── StatusBar.jsx         # Floating bottom status bar
```

## API Endpoints

### Stocks

| Method | Path                          | Description                          |
| ------ | ----------------------------- | ------------------------------------ |
| GET    | `/api/stocks/`                | List all stocks                      |
| POST   | `/api/stocks/`                | Add a new stock                      |
| GET    | `/api/stocks/{symbol}`        | Get stock by symbol                  |
| GET    | `/api/stocks/{symbol}/prices` | Price history (query: `limit`, max 1300) |

### Widgets

| Method | Path                       | Description     |
| ------ | -------------------------- | --------------- |
| GET    | `/api/widgets/`            | List all widgets|
| POST   | `/api/widgets/`            | Create a widget |
| DELETE | `/api/widgets/{widget_id}` | Remove a widget |

### Financials

| Method | Path                        | Description                   |
| ------ | --------------------------- | ----------------------------- |
| GET    | `/api/financials/{symbol}`  | Financial data for a stock    |

### News & Sentiment

| Method | Path                            | Description                           |
| ------ | ------------------------------- | ------------------------------------- |
| GET    | `/api/news/{symbol}`            | Headlines (query: `limit`, `feed`)    |
| GET    | `/api/news/{symbol}/sentiment`  | Aggregated sentiment summary          |

### Scraper

| Method | Path               | Description                     |
| ------ | ------------------ | ------------------------------- |
| POST   | `/api/scraper/run` | Trigger on-demand price scrape  |

### Status

| Method | Path           | Description                                |
| ------ | -------------- | ------------------------------------------ |
| GET    | `/api/status/` | Market hours, exchange status, last scraped|

### Health

| Method | Path          | Description  |
| ------ | ------------- | ------------ |
| GET    | `/api/health` | Health check |

## Database Schema

**stocks** — equities to track

| Column     | Type         | Notes           |
| ---------- | ------------ | --------------- |
| id         | SERIAL PK    |                 |
| symbol     | VARCHAR(10)  | Unique, indexed |
| name       | VARCHAR(255) |                 |
| sector     | VARCHAR(100) |                 |
| created_at | TIMESTAMP    | Default: now()  |

**stock_prices** — daily OHLCV data

| Column   | Type          | Notes                           |
| -------- | ------------- | ------------------------------- |
| id       | SERIAL PK     |                                 |
| stock_id | INTEGER FK    | References stocks(id), cascades |
| date     | DATE          | Unique with stock_id            |
| open     | NUMERIC(12,4) |                                 |
| high     | NUMERIC(12,4) |                                 |
| low      | NUMERIC(12,4) |                                 |
| close    | NUMERIC(12,4) |                                 |
| volume   | BIGINT        |                                 |

**stock_financials** — fundamental data per stock

| Column              | Type          | Notes                           |
| ------------------- | ------------- | ------------------------------- |
| id                  | SERIAL PK     |                                 |
| stock_id            | INTEGER FK    | Unique, references stocks(id)   |
| pe_ratio            | NUMERIC(12,4) | Trailing P/E                    |
| forward_pe          | NUMERIC(12,4) |                                 |
| market_cap          | BIGINT        |                                 |
| total_debt          | BIGINT        |                                 |
| total_revenue       | BIGINT        |                                 |
| operating_expense   | BIGINT        |                                 |
| capital_expenditure | BIGINT        |                                 |
| num_employees       | INTEGER       |                                 |
| earnings_per_share  | NUMERIC(12,4) |                                 |
| updated_at          | TIMESTAMP     | Default: now()                  |

**stock_news** — headlines with sentiment

| Column          | Type          | Notes                              |
| --------------- | ------------- | ---------------------------------- |
| id              | SERIAL PK     |                                    |
| stock_id        | INTEGER FK    | References stocks(id), cascades    |
| headline        | VARCHAR(500)  |                                    |
| url             | VARCHAR(1000) | Unique with stock_id               |
| source          | VARCHAR(200)  | Publisher name                     |
| published_at    | TIMESTAMP     |                                    |
| sentiment_score | NUMERIC(5,4)  | -1.0 (bearish) to +1.0 (bullish)  |
| sentiment_label | VARCHAR(10)   | positive / negative / neutral      |
| feed_source     | VARCHAR(20)   | google / twitter                   |
| created_at      | TIMESTAMP     | Default: now()                     |

**widgets** — dashboard widget configuration

| Column      | Type         | Notes                                              |
| ----------- | ------------ | -------------------------------------------------- |
| id          | SERIAL PK    |                                                    |
| name        | VARCHAR(100) |                                                    |
| widget_type | VARCHAR(50)  | history_chart, volume_bar_chart, price_chart, etc. |
| config      | JSONB        | Default: {}                                        |
| position_x  | INTEGER      | Grid column                                        |
| position_y  | INTEGER      | Grid row                                           |
| width       | INTEGER      | Column span                                        |
| height      | INTEGER      | Row span                                           |

## Tech Stack

| Layer          | Technology                | Version    |
| -------------- | ------------------------- | ---------- |
| Frontend       | React + Vite              | 18 / 6     |
| Charts         | Recharts                  | 2.x        |
| Backend        | FastAPI + Uvicorn         | 0.115 / 0.34 |
| ORM            | SQLAlchemy                | 2.0        |
| Database       | PostgreSQL                | 16         |
| Scraper        | curl_cffi + Yahoo Finance | direct API |
| News Scraper   | feedparser + VADER        |            |
| Sentiment      | vaderSentiment            | 3.3        |
| Container      | Docker Compose            | v2         |

## Environment Variables

| Variable                 | Service       | Default  | Description                        |
| ------------------------ | ------------- | -------- | ---------------------------------- |
| `DATABASE_URL`           | backend, scrapers | `postgresql://stockuser:stockpass@db:5432/stockdb` | PostgreSQL connection |
| `POSTGRES_USER`          | db            | `stockuser`  | Database user                  |
| `POSTGRES_PASSWORD`      | db            | `stockpass`  | Database password              |
| `POSTGRES_DB`            | db            | `stockdb`    | Database name                  |
| `HISTORY_PERIOD`         | scraper       | `5y`         | Price history range to fetch   |
| `SCRAPE_INTERVAL_MINUTES`| scraper       | `60`         | Price scrape frequency         |
| `NEWS_INTERVAL_MINUTES`  | news-scraper  | `30`         | News scrape frequency          |
| `TWITTER_BEARER_TOKEN`   | news-scraper  | *(empty)*    | Twitter API v2 bearer token    |

## License

[MIT](LICENSE)
