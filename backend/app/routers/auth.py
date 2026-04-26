from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import RegisterRequest, LoginRequest, UserOut, TokenResponse
from app.auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter()


@router.post("/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if db.query(User).filter(User.username == req.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")

    is_first_user = db.query(User).count() == 0
    user = User(
        email=req.email,
        username=req.username,
        hashed_password=hash_password(req.password),
        is_admin=is_first_user,
        is_approved=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if getattr(user, "is_locked", False):
        raise HTTPException(status_code=403, detail="Account is locked")
    if not getattr(user, "is_approved", True):
        raise HTTPException(status_code=403, detail="Account pending approval")

    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


class ResetPasswordRequest(BaseModel):
    email: str
    token: str
    new_password: str


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        raise HTTPException(status_code=400, detail="No account found with that email address")
    if not user.reset_token:
        raise HTTPException(status_code=400, detail="No reset token has been generated for this account. Ask an admin to generate one.")
    if user.reset_token_expiry and user.reset_token_expiry < datetime.utcnow():
        user.reset_token = None
        user.reset_token_expiry = None
        db.commit()
        raise HTTPException(status_code=400, detail="Reset token has expired. Ask an admin to generate a new one.")
    if user.reset_token.strip() != req.token.strip():
        raise HTTPException(status_code=400, detail="Reset token does not match. Make sure you copied it correctly.")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user.hashed_password = hash_password(req.new_password)
    user.reset_token = None
    user.reset_token_expiry = None
    db.commit()
    return {"message": "Password reset successfully"}
