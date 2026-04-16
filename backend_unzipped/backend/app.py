from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from backend.routes import analyze, auth, documents, reminders, summarize, tasks, upload
from backend.services.reminder_service import ReminderScheduler

app = FastAPI(title="SGU")
scheduler = ReminderScheduler()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(summarize.router)
app.include_router(tasks.router)
app.include_router(analyze.router)
app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(reminders.router)

frontend_dir = Path(__file__).resolve().parent.parent / "frontend"


@app.get("/api/health")
def health():
    return {"message": "SGU Backend running"}


@app.on_event("startup")
def start_scheduler():
    scheduler.start()


@app.on_event("shutdown")
def stop_scheduler():
    scheduler.stop()


@app.get("/")
def home():
    index_file = frontend_dir / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "SGU Backend running"}


@app.get("/app.js")
def frontend_script():
    app_file = frontend_dir / "app.js"
    if app_file.exists():
        return FileResponse(app_file, media_type="application/javascript")
    return {"message": "Frontend script not found"}


@app.get("/manifest.json")
def frontend_manifest():
    manifest_file = frontend_dir / "manifest.json"
    if manifest_file.exists():
        return FileResponse(manifest_file, media_type="application/manifest+json")
    return {"message": "Manifest not found"}


@app.get("/sw.js")
def service_worker():
    worker_file = frontend_dir / "sw.js"
    if worker_file.exists():
        return FileResponse(worker_file, media_type="application/javascript")
    return {"message": "Service worker not found"}
