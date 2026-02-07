import logging
import time

import requests
import yfinance as yf
from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.database import engine

logger = logging.getLogger(__name__)

router = APIRouter()


class ScrapeStatus(BaseModel):
    status: str
    message: str


def _make_session():
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    })
    return s


@router.post("/run", response_model=ScrapeStatus)
def trigger_scrape():
    """Trigger an on-demand scrape using yf.download() for prices and ticker.info for financials."""
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT id, symbol FROM stocks ORDER BY symbol"))
            symbol_map = {r[1]: r[0] for r in rows}

        if not symbol_map:
            return ScrapeStatus(status="ok", message="No stocks to scrape")

        symbols = list(symbol_map.keys())
        http_session = _make_session()
        price_count = 0
        fin_count = 0

        # --- Batch download prices ---
        try:
            df = yf.download(
                symbols,
                period="1y",
                group_by="ticker",
                threads=False,
                session=http_session,
            )

            if not df.empty:
                with engine.begin() as conn:
                    for symbol in symbols:
                        try:
                            stock_df = df if len(symbols) == 1 else df[symbol]
                            stock_df = stock_df.dropna(subset=["Close"])
                            if stock_df.empty:
                                continue
                            for date_idx, row in stock_df.iterrows():
                                conn.execute(
                                    text("""
                                        INSERT INTO stock_prices (stock_id, date, open, high, low, close, volume)
                                        VALUES (:stock_id, :date, :open, :high, :low, :close, :volume)
                                        ON CONFLICT (stock_id, date)
                                        DO UPDATE SET open=EXCLUDED.open, high=EXCLUDED.high,
                                                      low=EXCLUDED.low, close=EXCLUDED.close,
                                                      volume=EXCLUDED.volume
                                    """),
                                    {
                                        "stock_id": symbol_map[symbol],
                                        "date": date_idx.date(),
                                        "open": round(float(row["Open"]), 4) if row.get("Open") else None,
                                        "high": round(float(row["High"]), 4) if row.get("High") else None,
                                        "low": round(float(row["Low"]), 4) if row.get("Low") else None,
                                        "close": round(float(row["Close"]), 4),
                                        "volume": int(row["Volume"]) if row.get("Volume") else 0,
                                    },
                                )
                            price_count += 1
                        except Exception:
                            logger.exception(f"Error processing prices for {symbol}")
        except Exception:
            logger.exception("yf.download() failed in on-demand scrape")

        # --- Fetch financials per-ticker ---
        for symbol in symbols:
            try:
                ticker = yf.Ticker(symbol, session=http_session)
                info = ticker.info or {}
                if not info or info.get("quoteType") is None:
                    continue

                fin_data = {
                    "stock_id": symbol_map[symbol],
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
                with engine.begin() as conn:
                    conn.execute(
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
                fin_count += 1
            except Exception:
                logger.exception(f"Error scraping financials for {symbol}")
            time.sleep(1)

        return ScrapeStatus(
            status="ok",
            message=f"Prices: {price_count}/{len(symbols)}, Financials: {fin_count}/{len(symbols)}",
        )

    except Exception as e:
        return ScrapeStatus(status="error", message=str(e))
