import time
import os
import logging
import threading
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from pathlib import Path
from ..services.pdf_parser import parser as pdf_parser
from ..services.fmr_parser import parse_fmr_pdf_with_ai
from ..database import SessionLocal
from .. import crud

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

class PDFHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
        if not event.src_path.lower().endswith('.pdf'):
            return
            
        logger.info(f"New PDF detected: {event.src_path}")
        time.sleep(1)  # small delay to ensure file is fully written to disk before reading
        self.process_file(event.src_path)

    def on_deleted(self, event):
        if event.is_directory or not event.src_path.lower().endswith('.pdf'):
            return
            
        logger.info(f"PDF deletion detected: {event.src_path}")
        db = SessionLocal()
        try:
            success = crud.delete_statement(db, event.src_path)
            if success:
                logger.info(f"Successfully deleted statement from DB corresponding to: {event.src_path}")
            else:
                logger.warning(f"No DB record found to delete for: {event.src_path}")
        finally:
            db.close()

    def process_file(self, file_path):
        db = SessionLocal()
        try:
            # Logic to extract username/bank from path
            # Path format: .../data/{username}/{bank}/{filename}
            # Or FMR format: .../data/FMRs/{filename}
            path_obj = Path(file_path)
            
            if path_obj.parent.name == "FMRs":
                logger.info(f"FMR PDF detected. Routing to AI Parser: {file_path}")
                updated_count = parse_fmr_pdf_with_ai(file_path, db)
                if updated_count > 0:
                    logger.info(f"Successfully processed FMR {file_path} via Auto-Ingestion.")
                else:
                    logger.warning(f"FMR processed but zero funds were matched/enriched: {file_path}")
                
                # Delete the FMR file after processing to prevent repeated AI processing on startup
                try:
                    os.remove(file_path)
                    logger.info(f"Deleted FMR file to prevent re-processing: {file_path}")
                except Exception as e:
                    logger.error(f"Failed to delete FMR file {file_path}: {e}")
                
                return
                
            bank = path_obj.parent.name
            username = path_obj.parent.parent.name
            
            logger.info(f"Processing for User: {username}, Bank: {bank}")
            
            user = crud.get_user_by_username(db, username=username)
            if not user:
                logger.error(f"User {username} not found in database. Skipping {file_path}")
                return
                
            # Call the parser logic
            data = pdf_parser.parse_statement(file_path, bank)
            if "error" in data:
                logger.error(f"Failed to parse {file_path}: {data['error']}")
                return
                
            # Save to DB
            result = crud.save_statement(db, user_id=user.id, parsed_data=data, file_path=file_path)
            
            if result.get("status") == "success":
                logger.info(f"Successfully processed and saved {file_path}. Statement ID: {result.get('statement_id')}")
            else:
                logger.info(f"Skipped {file_path}: {result.get('message')}")
            
        except Exception as e:
            logger.error(f"Error processing {file_path}: {e}")
        finally:
            db.close()

class Watcher:
    def __init__(self, directory_to_watch):
        self.DIRECTORY_TO_WATCH = directory_to_watch
        self.observer = Observer()

    def run(self):
        event_handler = PDFHandler()
        self.observer.schedule(event_handler, self.DIRECTORY_TO_WATCH, recursive=True)
        self.observer.start()
        print(f"Watcher started on {self.DIRECTORY_TO_WATCH}")
        try:
            while True:
                time.sleep(5)
        except:
            self.observer.stop()
            print("Watcher stopped")

    def scan_existing_files(self):
        """Recursively scans for existing PDFs and processes them."""
        print(f"Scanning for existing PDFs in {self.DIRECTORY_TO_WATCH}...")
        event_handler = PDFHandler()
        
        for root, dirs, files in os.walk(self.DIRECTORY_TO_WATCH):
            for file in files:
                if file.lower().endswith('.pdf'):
                    full_path = os.path.join(root, file)
                    print(f"Found existing PDF: {full_path}")
                    event_handler.process_file(full_path)

    def start_background(self):
        """Starts the observer in a non-blocking way (for FastAPI startup)"""
        if not os.path.exists(self.DIRECTORY_TO_WATCH):
            os.makedirs(self.DIRECTORY_TO_WATCH, exist_ok=True)
            
        # Scan existing files first in a background thread so it doesn't block server startup
        threading.Thread(target=self.scan_existing_files, daemon=True).start()
        
        event_handler = PDFHandler()
        self.observer.schedule(event_handler, self.DIRECTORY_TO_WATCH, recursive=True)
        self.observer.start()
        print(f"Background Watcher started on {self.DIRECTORY_TO_WATCH}")

    def stop(self):
        self.observer.stop()
        self.observer.join()
