import json
import logging
import time
from datetime import datetime, timezone

from curl_cffi.requests import Session as CffiSession
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text

from app.database import engine

logger = logging.getLogger(__name__)

router = APIRouter()


class ScrapeStatus(BaseModel):
    status: str
    message: str


YAHOO_CHART_URL = "https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
YAHOO_QUOTE_URL = "https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}"
YAHOO_MODULES = "defaultKeyStatistics,financialData,summaryDetail,assetProfile,quoteType"


def _make_session():
    return CffiSession(impersonate="chrome")


def _get_yahoo_crumb(http_session: CffiSession) -> str:
    """Obtain a Yahoo Finance cookie + crumb for authenticated API access."""
    http_session.get("https://fc.yahoo.com", allow_redirects=True)
    resp = http_session.get("https://query2.finance.yahoo.com/v1/test/getcrumb")
    resp.raise_for_status()
    crumb = resp.text.strip()
    if not crumb:
        raise RuntimeError("Failed to obtain Yahoo crumb")
    return crumb


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
    """Fetch financial info directly from Yahoo Finance API."""
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


@router.post("/run", response_model=ScrapeStatus)
def trigger_scrape():
    """Trigger an on-demand scrape using Yahoo Finance APIs directly."""
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

        # --- Obtain crumb for all API calls ---
        try:
            crumb = _get_yahoo_crumb(http_session)
        except Exception:
            logger.exception("Failed to obtain Yahoo crumb")
            return ScrapeStatus(status="error", message="Failed to obtain Yahoo crumb")

        # --- Fetch prices per symbol via chart API ---
        for symbol in symbols:
            try:
                chart_rows = _fetch_chart(symbol, http_session, crumb, "5y")
                if not chart_rows:
                    logger.warning(f"{symbol}: no price data returned")
                    continue

                with engine.begin() as conn:
                    for r in chart_rows:
                        conn.execute(
                            text("""
                                INSERT INTO stock_prices (stock_id, date, open, high, low, close, volume)
                                VALUES (:stock_id, :date, :open, :high, :low, :close, :volume)
                                ON CONFLICT (stock_id, date)
                                DO UPDATE SET open=EXCLUDED.open, high=EXCLUDED.high,
                                              low=EXCLUDED.low, close=EXCLUDED.close,
                                              volume=EXCLUDED.volume
                            """),
                            {"stock_id": symbol_map[symbol], **r},
                        )

                price_count += 1
                logger.info(f"{symbol}: {len(chart_rows)} price rows upserted")
            except Exception:
                logger.exception(f"Error processing prices for {symbol}")
            time.sleep(1)

        # --- Fetch financials via quoteSummary API ---
        for symbol in symbols:
            try:
                info = _fetch_yahoo_info(symbol, http_session, crumb)
                if not info:
                    continue

                # Update stock name and sector from Yahoo data
                long_name = info.get("longName") or info.get("shortName")
                sector = info.get("sector")
                quote_type = info.get("quoteType", "")
                if long_name or sector or quote_type == "ETF":
                    update_parts: list = []
                    params: dict = {"stock_id": symbol_map[symbol]}
                    if long_name:
                        update_parts.append("name = :name")
                        params["name"] = long_name
                    if sector:
                        update_parts.append("sector = :sector")
                        params["sector"] = sector
                    elif quote_type == "ETF":
                        update_parts.append("sector = :sector")
                        params["sector"] = "ETF"
                    if update_parts:
                        with engine.begin() as conn:
                            conn.execute(
                                text(f"UPDATE stocks SET {', '.join(update_parts)} WHERE id = :stock_id"),
                                params,
                            )

                fin_data = {
                    "stock_id": symbol_map[symbol],
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


def _sse_event(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


@router.post("/run-stream")
def trigger_scrape_stream():
    """SSE streaming version of scrape — sends progress events per symbol."""

    def generate():
        try:
            with engine.connect() as conn:
                rows = conn.execute(text("SELECT id, symbol FROM stocks ORDER BY symbol"))
                symbol_map = {r[1]: r[0] for r in rows}

            if not symbol_map:
                yield _sse_event({"phase": "done", "message": "No stocks to scrape"})
                return

            symbols = list(symbol_map.keys())
            total = len(symbols)
            http_session = _make_session()
            price_count = 0
            fin_count = 0

            yield _sse_event({
                "phase": "start",
                "total": total,
                "symbols": symbols,
                "message": f"Scraping {total} stocks...",
            })

            # Obtain crumb
            try:
                crumb = _get_yahoo_crumb(http_session)
            except Exception:
                logger.exception("Failed to obtain Yahoo crumb")
                yield _sse_event({"phase": "error", "message": "Failed to obtain Yahoo crumb"})
                return

            # --- Prices ---
            for i, symbol in enumerate(symbols):
                yield _sse_event({
                    "phase": "price",
                    "symbol": symbol,
                    "current": i + 1,
                    "total": total,
                    "message": f"Fetching prices for {symbol} ({i + 1}/{total})",
                })
                try:
                    chart_rows = _fetch_chart(symbol, http_session, crumb, "5y")
                    if chart_rows:
                        with engine.begin() as conn:
                            for r in chart_rows:
                                conn.execute(
                                    text("""
                                        INSERT INTO stock_prices (stock_id, date, open, high, low, close, volume)
                                        VALUES (:stock_id, :date, :open, :high, :low, :close, :volume)
                                        ON CONFLICT (stock_id, date)
                                        DO UPDATE SET open=EXCLUDED.open, high=EXCLUDED.high,
                                                      low=EXCLUDED.low, close=EXCLUDED.close,
                                                      volume=EXCLUDED.volume
                                    """),
                                    {"stock_id": symbol_map[symbol], **r},
                                )
                        price_count += 1
                except Exception:
                    logger.exception(f"Error processing prices for {symbol}")
                time.sleep(1)

            # --- Financials ---
            for i, symbol in enumerate(symbols):
                yield _sse_event({
                    "phase": "financials",
                    "symbol": symbol,
                    "current": i + 1,
                    "total": total,
                    "message": f"Fetching financials for {symbol} ({i + 1}/{total})",
                })
                try:
                    info = _fetch_yahoo_info(symbol, http_session, crumb)
                    if not info:
                        continue

                    long_name = info.get("longName") or info.get("shortName")
                    sector = info.get("sector")
                    quote_type = info.get("quoteType", "")
                    if long_name or sector or quote_type == "ETF":
                        update_parts: list = []
                        params: dict = {"stock_id": symbol_map[symbol]}
                        if long_name:
                            update_parts.append("name = :name")
                            params["name"] = long_name
                        if sector:
                            update_parts.append("sector = :sector")
                            params["sector"] = sector
                        elif quote_type == "ETF":
                            update_parts.append("sector = :sector")
                            params["sector"] = "ETF"
                        if update_parts:
                            with engine.begin() as conn:
                                conn.execute(
                                    text(f"UPDATE stocks SET {', '.join(update_parts)} WHERE id = :stock_id"),
                                    params,
                                )

                    fin_data = {
                        "stock_id": symbol_map[symbol],
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

            yield _sse_event({
                "phase": "done",
                "message": f"Prices: {price_count}/{total}, Financials: {fin_count}/{total}",
            })

        except Exception as e:
            yield _sse_event({"phase": "error", "message": str(e)})

    return StreamingResponse(generate(), media_type="text/event-stream")
