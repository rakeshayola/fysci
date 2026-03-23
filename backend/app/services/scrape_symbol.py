"""
Scrape prices, financials, and news for a single stock symbol.
Reuses the same Yahoo Finance logic from the scraper router but scoped to one symbol.
Designed to be called in a background thread so it doesn't block the request.
"""

import logging
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import feedparser
from curl_cffi.requests import Session as CffiSession
from sqlalchemy import text

from app.database import engine

logger = logging.getLogger(__name__)

YAHOO_CHART_URL = "https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
YAHOO_QUOTE_URL = "https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}"
YAHOO_MODULES = "defaultKeyStatistics,financialData,summaryDetail,assetProfile"
GOOGLE_NEWS_RSS = "https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"


def _make_session():
    return CffiSession(impersonate="chrome")


def _get_yahoo_crumb(http: CffiSession) -> str:
    http.get("https://fc.yahoo.com", allow_redirects=True)
    resp = http.get("https://query2.finance.yahoo.com/v1/test/getcrumb")
    resp.raise_for_status()
    crumb = resp.text.strip()
    if not crumb:
        raise RuntimeError("Failed to obtain Yahoo crumb")
    return crumb


def _scrape_prices(symbol: str, stock_id: int, http: CffiSession, crumb: str):
    url = YAHOO_CHART_URL.format(symbol=symbol)
    resp = http.get(url, params={"range": "5y", "interval": "1d", "crumb": crumb})
    resp.raise_for_status()
    data = resp.json()

    result = data.get("chart", {}).get("result")
    if not result:
        return 0

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
            "stock_id": stock_id,
            "date": dt,
            "open": round(float(opens[i]), 4) if i < len(opens) and opens[i] is not None else None,
            "high": round(float(highs[i]), 4) if i < len(highs) and highs[i] is not None else None,
            "low": round(float(lows[i]), 4) if i < len(lows) and lows[i] is not None else None,
            "close": round(float(close_val), 4),
            "volume": int(volumes[i]) if i < len(volumes) and volumes[i] is not None else 0,
        })

    if rows:
        with engine.begin() as conn:
            for r in rows:
                conn.execute(
                    text("""
                        INSERT INTO stock_prices (stock_id, date, open, high, low, close, volume)
                        VALUES (:stock_id, :date, :open, :high, :low, :close, :volume)
                        ON CONFLICT (stock_id, date)
                        DO UPDATE SET open=EXCLUDED.open, high=EXCLUDED.high,
                                      low=EXCLUDED.low, close=EXCLUDED.close,
                                      volume=EXCLUDED.volume
                    """),
                    r,
                )
    return len(rows)


def _scrape_financials(symbol: str, stock_id: int, http: CffiSession, crumb: str):
    url = YAHOO_QUOTE_URL.format(symbol=symbol)
    resp = http.get(url, params={"modules": YAHOO_MODULES, "crumb": crumb})
    resp.raise_for_status()
    data = resp.json()
    result = data.get("quoteSummary", {}).get("result")
    if not result:
        return False

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

    fin_data = {
        "stock_id": stock_id,
        "pe_ratio": flat.get("trailingPE"),
        "forward_pe": flat.get("forwardPE"),
        "market_cap": flat.get("marketCap"),
        "total_debt": flat.get("totalDebt"),
        "total_revenue": flat.get("totalRevenue"),
        "operating_expense": flat.get("operatingExpenses") or flat.get("totalOperatingExpenses"),
        "capital_expenditure": abs(flat.get("capitalExpenditures") or flat.get("capitalExpenditure") or 0) or None,
        "num_employees": flat.get("fullTimeEmployees"),
        "earnings_per_share": flat.get("trailingEps"),
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
    return True


def _scrape_news(symbol: str, stock_id: int, http: CffiSession):
    try:
        from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
        analyzer = SentimentIntensityAnalyzer()
    except ImportError:
        logger.warning("vaderSentiment not installed — skipping news scrape for %s", symbol)
        return 0

    query = f"{symbol}+stock"
    url = GOOGLE_NEWS_RSS.format(query=query)
    resp = http.get(url)
    resp.raise_for_status()
    feed = feedparser.parse(resp.text)

    articles = []
    for entry in feed.entries[:20]:
        headline = entry.get("title", "").strip()
        link = entry.get("link", "").strip()
        source = entry.get("source", {}).get("title", "") if hasattr(entry, "source") else ""
        if not source:
            parts = headline.rsplit(" - ", 1)
            if len(parts) == 2:
                source = parts[1]

        pub_dt = None
        raw = entry.get("published") or entry.get("updated")
        if raw:
            try:
                pub_dt = parsedate_to_datetime(raw)
            except Exception:
                pass

        scores = analyzer.polarity_scores(headline)
        compound = scores["compound"]
        label = "positive" if compound >= 0.05 else ("negative" if compound <= -0.05 else "neutral")

        articles.append({
            "stock_id": stock_id,
            "headline": headline[:500],
            "url": link[:1000] if link else None,
            "source": source[:200] if source else None,
            "published_at": pub_dt,
            "sentiment_score": round(compound, 4),
            "sentiment_label": label,
            "feed_source": "google",
        })

    if articles:
        with engine.begin() as conn:
            for a in articles:
                conn.execute(
                    text("""
                        INSERT INTO stock_news
                            (stock_id, headline, url, source, published_at,
                             sentiment_score, sentiment_label, feed_source)
                        VALUES
                            (:stock_id, :headline, :url, :source, :published_at,
                             :sentiment_score, :sentiment_label, :feed_source)
                        ON CONFLICT (stock_id, url) DO UPDATE SET
                            headline = EXCLUDED.headline,
                            sentiment_score = EXCLUDED.sentiment_score,
                            sentiment_label = EXCLUDED.sentiment_label,
                            published_at = EXCLUDED.published_at
                    """),
                    a,
                )
    return len(articles)


def scrape_symbol(symbol: str, stock_id: int):
    """Scrape all data (prices, financials, news) for a single symbol.

    Safe to call from a background thread — uses its own DB connections.
    """
    logger.info("Auto-scraping new stock: %s (id=%d)", symbol, stock_id)
    http = _make_session()

    try:
        crumb = _get_yahoo_crumb(http)
    except Exception:
        logger.exception("Failed to get Yahoo crumb for %s", symbol)
        return

    # Prices
    try:
        count = _scrape_prices(symbol, stock_id, http, crumb)
        logger.info("%s: %d price rows upserted", symbol, count)
    except Exception:
        logger.exception("Error scraping prices for %s", symbol)

    time.sleep(1)

    # Financials
    try:
        ok = _scrape_financials(symbol, stock_id, http, crumb)
        logger.info("%s: financials %s", symbol, "ok" if ok else "no data")
    except Exception:
        logger.exception("Error scraping financials for %s", symbol)

    time.sleep(1)

    # News
    try:
        count = _scrape_news(symbol, stock_id, http)
        logger.info("%s: %d news articles upserted", symbol, count)
    except Exception:
        logger.exception("Error scraping news for %s", symbol)

    logger.info("Auto-scrape complete for %s", symbol)
