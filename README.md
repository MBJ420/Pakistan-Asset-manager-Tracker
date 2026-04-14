# Fund Tracker
   
## Application Overview
Fund Tracker is a monolithic-style web application featuring a Python **FastAPI** backend and a **React/Electron** frontend. It automatically ingests user bank statements and Fund Manager Reports (FMRs) from a local directory to track mutual fund investments, scrape daily Net Asset Values (NAVs) from MUFAP, calculate gains/losses, and categorize funds by risk and asset allocation using AI (Google Gemini 2.5 Flash API). 


## Technical Stack & Libraries Used
- **Backend Framework:** FastAPI, Uvicorn, SQLAlchemy (for ORM), Pydantic.
- **Backend Database:** SQLite (`fundtracker.db`).
- **Data Collection & Scraping:** Playwright, BeautifulSoup4, pandas.
- **PDF & AI Processing:** pdfplumber, Google Generative AI (Gemini).
- **Background Tasks:** APScheduler, Watchdog (for background auto-ingestion).
- **Frontend Framework:** React 19, Vite, Electron (for Desktop functionality).
- **Frontend Styling:** Tailwind CSS, Framer Motion, Lucide React.
- **Frontend Interactivity:** ApexCharts / react-apexcharts for rich historical charting.
- **Tooling:** Python 3, Node.js, npm, Axios.

## General Workflow
The application runs as a local offline-first solution that wraps an interactive React dashboard within an Electron window:
1. **Auto-Ingestion:** A background daemon thread monitors a specified local data directory (e.g., `C:/Users/username/data/`). Any PDF dropped into the sub-folders is automatically processed and sorted:
   - FMR drops trigger the Gemini AI parser to scrape and seed static fund metrics (e.g., Risk Profile, Allocations).
   - Personal statement drops trigger an ingestion into the user's specific portfolio.
2. **Daily Data Scraping:** A daily background job via APScheduler accesses MUFAP utilizing Playwright. It pulls historical NAVs and standard performance returns (1D, MTD, YTD) directly into the SQLite database.
3. **Analytics UI:** A modern, clean frontend displays grouped portfolios, dynamic "Fund Performance" tables, and interactive area charts for trajectories. 

## How To Execute

### Prerequisites
1. **Python 3.x+** installed and added to PATH.
2. **Node.js** and **npm** installed.
3. A **Google Gemini API Key** for processing PDF files intelligently.

### Setup Instructions
1. **Clone the repository:**
   ```bash
   git clone <your-github-repo-url>
   cd "Fund Tracker"
   ```
2. **Setup the Backend Engine:**
   - Navigate into the `backend/` directory.
   - Create and activate a Python virtual environment:
     ```bash
     cd backend
     python -m venv venv
     venv\Scripts\activate  # On Windows
     # source venv/bin/activate on Mac/Linux
     ```
   - Install required dependencies:
     ```bash
     pip install -r requirements.txt
     ```
   - Make sure you place a `.env` file within the `backend/` folder listing essential environment variables (e.g., `GEMINI_API_KEY=your_key_here`).
3. **Setup the Frontend App:**
   - Open a new terminal and navigate to the `frontend/` directory.
   - Install NodeJS dependencies:
     ```bash
     cd frontend
     npm install
     ```

### Running the App
The project includes a `start_app.bat` script on Windows to bootstrap everything together automatically. Run it via command prompt or simply double-click:
```bash
start_app.bat
```
*(This triggers the backend Python server on `http://localhost:8001` and concurrently launches the React app locally inside an Electron window).*

If running manually:
- **Terminal 1 (Backend):** `cd backend && venv\Scripts\activate && uvicorn app.main:app --reload --port 8001`
- **Terminal 2 (Frontend):** `cd frontend && npm run electron:dev`


