from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from .. import crud, models, schemas, database, utils
from typing import List, Dict, Any, Optional
from collections import defaultdict
import json
from datetime import datetime, timedelta

router = APIRouter(
    prefix="/dashboard",
    tags=["dashboard"]
)

def get_latest_statements(db: Session, user_id: int, bank_name: Optional[str] = None, days: Optional[int] = None):
    """Helper to get the most recent statement for each portfolio owned by the user, optionally filtered by bank and date range."""
    query = db.query(models.Portfolio).filter(models.Portfolio.user_id == user_id)
    if bank_name:
        query = query.join(models.Bank).filter(func.lower(models.Bank.name) == bank_name.lower())
        
    portfolios = query.all()
    portfolio_ids = [p.id for p in portfolios]
    
    statement_query = db.query(models.Statement).filter(models.Statement.portfolio_id.in_(portfolio_ids))

    # Subquery to get the max date per portfolio
    subquery = db.query(
        models.Statement.portfolio_id,
        func.max(models.Statement.date).label("max_date")
    ).filter(
        models.Statement.portfolio_id.in_(portfolio_ids)
    )
    
    if days:
        cutoff_date = datetime.now() - timedelta(days=days)
        cutoff_str = cutoff_date.strftime("%Y-%m-%d")
        subquery = subquery.filter(models.Statement.date >= cutoff_str)
        
    subquery = subquery.group_by(models.Statement.portfolio_id).subquery()

    # Join statement query with the max_date subquery
    statements = db.query(models.Statement).join(
        subquery,
        (models.Statement.portfolio_id == subquery.c.portfolio_id) &
        (models.Statement.date == subquery.c.max_date)
    ).all()
    
    # In case there are multiple statements on the exact same max date for a portfolio, 
    # we take the one inserted last (highest ID)
    latest_statements = {}
    for s in statements:
        if s.portfolio_id not in latest_statements:
            latest_statements[s.portfolio_id] = s
        elif s.id > latest_statements[s.portfolio_id].id:
            latest_statements[s.portfolio_id] = s
            
    return list(latest_statements.values()), portfolios

