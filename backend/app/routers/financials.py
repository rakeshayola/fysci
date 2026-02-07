from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Stock, StockFinancials
from app.schemas import StockFinancialsOut

router = APIRouter()


@router.get("/{symbol}", response_model=StockFinancialsOut)
def get_financials(symbol: str, db: Session = Depends(get_db)):
    """Get financial data for a stock."""
    stock = db.query(Stock).filter(Stock.symbol == symbol.upper()).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    fin = db.query(StockFinancials).filter(StockFinancials.stock_id == stock.id).first()
    if not fin:
        raise HTTPException(status_code=404, detail="No financial data available — run a scrape first")
    return fin
