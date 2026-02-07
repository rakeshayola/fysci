# Stock Dashboard

A full-stack stock dashboard application with a widget-based UI for analysing equities. Select stocks from a sidebar and view live-updating widgets (price tables, key metrics, volume data) on a configurable dashboard.

Built with **React**, **FastAPI**, and **PostgreSQL**, each running in its own Docker container.

![Architecture: Frontend :3000 → Backend :8000 → PostgreSQL :5432](https://img.shields.io/badge/containers-3-blue)

## Quick Start

**Prerequisites:** [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

```bash
# Clone and start all services
git clone <repo-url> && cd fysci
docker compose up --build
```

| Service    | URL                            |
| ---------- | ------------------------------ |
| Frontend   | http://localhost:3000           |
| Backend API| http://localhost:8000/api       |
| API Docs   | http://localhost:8000/docs      |
| Database   | `localhost:5432` (stockuser/stockpass) |

The database is seeded automatically with 10 sample stocks, 5 days of price history, and 3 default widgets.

## Usage

1. Open http://localhost:3000
2. **Sidebar (left)** — click stocks to select/deselect them (multi-select supported)
3. **Dashboard (main area)** — widgets react to your selection and display data for chosen stocks
4. Default widgets: **Price Chart**, **Key Metrics**, **Volume**

## Project Structure

```
fysci/
├── docker-compose.yml              # Orchestrates all 3 containers
├── database/
│   └── init.sql                    # Schema, seed stocks, prices & widgets
├── backend/                        # Python / FastAPI
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py                 # App entry, CORS, router registration
│       ├── database.py             # SQLAlchemy engine & session
│       ├── models.py               # ORM models (Stock, StockPrice, Widget)
│       ├── schemas.py              # Pydantic request/response schemas
│       └── routers/
│           ├── stocks.py           # /api/stocks endpoints
│           └── widgets.py          # /api/widgets endpoints
└── frontend/                       # React / Vite
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js              # Dev server + API proxy
    └── src/
        ├── App.jsx                 # Root layout & stock selection state
        ├── App.css                 # Dark theme
        ├── api/stocks.js           # Fetch helpers
        └── components/
            ├── StockSidebar.jsx    # Left pane stock list
            ├── Dashboard.jsx       # Widget grid
            └── Widget.jsx          # Individual widget card
```

## API Endpoints

### Stocks

| Method | Path                         | Description                 |
| ------ | ---------------------------- | --------------------------- |
| GET    | `/api/stocks/`               | List all stocks             |
| POST   | `/api/stocks/`               | Add a new stock             |
| GET    | `/api/stocks/{symbol}`       | Get stock by symbol         |
| GET    | `/api/stocks/{symbol}/prices`| Price history (query: `limit`) |

### Widgets

| Method | Path                      | Description            |
| ------ | ------------------------- | ---------------------- |
| GET    | `/api/widgets/`           | List all widgets       |
| POST   | `/api/widgets/`           | Create a widget        |
| DELETE | `/api/widgets/{widget_id}`| Remove a widget        |

### Health

| Method | Path           | Description   |
| ------ | -------------- | ------------- |
| GET    | `/api/health`  | Health check  |

## Database Schema

**stocks** — equities to track

| Column     | Type         | Notes              |
| ---------- | ------------ | ------------------ |
| id         | SERIAL PK    |                    |
| symbol     | VARCHAR(10)  | Unique, indexed    |
| name       | VARCHAR(255) |                    |
| sector     | VARCHAR(100) |                    |
| created_at | TIMESTAMP    | Default: now()     |

**stock_prices** — daily OHLCV data

| Column   | Type          | Notes                            |
| -------- | ------------- | -------------------------------- |
| id       | SERIAL PK     |                                  |
| stock_id | INTEGER FK    | References stocks(id), cascades  |
| date     | DATE          | Unique with stock_id             |
| open     | NUMERIC(12,4) |                                  |
| high     | NUMERIC(12,4) |                                  |
| low      | NUMERIC(12,4) |                                  |
| close    | NUMERIC(12,4) |                                  |
| volume   | BIGINT        |                                  |

**widgets** — dashboard widget configuration

| Column      | Type         | Notes              |
| ----------- | ------------ | ------------------ |
| id          | SERIAL PK    |                    |
| name        | VARCHAR(100) |                    |
| widget_type | VARCHAR(50)  | price_chart, key_metrics, volume_chart |
| config      | JSONB        | Default: {}        |
| position_x  | INTEGER      | Grid column        |
| position_y  | INTEGER      | Grid row           |
| width       | INTEGER      | Column span        |
| height      | INTEGER      | Row span           |

## Tech Stack

| Layer     | Technology               | Version |
| --------- | ------------------------ | ------- |
| Frontend  | React + Vite             | 18 / 6  |
| Backend   | FastAPI + Uvicorn        | 0.115 / 0.34 |
| ORM       | SQLAlchemy               | 2.0     |
| Database  | PostgreSQL               | 16      |
| Container | Docker Compose           | v2      |

## License

[MIT](LICENSE)
