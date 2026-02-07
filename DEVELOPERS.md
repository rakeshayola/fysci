# Developer Guide

This guide covers the architecture, local development workflow, and conventions for contributing to the Stock Dashboard project.

## Architecture Overview

The application follows a three-tier architecture, with each tier running in its own Docker container:

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│    Frontend      │      │    Backend       │      │    Database      │
│  React / Vite    │─────▶│  FastAPI         │─────▶│  PostgreSQL 16   │
│  :3000           │ /api │  :8000           │      │  :5432           │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

**Request flow:**
1. Browser loads the React SPA from the Vite dev server on port 3000
2. All `/api/*` requests are proxied by Vite to the FastAPI backend on port 8000
3. FastAPI uses SQLAlchemy to query PostgreSQL
4. Responses flow back as JSON to the React frontend

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

All three services start with hot-reload enabled — edit any file and see changes immediately.

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

# Point to your database
export DATABASE_URL=postgresql://stockuser:stockpass@localhost:5432/stockdb

uvicorn app.main:app --reload --port 8000
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
├── requirements.txt
└── app/
    ├── main.py          # FastAPI app, middleware, router mounts
    ├── database.py      # Engine, session factory, get_db dependency
    ├── models.py        # SQLAlchemy ORM models
    ├── schemas.py       # Pydantic schemas (validation + serialisation)
    └── routers/
        ├── stocks.py    # Stock & price endpoints
        └── widgets.py   # Widget CRUD endpoints
```

**Key patterns:**
- **Dependency injection** — `get_db()` yields a SQLAlchemy session per request and closes it automatically.
- **Router organisation** — each domain (stocks, widgets) has its own router file under `routers/`, mounted with a URL prefix in `main.py`.
- **Schema separation** — `schemas.py` defines `*Create` (input) and `*Out` (output) models. ORM objects are converted via `model_config = {"from_attributes": True}`.

### Frontend (`/frontend`)

```
frontend/
├── Dockerfile
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx                # React root
    ├── App.jsx                 # Top-level state & layout
    ├── App.css                 # Global styles (dark theme)
    ├── api/
    │   └── stocks.js           # All fetch() calls to the backend
    └── components/
        ├── StockSidebar.jsx    # Stock list with selection
        ├── Dashboard.jsx       # Widget container & grid
        └── Widget.jsx          # Widget card + type-specific renderers
```

**Key patterns:**
- **State lives in App.jsx** — `stocks` (all available) and `selectedSymbols` (user's picks) are passed down as props.
- **API layer** — `src/api/stocks.js` centralises every backend call. Components never call `fetch()` directly.
- **Widget rendering** — `Widget.jsx` fetches price data for selected symbols, then delegates to `WidgetContent` which switches on `widget_type` to render the right view.

### Database (`/database`)

```
database/
└── init.sql     # DDL + seed data, auto-runs on first container start
```

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

2. **Frontend** — add a rendering branch in `Widget.jsx` → `WidgetContent`:
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

1. Add the SQLAlchemy model in `backend/app/models.py`.
2. Add the DDL to `database/init.sql` so fresh environments get the table.
3. The backend auto-creates tables on startup via `Base.metadata.create_all()`, so existing environments pick up changes too.

## Environment Variables

| Variable       | Service  | Default                                             | Description          |
| -------------- | -------- | --------------------------------------------------- | -------------------- |
| `DATABASE_URL` | backend  | `postgresql://stockuser:stockpass@db:5432/stockdb`  | PostgreSQL connection string |
| `POSTGRES_USER`| db       | `stockuser`                                         | Database user        |
| `POSTGRES_PASSWORD`| db   | `stockpass`                                         | Database password    |
| `POSTGRES_DB`  | db       | `stockdb`                                           | Database name        |

## Docker Details

### Volumes

| Volume                  | Purpose                                       |
| ----------------------- | --------------------------------------------- |
| `pgdata`                | Persists database data across restarts         |
| `./backend:/app`        | Hot-reload for backend code changes            |
| `./frontend:/app`       | Hot-reload for frontend code changes           |
| `/app/node_modules`     | Anonymous volume — prevents host overriding container's node_modules |

### Ports

| Port  | Service   |
| ----- | --------- |
| 3000  | Frontend  |
| 8000  | Backend   |
| 5432  | PostgreSQL|

### Health Checks

The `db` service has a health check (`pg_isready`) — the backend waits for it before starting, ensuring the database is ready to accept connections.

## Useful Commands

```bash
# Start everything
docker compose up --build

# Start in background
docker compose up -d --build

# View logs for a single service
docker compose logs -f backend

# Rebuild a single service
docker compose build frontend

# Open a psql shell
docker compose exec db psql -U stockuser -d stockdb

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

## Roadmap Ideas

These are potential enhancements to build on the skeleton:

- Real stock data via yfinance or Alpha Vantage
- Charting with Recharts or Chart.js
- Drag-and-drop widget repositioning
- User authentication and per-user dashboards
- WebSocket for real-time price updates
- Additional widget types (news feed, moving averages, RSI)
