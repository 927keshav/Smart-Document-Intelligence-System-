# SGU - Smart Document Intelligence Workspace

SGU is a document analysis project built around a FastAPI backend and two frontend variants:

- a React + Vite frontend in `src/`
- a static frontend served directly by the backend in `backend_unzipped/frontend/`

The app is designed to take uploaded files, extract readable text, generate summaries, identify task items, detect or suggest deadlines, and surface reminders through dashboards, notifications, and email.

## What the project does

- Upload `PDF`, `DOCX`, `TXT`, image, and audio files
- Extract text from documents
- Transcribe audio using Whisper when available
- Generate summaries from long content
- Extract task/action items from text
- Detect deadlines from natural language
- Assign task priority levels
- Store analyzed documents per user
- Send immediate and scheduled email deadline reminders
- Support manual auth plus optional Google sign-in
- Show task deadlines in dashboard and calendar-style views

## Project structure

```text
.
|-- src/                         # React + Vite frontend
|-- app.js                       # Standalone browser frontend script
|-- backend_unzipped/
|   |-- backend/
|   |   |-- app.py               # FastAPI entry point
|   |   |-- routes/              # API routes
|   |   |-- services/            # Extraction, summary, auth, reminders, email
|   |   |-- models/              # Pydantic models
|   |   |-- agents/              # Agent-style task processing helpers
|   |   |-- data/                # JSON file storage
|   |-- frontend/                # Static frontend served by FastAPI
|-- package.json
|-- vite.config.js
```

## Main features

### 1. Document and audio ingestion

The backend accepts uploads through `/upload/` and `/analyze/`.

- `PDF` extraction uses `pdfplumber`
- `DOCX` extraction uses `python-docx`
- `TXT` files are decoded directly
- image files can be OCR-processed with Tesseract
- audio files can be transcribed with `faster-whisper`

Supported image extensions in the backend include:

- `.png`
- `.jpg`
- `.jpeg`
- `.bmp`
- `.gif`
- `.tiff`
- `.tif`
- `.webp`

Supported audio extensions in the backend include:

- `.mp3`
- `.wav`
- `.m4a`
- `.ogg`
- `.webm`
- `.mpeg`

### 2. Summarization

The summarization service tries to use Hugging Face transformers with:

- `sshleifer/distilbart-cnn-12-6`

If transformers are unavailable, it falls back to a simple sentence-based summary strategy.

### 3. Task extraction and deadline detection

The task extraction pipeline:

- splits content into sentences
- looks for action-oriented phrases
- detects inline deadlines
- parses relative and absolute date expressions
- assigns a priority label

If a file is audio and no explicit tasks are detected, the app can synthesize fallback tasks from transcript content.

### 4. Authentication

The backend includes:

- email/password registration
- email/password login
- session-token authentication
- optional Google sign-in

### 5. Reminder workflow

The reminder system:

- registers tasks with deadlines
- stores reminder metadata in local JSON files
- can send summary emails
- can send immediate deadline alert emails
- can send close-deadline reminder emails
- runs a scheduler on backend startup

### 6. Frontend experiences

There are two frontend implementations in this repo:

#### React frontend

Located in `src/`, this version provides:

- landing page
- dashboard
- upload area
- extracted text preview
- summary panel
- task list

#### Static backend-served frontend

Located in `backend_unzipped/frontend/`, this version is more feature-rich and includes:

- authentication UI
- Google sign-in support
- voice recording flow
- live camera capture for OCR
- speech recognition transcript assistance
- deadline reminders
- browser notifications
- calendar view
- service worker / PWA-style setup

## Backend API overview

Core routes discovered in the project:

- `GET /api/health`
- `POST /upload/`
- `POST /summarize/`
- `POST /tasks/`
- `POST /analyze/`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/google`
- `GET /auth/config`
- `GET /auth/me`
- `POST /auth/logout`
- `GET /documents/`
- `DELETE /documents/`
- `PATCH /documents/tasks/{task_id}/complete`
- `GET /reminders/`
- `POST /reminders/register`
- `POST /reminders/run`
- `POST /reminders/test-email`
- `DELETE /reminders/`
- `POST /context/add/`
- `POST /context/search/`
- `POST /agent/process/`

## Tech stack

### Frontend

- React 18
- Vite
- Axios
- plain JavaScript frontend for the backend-served app

### Backend

- FastAPI
- Uvicorn
- Pydantic
- `python-multipart`
- `pdfplumber`
- `python-docx`
- `dateparser`
- `faster-whisper`
- `pytesseract`
- `Pillow`
- Google auth libraries

### ML / NLP helpers used in code

The code also attempts to use:

- `transformers`
- `spacy`

These are referenced in services even though they are not currently listed in `backend_unzipped/requirements.txt`.

## Local setup

### 1. Frontend setup for the React app

From the project root:

```bash
npm install
npm run dev
```

The React frontend lives in `src/`.

### 2. Backend setup

From the project root:

```bash
cd backend_unzipped
python -m venv .venv
```

Activate the virtual environment:

```bash
# Windows PowerShell
.venv\Scripts\Activate.ps1
```

Install backend dependencies:

```bash
pip install -r requirements.txt
```

Start the API:

```bash
uvicorn backend.app:app --reload
```

By default this runs on:

```text
http://127.0.0.1:8000
```

## Environment variables

The backend reads values from `.env` files if present.

Useful variables from the current code:

```env
GOOGLE_CLIENT_ID=
TESSERACT_CMD=

SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_USE_TLS=true

REMINDER_EMAIL_FROM=
REMINDER_EMAIL_TO=
REMINDER_CHECK_INTERVAL_SECONDS=300
REMINDER_SAME_DAY_HOUR=9
```

### Notes

- `SMTP_PASSWORD` is normalized to remove spaces
- `TESSERACT_CMD` can be used to point Python OCR to a custom `tesseract.exe` path
- Google login is enabled only when `GOOGLE_CLIENT_ID` is set
- email alerts require SMTP configuration

### OCR notes

- image OCR uses Tesseract locally
- printed text works much better than messy natural handwriting
- the backend tries multiple preprocessing and OCR passes for camera images
- handwriting performs best with dark ink, bright light, minimal shadows, and a tight crop

## Data storage

This project currently uses file-based JSON storage under:

- `backend_unzipped/backend/data/users.json`
- `backend_unzipped/backend/data/sessions.json`
- `backend_unzipped/backend/data/documents.json`
- `backend_unzipped/backend/data/reminders.json`

This makes the project simple to run locally, but it is not production-grade persistence.

## Typical flow

1. User signs in or registers
2. User uploads a document or audio file
3. Backend extracts or transcribes text
4. Backend generates a summary
5. Backend extracts tasks and deadlines
6. Tasks are stored in JSON-backed document storage
7. Reminder emails may be sent if SMTP is configured
8. Deadlines appear in the dashboard and calendar views

## Known implementation notes

- The repo contains both a React frontend and a separate static frontend
- The static backend-served frontend is currently the fuller product surface
- `transformers` and `spacy` are used in code but missing from `requirements.txt`
- Some features degrade gracefully if optional ML libraries are not installed
- CORS is currently open to all origins in the FastAPI app
- Persistence is JSON-file based rather than database-backed

## Suggested future improvements

- add a complete root-level backend/frontend run guide with ports and proxy setup
- move JSON storage to a real database
- add tests for extraction, auth, and reminder flows
- add a pinned dependency list for optional NLP packages
- document deployment for both frontend variants
- unify the two frontend implementations into one primary app

## Authors / team

This README documents the current implementation present in the repository.
