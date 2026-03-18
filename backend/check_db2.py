import sys
import json
from app.database import SessionLocal
from app.models import Statement, Portfolio

db = SessionLocal()
stmts = db.query(Statement).all()
print(f"Total statements: {len(stmts)}")
for s in stmts:
    raw = json.loads(s.raw_data) if isinstance(s.raw_data, str) else s.raw_data
    bank = raw.get("bank", "Unknown")
    summary = raw.get("summary", {})
    val = summary.get("total_market_value", 0)
    gain = summary.get("total_gain_loss", 0)
    print(f"[{s.date}] {bank}: Market Value={val}, Gain={gain}")
    for idx, h in enumerate(raw.get("holdings", [])):
        print(f"  Hold {idx}: {h.get('fund_name')} - {h.get('market_value')}")
db.close()
