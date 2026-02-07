import subprocess
import sys

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class ScrapeStatus(BaseModel):
    status: str
    message: str


@router.post("/run", response_model=ScrapeStatus)
def trigger_scrape():
    """Trigger an on-demand scrape by running the scraper inline."""
    try:
        from app.database import get_db, engine
        from sqlalchemy import text

        with engine.connect() as conn:
            rows = conn.execute(text("SELECT id, symbol FROM stocks ORDER BY symbol"))
            symbols = [(r[0], r[1]) for r in rows]

        if not symbols:
            return ScrapeStatus(status="ok", message="No stocks to scrape")

        import yfinance as yf

        total = 0
        with engine.begin() as conn:
            for stock_id, symbol in symbols:
                try:
                    ticker = yf.Ticker(symbol)
                    hist = ticker.history(period="1y")
                    if hist.empty:
                        continue
                    for date, row in hist.iterrows():
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
                                "stock_id": stock_id,
                                "date": date.date(),
                                "open": round(float(row["Open"]), 4),
                                "high": round(float(row["High"]), 4),
                                "low": round(float(row["Low"]), 4),
                                "close": round(float(row["Close"]), 4),
                                "volume": int(row["Volume"]),
                            },
                        )
                    # Also scrape financials
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
                    total += 1
                except Exception:
                    continue

        return ScrapeStatus(status="ok", message=f"Scraped {total}/{len(symbols)} stocks")

    except Exception as e:
        return ScrapeStatus(status="error", message=str(e))
