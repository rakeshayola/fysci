from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, StockAnalysis
from app.schemas import AnalysisRequest, AnalysisOut
from app.auth import get_current_user, get_optional_user
from app.services.research_agent import run_research

router = APIRouter()


@router.post("/run", response_model=AnalysisOut)
def run_analysis(
    req: AnalysisRequest,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    if not req.symbols:
        raise HTTPException(status_code=400, detail="At least one symbol is required.")

    symbols_key = ",".join(sorted(s.upper() for s in req.symbols))
    query_key = (req.query or "").strip() or None
    user_id = user.id if user else None

    # Cache check: completed analysis < 1 hour old
    cutoff = datetime.utcnow() - timedelta(hours=1)
    cache_query = db.query(StockAnalysis).filter(
        StockAnalysis.symbols == symbols_key,
        StockAnalysis.status == "completed",
        StockAnalysis.created_at > cutoff,
    )
    if query_key is None:
        cache_query = cache_query.filter(StockAnalysis.query.is_(None))
    else:
        cache_query = cache_query.filter(StockAnalysis.query == query_key)
    if user_id is not None:
        cache_query = cache_query.filter(StockAnalysis.user_id == user_id)
    else:
        cache_query = cache_query.filter(StockAnalysis.user_id.is_(None))

    cached = cache_query.order_by(StockAnalysis.created_at.desc()).first()
    if cached:
        return cached

    # Create new analysis record
    record = StockAnalysis(
        user_id=user_id,
        symbols=symbols_key,
        query=query_key,
        status="running",
        provider="",
        model="",
    )
    db.add(record)
    db.flush()

    try:
        result = run_research(db, req.symbols, req.query)
        record.status = "completed"
        record.analysis = result["analysis"]
        record.provider = result["provider"]
        record.model = result["model"]
    except Exception as e:
        record.status = "failed"
        record.error = str(e)

    db.commit()
    db.refresh(record)
    return record


@router.get("/history", response_model=list[AnalysisOut])
def analysis_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(StockAnalysis)
        .filter(StockAnalysis.user_id == current_user.id)
        .order_by(StockAnalysis.created_at.desc())
        .limit(50)
        .all()
    )


@router.get("/{analysis_id}", response_model=AnalysisOut)
def get_analysis(analysis_id: int, db: Session = Depends(get_db)):
    record = db.query(StockAnalysis).filter(StockAnalysis.id == analysis_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return record
