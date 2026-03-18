from playwright.sync_api import sync_playwright
import sys, os

# Ensure backend app imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.database import SessionLocal
from app.models import Fund, Bank

def seed():
    print("Fetching MUFAP data...")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto('https://mufap.com.pk/Industry/IndustryStatDaily?tab=1', wait_until='networkidle', timeout=60000)
        page.wait_for_timeout(5000)
        table_text = page.locator('#table_id').inner_text()
        browser.close()
        
    print("Data fetched. Processing combinations...")
    db = SessionLocal()
    banks = db.query(Bank).all()
    # Map lowercase bank names to their IDs
    bank_map = {b.name.lower(): b.id for b in banks}
    
    # Check bank mappings specifically for requested aliases: 
    # The database has names exactly like "Meezan", "HBL", "Atlas", "Faysal" based on our earlier purge.
    
    lines = table_text.split('\n')
    headers = []
    
    added = 0
    for line in lines:
        cols = line.split('\t')
        if 'Fund Name' in cols and 'NAV' in cols:
            headers = [c.strip() for c in cols]
            continue
            
        if len(cols) < 5 or not headers:
            continue
            
        fund_name = cols[headers.index('Fund Name')].strip()
        if not fund_name:
            continue
            
        # Check if fund belongs to one of our target banks
        matched_bank_id = None
        fund_lower = fund_name.lower()
        if 'meezan' in fund_lower or 'al meezan' in fund_lower:
            matched_bank_id = bank_map.get('meezan')
        elif 'hbl' in fund_lower:
            matched_bank_id = bank_map.get('hbl')
        elif 'atlas' in fund_lower:
            matched_bank_id = bank_map.get('atlas', bank_map.get('atlas funds')) 
            if not matched_bank_id:
                # search keys manually
                for k, v in bank_map.items():
                    if 'atlas' in k:
                        matched_bank_id = v
        elif 'faysal' in fund_lower:
            matched_bank_id = bank_map.get('faysal', bank_map.get('faysal funds'))
            if not matched_bank_id:
                for k, v in bank_map.items():
                    if 'faysal' in k:
                        matched_bank_id = v
                        
        if matched_bank_id:
            existing = db.query(Fund).filter(Fund.name == fund_name).first()
            if not existing:
                db.add(Fund(name=fund_name, bank_id=matched_bank_id))
                added += 1
                
    db.commit()
    db.close()
    print(f"Added {added} funds successfully.")

if __name__ == '__main__':
    seed()
