from sqlalchemy import Column, Integer, String, Numeric, BigInteger, Date, DateTime, ForeignKey, func
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
