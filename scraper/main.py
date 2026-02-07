import os
import time
import logging
from datetime import datetime

import schedule
import yfinance as yf
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://stockuser:stockpass@db:5432/stockdb",
)

engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)

HISTORY_PERIOD = os.getenv("HISTORY_PERIOD", "1y")
SCRAPE_INTERVAL_MINUTES = int(os.getenv("SCRAPE_INTERVAL_MINUTES", "60"))


def get_tracked_symbols():
    """Fetch all stock symbols from the database."""
    with Session() as session:
        rows = session.execute(text("SELECT id, symbol FROM stocks ORDER BY symbol"))
        return [(row[0], row[1]) for row in rows]


def scrape_stock(stock_id: int, symbol: str):
    """Download price history for a single stock and upsert into the database."""
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=HISTORY_PERIOD)

        if hist.empty:
            logger.warning(f"No data returned for {symbol}")
            return 0

        rows = []
        for date, row in hist.iterrows():
            rows.append({
                "stock_id": stock_id,
                "date": date.date(),
                "open": round(float(row["Open"]), 4),
                "high": round(float(row["High"]), 4),
                "low": round(float(row["Low"]), 4),
                "close": round(float(row["Close"]), 4),
                "volume": int(row["Volume"]),
            })

        with Session() as session:
            for r in rows:
                session.execute(
                    text("""
                        INSERT INTO stock_prices (stock_id, date, open, high, low, close, volume)
                        VALUES (:stock_id, :date, :open, :high, :low, :close, :volume)
                        ON CONFLICT (stock_id, date)
                        DO UPDATE SET open = EXCLUDED.open,
                                      high = EXCLUDED.high,
                                      low  = EXCLUDED.low,
                                      close = EXCLUDED.close,
                                      volume = EXCLUDED.volume
                    """),
                    r,
                )
            session.commit()

        logger.info(f"{symbol}: upserted {len(rows)} price rows")

        # Scrape financial data
        try:
            info = ticker.info or {}
            fin_data = {
                "stock_id": stock_id,
                "pe_ratio": info.get("trailingPE"),
                "forward_pe": info.get("forwardPE"),
                "market_cap": info.get("marketCap"),
                "total_debt": info.get("totalDebt"),
                "total_revenue": info.get("totalRevenue"),
                "operating_expense": info.get("operatingExpense") or info.get("totalOperatingExpenses"),
                "capital_expenditure": abs(info.get("capitalExpenditure") or info.get("capex") or 0) or None,
                "num_employees": info.get("fullTimeEmployees"),
                "earnings_per_share": info.get("trailingEps"),
            }
            with Session() as session:
                session.execute(
                    text("""
                        INSERT INTO stock_financials
                            (stock_id, pe_ratio, forward_pe, market_cap, total_debt,
                             total_revenue, operating_expense, capital_expenditure,
                             num_employees, earnings_per_share)
                        VALUES
                            (:stock_id, :pe_ratio, :forward_pe, :market_cap, :total_debt,
                             :total_revenue, :operating_expense, :capital_expenditure,
                             :num_employees, :earnings_per_share)
                        ON CONFLICT (stock_id)
                        DO UPDATE SET
                            pe_ratio=EXCLUDED.pe_ratio, forward_pe=EXCLUDED.forward_pe,
                            market_cap=EXCLUDED.market_cap, total_debt=EXCLUDED.total_debt,
                            total_revenue=EXCLUDED.total_revenue,
                            operating_expense=EXCLUDED.operating_expense,
                            capital_expenditure=EXCLUDED.capital_expenditure,
                            num_employees=EXCLUDED.num_employees,
                            earnings_per_share=EXCLUDED.earnings_per_share,
                            updated_at=NOW()
                    """),
                    fin_data,
                )
                session.commit()
            logger.info(f"{symbol}: financials updated")
        except Exception:
            logger.exception(f"Error scraping financials for {symbol}")

        return len(rows)

    except Exception:
        logger.exception(f"Error scraping {symbol}")
        return 0


def run_scrape():
    """Scrape all tracked stocks."""
    symbols = get_tracked_symbols()
    logger.info(f"Starting scrape for {len(symbols)} stocks...")
    total = 0
    for stock_id, symbol in symbols:
        total += scrape_stock(stock_id, symbol)
        time.sleep(1)  # rate-limit between tickers
    logger.info(f"Scrape complete — {total} total rows upserted")


def wait_for_db(retries=30, delay=2):
    """Block until the database is reachable."""
    for attempt in range(retries):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Database is ready")
            return
        except Exception:
            logger.info(f"Waiting for database (attempt {attempt + 1}/{retries})...")
            time.sleep(delay)
    raise RuntimeError("Could not connect to database")


if __name__ == "__main__":
    wait_for_db()

    logger.info("Running initial scrape...")
    run_scrape()

    logger.info(f"Scheduling scrape every {SCRAPE_INTERVAL_MINUTES} minutes")
    schedule.every(SCRAPE_INTERVAL_MINUTES).minutes.do(run_scrape)

    while True:
        schedule.run_pending()
        time.sleep(10)
