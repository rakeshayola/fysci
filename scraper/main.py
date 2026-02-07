import os
import time
import logging

from curl_cffi.requests import Session as CffiSession
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


def _make_session():
    """Create a curl_cffi session that impersonates Chrome to bypass TLS fingerprinting."""
    return CffiSession(impersonate="chrome")


def get_tracked_symbols():
    """Fetch all stock symbols from the database."""
    with Session() as session:
        rows = session.execute(text("SELECT id, symbol FROM stocks ORDER BY symbol"))
        return [(row[0], row[1]) for row in rows]


def scrape_prices(symbol_map: dict[str, int]):
    """Batch-download price history using yf.download() and upsert into the database."""
    symbols = list(symbol_map.keys())
    logger.info(f"Downloading prices for {len(symbols)} stocks...")

    try:
        df = yf.download(
            symbols,
            period=HISTORY_PERIOD,
            group_by="ticker",
            threads=False,
            session=_make_session(),
        )
    except Exception:
        logger.exception("yf.download() failed")
        return 0

    if df.empty:
        logger.warning("yf.download() returned empty dataframe")
        return 0

    total = 0
    with Session() as db_session:
        for symbol in symbols:
            stock_id = symbol_map[symbol]
            try:
                if len(symbols) == 1:
                    stock_df = df
                else:
                    stock_df = df[symbol]

                stock_df = stock_df.dropna(subset=["Close"])
                if stock_df.empty:
                    logger.warning(f"{symbol}: no price rows after dropna")
                    continue

                for date_idx, row in stock_df.iterrows():
                    db_session.execute(
                        text("""
                            INSERT INTO stock_prices (stock_id, date, open, high, low, close, volume)
                            VALUES (:stock_id, :date, :open, :high, :low, :close, :volume)
                            ON CONFLICT (stock_id, date)
                            DO UPDATE SET open=EXCLUDED.open, high=EXCLUDED.high,
                                          low=EXCLUDED.low, close=EXCLUDED.close,
                                          volume=EXCLUDED.volume
                        """),
                        {
                            "stock_id": stock_id,
                            "date": date_idx.date(),
                            "open": round(float(row["Open"]), 4) if row.get("Open") else None,
                            "high": round(float(row["High"]), 4) if row.get("High") else None,
                            "low": round(float(row["Low"]), 4) if row.get("Low") else None,
                            "close": round(float(row["Close"]), 4),
                            "volume": int(row["Volume"]) if row.get("Volume") else 0,
                        },
                    )
                total += len(stock_df)
                logger.info(f"{symbol}: {len(stock_df)} price rows")
            except Exception:
                logger.exception(f"Error processing prices for {symbol}")

        db_session.commit()

    logger.info(f"Prices done — {total} total rows upserted")
    return total


YAHOO_QUOTE_URL = "https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}"
YAHOO_MODULES = "defaultKeyStatistics,financialData,summaryDetail,assetProfile"


def _fetch_yahoo_info(symbol: str, http_session: CffiSession) -> dict:
    """Fetch financial info directly from Yahoo Finance API using curl_cffi."""
    url = YAHOO_QUOTE_URL.format(symbol=symbol)
    resp = http_session.get(url, params={"modules": YAHOO_MODULES})
    resp.raise_for_status()
    data = resp.json()
    result = data.get("quoteSummary", {}).get("result")
    if not result:
        return {}
    modules = result[0]
    # Flatten the nested module dicts into one dict, extracting 'raw' values
    flat = {}
    for module in modules.values():
        if not isinstance(module, dict):
            continue
        for key, val in module.items():
            if isinstance(val, dict) and "raw" in val:
                flat[key] = val["raw"]
            elif not isinstance(val, (dict, list)):
                flat[key] = val
    return flat


def scrape_financials(symbol_map: dict[str, int]):
    """Fetch financial data for each stock directly from Yahoo Finance API."""
    http_session = _make_session()
    count = 0

    for symbol, stock_id in symbol_map.items():
        try:
            info = _fetch_yahoo_info(symbol, http_session)

            if not info:
                logger.warning(f"{symbol}: Yahoo API returned empty, skipping financials")
                continue

            fin_data = {
                "stock_id": stock_id,
                "pe_ratio": info.get("trailingPE"),
                "forward_pe": info.get("forwardPE"),
                "market_cap": info.get("marketCap"),
                "total_debt": info.get("totalDebt"),
                "total_revenue": info.get("totalRevenue"),
                "operating_expense": info.get("operatingExpenses") or info.get("totalOperatingExpenses"),
                "capital_expenditure": abs(info.get("capitalExpenditures") or info.get("capitalExpenditure") or 0) or None,
                "num_employees": info.get("fullTimeEmployees"),
                "earnings_per_share": info.get("trailingEps"),
            }

            with Session() as db_session:
                db_session.execute(
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
                db_session.commit()

            logger.info(f"{symbol}: financials updated")
            count += 1
        except Exception:
            logger.exception(f"Error scraping financials for {symbol}")

        time.sleep(2)  # rate-limit between calls

    logger.info(f"Financials done — {count}/{len(symbol_map)} stocks")
    return count


def run_scrape():
    """Scrape all tracked stocks."""
    tracked = get_tracked_symbols()
    symbol_map = {symbol: stock_id for stock_id, symbol in tracked}
    logger.info(f"Starting scrape for {len(symbol_map)} stocks...")

    scrape_prices(symbol_map)
    scrape_financials(symbol_map)

    logger.info("Scrape complete")


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
