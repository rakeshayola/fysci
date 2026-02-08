from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Stock, StockNews
from app.schemas import StockNewsOut, SentimentSummary

router = APIRouter()


@router.get("/{symbol}", response_model=list[StockNewsOut])
def get_news(
    symbol: str,
    limit: Optional[int] = Query(30, ge=1, le=100),
    feed: Optional[str] = Query(None, description="Filter by feed_source: google, twitter"),
    db: Session = Depends(get_db),
):
    """Return recent news articles for a stock, newest first."""
    stock = db.query(Stock).filter(Stock.symbol == symbol.upper()).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")

    q = db.query(StockNews).filter(StockNews.stock_id == stock.id)
    if feed:
        q = q.filter(StockNews.feed_source == feed)
    articles = q.order_by(StockNews.published_at.desc().nullslast()).limit(limit).all()
    return articles


@router.get("/{symbol}/sentiment", response_model=SentimentSummary)
def get_sentiment(
    symbol: str,
    db: Session = Depends(get_db),
):
    """Return aggregated sentiment summary for a stock."""
    stock = db.query(Stock).filter(Stock.symbol == symbol.upper()).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")

    rows = (
        db.query(
            func.count(StockNews.id).label("total"),
            func.count(StockNews.id).filter(StockNews.sentiment_label == "positive").label("positive"),
            func.count(StockNews.id).filter(StockNews.sentiment_label == "negative").label("negative"),
            func.count(StockNews.id).filter(StockNews.sentiment_label == "neutral").label("neutral"),
            func.coalesce(func.avg(StockNews.sentiment_score), 0).label("avg_score"),
        )
        .filter(StockNews.stock_id == stock.id)
        .first()
    )

    total, positive, negative, neutral, avg_score = rows
    avg_f = float(avg_score)
    if avg_f >= 0.05:
        label = "bullish"
    elif avg_f <= -0.05:
        label = "bearish"
    else:
        label = "neutral"

    return SentimentSummary(
        symbol=symbol.upper(),
        total=total,
        positive=positive,
        negative=negative,
        neutral=neutral,
        avg_score=round(avg_f, 4),
        label=label,
    )
