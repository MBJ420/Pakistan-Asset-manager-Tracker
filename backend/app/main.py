from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import auth, users, dashboard, performance
from .database import engine, Base
from apscheduler.schedulers.background import BackgroundScheduler
from .services.watcher import Watcher
from .services.scraper import scrape_mufap_data
import logging
import os

logger = logging.getLogger(__name__)

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Fund Tracker API")

# Initialize Watcher and Scheduler
data_directory = os.path.expanduser("~/data")
watcher = Watcher(data_directory)
scheduler = BackgroundScheduler()

# Add the daily MUFAP scraping job to run every day at 18:00 (6:00 PM)
# Adjust hour and minute as necessary depending on server timezone vs PKT
scheduler.add_job(
    scrape_mufap_data, 
    'cron', 
    hour=18, 
    minute=0, 
    id='daily_mufap_scrape', 
    replace_existing=True
)

# Configure CORS
origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://localhost:8001",
    "http://localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(dashboard.router)
app.include_router(performance.router)

@app.on_event("startup")
async def startup_event():
    logger.info("Starting background services...")
    watcher.start_background()
    scheduler.start()
    logger.info("Background services started.")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Stopping background services...")
    watcher.stop()
    scheduler.shutdown()
    logger.info("Background services stopped.")

@app.get("/")
def read_root():
    return {"message": "Welcome to Fund Tracker API"}
