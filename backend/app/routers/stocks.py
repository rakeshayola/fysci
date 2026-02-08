from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Stock, StockPrice
from app.schemas import StockOut, StockCreate, StockPriceOut

router = APIRouter()


@router.get("/", response_model=list[StockOut])
def list_stocks(db: Session = Depends(get_db)):
    """Return all available stocks."""
    return db.query(Stock).order_by(Stock.symbol).all()


@router.post("/", response_model=StockOut, status_code=201)
def create_stock(stock: StockCreate, db: Session = Depends(get_db)):
    """Add a new stock to track."""
    existing = db.query(Stock).filter(Stock.symbol == stock.symbol).first()
    if existing:
        raise HTTPException(status_code=409, detail="Stock already exists")
    db_stock = Stock(**stock.model_dump())
    db.add(db_stock)
    db.commit()
    db.refresh(db_stock)
    return db_stock


@router.get("/{symbol}", response_model=StockOut)
def get_stock(symbol: str, db: Session = Depends(get_db)):
    """Get a single stock by symbol."""
    stock = db.query(Stock).filter(Stock.symbol == symbol.upper()).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    return stock


@router.get("/{symbol}/prices", response_model=list[StockPriceOut])
def get_stock_prices(
    symbol: str,
    limit: Optional[int] = Query(30, ge=1, le=1300),
    db: Session = Depends(get_db),
):
    """Get price history for a stock."""
    stock = db.query(Stock).filter(Stock.symbol == symbol.upper()).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    prices = (
        db.query(StockPrice)
        .filter(StockPrice.stock_id == stock.id)
        .order_by(StockPrice.date.desc())
        .limit(limit)
        .all()
    )
    return prices
