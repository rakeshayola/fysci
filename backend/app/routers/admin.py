import os
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import require_admin, get_current_user
from app.database import get_db
from app.models import User, Portfolio, PortfolioHolding, Stock, StockPrice
from app.schemas import AdminUserOut, AdminAnalytics

router = APIRouter()

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "")


def _ensure_admin(user: User):
    if ADMIN_EMAIL and user.email == ADMIN_EMAIL:
        return
    if not getattr(user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")


# ── User list ────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)

    users = db.query(User).order_by(User.created_at.desc()).all()
    result = []
    for u in users:
        portfolio_count = db.query(func.count(Portfolio.id)).filter(Portfolio.user_id == u.id).scalar() or 0
        stock_count = (
            db.query(func.count(PortfolioHolding.id))
            .join(Portfolio)
            .filter(Portfolio.user_id == u.id)
            .scalar() or 0
        )
        # Estimate total value from latest prices
        total_value = _user_total_value(db, u.id)
        result.append(AdminUserOut(
            id=u.id,
            email=u.email,
            username=u.username,
            is_active=u.is_active,
            is_locked=getattr(u, "is_locked", False),
            is_approved=getattr(u, "is_approved", True),
            is_admin=getattr(u, "is_admin", False),
            created_at=u.created_at,
            portfolio_count=portfolio_count,
            stock_count=stock_count,
            total_value=total_value,
        ))
    return result


def _user_total_value(db: Session, user_id: int) -> float:
    holdings = (
        db.query(PortfolioHolding)
        .join(Portfolio)
        .filter(Portfolio.user_id == user_id)
        .all()
    )
    total = 0.0
    for h in holdings:
        latest = (
            db.query(StockPrice)
            .filter(StockPrice.stock_id == h.stock_id)
            .order_by(StockPrice.date.desc())
            .first()
        )
        if latest and latest.close and h.shares:
            total += float(latest.close) * float(h.shares)
    return round(total, 2)


# ── Lock / unlock ─────────────────────────────────────────────────────────────

@router.post("/users/{user_id}/lock")
def toggle_lock(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot lock your own account")
    user.is_locked = not getattr(user, "is_locked", False)
    db.commit()
    return {"id": user.id, "is_locked": user.is_locked}


# ── Approve ───────────────────────────────────────────────────────────────────

@router.post("/users/{user_id}/approve")
def approve_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_approved = True
    db.commit()
    return {"id": user.id, "is_approved": True}


# ── Delete user ───────────────────────────────────────────────────────────────

@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    db.delete(user)
    db.commit()
    return {"deleted": user_id}


# ── Promote / demote admin ─────────────────────────────────────────────────────

@router.post("/users/{user_id}/toggle-admin")
def toggle_admin(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own admin status")
    user.is_admin = not getattr(user, "is_admin", False)
    db.commit()
    return {"id": user.id, "is_admin": user.is_admin}


# ── Generate password-reset token ─────────────────────────────────────────────

@router.post("/users/{user_id}/generate-reset-token")
def generate_reset_token(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    token = secrets.token_urlsafe(32)
    user.reset_token = token
    user.reset_token_expiry = datetime.utcnow() + timedelta(hours=1)
    db.commit()
    return {"user_id": user.id, "username": user.username, "token": token, "expires_in": "1 hour"}


# ── Analytics ─────────────────────────────────────────────────────────────────

@router.get("/analytics")
def get_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)

    total_users = db.query(func.count(User.id)).scalar() or 0
    locked_users = db.query(func.count(User.id)).filter(User.is_locked == True).scalar() or 0
    pending_approval = db.query(func.count(User.id)).filter(User.is_approved == False).scalar() or 0
    active_users = total_users - locked_users
    total_portfolios = db.query(func.count(Portfolio.id)).scalar() or 0
    total_holdings = db.query(func.count(PortfolioHolding.id)).scalar() or 0

    # Most tracked stocks (by number of holdings)
    most_tracked = (
        db.query(Stock.symbol, Stock.name, func.count(PortfolioHolding.id).label("count"))
        .join(PortfolioHolding, PortfolioHolding.stock_id == Stock.id)
        .group_by(Stock.id, Stock.symbol, Stock.name)
        .order_by(func.count(PortfolioHolding.id).desc())
        .limit(10)
        .all()
    )
    most_tracked_stocks = [
        {"symbol": r.symbol, "name": r.name, "count": r.count}
        for r in most_tracked
    ]

    # Registrations per day for last 30 days
    since = datetime.utcnow() - timedelta(days=30)
    daily_regs = (
        db.query(
            func.date(User.created_at).label("day"),
            func.count(User.id).label("count"),
        )
        .filter(User.created_at >= since)
        .group_by(func.date(User.created_at))
        .order_by(func.date(User.created_at))
        .all()
    )
    registrations_over_time = [
        {"date": str(r.day), "count": r.count}
        for r in daily_regs
    ]

    # Net worth per user (for distribution chart)
    users = db.query(User).all()
    networth_distribution = []
    for u in users:
        val = _user_total_value(db, u.id)
        networth_distribution.append({"username": u.username, "value": val})
    networth_distribution.sort(key=lambda x: x["value"], reverse=True)

    return {
        "total_users": total_users,
        "active_users": active_users,
        "locked_users": locked_users,
        "pending_approval": pending_approval,
        "total_portfolios": total_portfolios,
        "total_holdings": total_holdings,
        "most_tracked_stocks": most_tracked_stocks,
        "registrations_over_time": registrations_over_time,
        "networth_distribution": networth_distribution,
    }
