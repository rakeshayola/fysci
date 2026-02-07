from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Widget
from app.schemas import WidgetOut, WidgetCreate

router = APIRouter()


@router.get("/", response_model=list[WidgetOut])
def list_widgets(db: Session = Depends(get_db)):
    """Return all dashboard widgets."""
    return db.query(Widget).order_by(Widget.position_y, Widget.position_x).all()


@router.post("/", response_model=WidgetOut, status_code=201)
def create_widget(widget: WidgetCreate, db: Session = Depends(get_db)):
    """Add a new widget to the dashboard."""
    db_widget = Widget(**widget.model_dump())
    db.add(db_widget)
    db.commit()
    db.refresh(db_widget)
    return db_widget


@router.delete("/{widget_id}", status_code=204)
def delete_widget(widget_id: int, db: Session = Depends(get_db)):
    """Remove a widget from the dashboard."""
    widget = db.query(Widget).filter(Widget.id == widget_id).first()
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")
    db.delete(widget)
    db.commit()
