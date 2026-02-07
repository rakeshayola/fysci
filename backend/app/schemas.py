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
