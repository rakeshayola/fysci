from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from zoneinfo import ZoneInfo

from app.database import get_db

router = APIRouter()

# Exchange mapping for seeded stocks (extend as new stocks are added)
EXCHANGE_MAP = {
    "AAPL": "NASDAQ", "GOOGL": "NASDAQ", "MSFT": "NASDAQ",
    "AMZN": "NASDAQ", "TSLA": "NASDAQ", "NVDA": "NASDAQ", "META": "NASDAQ",
    "JPM": "NYSE", "JNJ": "NYSE", "V": "NYSE",
}

MARKET_TZ = ZoneInfo("America/New_York")


def _is_market_open(now_et: datetime) -> bool:
    if now_et.weekday() >= 5:
        return False
    open_time = now_et.replace(hour=9, minute=30, second=0, microsecond=0)
    close_time = now_et.replace(hour=16, minute=0, second=0, microsecond=0)
    return open_time <= now_et <= close_time


@router.get("/")
def get_market_status(db: Session = Depends(get_db)):
    now_et = datetime.now(MARKET_TZ)
    market_open = _is_market_open(now_et)

    # Last scraped timestamp
    row = db.execute(text("SELECT MAX(created_at) FROM stock_prices")).scalar()
    last_scraped = row.isoformat() if row else None

    # Latest + previous close per stock for direction indicator
    rows = db.execute(text("""
        WITH ranked AS (
            SELECT s.symbol, sp.close, sp.date,
                   ROW_NUMBER() OVER (PARTITION BY s.symbol ORDER BY sp.date DESC) AS rn
            FROM stocks s
            JOIN stock_prices sp ON sp.stock_id = s.id
        )
        SELECT symbol,
               MAX(CASE WHEN rn = 1 THEN close END) AS latest_close,
               MAX(CASE WHEN rn = 2 THEN close END) AS prev_close,
               MAX(CASE WHEN rn = 1 THEN date END)  AS latest_date
        FROM ranked
        WHERE rn <= 2
        GROUP BY symbol
        ORDER BY symbol
    """)).fetchall()

    stocks = []
    exchange_agg = {}

    for symbol, latest, prev, latest_date in rows:
        change = float(latest - prev) if latest and prev else 0
        pct = (change / float(prev) * 100) if prev and float(prev) != 0 else 0
        exchange = EXCHANGE_MAP.get(symbol, "NYSE")

        stocks.append({
            "symbol": symbol,
            "exchange": exchange,
            "latest_close": float(latest) if latest else None,
            "change": round(change, 4),
            "change_pct": round(pct, 2),
            "date": str(latest_date) if latest_date else None,
        })

        if exchange not in exchange_agg:
            exchange_agg[exchange] = {"sum_pct": 0, "count": 0}
        exchange_agg[exchange]["sum_pct"] += pct
        exchange_agg[exchange]["count"] += 1

    exchanges = []
    for name, agg in sorted(exchange_agg.items()):
        avg = agg["sum_pct"] / agg["count"] if agg["count"] else 0
        exchanges.append({
            "name": name,
            "avg_change_pct": round(avg, 2),
            "direction": "up" if avg >= 0 else "down",
            "is_open": market_open,
        })

    return {
        "server_time_et": now_et.strftime("%Y-%m-%dT%H:%M:%S"),
        "market_open": market_open,
        "last_scraped": last_scraped,
        "exchanges": exchanges,
        "stocks": stocks,
    }
