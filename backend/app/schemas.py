from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


# --- Stocks ---

class StockBase(BaseModel):
    symbol: str
    name: str
    sector: Optional[str] = None


class StockCreate(StockBase):
    pass


class StockOut(StockBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Stock Prices ---

class StockPriceOut(BaseModel):
    id: int
    stock_id: int
    date: date
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    close: Optional[float] = None
    volume: Optional[int] = None

    model_config = {"from_attributes": True}


# --- Stock Financials ---

class StockFinancialsOut(BaseModel):
    id: int
    stock_id: int
    pe_ratio: Optional[float] = None
    forward_pe: Optional[float] = None
    market_cap: Optional[int] = None
    total_debt: Optional[int] = None
    total_revenue: Optional[int] = None
    operating_expense: Optional[int] = None
    capital_expenditure: Optional[int] = None
    num_employees: Optional[int] = None
    earnings_per_share: Optional[float] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# --- Stock News ---

class StockNewsOut(BaseModel):
    id: int
    stock_id: int
    headline: str
    url: Optional[str] = None
    source: Optional[str] = None
    published_at: Optional[datetime] = None
    sentiment_score: Optional[float] = None
    sentiment_label: Optional[str] = None
    feed_source: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SentimentSummary(BaseModel):
    symbol: str
    total: int
    positive: int
    negative: int
    neutral: int
    avg_score: float
    label: str  # overall: bullish / bearish / neutral


# --- Widgets ---

class WidgetBase(BaseModel):
    name: str
    widget_type: str
    config: Optional[dict] = {}
    position_x: Optional[int] = 0
    position_y: Optional[int] = 0
    width: Optional[int] = 1
    height: Optional[int] = 1


class WidgetCreate(WidgetBase):
    pass


class WidgetOut(WidgetBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- LLM Settings ---

class LlmSettingCreate(BaseModel):
    provider: str
    api_key: str
    model_name: Optional[str] = None


class LlmSettingOut(BaseModel):
    id: int
    provider: str
    api_key_masked: str
    model_name: Optional[str] = None
    is_active: bool

    model_config = {"from_attributes": True}


# --- Agent ---

class AgentRequest(BaseModel):
    symbols: list[str]
    query: Optional[str] = None


class AgentResponse(BaseModel):
    provider: str
    model: str
    symbols: list[str]
    analysis: str
    timestamp: datetime
