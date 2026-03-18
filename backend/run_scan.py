import os
import sys

sys.path.append('.')

from app.database import SessionLocal
from app.services.pdf_parser import parser
from app.crud import save_statement
from app.models import User

def main():
    db = SessionLocal()
    user = db.query(User).filter(User.username == 'jamil').first()
    
    if not user:
        print("User not found.")
        return

    base_dir = r"C:\Users\Jameel Akhtar\data\jamil"
    
    for root, _, files in os.walk(base_dir):
        for file in files:
            if file.lower().endswith(".pdf"):
                path = os.path.join(root, file)
                
                # Bank name is the parent directory name
                bank = os.path.basename(os.path.dirname(path))
                
                # Parse
                parsed = parser.parse_statement(path, bank)
                
                if "error" in parsed:
                     print(f"Error parsing {path}: {parsed['error']}")
                     continue
                
                # Save
                save_statement(db, user.id, parsed, path)

    import sqlite3
    import json
    conn = sqlite3.connect('fundtracker.db')
    cur = conn.cursor()
    cur.execute('SELECT p.account_number, s.date, s.raw_data FROM statements s JOIN portfolios p ON s.portfolio_id = p.id ORDER BY s.date DESC;')
    results = cur.fetchall()
    
    sum_val = 0
    for r in results:
        raw = json.loads(r[2]) if isinstance(r[2], str) else r[2]
        nw = raw.get('summary', {}).get('total_market_value', 0)
        sum_val += nw
    
    print(f'ALL (Length={len(results)}): {[r[:2] for r in results[:10]]}')
    print(f'TOTAL NW RAW SUM: {sum_val}')
    conn.close()

if __name__ == "__main__":
    main()
