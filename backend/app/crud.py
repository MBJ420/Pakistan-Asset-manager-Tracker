from sqlalchemy.orm import Session
from . import models, schemas
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()

def create_user(db: Session, user: schemas.UserCreate):
    hashed_password = get_password_hash(user.password)
    db_user = models.User(username=user.username, password_hash=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def get_portfolios(db: Session, user_id: int, skip: int = 0, limit: int = 100):
    return db.query(models.Portfolio).filter(models.Portfolio.user_id == user_id).offset(skip).limit(limit).all()

def create_portfolio(db: Session, portfolio: schemas.PortfolioCreate, user_id: int):
    db_portfolio = models.Portfolio(**portfolio.dict(), user_id=user_id)
    db.add(db_portfolio)
    db.commit()
    db.refresh(db_portfolio)
    return db_portfolio

def get_or_create_bank(db: Session, bank_name: str) -> models.Bank:
    """Finds a bank by name or creates it if it doesn't exist."""
    bank = db.query(models.Bank).filter(models.Bank.name.ilike(bank_name)).first()
    if not bank:
        bank = models.Bank(name=bank_name.capitalize())
        db.add(bank)
        db.commit()
        db.refresh(bank)
    return bank

def save_statement(db: Session, user_id: int, parsed_data: dict, file_path: str) -> dict:
    """
    Saves parsed PDF statement data into the database.
    Creates Bank and Portfolio if they don't exist.
    Avoids duplicate inserts for the same portfolio and exact date.
    """
    bank_name = parsed_data.get("bank")
    if not bank_name:
        return {"error": "Missing bank name in parsed data"}
        
    portfolio_id_str = parsed_data.get("portfolio_id", "UNKNOWN")
    account_name = parsed_data.get("account_name", "UNKNOWN")
    date = parsed_data.get("statement_date")
    
    if not date:
        return {"error": "Missing statement date in parsed data"}
        
    bank = get_or_create_bank(db, bank_name)
    
    # Find or create portfolio
    portfolio = db.query(models.Portfolio).filter(
        models.Portfolio.user_id == user_id,
        models.Portfolio.bank_id == bank.id,
        models.Portfolio.account_number == portfolio_id_str
    ).first()
    
    if not portfolio:
        portfolio = models.Portfolio(
            user_id=user_id,
            bank_id=bank.id,
            account_number=portfolio_id_str,
            holder_name=account_name
        )
        db.add(portfolio)
        db.commit()
        db.refresh(portfolio)
    
    # HEALING LOGIC: If we found a valid name in this PDF, update the portfolio 
    # and propagate it to other "UNKNOWN" or "Garbage" portfolios for the same user.
    if account_name and account_name != "UNKNOWN":
        # Check if the current portfolio name is garbage or unknown
        blacklist = ["GROSS DIVIDEND", "WHT", "ZAKAT", "PORTFOLIO NO", "UNKNOWN"]
        is_current_garbage = any(word in (portfolio.holder_name or "").upper() for word in blacklist)
        
        if is_current_garbage:
            logger.info(f"Healing portfolio {portfolio.account_number}: Current '{portfolio.holder_name}' -> New '{account_name}'")
            portfolio.holder_name = account_name
            db.commit()
            
            # Propagate to all other portfolios for this user that are also garbage
            other_portfolios = db.query(models.Portfolio).filter(models.Portfolio.user_id == user_id).all()
            for p in other_portfolios:
                if any(word in (p.holder_name or "").upper() for word in blacklist):
                    logger.info(f"Propagating consensus name to user {user_id}'s portfolio {p.account_number}")
                    p.holder_name = account_name
            db.commit()
        
    # Check for duplicate statement on exact date
    existing_statement = db.query(models.Statement).filter(
        models.Statement.portfolio_id == portfolio.id,
        models.Statement.date == date
    ).first()
    
    if existing_statement:
        # Update rather than skip, so parser logic changes can heal old entries
        existing_statement.raw_data = parsed_data
        db.commit()
        return {"status": "updated", "message": f"Statement updated for date {date}", "statement_id": existing_statement.id}
        
    statement = models.Statement(
        portfolio_id=portfolio.id,
        date=date,
        file_path=file_path,
        raw_data=parsed_data
    )
    db.add(statement)
    db.commit()
    db.refresh(statement)
    
    return {"status": "success", "statement_id": statement.id}

def delete_statement(db: Session, file_path: str) -> bool:
    """
    Deletes a statement from the database based on the file path.
    Called when the Watchdog detects a file deletion.
    """
    statement = db.query(models.Statement).filter(models.Statement.file_path == file_path).first()
    if statement:
        db.delete(statement)
        db.commit()
        return True
    return False


