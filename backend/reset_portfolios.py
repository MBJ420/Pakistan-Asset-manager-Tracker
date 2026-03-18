import sys, os
sys.path.append(r'c:\Users\Jameel Akhtar\VsCode\Fund Tracker\backend')
from app.database import SessionLocal
from app.models import Portfolio, Statement

def reset():
    db = SessionLocal()
    count_s = db.query(Statement).count()
    count_p = db.query(Portfolio).count()
    db.query(Statement).delete()
    db.query(Portfolio).delete()
    db.commit()
    print(f"Deleted {count_s} statements and {count_p} portfolios.")
    db.close()

if __name__ == '__main__':
    reset()
