import csv
import io
import logging
import threading

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import User, Portfolio, PortfolioHolding, Stock, StockPrice
from app.schemas import PortfolioCreate, PortfolioOut, HoldingCreate, HoldingOut
from app.auth import get_current_user
from app.services.scrape_symbol import scrape_symbol

logger = logging.getLogger(__name__)

router = APIRouter()


def _auto_scrape(symbol: str, stock_id: int):
    """Fire-and-forget background scrape for a newly added stock."""
    def _run():
        try:
            scrape_symbol(symbol, stock_id)
        except Exception:
            logger.exception("Background scrape failed for %s", symbol)
    thread = threading.Thread(target=_run, daemon=True)
    thread.start()


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
    symbol = req.symbol.upper()
    stock = db.query(Stock).filter(Stock.symbol == symbol).first()
    is_new_stock = stock is None
    if not stock:
        stock = Stock(symbol=symbol, name=symbol)
        db.add(stock)
        db.commit()
        db.refresh(stock)

    # Auto-scrape prices/financials/news for newly added stocks
    if is_new_stock:
        _auto_scrape(stock.symbol, stock.id)

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
    new_stocks = []  # Track newly created stocks for auto-scrape

    for row in rows:
        symbol = str(row.get(sym_key, "")).strip().upper()
        if not symbol:
            continue

        stock = db.query(Stock).filter(Stock.symbol == symbol).first()
        if not stock:
            stock = Stock(symbol=symbol, name=symbol)
            db.add(stock)
            db.flush()
            new_stocks.append((stock.symbol, stock.id))

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

    # Auto-scrape all newly created stocks in background
    for sym, sid in new_stocks:
        _auto_scrape(sym, sid)

    return {"imported": imported, "skipped": list(set(skipped))}


def _is_etf(symbol: str) -> bool:
    """Heuristic: index symbols start with ^; common ETFs are 3-4 letter uppercase without dots."""
    known_etfs = {
        "SPY", "QQQ", "DIA", "IWM", "VTI", "VOO", "VEA", "VWO", "BND", "AGG",
        "GLD", "SLV", "XLF", "XLK", "XLE", "XLV", "XLI", "XLY", "XLP", "XLB",
        "XLU", "XLRE", "IVV", "EFA", "EEM", "TLT", "HYG", "LQD", "ARKK", "ARKG",
        "SCHD", "VIG", "VYM", "JEPI", "JEPQ", "VGT", "SOXX", "SMH", "IWF", "IWD",
        "VTV", "VUG", "IJR", "IJH", "MDY", "RSP",
    }
    return symbol.upper() in known_etfs


def _fetch_expense_ratio(symbol: str) -> float | None:
    """Try to get ETF expense ratio via yfinance."""
    try:
        import yfinance as yf
        info = yf.Ticker(symbol).info
        return info.get("annualReportExpenseRatio") or info.get("totalExpenseRatio") or None
    except Exception:
        return None


