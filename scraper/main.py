import os
import time
import logging
from datetime import datetime, timezone

from curl_cffi.requests import Session as CffiSession
import schedule
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

HISTORY_PERIOD = os.getenv("HISTORY_PERIOD", "5y")
SCRAPE_INTERVAL_MINUTES = int(os.getenv("SCRAPE_INTERVAL_MINUTES", "60"))

YAHOO_CHART_URL = "https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
YAHOO_QUOTE_URL = "https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}"
YAHOO_MODULES = "defaultKeyStatistics,financialData,summaryDetail,assetProfile"


def _make_session():
    """Create a curl_cffi session that impersonates Chrome."""
    return CffiSession(impersonate="chrome")


def _get_yahoo_crumb(http_session: CffiSession) -> str:
    """Obtain a Yahoo Finance cookie + crumb."""
    http_session.get("https://fc.yahoo.com", allow_redirects=True)
    resp = http_session.get("https://query2.finance.yahoo.com/v1/test/getcrumb")
    resp.raise_for_status()
    crumb = resp.text.strip()
    if not crumb:
        raise RuntimeError("Failed to obtain Yahoo crumb")
    return crumb


def get_tracked_symbols():
    """Fetch all stock symbols from the database."""
    with Session() as session:
        rows = session.execute(text("SELECT id, symbol FROM stocks ORDER BY symbol"))
        return [(row[0], row[1]) for row in rows]


def _fetch_chart(symbol: str, http_session: CffiSession, crumb: str, period: str = "1y") -> list[dict]:
    """Fetch OHLCV data from Yahoo Finance chart API."""
    url = YAHOO_CHART_URL.format(symbol=symbol)
    resp = http_session.get(url, params={
        "range": period,
        "interval": "1d",
        "crumb": crumb,
    })
    resp.raise_for_status()
    data = resp.json()

    result = data.get("chart", {}).get("result")
    if not result:
        return []

    chart = result[0]
    timestamps = chart.get("timestamp", [])
    quote = chart.get("indicators", {}).get("quote", [{}])[0]

    opens = quote.get("open", [])
    highs = quote.get("high", [])
    lows = quote.get("low", [])
    closes = quote.get("close", [])
    volumes = quote.get("volume", [])

    rows = []
    for i, ts in enumerate(timestamps):
        close_val = closes[i] if i < len(closes) else None
        if close_val is None:
            continue
        dt = datetime.fromtimestamp(ts, tz=timezone.utc).date()
        rows.append({
            "date": dt,
            "open": round(float(opens[i]), 4) if i < len(opens) and opens[i] is not None else None,
            "high": round(float(highs[i]), 4) if i < len(highs) and highs[i] is not None else None,
            "low": round(float(lows[i]), 4) if i < len(lows) and lows[i] is not None else None,
            "close": round(float(close_val), 4),
            "volume": int(volumes[i]) if i < len(volumes) and volumes[i] is not None else 0,
        })
    return rows


def _fetch_yahoo_info(symbol: str, http_session: CffiSession, crumb: str) -> dict:
    """Fetch financial info from Yahoo Finance quoteSummary API."""
    url = YAHOO_QUOTE_URL.format(symbol=symbol)
    resp = http_session.get(url, params={"modules": YAHOO_MODULES, "crumb": crumb})
    resp.raise_for_status()
    data = resp.json()
    result = data.get("quoteSummary", {}).get("result")
    if not result:
        return {}
    modules = result[0]
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


def scrape_prices(symbol_map: dict[str, int], http_session: CffiSession, crumb: str):
    """Download price history for each stock and upsert into the database."""
    logger.info(f"Downloading prices for {len(symbol_map)} stocks...")
    total = 0

    for symbol, stock_id in symbol_map.items():
        try:
            rows = _fetch_chart(symbol, http_session, crumb, HISTORY_PERIOD)
            if not rows:
                logger.warning(f"{symbol}: no price data returned")
                continue

            with Session() as db_session:
                for r in rows:
                    db_session.execute(
                        text("""
                            INSERT INTO stock_prices (stock_id, date, open, high, low, close, volume)
                            VALUES (:stock_id, :date, :open, :high, :low, :close, :volume)
                            ON CONFLICT (stock_id, date)
                            DO UPDATE SET open=EXCLUDED.open, high=EXCLUDED.high,
                                          low=EXCLUDED.low, close=EXCLUDED.close,
                                          volume=EXCLUDED.volume
                        """),
                        {"stock_id": stock_id, **r},
                    )
                db_session.commit()

            total += len(rows)
            logger.info(f"{symbol}: {len(rows)} price rows")
        except Exception:
            logger.exception(f"Error scraping prices for {symbol}")
        time.sleep(1)

    logger.info(f"Prices done — {total} total rows upserted")
    return total


def scrape_financials(symbol_map: dict[str, int], http_session: CffiSession, crumb: str):
    """Fetch financial data for each stock from Yahoo Finance API."""
    count = 0

    for symbol, stock_id in symbol_map.items():
        try:
            info = _fetch_yahoo_info(symbol, http_session, crumb)

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

        time.sleep(2)

    logger.info(f"Financials done — {count}/{len(symbol_map)} stocks")
    return count


def run_scrape():
    """Scrape all tracked stocks."""
    tracked = get_tracked_symbols()
    symbol_map = {symbol: stock_id for stock_id, symbol in tracked}
    logger.info(f"Starting scrape for {len(symbol_map)} stocks...")

    http_session = _make_session()
    try:
        crumb = _get_yahoo_crumb(http_session)
        logger.info(f"Obtained Yahoo crumb: {crumb[:8]}...")
    except Exception:
        logger.exception("Failed to obtain Yahoo crumb — cannot scrape")
        return

    scrape_prices(symbol_map, http_session, crumb)
    scrape_financials(symbol_map, http_session, crumb)

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
