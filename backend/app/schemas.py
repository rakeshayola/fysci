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


# --- Auth ---

class RegisterRequest(BaseModel):
    email: str
    username: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    username: str
    is_active: bool
    is_locked: bool = False
    is_approved: bool = True
    is_admin: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminUserOut(BaseModel):
    id: int
    email: str
    username: str
    is_active: bool
    is_locked: bool = False
    is_approved: bool = True
    is_admin: bool = False
    created_at: datetime
    portfolio_count: int = 0
    stock_count: int = 0
    total_value: float = 0.0

    model_config = {"from_attributes": True}


class AdminAnalytics(BaseModel):
    total_users: int
    active_users: int
    locked_users: int
    pending_approval: int
    total_portfolios: int
    total_holdings: int
    most_tracked_stocks: list[dict]
    registrations_over_time: list[dict]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --- Portfolios ---

class HoldingCreate(BaseModel):
    symbol: str
    shares: float
    avg_cost: Optional[float] = None


class HoldingOut(BaseModel):
    id: int
    portfolio_id: int
    stock_id: int
    shares: float
    avg_cost: Optional[float] = None
    added_at: datetime
    symbol: Optional[str] = None
    stock_name: Optional[str] = None

    model_config = {"from_attributes": True}


class PortfolioCreate(BaseModel):
    name: str
    description: Optional[str] = None


class PortfolioOut(BaseModel):
    id: int
    user_id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    holdings: list[HoldingOut] = []

    model_config = {"from_attributes": True}


# --- Analysis ---

class AnalysisRequest(BaseModel):
    symbols: list[str]
    query: Optional[str] = None


class AnalysisOut(BaseModel):
    id: int
    symbols: str
    query: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    analysis: Optional[str] = None
    status: str
    error: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
