"""
News scraper service – pulls headlines from Google News RSS and (optionally)
Twitter/X, runs VADER sentiment analysis, and stores results in PostgreSQL.
"""

import os
import time
import logging
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import feedparser
import schedule
from curl_cffi.requests import Session as CffiSession
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://stockuser:stockpass@db:5432/stockdb",
)
SCRAPE_INTERVAL_MINUTES = int(os.getenv("NEWS_INTERVAL_MINUTES", "30"))
TWITTER_BEARER_TOKEN = os.getenv("TWITTER_BEARER_TOKEN", "")

engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
analyzer = SentimentIntensityAnalyzer()

GOOGLE_NEWS_RSS = "https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_session():
    return CffiSession(impersonate="chrome")


def _sentiment(text_str: str) -> tuple[float, str]:
    """Return (compound_score, label) using VADER."""
    scores = analyzer.polarity_scores(text_str)
    compound = scores["compound"]
    if compound >= 0.05:
        label = "positive"
    elif compound <= -0.05:
        label = "negative"
    else:
        label = "neutral"
    return round(compound, 4), label


def _parse_pub_date(entry) -> datetime | None:
    """Best-effort parsing of RSS published date."""
    raw = entry.get("published") or entry.get("updated")
    if not raw:
        return None
    try:
        return parsedate_to_datetime(raw)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Google News
# ---------------------------------------------------------------------------


def scrape_google_news(symbols: dict[str, int], http_session: CffiSession):
    """Fetch Google News RSS for each stock symbol and upsert articles."""
    logger.info("Scraping Google News for %d symbols...", len(symbols))
    total = 0

    for symbol, stock_id in symbols.items():
        try:
            query = f"{symbol}+stock"
            url = GOOGLE_NEWS_RSS.format(query=query)
            resp = http_session.get(url)
            resp.raise_for_status()
            feed = feedparser.parse(resp.text)

            articles = []
            for entry in feed.entries[:20]:  # latest 20 per symbol
                headline = entry.get("title", "").strip()
                link = entry.get("link", "").strip()
                source = entry.get("source", {}).get("title", "") if hasattr(entry, "source") else ""
                if not source:
                    # Google News often encodes source at end: "headline - SourceName"
                    parts = headline.rsplit(" - ", 1)
                    if len(parts) == 2:
                        source = parts[1]

                pub_dt = _parse_pub_date(entry)
                score, label = _sentiment(headline)

                articles.append({
                    "stock_id": stock_id,
                    "headline": headline[:500],
                    "url": link[:1000] if link else None,
                    "source": source[:200] if source else None,
                    "published_at": pub_dt,
                    "sentiment_score": score,
                    "sentiment_label": label,
                    "feed_source": "google",
                })

            if articles:
                with Session() as db:
                    for a in articles:
                        db.execute(
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
                    db.commit()
                total += len(articles)
                logger.info("%s: %d articles", symbol, len(articles))
        except Exception:
            logger.exception("Error scraping Google News for %s", symbol)
        time.sleep(1)

    logger.info("Google News done — %d total articles upserted", total)
    return total


# ---------------------------------------------------------------------------
# Twitter / X  (requires TWITTER_BEARER_TOKEN env var)
# ---------------------------------------------------------------------------


def scrape_twitter(symbols: dict[str, int], http_session: CffiSession):
    """Fetch recent tweets about each stock via Twitter API v2."""
    if not TWITTER_BEARER_TOKEN:
        logger.info("TWITTER_BEARER_TOKEN not set — skipping Twitter scrape")
        return 0

    logger.info("Scraping Twitter for %d symbols...", len(symbols))
    total = 0
    search_url = "https://api.twitter.com/2/tweets/search/recent"
    headers = {"Authorization": f"Bearer {TWITTER_BEARER_TOKEN}"}

    for symbol, stock_id in symbols.items():
        try:
            params = {
                "query": f"${symbol} stock lang:en -is:retweet",
                "max_results": 20,
                "tweet.fields": "created_at,author_id,text",
            }
            resp = http_session.get(search_url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()

            tweets = data.get("data", [])
            articles = []
            for tweet in tweets:
                text_str = tweet.get("text", "")
                score, label = _sentiment(text_str)
                created = tweet.get("created_at")
                pub_dt = datetime.fromisoformat(created.replace("Z", "+00:00")) if created else None
                tweet_url = f"https://x.com/i/status/{tweet['id']}"

                articles.append({
                    "stock_id": stock_id,
                    "headline": text_str[:500],
                    "url": tweet_url,
                    "source": "Twitter/X",
                    "published_at": pub_dt,
                    "sentiment_score": score,
                    "sentiment_label": label,
                    "feed_source": "twitter",
                })

            if articles:
                with Session() as db:
                    for a in articles:
                        db.execute(
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
                    db.commit()
                total += len(articles)
                logger.info("%s: %d tweets", symbol, len(articles))
        except Exception:
            logger.exception("Error scraping Twitter for %s", symbol)
        time.sleep(1)

    logger.info("Twitter done — %d total tweets upserted", total)
    return total


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


def get_tracked_symbols() -> dict[str, int]:
    with Session() as session:
        rows = session.execute(text("SELECT id, symbol FROM stocks ORDER BY symbol"))
        return {row[1]: row[0] for row in rows}


def run_scrape():
    symbols = get_tracked_symbols()
    if not symbols:
        logger.info("No stocks to scrape news for")
        return

    logger.info("Starting news scrape for %d stocks...", len(symbols))
    http_session = _make_session()

    scrape_google_news(symbols, http_session)
    scrape_twitter(symbols, http_session)

    logger.info("News scrape complete")


def wait_for_db(retries=30, delay=2):
    for attempt in range(retries):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Database is ready")
            return
        except Exception:
            logger.info("Waiting for database (attempt %d/%d)...", attempt + 1, retries)
            time.sleep(delay)
    raise RuntimeError("Could not connect to database")


def ensure_unique_constraint():
    """Create the unique constraint on stock_news(stock_id, url) if missing."""
    with Session() as session:
        session.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_news_stock_url
            ON stock_news (stock_id, url)
        """))
        session.commit()
    logger.info("Ensured unique index uq_stock_news_stock_url exists")


if __name__ == "__main__":
    wait_for_db()
    ensure_unique_constraint()

    logger.info("Running initial news scrape...")
    run_scrape()

    logger.info("Scheduling news scrape every %d minutes", SCRAPE_INTERVAL_MINUTES)
    schedule.every(SCRAPE_INTERVAL_MINUTES).minutes.do(run_scrape)

    while True:
        schedule.run_pending()
        time.sleep(10)