@router.get("/{portfolio_id}/summary")
def portfolio_summary(
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

    holdings_data = []
    total_value = 0.0
    total_cost = 0.0

    for h in portfolio.holdings:
        symbol = h.stock.symbol if h.stock else "?"
        name = h.stock.name if h.stock else symbol
        sector = h.stock.sector if h.stock else None
        shares = float(h.shares)
        avg_cost = float(h.avg_cost) if h.avg_cost else None

        # Get latest closing price
        latest_price_row = (
            db.query(StockPrice)
            .filter(StockPrice.stock_id == h.stock_id)
            .order_by(StockPrice.date.desc())
            .first()
        )
        current_price = float(latest_price_row.close) if latest_price_row and latest_price_row.close else None

        current_value = shares * current_price if current_price else None
        cost_basis = shares * avg_cost if avg_cost else None
        gain = current_value - cost_basis if current_value is not None and cost_basis is not None else None
        gain_pct = (gain / cost_basis * 100) if gain is not None and cost_basis else None

        if current_value is not None:
            total_value += current_value
        if cost_basis is not None:
            total_cost += cost_basis

        # ETF expense ratio
        is_etf = _is_etf(symbol)
        expense_ratio = None
        if is_etf:
            expense_ratio = _fetch_expense_ratio(symbol)

        holdings_data.append({
            "id": h.id,
            "symbol": symbol,
            "stock_name": name,
            "sector": sector,
            "is_etf": is_etf,
            "expense_ratio": expense_ratio,
            "shares": shares,
            "avg_cost": avg_cost,
            "current_price": current_price,
            "current_value": round(current_value, 2) if current_value else None,
            "cost_basis": round(cost_basis, 2) if cost_basis else None,
            "gain": round(gain, 2) if gain is not None else None,
            "gain_pct": round(gain_pct, 2) if gain_pct is not None else None,
        })

    total_gain = total_value - total_cost if total_cost > 0 else None
    total_gain_pct = (total_gain / total_cost * 100) if total_gain is not None and total_cost > 0 else None

    # Sector allocation
    sector_map = {}
    for h in holdings_data:
        sec = h.get("sector") or "Unknown"
        val = h.get("current_value") or 0
        sector_map[sec] = sector_map.get(sec, 0) + val
    sector_allocation = []
    for sec, val in sorted(sector_map.items(), key=lambda x: -x[1]):
        pct = (val / total_value * 100) if total_value > 0 else 0
        sector_allocation.append({"sector": sec, "value": round(val, 2), "pct": round(pct, 2)})

    return {
        "portfolio_id": portfolio.id,
        "name": portfolio.name,
        "net_worth": round(total_value, 2),
        "total_cost": round(total_cost, 2),
        "total_gain": round(total_gain, 2) if total_gain is not None else None,
        "total_gain_pct": round(total_gain_pct, 2) if total_gain_pct is not None else None,
        "holdings": holdings_data,
        "sector_allocation": sector_allocation,
    }


@router.post("/{portfolio_id}/sector-analysis")
def sector_analysis(
    portfolio_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Use configured LLM to analyze risk score and growth potential per sector."""
    portfolio = (
        db.query(Portfolio)
        .options(joinedload(Portfolio.holdings).joinedload(PortfolioHolding.stock))
        .filter(Portfolio.id == portfolio_id, Portfolio.user_id == current_user.id)
        .first()
    )
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    if not portfolio.holdings:
        raise HTTPException(status_code=400, detail="Portfolio has no holdings to analyze")

    from app.services.research_agent import run_research

    symbols = []
    sector_holdings = {}
    for h in portfolio.holdings:
        sym = h.stock.symbol if h.stock else "?"
        sec = h.stock.sector if h.stock else "Unknown"
        symbols.append(sym)
        sector_holdings.setdefault(sec, []).append(sym)

    sector_desc = "; ".join(
        f"{sec}: [{', '.join(syms)}]" for sec, syms in sector_holdings.items()
    )

    query = (
        f"The user's portfolio is grouped by sectors: {sector_desc}. "
        "For EACH sector, provide:\n"
        "1. Risk Score (1-10, where 1=very low risk, 10=very high risk)\n"
        "2. Growth Potential (1-10, where 1=very low growth, 10=very high growth)\n"
        "3. A brief 1-2 sentence justification.\n\n"
        "IMPORTANT: Return your analysis as a JSON array with objects having keys: "
        '"sector", "risk_score", "growth_potential", "justification". '
        "Return ONLY the JSON array, no markdown fences or extra text."
    )

    try:
        result = run_research(db, symbols, query)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Try to parse structured JSON from the LLM response
    import json as json_mod
    analysis_text = result.get("analysis", "")
    sector_scores = []
    try:
        # Strip markdown code fences if present
        cleaned = analysis_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()
        sector_scores = json_mod.loads(cleaned)
    except (json_mod.JSONDecodeError, ValueError):
        # Return raw analysis if JSON parsing fails
        pass

    return {
        "portfolio_id": portfolio.id,
        "provider": result.get("provider"),
        "model": result.get("model"),
        "sector_scores": sector_scores,
        "raw_analysis": analysis_text,
    }
