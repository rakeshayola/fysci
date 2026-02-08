from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.routers import stocks, widgets, financials, scraper, status

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Stock Dashboard API", version="0.1.0")

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


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
