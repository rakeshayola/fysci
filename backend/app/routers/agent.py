from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import AgentRequest, AgentResponse
from app.services.research_agent import run_research

router = APIRouter()


@router.post("/research", response_model=AgentResponse)
def research(req: AgentRequest, db: Session = Depends(get_db)):
    if not req.symbols:
        raise HTTPException(status_code=400, detail="At least one symbol is required.")
    try:
        result = run_research(db, req.symbols, req.query)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM API error: {str(e)}")
