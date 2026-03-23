import csv
import io

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import User, Portfolio, PortfolioHolding, Stock
from app.schemas import PortfolioCreate, PortfolioOut, HoldingCreate, HoldingOut
from app.auth import get_current_user

router = APIRouter()


def _get_portfolio(db: Session, portfolio_id: int, user: User) -> Portfolio:
    portfolio = (
        db.query(Portfolio)
        .filter(Portfolio.id == portfolio_id, Portfolio.user_id == user.id)
        .first()
    )
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio


def _enrich_holdings(portfolio: Portfolio) -> Portfolio:
    for h in portfolio.holdings:
        if h.stock:
            h.symbol = h.stock.symbol
            h.stock_name = h.stock.name
    return portfolio


@router.get("/", response_model=list[PortfolioOut])
def list_portfolios(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    portfolios = (
        db.query(Portfolio)
        .options(joinedload(Portfolio.holdings).joinedload(PortfolioHolding.stock))
        .filter(Portfolio.user_id == current_user.id)
        .order_by(Portfolio.created_at.desc())
        .all()
    )
    for p in portfolios:
        _enrich_holdings(p)
    return portfolios


@router.post("/", response_model=PortfolioOut, status_code=201)
def create_portfolio(
    req: PortfolioCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    portfolio = Portfolio(
        user_id=current_user.id,
        name=req.name,
        description=req.description,
    )
    db.add(portfolio)
    db.commit()
    db.refresh(portfolio)
    return portfolio


@router.get("/{portfolio_id}", response_model=PortfolioOut)
def get_portfolio(
    portfolio_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    portfolio = (
        db.query(Portfolio)
        .options(joinedload(Portfolio.holdings).joinedload(PortfolioHolding.stock))
        .filter(Portfolio.id == portfolio_id, Portfolio.user_id == current_user.id)
        .first()
    )
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    _enrich_holdings(portfolio)
    return portfolio


@router.put("/{portfolio_id}", response_model=PortfolioOut)
def update_portfolio(
    portfolio_id: int,
    req: PortfolioCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    portfolio = _get_portfolio(db, portfolio_id, current_user)
    portfolio.name = req.name
    portfolio.description = req.description
    db.commit()
    db.refresh(portfolio)
    return portfolio


@router.delete("/{portfolio_id}", status_code=204)
def delete_portfolio(
    portfolio_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    portfolio = _get_portfolio(db, portfolio_id, current_user)
    db.delete(portfolio)
    db.commit()


@router.post("/{portfolio_id}/holdings", response_model=HoldingOut)
def add_holding(
    portfolio_id: int,
    req: HoldingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    portfolio = _get_portfolio(db, portfolio_id, current_user)
    stock = db.query(Stock).filter(Stock.symbol == req.symbol.upper()).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock '{req.symbol}' not found")

    existing = (
        db.query(PortfolioHolding)
        .filter(
            PortfolioHolding.portfolio_id == portfolio.id,
            PortfolioHolding.stock_id == stock.id,
        )
        .first()
    )
    if existing:
        existing.shares = req.shares
        existing.avg_cost = req.avg_cost
        db.commit()
        db.refresh(existing)
        existing.symbol = stock.symbol
        existing.stock_name = stock.name
        return existing

    holding = PortfolioHolding(
        portfolio_id=portfolio.id,
        stock_id=stock.id,
        shares=req.shares,
        avg_cost=req.avg_cost,
    )
    db.add(holding)
    db.commit()
    db.refresh(holding)
    holding.symbol = stock.symbol
    holding.stock_name = stock.name
    return holding


@router.delete("/{portfolio_id}/holdings/{holding_id}", status_code=204)
def remove_holding(
    portfolio_id: int,
    holding_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    portfolio = _get_portfolio(db, portfolio_id, current_user)
    holding = (
        db.query(PortfolioHolding)
        .filter(
            PortfolioHolding.id == holding_id,
            PortfolioHolding.portfolio_id == portfolio.id,
        )
        .first()
    )
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    db.delete(holding)
    db.commit()


@router.post("/{portfolio_id}/upload")
async def upload_holdings(
    portfolio_id: int,
    file: UploadFile = File(...),
    symbol_col: str = Query("symbol"),
    shares_col: str = Query("shares"),
    avg_cost_col: str = Query("avg_cost"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    portfolio = _get_portfolio(db, portfolio_id, current_user)
    content = await file.read()

    rows = []
    if file.filename and file.filename.endswith(".xlsx"):
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(content), read_only=True)
        ws = wb.active
        headers = [str(c.value).strip().lower() for c in next(ws.iter_rows(min_row=1, max_row=1))]
        for row in ws.iter_rows(min_row=2, values_only=True):
            rows.append({h: v for h, v in zip(headers, row)})
        wb.close()
    else:
        text = content.decode("utf-8", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            rows.append({k.strip().lower(): v for k, v in row.items()})

    sym_key = symbol_col.strip().lower()
    shares_key = shares_col.strip().lower()
    cost_key = avg_cost_col.strip().lower()

    imported = 0
    skipped = []

    for row in rows:
        symbol = str(row.get(sym_key, "")).strip().upper()
        if not symbol:
            continue

        stock = db.query(Stock).filter(Stock.symbol == symbol).first()
        if not stock:
            skipped.append(symbol)
            continue

        shares_val = row.get(shares_key)
        try:
            shares_val = float(shares_val)
        except (TypeError, ValueError):
            skipped.append(symbol)
            continue

        cost_val = row.get(cost_key)
        try:
            cost_val = float(cost_val) if cost_val else None
        except (TypeError, ValueError):
            cost_val = None

        existing = (
            db.query(PortfolioHolding)
            .filter(
                PortfolioHolding.portfolio_id == portfolio.id,
                PortfolioHolding.stock_id == stock.id,
            )
            .first()
        )
        if existing:
            existing.shares = shares_val
            existing.avg_cost = cost_val
        else:
            db.add(PortfolioHolding(
                portfolio_id=portfolio.id,
                stock_id=stock.id,
                shares=shares_val,
                avg_cost=cost_val,
            ))
        imported += 1

    db.commit()
    return {"imported": imported, "skipped": list(set(skipped))}
