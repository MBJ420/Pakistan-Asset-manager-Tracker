# Fund Tracker - Project Knowledge Handover

This document compresses the entire architectural knowledge and core logic of the "Fund Tracker" project into a single reference context.

## Application Overview
Fund Tracker is a monolithic-style web application featuring a Python **FastAPI** backend and a **React/Electron** frontend. It automatically ingests user bank statements and Fund Manager Reports (FMRs) to track mutual fund investments, historically scrape daily Net Asset Values (NAVs), calculate gains/losses, and categorize funds by risk and asset allocation using AI.

## Technical Stack
- **Backend:** FastAPI, SQLAlchemy, SQLite ([fundtracker.db](file:///c:/Users/Jameel%20Akhtar/VsCode/Fund%20Tracker/backend/fundtracker.db)), Watchdog (Auto-ingestion), Playwright / BeautifulSoup4 (Scraping), Google Gemini API (AI FMR Parsing).
- **Frontend:** React, TypeScript, Tailwind CSS, Vite, Electron (Desktop wrapper).

## Core Backend Services (`backend/app/services/`)

### 1. Auto-Ingestion Watcher (`watcher.py`)
- Runs as a **Daemon Thread** on FastAPI startup to avoid blocking the main server thread.
- Recursively monitors the `C:/Users/Jameel Akhtar/data/` directory.
- **Routing Logic:** 
  - If a PDF is dropped in `/data/FMRs/`, it routes to the AI FMR Parser (`fmr_parser.py`) and is **auto-deleted** upon successful parsing to prevent startup loops.
  - If a PDF is dropped in a user folder (e.g., `/data/jameel/meezan/`), it processes it as a personal bank statement (`pdf_parser.py`) and extracts transactional balances.

### 2. Daily Data Scraper (`scraper.py`)
- Runs on a background scheduler (`apscheduler`) daily at 18:00.
- Connects headless to `mufap.com.pk` using **Playwright**.
- Scrapes the main mutual fund DataTable for standard 1D, MTD, 6M, 1Y, and YTD performance returns.
- **VPS/Pension Exception:** MUFAP hides Voluntary Pension Schemes (VPS). The scraper has a custom routine to silently visit `/WebPost/WebPostById?title=VoluntryPansionFund(VPS)`, extract the non-tabular cards, and fuzzy-match the NAV prices to specific Pension sub-funds (e.g., `MTPF - Equity sub Fund`).

### 3. FMR AI Parser (`fmr_parser.py`)
- Leverages **Gemini 2.5 Flash API** to parse dense structural PDFs visually.
- Extracts: `fund_name`, `short_name`, `risk_profile`, `asset_allocation`, `fund_type`, and fallback historical returns (`return_1m`, `return_6m`, `return_1y`, `return_ytd`).
- **Fuzzy-Matcher:** Features an aggressive `normalize_name()` regex that strips dashes, spaces, and words like *"sub fund"*, *"plan"*, *"index"*, and *"tracker"* to prevent AI from accidentally generating duplicate/phantom funds when matching the parsed FMR output against the official SQLite Database strings.

## Detailed Database Guide (`backend/app/models.py`)
All persistent data is stored locally in the SQLite database file `backend/fundtracker.db`. The database schema is defined using SQLAlchemy ORM in `backend/app/models.py`.

### 1. `users` Table
- **What it stores:** User credentials (`username`, `password_hash`) and creation timestamps.
- **When it's called:** Queried during login (`routers/auth.py`), and when fetching user-specific dashboard metrics (`routers/dashboard.py`).
- **When it's changed:** Inserted upon user registration.

### 2. `banks` Table
- **What it stores:** A master lookup list of asset management companies (e.g., "Meezan", "HBL", "Atlas", "Faysal").
- **When it's called:** Used as a reference point when filtering funds by AMC on the frontend, and to organize portfolios.
- **When it's changed:** Populated during initial auto-seeding. New banks are automatically and dynamically created by the AI parser (`fmr_parser.py`) if an unknown AMC name is discovered in a new FMR.

### 3. `funds` Table (The Core Asset Directory)
- **What it stores:** Represents a unique mutual fund or pension sub-fund.
  - *Static Data:* `name`, `short_name`, `category`, and a foreign key to its `bank`.
  - *AI-Enriched FMR Metadata:* `risk_profile` (Low/High), `asset_allocation` (e.g., "80% Equity"), `fund_type` (Equity, Money Market, etc.).
  - *FMR Fallback Returns:* `fmr_return_1m`, `fmr_return_6m`, `fmr_return_1y`, `fmr_return_ytd` (stored securely as floats).
- **When it's called:** Extremely heavily queried. Fetched when rendering the "Fund Performance" table (`routers/performance.py`), when grouping user investments on the dashboard, and repeatedly during AI/Scraper fuzzy-matching to identify which fund to link incoming data to.
- **When it's changed:** 
  - **Inserted:** New funds are auto-discovered and inserted by `fmr_parser.py` if Gemini reads an FMR containing a fund not currently in the database.
  - **Updated:** The AI-Enriched metadata (`risk_profile`, `fmr_return_*`) is forcefully overwritten every single time a new FMR is dropped in the folder, ensuring data is always fresh.

### 4. `portfolios` Table
- **What it stores:** A user's actual investment into a specific bank (links a `User` to a `Bank` and stores `portfolio_number`).
- **When it's called:** Used to organize the user's dashboard and group their imported PDF bank statements.
- **When it's changed:** Inserted when a new personal bank statement is successfully parsed by `pdf_parser.py` via the auto-ingestion watcher.

### 5. `FundNAVHistory` Table
- **What it stores:** The daily Net Asset Value (NAV) price for a fund. Includes `fund_id`, `date`, `nav_price`, and pre-calculated `daily_change` / `daily_percentage`.
- **When it's called:** Used to draw the historical line charts on the dashboard API and to calculate the user's 1-day portfolio gains.
- **When it's changed:** Appended to **daily at 18:00 PKT** by the background `scraper.py` script which fetches the latest prices from MUFAP.

### 6. `FundPerformanceMetrics` Table
- **What it stores:** Cached benchmark returns for a fund from MUFAP: `return_1m`, `return_6m`, `return_1y`, and `return_ytd`.
- **When it's called:** Rendered directly onto the "Fund Performance" UI tables to show short and long-term yield.
- **When it's changed:** Overwritten/Updated **daily** by `scraper.py` via MUFAP scraping. *Note: If this table shows 0% for a specific metric (due to MUFAP hiding Pension data), the `routers/performance.py` API safely ignores this table and queries the `funds` table for the AI FMR fallbacks instead.*

## Frontend Features (`frontend/src/`)
- **Dashboard (`Dashboard.tsx`):**
  - High-level charts rendering personal portfolio valuation.
  - Dynamic "Fund Performance" UI Table containing all bank mutual funds.
  - **Filters:** Incorporates real-time dropdown filtering by "Category" (Equity, Income, etc.) and "Risk Profile" (Low, High) driven directly by the AI FMR parser.
- **Asset Allocation UI:** Includes dropdown rows that gracefully expand to show the full AI-extracted "60% Stocks, 20% Cash..." strings.

## Recent Fixes & Critical Rules
1. **Never Block Startup:** The directory watcher must always run via `threading.Thread(..., daemon=True)` so FastAPI doesn't freeze the client with "Network Errors".
2. **Pension Fallbacks:** MUFAP does not post 6M/1Y returns for Pension sub-funds. The API (`routers/performance.py`) must seamlessly substitute `latest_metrics.return_1m` with `fund.fmr_return_1m` whenever MUFAP returns exactly `0.0%`.
3. **FMR Deletion:** Read FMRs are permanently `os.remove()`'d after upload to save API quotas and DB integrity.
