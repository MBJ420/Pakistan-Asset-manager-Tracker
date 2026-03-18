from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime

class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class BankBase(BaseModel):
    name: str

class Bank(BankBase):
    id: int
    class Config:
        from_attributes = True

class PortfolioBase(BaseModel):
    account_number: str
    holder_name: str
    bank_id: int

class PortfolioCreate(PortfolioBase):
    pass

class Portfolio(PortfolioBase):
    id: int
    user_id: int
    class Config:
        from_attributes = True

class StatementBase(BaseModel):
    date: str
    file_path: str
    raw_data: Optional[Any] = None

class StatementCreate(StatementBase):
    portfolio_id: int

class Statement(StatementBase):
    id: int
    portfolio_id: int
    created_at: datetime
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
