from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base, SessionLocal
from app.models import Stock
from app.routers import stocks, widgets, financials, scraper, status, news, settings, agent, auth, portfolios, analysis

Base.metadata.create_all(bind=engine)

SEED_INDICES = [
    ("^GSPC", "S&P 500", "Index"),
    ("^IXIC", "NASDAQ Composite", "Index"),
    ("^DJI", "Dow Jones Industrial Average", "Index"),
    ("^RUT", "Russell 2000", "Index"),
    ("^VIX", "CBOE Volatility Index", "Index"),
    ("^FTSE", "FTSE 100", "Index"),
    ("^N225", "Nikkei 225", "Index"),
]


def _seed_indices():
    db = SessionLocal()
    try:
        for symbol, name, sector in SEED_INDICES:
            exists = db.query(Stock).filter(Stock.symbol == symbol).first()
            if not exists:
                db.add(Stock(symbol=symbol, name=name, sector=sector))
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app):
    _seed_indices()
    yield


app = FastAPI(title="Stock Dashboard API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stocks.router, prefix="/api/stocks", tags=["stocks"])
app.include_router(widgets.router, prefix="/api/widgets", tags=["widgets"])
app.include_router(financials.router, prefix="/api/financials", tags=["financials"])
app.include_router(scraper.router, prefix="/api/scraper", tags=["scraper"])
app.include_router(status.router, prefix="/api/status", tags=["status"])
app.include_router(news.router, prefix="/api/news", tags=["news"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(agent.router, prefix="/api/agent", tags=["agent"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(portfolios.router, prefix="/api/portfolios", tags=["portfolios"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["analysis"])


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