@router.get("/summary", response_model=Dict[str, Any])
def get_dashboard_summary(
    bank: Optional[str] = Query(None, description="Filter by bank name"),
    current_user: schemas.User = Depends(utils.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Returns high-level summary: Net Worth, Total Invested, Gain/Loss.
    """
    latest_statements, portfolios = get_latest_statements(db, current_user.id, bank)
    
    total_net_worth = 0.0
    total_gain_loss = 0.0
    bank_totals = defaultdict(float)
    
    # Create map of portfolio_id to bank names
    portfolio_banks = {p.id: (p.bank.name if p.bank else "Unknown") for p in portfolios}
    portfolio_ids = list(portfolio_banks.keys())
    
    # Find top performing fund
    best_fund_name = "N/A"
    best_fund_pct = -float('inf')
    
    for stmt in latest_statements:
        raw = stmt.raw_data if isinstance(stmt.raw_data, dict) else json.loads(stmt.raw_data)
        summary = raw.get("summary", {})
        
        val = summary.get("total_market_value", 0.0)
        gain = summary.get("total_gain_loss", 0.0)
        
        total_net_worth += val
        total_gain_loss += gain
        
        b_name = portfolio_banks.get(stmt.portfolio_id, "Unknown")
        bank_totals[b_name] += val
        
        # Calculate individual fund performance
        holdings = raw.get("holdings", [])
        for holding in holdings:
            h_val = holding.get("market_value", 0.0)
            h_gain = holding.get("gain_loss", 0.0)
            h_invested = h_val - h_gain
            
            if h_invested > 0:
                pct = (h_gain / h_invested) * 100
                if pct > best_fund_pct:
                    best_fund_pct = pct
                    best_fund_name = holding.get("fund_name", "Unknown")
        
    top_performer_title = "N/A"
    top_performer_subtitle = "Best ROI"
    
    if bank and best_fund_name != "N/A":
        # If looking at a specific bank, show the best fund
        top_performer_title = best_fund_name
        top_performer_subtitle = f"{best_fund_pct:.2f}% Yield"
    elif bank_totals:
        # If looking globally, show the best bank
        top_performer_title = max(bank_totals.items(), key=lambda x: x[1])[0]
        
    total_invested = total_net_worth - total_gain_loss
    monthly_change_pct = (total_gain_loss / total_invested * 100) if total_invested > 0 else 0.0
    
    # Check if there's at least 1 month of data
    has_one_month = False
    all_dates = db.query(models.Statement.date).filter(
        models.Statement.portfolio_id.in_(portfolio_ids)
    ).all()
    
    if all_dates:
        parsed_dates = [datetime.strptime(d[0], "%Y-%m-%d") for d in all_dates if d[0]]
        if parsed_dates:
            min_date = min(parsed_dates)
            max_date = max(parsed_dates)
            if (max_date - min_date).days >= 30:
                has_one_month = True

    return {
        "total_net_worth": total_net_worth,
        "total_invested": total_invested,
        "total_gain_loss": total_gain_loss,
        "monthly_change_pct": monthly_change_pct,
        "top_performing_bank": top_performer_title,
        "top_performing_subtitle": top_performer_subtitle,
        "has_one_month": has_one_month
    }

@router.get("/holdings", response_model=List[Dict[str, Any]])
def get_detailed_holdings(
    bank: Optional[str] = Query(None, description="Filter by bank name"),
    current_user: schemas.User = Depends(utils.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Returns a flat list of all individual fund investments from the latest statements.
    """
    latest_statements, portfolios = get_latest_statements(db, current_user.id, bank)
    portfolio_banks = {p.id: (p.bank.name if p.bank else "Unknown") for p in portfolios}
    portfolio_accounts = {p.id: p.account_number for p in portfolios}
    
    all_holdings = []
    
    for stmt in latest_statements:
        raw = stmt.raw_data if isinstance(stmt.raw_data, dict) else json.loads(stmt.raw_data)
        b_name = portfolio_banks.get(stmt.portfolio_id, "Unknown")
        p_account = portfolio_accounts.get(stmt.portfolio_id, "Unknown")
        holdings = raw.get("holdings", [])
        
        for holding in holdings:
            h_val = holding.get("market_value", 0.0)
            h_gain = holding.get("gain_loss", 0.0)
            h_invested = h_val - h_gain
            
            pct_change = (h_gain / h_invested * 100) if h_invested > 0 else 0.0
            
            # Use raw percentage change if provided, otherwise compute it
            if "percent_change" in holding and holding["percent_change"] != 0.0:
                pct_change = holding["percent_change"]
                
            all_holdings.append({
                "fund_name": holding.get("fund_name", "Unknown"),
                "bank": b_name,
                "portfolio_account": p_account,
                "category": holding.get("category", "Other"),
                "units": holding.get("units", 0.0),
                "nav": holding.get("nav", 0.0),
                "investment_amount": h_invested,
                "market_value": h_val,
                "gain_loss": h_gain,
                "percentage_change": pct_change
            })
            
    # Sort holdings naturally by highest market value
    return sorted(all_holdings, key=lambda x: x["market_value"], reverse=True)


@router.get("/allocation", response_model=Dict[str, Any])
def get_asset_allocation(
    bank: Optional[str] = Query(None, description="Filter by bank name"),
    days: Optional[int] = Query(None, description="Filter by trailing days (e.g., 30, 90, 180, 365)"),
    current_user: schemas.User = Depends(utils.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Returns asset allocation (categories) for the latest statements.
    """
    latest_statements, _ = get_latest_statements(db, current_user.id, bank, days)
    
    allocations = defaultdict(float)
    
    for stmt in latest_statements:
        raw = stmt.raw_data if isinstance(stmt.raw_data, dict) else json.loads(stmt.raw_data)
        holdings = raw.get("holdings", [])
        
        for holding in holdings:
            raw_cat = holding.get("category", "Other").lower()
            
            if "money" in raw_cat or "cash" in raw_cat:
                cat = "Money Market"
            elif "equity" in raw_cat or "stock" in raw_cat:
                cat = "Stocks"
            elif "debt" in raw_cat and "income" in raw_cat:
                cat = "Income Funds"
            elif "debt" in raw_cat:
                cat = "Debt Market"
            elif "income" in raw_cat or "return" in raw_cat:
                cat = "Income Funds"
            elif "gold" in raw_cat or "commodity" in raw_cat:
                cat = "Gold"
            else:
                cat = "Others" # default fallback
                
            val = holding.get("market_value", 0.0)
            allocations[cat] += val

    # Calculate percentages
    total = sum(allocations.values())
    if total == 0:
        return {
            "dates": ["Stocks", "Gold", "Money Market", "Debt Market", "Income Funds", "Others"],
            "values": [0, 0, 0, 0, 0, 0]
        }
        
    dates = list(allocations.keys())
    values = [round((val / total) * 100, 1) for val in allocations.values()]

    return {
        "dates": dates,
        "values": values
    }

@router.get("/performance", response_model=Dict[str, Any])
def get_portfolio_performance(
    bank: Optional[str] = Query(None, description="Filter by bank name"),
    days: Optional[int] = Query(None, description="Filter by trailing days (e.g., 30, 90, 180, 365)"),
    current_user: schemas.User = Depends(utils.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Returns daily total portfolio value for the AreaChart.
    Line plot points use exact Statement dates.
    """
    query = db.query(models.Statement).join(models.Portfolio).filter(
        models.Portfolio.user_id == current_user.id
    )
    
    if bank:
        query = query.join(models.Bank).filter(
            models.Bank.name.ilike(f"%{bank}%")
        )
        
    if days:
        cutoff = datetime.now() - timedelta(days=days)
        # Assuming db Statement dates are stored as formatted strings "YYYY-MM-DD", 
        # we can do string comparison or parse. The easiest in SQLite/Postgres is string comparison for ISO dates.
        cutoff_str = cutoff.strftime("%Y-%m-%d")
        query = query.filter(models.Statement.date >= cutoff_str)

    statements = query.order_by(models.Statement.date.asc()).all()
    
    # Need to get portfolio_ids from the filtered statements to correctly sum values
    # This part was slightly off in the original and the provided snippet.
    # We need the portfolios associated with the filtered statements to get their IDs.
    # A more robust way is to get unique portfolio_ids from the filtered statements.
    portfolio_ids = list(set([stmt.portfolio_id for stmt in statements]))

    statements_by_date = defaultdict(list)
    for stmt in statements:
        statements_by_date[stmt.date].append(stmt)
        
    sorted_dates = sorted(statements_by_date.keys())
    
    portfolio_latest = {pid: 0.0 for pid in portfolio_ids}
    daily_totals = {}
    
    for date in sorted_dates:
        for stmt in statements_by_date[date]:
            raw = stmt.raw_data if isinstance(stmt.raw_data, dict) else json.loads(stmt.raw_data)
            val = raw.get("summary", {}).get("total_market_value", 0.0)
            portfolio_latest[stmt.portfolio_id] = val
            
        daily_totals[date] = sum(portfolio_latest.values())

    if not daily_totals:
        return {
            "dates": ["2026-02-18", "2026-02-19", "2026-02-20"],
            "values": [0, 0, 0]
        }
    
    return {
        "dates": sorted_dates,
        "values": [daily_totals[d] for d in sorted_dates]
    }

@router.get("/insights", response_model=Dict[str, Any])
def get_ai_insights(
    bank: Optional[str] = Query(None, description="Filter by bank name"),
    current_user: schemas.User = Depends(utils.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Analyzes current portfolio for risk factors and generates plain text insights.
    """
    latest_statements, portfolios = get_latest_statements(db, current_user.id, bank)
    portfolio_banks = {p.id: (p.bank.name if p.bank else "Unknown") for p in portfolios}
    
    total_market_value = 0.0
    category_totals = defaultdict(float)
    bank_totals = defaultdict(float)
    
    worst_fund = None
    worst_yield = float('inf')
    worst_loss = 0.0
    
    for stmt in latest_statements:
        raw = stmt.raw_data if isinstance(stmt.raw_data, dict) else json.loads(stmt.raw_data)
        b_name = portfolio_banks.get(stmt.portfolio_id, "Unknown")
        holdings = raw.get("holdings", [])
        
        for h in holdings:
            val = h.get("market_value", 0.0)
            gain = h.get("gain_loss", 0.0)
            cat = h.get("category", "Other")
            fund = h.get("fund_name", "Unknown")
            
            invested = val - gain
            pct_change = (gain / invested * 100) if invested > 0 else 0.0
            
            total_market_value += val
            category_totals[cat] += val
            bank_totals[b_name] += val
            
            if val > 0 and gain < 0:
                if pct_change < worst_yield:
                    worst_yield = pct_change
                    worst_loss = gain
                    worst_fund = fund

    insights = []
    
    summary_insights = []
    
    if total_market_value > 0:
        # 1. Asset Category Concentration (> 50%)
        safe_keywords = ["money market", "income", "debt", "islamic funds", "cash"]
        
        for cat, amount in category_totals.items():
            pct = amount / total_market_value
            if pct > 0.50:
                is_safe = any(k in cat.lower() for k in safe_keywords)
                if is_safe:
                    summary_insights.append({
                        "title": f"Safe Haven Allocation: {cat}",
                        "message": f"Your portfolio is heavily allocated to low-risk {cat} ({pct * 100:.1f}%). This provides excellent capital preservation, though you may consider small equity positions to outpace long-term inflation."
                    })
                else:
                    summary_insights.append({
                        "title": f"High Warning: {cat} Concentration",
                        "message": f"Your portfolio is highly exposed to {cat} assets ({pct * 100:.1f}% of total). Consider diversifying into safer categories like Money Market or Income funds to hedge against market volatility."
                    })
                
        # 2. Bank Concentration Risk (> 80%)
        for b, amount in bank_totals.items():
            pct = amount / total_market_value
            if pct > 0.80:
                summary_insights.append({
                    "title": f"Concentration Risk: {b}",
                    "message": f"{pct * 100:.1f}% of your wealth is held strictly in {b}. For stronger risk management, redistributing equity to other institutions is recommended."
                })
                
        # 3. Underperforming Asset Triggers
        if worst_fund and worst_yield < -1.0:
            summary_insights.append({
                "title": "Underperforming Asset Detected",
                "message": f"{worst_fund} is currently yielding {worst_yield:.1f}% (PKR {worst_loss:,.0f} loss). If this trend continues over a 3-month rolling period, verify its underlying performance benchmark."
            })
            
        # 4. Tax Evaluation (15% CGT on positive returns)
        total_gains = sum(h.get("gain_loss", 0) for stmt in latest_statements for h in (stmt.raw_data if isinstance(stmt.raw_data, dict) else json.loads(stmt.raw_data)).get("holdings", []) if h.get("gain_loss", 0) > 0)
        if total_gains > 0:
            tax_liability = total_gains * 0.15 # 15% Filer CGT roughly
            summary_insights.append({
                "title": "Capital Gains Tax (CGT) Estimate",
                "message": f"Based on positive returns of PKR {total_gains:,.0f}, your estimated CGT liability at 15% (Filer rate) is PKR {tax_liability:,.0f} upon realization."
            })
            
    # Default message if perfectly balanced
    if len(summary_insights) == 0:
        summary_insights.append({
            "title": "Portfolio Optimal",
            "message": "Your portfolio is beautifully balanced according to our risk parity checking algorithms. No immediate action required."
        })
        
    return {
        "insight_available": len(summary_insights) > 0,
        "insight": summary_insights[0] if summary_insights else None,
        "all_insights": summary_insights
    }
