from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LlmSetting
from app.schemas import LlmSettingCreate, LlmSettingOut

router = APIRouter()


def _mask_key(key: str) -> str:
    if len(key) <= 4:
        return "****"
    return "*" * (len(key) - 4) + key[-4:]


def _to_out(setting: LlmSetting) -> dict:
    return {
        "id": setting.id,
        "provider": setting.provider,
        "api_key_masked": _mask_key(setting.api_key),
        "model_name": setting.model_name,
        "is_active": setting.is_active,
    }


@router.get("/", response_model=LlmSettingOut | None)
def get_settings(db: Session = Depends(get_db)):
    setting = db.query(LlmSetting).filter(LlmSetting.is_active == True).first()
    if not setting:
        return None
    return _to_out(setting)


@router.post("/", response_model=LlmSettingOut, status_code=200)
def save_settings(payload: LlmSettingCreate, db: Session = Depends(get_db)):
    # Deactivate all existing
    db.query(LlmSetting).update({"is_active": False})

    # Upsert by provider
    existing = db.query(LlmSetting).filter(LlmSetting.provider == payload.provider).first()
    if existing:
        existing.api_key = payload.api_key
        existing.model_name = payload.model_name
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return _to_out(existing)

    new_setting = LlmSetting(
        provider=payload.provider,
        api_key=payload.api_key,
        model_name=payload.model_name,
        is_active=True,
    )
    db.add(new_setting)
    db.commit()
    db.refresh(new_setting)
    return _to_out(new_setting)


@router.delete("/", status_code=204)
def delete_settings(db: Session = Depends(get_db)):
    db.query(LlmSetting).delete()
    db.commit()
