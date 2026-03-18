import pdfplumber
import re
from datetime import datetime
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

class PDFParser:
    def __init__(self):
        pass

    def parse_statement(self, file_path: str, bank_name: str) -> Dict[str, Any]:
        """
        Parses a PDF statement based on the bank name.
        """
        if bank_name.lower() in ["meezan", "hbl", "atlas", "faysal"]:
            return self._generic_parse(file_path, bank_name.capitalize())
        else:
            return {"error": f"Bank {bank_name} not supported"}

    def _generic_parse(self, file_path: str, bank_name: str) -> Dict[str, Any]:
        """
        Extracts data from funds statement using generalized regex heuristics.
        """
        data = {
            "bank": bank_name,
            "holdings": [],
            "summary": {},
            "portfolio_id": "UNKNOWN",
            "account_name": "UNKNOWN",
            "statement_month": datetime.now().strftime("%Y-%m")
        }
        
        try:
            with pdfplumber.open(file_path) as pdf:
                full_text = ""
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        full_text += text + "\n"
                
                # --- EXACT STATEMENT DATE ---
                # Meezan: "Balance Summary as at 19-Feb-2026"
                # Atlas/Faysal: "Print Date : 10-Feb-2026" or "Summary of Investment - As of 31-Jan-2026"
                # HBL: "Print Date: 09-Feb-2026 1:24:04PM"
                date_match = re.search(r"(?:Balance Summary as at|Print Date\s*:|Summary of Investment - As of)\s*(\d{1,2}-[A-Za-z]{3}-\d{4})", full_text, re.IGNORECASE)
                if date_match:
                    date_str = date_match.group(1)
                    dt_obj = datetime.strptime(date_str, "%d-%b-%Y")
                    data["statement_date"] = dt_obj.strftime("%Y-%m-%d")
                    data["statement_month"] = dt_obj.strftime("%Y-%m")
                else:
                    data["statement_date"] = datetime.now().strftime("%Y-%m-%d")
                
                # --- PORTFOLIO ID ---
                # Search prioritize exact portfolio references over generic account/customer IDs
                # This explicitly solves the Meezan sub-portfolio overwrite bug
                portfolio_ids = re.findall(r"(?:Portfolio No|Portfolio ID|Portfolio\s*#|Portfolio Number|Folio No|Folio Number)[\s\:\#\n]*([A-Za-z0-9\-\/]+)", full_text, re.IGNORECASE)
                
                valid_id = None
                for pid in portfolio_ids:
                    if pid.lower() != "statement":
                        valid_id = pid.strip()
                        break
                        
                if not valid_id:
                    alt_ids = re.findall(r"(?:Account No|Account Number|Registration No|Registration Number|Investor ID|Customer ID)[\s\:\#]*([A-Za-z0-9\-\/]+)", full_text, re.IGNORECASE)
                    for pid in alt_ids:
                        if pid.lower() != "statement":
                            valid_id = pid.strip()
                            break
                            
                data["portfolio_id"] = valid_id if valid_id else f"PORT-{abs(hash(full_text)) % 100000}"
                    
            # --- ACCOUNT NAME ---
            name_match = re.search(r"(?:Account Title|Name|Customer ID:.*?\n.*?\n)(.*?)\n", full_text, re.IGNORECASE)
            if not name_match:
                # Atlas/Faysal format has name right after IPA Number
                name_match = re.search(r"IPA Number.*?\n(.*?)(?:\s+Employer Name|[\r\n])", full_text)
            if not name_match:
                # HBL often has name after "Distribution Payout: Re-Invest"
                name_match = re.search(r"Distribution Payout:.*?\n(.*?)\n", full_text, re.IGNORECASE)
            
            if name_match:
                name = name_match.group(1).strip().upper()
                # Blacklist garbage headers and labels
                blacklist = ["GROSS DIVIDEND", "WHT", "ZAKAT", "NET DIVIDEND", "PORTFOLIO NO", "FOLIO NO", "ACCOUNT NO", "TAX"]
                is_garbage = any(word in name for word in blacklist) or any(char.isdigit() for char in name)
                
                if name and not is_garbage and len(name) < 60 and (len(name.split()) > 1):
                    data["account_name"] = name.replace("MR. ", "").replace("MS. ", "").strip()
                
                # --- HOLDINGS PARSING ---
                # --- HOLDINGS PARSING ---
                if bank_name.lower() in ["atlas", "faysal"]:
                    # Both Atlas and Faysal use the same generator and summarize the actual values at the very bottom
                    summary_idx = full_text.find("Summary of Investment - As of")
                    if summary_idx == -1:
                        summary_idx = full_text.find("Summary of Investment")
                        
                    mode_idx = full_text.find("Mode of Unit Holding", summary_idx)
                    
                    if mode_idx == -1:
                        mode_idx = full_text.find("Contribution Details", summary_idx)
                    
                    # Pension funds print Summary at the TOP, followed by the Transaction Ledger. 
                    # We must stop slicing before the ledger starts to avoid parsing transactions as funds.
                    ledger_idx1 = full_text.find("Date Transaction", summary_idx)
                    ledger_idx2 = full_text.find("NAV Date", summary_idx)
                    
                    cutoffs = [idx for idx in [mode_idx, ledger_idx1, ledger_idx2] if idx != -1]
                    end_idx = min(cutoffs) if cutoffs else (summary_idx + 1000)
                    
                    if summary_idx != -1:
                        table_text = full_text[summary_idx:end_idx]
                        lines = table_text.split('\n')
                        
                        for line in lines:
                            if "Fund Name" in line or "Summary of Investment" in line or line.strip() == "": 
                                continue
                            
                            tokens = line.strip().split()
                            if len(tokens) < 5: 
                                continue
                                
                            # Skip the total sum row which is just a single number at the end usually
                            if len(tokens) == 1: 
                                continue
                                
                            try:
                                val_str = tokens[-1].replace(',', '')
                                if val_str == '-': 
                                    val_str = '0.0'
                                val = float(val_str)
                                
                                # Check if Date is Token -2
                                has_date = bool(re.match(r'\d{2}-[A-Za-z]{3}-\d{4}', tokens[-2]))
                                offset = 1 if has_date else 0
                                
                                nav_str = tokens[-2 - offset].replace(',', '')
                                nav = float(nav_str)
                                
                                units_str = tokens[-3 - offset].replace(',', '')
                                if units_str == '-':
                                    units = 0.0
                                else:
                                    units = float(units_str)
                                    
                                name_class = ' '.join(tokens[:-3 - offset]).strip()
                                
                                # Basic category guessing
                                category = "Money Market" if "Money Market" in name_class or "Cash" in name_class else "Equity" if "Stock" in name_class or "Equity" in name_class else "Islamic Funds"
                                
                                data["holdings"].append({
                                    "fund_name": name_class,
                                    "category": category,
                                    "units": units,
                                    "nav": nav,
                                    "market_value": val,
                                    "gain_loss": 0.0,
                                    "percent_change": 0.0
                                })
                                
                            except ValueError:
                                continue

                    if data["holdings"]:
                        data["summary"]["total_market_value"] = sum(h["market_value"] for h in data["holdings"])
                        contrib_match = re.search(r"Total Contribution Amount Since A/c Opening\s+([\d,\.]+)", full_text, re.IGNORECASE)
                        if contrib_match:
                            tot_contrib = float(contrib_match.group(1).replace(',', ''))
                            data["summary"]["total_gain_loss"] = data["summary"]["total_market_value"] - tot_contrib
                        else:
                            data["summary"]["total_gain_loss"] = 0.0

                elif bank_name.lower() == "hbl":
                    # HBL Data Row: Fund Name | Type of units | Units | NAV | Value
                    # Example: HBL IPF-DEBT SUB FUND (HBLIPF-DSF) Customized 15,508.8989 312.6248 4,848,466.00
                    hbl_row_pattern = re.compile(r"(HBL.*?)\s+(?:(Customized|Regular|Class [A-Za-z]|Growth|Income)\s+)?([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)$", re.IGNORECASE)
                    
                    for line in full_text.split('\n'):
                        match = hbl_row_pattern.search(line.strip())
                        if match:
                            fund_name = match.group(1).strip()
                            category = "Money Market" if "MONEY MARKET" in fund_name.upper() else "Debt/Income" if "DEBT" in fund_name.upper() else "Equity"
                            
                            units = float(match.group(3).replace(',', ''))
                            nav = float(match.group(4).replace(',', ''))
                            market_value = float(match.group(5).replace(',', ''))
                            
                            data["holdings"].append({
                                "fund_name": fund_name,
                                "category": category,
                                "units": units,
                                "nav": nav,
                                "market_value": market_value,
                                "gain_loss": 0.0,
                                "percent_change": 0.0
                            })

                    # Try to find total and contribution
                    total_match = re.search(r"Total Values\s+([\d,\.]+)", full_text, re.IGNORECASE)
                    if total_match:
                        data["summary"]["total_market_value"] = float(total_match.group(1).replace(',', ''))
                    elif data["holdings"]:
                        data["summary"]["total_market_value"] = sum(h["market_value"] for h in data["holdings"])
                        
                    contrib_match = re.search(r"Total Investments\s+([\d,\.]+)", full_text, re.IGNORECASE)
                    if contrib_match:
                        tot_contrib = float(contrib_match.group(1).replace(',', ''))
                        market_val = data["summary"].get("total_market_value", 0.0)
                        data["summary"]["total_gain_loss"] = market_val - tot_contrib
                    else:
                        data["summary"]["total_gain_loss"] = sum(h.get("gain_loss", 0.0) for h in data["holdings"])

                else:
                    # Meezan Data Row Regex: Fund Acronym | Type of Units | Units | NAV | Value | Gain (FYTD) | Gain (To Date)
                    meezan_row_pattern = re.compile(r"([A-Z0-9\-]+)\s+(GROWTH-[A-Z]|INCOME-[A-Z]|CASH-[A-Z]|.+?)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)")
                    
                    summary_idx = full_text.find("Balance Summary")
                    total_idx = full_text.find("Total Values", summary_idx)
                    
                    # Isolate just the holdings table to prevent parsing the transaction ledger
                    table_text = full_text[summary_idx:total_idx] if summary_idx != -1 and total_idx != -1 else full_text
                    
                    for line in table_text.split('\n'):
                        match = meezan_row_pattern.search(line)
                        if match:
                            fund_name = match.group(1).strip()
                            category = "Islamic Funds"
                            if "MGF" in fund_name: category = "Gold"
                            elif "MEF" in fund_name or "MIF" in fund_name or "KMI" in fund_name: category = "Equity"
                            elif "MCF" in fund_name or "MMP" in fund_name: category = "Money Market"
                            
                            units = float(match.group(3).replace(',', ''))
                            nav = float(match.group(4).replace(',', ''))
                            market_value = float(match.group(5).replace(',', ''))
                            gain_loss = float(match.group(7).replace(',', ''))
                            
                            data["holdings"].append({
                                "fund_name": fund_name,
                                "category": category,
                                "units": units,
                                "nav": nav,
                                "market_value": market_value,
                                "gain_loss": gain_loss,
                                "percent_change": 0.0 
                            })
                    
                    # Extract Total Values Row
                    total_match = re.search(r"Total Values\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)", full_text, re.IGNORECASE)
                    if total_match:
                        total_value = float(total_match.group(1).replace(',', ''))
                        total_gain = float(total_match.group(3).replace(',', ''))
                        data["summary"]["total_market_value"] = total_value
                        data["summary"]["total_gain_loss"] = total_gain
                    elif data["holdings"]:
                        data["summary"]["total_market_value"] = sum(h["market_value"] for h in data["holdings"])
                        data["summary"]["total_gain_loss"] = sum(h.get("gain_loss", 0.0) for h in data["holdings"])
                
        except Exception as e:
            logger.error(f"Error parsing {file_path}: {str(e)}")
            return {"error": str(e)}
            
        return data

parser = PDFParser()
