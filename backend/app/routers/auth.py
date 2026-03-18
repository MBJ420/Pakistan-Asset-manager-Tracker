from datetime import timedelta
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from .. import crud, models, schemas, database
from ..utils import create_access_token, get_current_user # Need to implement utils

router = APIRouter(
    tags=["authentication"]
)

from pathlib import Path

@router.post("/token", response_model=schemas.Token)
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(database.get_db)
):
    user = crud.get_user_by_username(db, username=form_data.username)
    if not user or not crud.verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Ensure data folders exist on login
    try:
        base_data_path = Path("C:/Users/Jameel Akhtar/data")
        user_data_path = base_data_path / user.username
        banks = ["meezan", "hbl", "faysal", "atlas"]
        
        for bank in banks:
            (user_data_path / bank).mkdir(parents=True, exist_ok=True)
    except Exception as e:
        print(f"Failed to ensure folders exist on login: {e}")

    access_token_expires = timedelta(minutes=30)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}
