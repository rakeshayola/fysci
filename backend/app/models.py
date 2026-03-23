from sqlalchemy import Boolean, Column, Integer, String, Numeric, BigInteger, Date, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class Stock(Base):
    __tablename__ = "stocks"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(10), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    sector = Column(String(100))
    created_at = Column(DateTime, server_default=func.now())

    prices = relationship("StockPrice", back_populates="stock")


class StockPrice(Base):
    __tablename__ = "stock_prices"

    id = Column(Integer, primary_key=True, index=True)
    stock_id = Column(Integer, ForeignKey("stocks.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    open = Column(Numeric(12, 4))
    high = Column(Numeric(12, 4))
    low = Column(Numeric(12, 4))
    close = Column(Numeric(12, 4))
    volume = Column(BigInteger)
    created_at = Column(DateTime, server_default=func.now())

    stock = relationship("Stock", back_populates="prices")


class StockFinancials(Base):
    __tablename__ = "stock_financials"

    id = Column(Integer, primary_key=True, index=True)
    stock_id = Column(Integer, ForeignKey("stocks.id", ondelete="CASCADE"), unique=True, nullable=False)
    pe_ratio = Column(Numeric(12, 4))
    forward_pe = Column(Numeric(12, 4))
    market_cap = Column(BigInteger)
    total_debt = Column(BigInteger)
    total_revenue = Column(BigInteger)
    operating_expense = Column(BigInteger)
    capital_expenditure = Column(BigInteger)
    num_employees = Column(Integer)
    earnings_per_share = Column(Numeric(12, 4))
    updated_at = Column(DateTime, server_default=func.now())

    stock = relationship("Stock")


class StockNews(Base):
    __tablename__ = "stock_news"
    __table_args__ = (
        UniqueConstraint("stock_id", "url", name="uq_stock_news_stock_url"),
    )

    id = Column(Integer, primary_key=True, index=True)
    stock_id = Column(Integer, ForeignKey("stocks.id", ondelete="CASCADE"), nullable=False)
    headline = Column(String(500), nullable=False)
    url = Column(String(1000))
    source = Column(String(200))
    published_at = Column(DateTime)
    sentiment_score = Column(Numeric(5, 4))
    sentiment_label = Column(String(10))
    feed_source = Column(String(20), default="google")
    created_at = Column(DateTime, server_default=func.now())

    stock = relationship("Stock")


class Widget(Base):
    __tablename__ = "widgets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    widget_type = Column(String(50), nullable=False)
    config = Column(JSONB, default={})
    position_x = Column(Integer, default=0)
    position_y = Column(Integer, default=0)
    width = Column(Integer, default=1)
    height = Column(Integer, default=1)
    created_at = Column(DateTime, server_default=func.now())


class LlmSetting(Base):
    __tablename__ = "llm_settings"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String(50), unique=True, nullable=False)
    api_key = Column(String(500), nullable=False)
    model_name = Column(String(100))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
