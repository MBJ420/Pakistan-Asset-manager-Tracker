from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Float, JSON, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    portfolios = relationship("Portfolio", back_populates="user")

class Bank(Base):
    __tablename__ = "banks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)  # Meezan, HBL, Atlas, Faysal

    funds = relationship("Fund", back_populates="bank")
    portfolios = relationship("Portfolio", back_populates="bank")

class Fund(Base):
    __tablename__ = "funds"

    id = Column(Integer, primary_key=True, index=True)
    bank_id = Column(Integer, ForeignKey("banks.id"))
    name = Column(String, index=True)
    short_name = Column(String, nullable=True) # E.g., MCF for Meezan Cash Fund
    category = Column(String)  # Equity, Gold, Money Market, etc.
    
    # Enriched FMR Metadata (Parsed via PDF uploads/folder watchers)
    risk_profile = Column(String, nullable=True)     # "Low", "Moderate", "High"
    asset_allocation = Column(String, nullable=True) # "80% Stocks, 20% Cash"
    fund_type = Column(String, nullable=True)        # "Money Market", "Equity", "Income"
    
    # Official FMR Historical Returns (Fallback for Pension Funds)
    fmr_return_1m = Column(Float, nullable=True)
    fmr_return_6m = Column(Float, nullable=True)
    fmr_return_1y = Column(Float, nullable=True)
    fmr_return_ytd = Column(Float, nullable=True)

    bank = relationship("Bank", back_populates="funds")

class Portfolio(Base):
    __tablename__ = "portfolios"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    bank_id = Column(Integer, ForeignKey("banks.id"))
    account_number = Column(String, index=True) # Portfolio ID/Account Number
    holder_name = Column(String)

    user = relationship("User", back_populates="portfolios")
    bank = relationship("Bank", back_populates="portfolios")
    statements = relationship("Statement", back_populates="portfolio")

class Statement(Base):
    __tablename__ = "statements"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"))
    date = Column(String)  # YYYY-MM-DD
    file_path = Column(String)
    raw_data = Column(JSON) # Store parsed data as JSON
    created_at = Column(DateTime, default=datetime.utcnow)

    portfolio = relationship("Portfolio", back_populates="statements")

class FundNAVHistory(Base):
    __tablename__ = "fund_nav_history"

    id = Column(Integer, primary_key=True, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), index=True)
    date = Column(String, index=True) # YYYY-MM-DD
    nav_price = Column(Float)

    fund = relationship("Fund", backref="nav_history")

class FundPerformanceMetrics(Base):
    __tablename__ = "fund_performance_metrics"

    id = Column(Integer, primary_key=True, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), index=True)
    date = Column(String, index=True) # Date these metrics were scraped
    return_1m = Column(Float, nullable=True)
    return_6m = Column(Float, nullable=True)
    return_1y = Column(Float, nullable=True)
    return_ytd = Column(Float, nullable=True)

    fund = relationship("Fund", backref="performance_metrics")

