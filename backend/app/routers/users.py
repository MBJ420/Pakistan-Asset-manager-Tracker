from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from .. import crud, models, schemas, database
from ..utils import get_current_user

router = APIRouter(
    prefix="/users",
    tags=["users"]
)

import os
from pathlib import Path

@router.post("/", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    # Create User in DB
    new_user = crud.create_user(db=db, user=user)

    # Create Folder Structure
    try:
        # Use a fixed data directory outside of Documents for better control
        base_data_path = Path("C:/Users/Jameel Akhtar/data")
        user_data_path = base_data_path / user.username
        
        banks = ["meezan", "hbl", "faysal", "atlas"]
        
        for bank in banks:
            (user_data_path / bank).mkdir(parents=True, exist_ok=True)
            
        print(f"Created folders at: {user_data_path}")
    except Exception as e:
        print(f"Failed to create folders: {e}")
        # Note: We don't rollback user creation if folder creation fails, but we log it.

    return new_user

@router.get("/me", response_model=schemas.User)
async def read_users_me(current_user: schemas.User = Depends(get_current_user)):
    return current_user
