# MediMind — AI-Powered Medical Triage System

<div align="center">

![MediMind Banner](https://img.shields.io/badge/MediMind-AI%20Medical%20Triage-00b896?style=for-the-badge&logo=heart&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![NVIDIA NIM](https://img.shields.io/badge/NVIDIA%20NIM-LLM%20Inference-76B900?style=for-the-badge&logo=nvidia&logoColor=white)
![ChromaDB](https://img.shields.io/badge/ChromaDB-RAG%20Pipeline-FF6B35?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

**A full-stack AI health triage system that extracts symptoms, retrieves medical knowledge via RAG, classifies urgency, finds nearby hospitals, and generates professional PDF reports — all powered by free NVIDIA NIM cloud inference.**

[Live Demo](#) · [Report Bug](https://github.com/abdul-rafay19/MediMind/issues) · [Request Feature](https://github.com/abdul-rafay19/MediMind/issues)

</div>

---

## What is MediMind?

MediMind is a production-grade AI medical triage assistant built entirely with free, open-source tools. A patient describes their symptoms in plain English — MediMind runs them through a 3-stage AI pipeline, classifies urgency as Emergency / Urgent / Self-Care, provides personalized health advice, finds the nearest hospitals using real geolocation, and generates a professional PDF medical brief to bring to a doctor.

> **Disclaimer:** MediMind is an informational tool only. It does not diagnose, prescribe, or replace professional medical advice.

---

## Screenshots

| Home Page | Triage Result | PDF Report |
|-----------|---------------|------------|
| Hero with AI pipeline overview | Emergency / Urgent / Self-Care banner with confidence score | Professional medical brief with symptoms table |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     MediMind System                         │
├──────────────────┬──────────────────────────────────────────┤
│   Frontend       │   Backend (FastAPI)                      │
│                  │                                          │
│  HTML/CSS/JS     │  ┌─────────────────────────────────┐    │
│  3 pages         │  │     3-Stage AI Pipeline          │    │
│  Modular files   │  │                                  │    │
│  Geolocation API │  │  Stage 1: Symptom Extraction     │    │
│  OpenStreetMap   │  │  Stage 2: RAG Retrieval          │    │
│                  │  │  Stage 3: Triage Classification  │    │
│                  │  └─────────────────────────────────┘    │
│                  │                                          │
│                  │  ┌──────────┐  ┌──────────────────────┐ │
│                  │  │ChromaDB  │  │  NVIDIA NIM API       │ │
│                  │  │RAG Store │  │  meta/llama-3.1-8b    │ │
│                  │  └──────────┘  └──────────────────────┘ │
│                  │                                          │
│                  │  ┌──────────┐  ┌──────────────────────┐ │
│                  │  │ SQLite   │  │  fpdf2 PDF Generator  │ │
│                  │  │ Database │  │                        │ │
│                  │  └──────────┘  └──────────────────────┘ │
└──────────────────┴──────────────────────────────────────────┘
```

---

## Key Features

- **3-Stage AI Pipeline** — Symptom extraction, RAG knowledge retrieval, and triage classification run as a single optimized LLM call for speed
- **RAG Medical Knowledge Base** — ChromaDB vector store with semantic search over curated medical content, grounded with real source links (WHO, NHS, Mayo Clinic, MedlinePlus)
- **NVIDIA NIM Inference** — Free cloud inference on H100/A100 GPUs via `build.nvidia.com` — 3–8 second responses
- **Live Nearest Hospitals** — Browser geolocation + OpenStreetMap Overpass API finds real nearby hospitals and clinics with one-click Google Maps directions
- **Personalized Health Advice** — Symptom-specific home care tips generated alongside every triage result
- **PDF Medical Brief** — Professional downloadable report to share with a doctor, including symptoms table, red flags, AI narrative, and follow-up Q&A
- **Follow-up Chat** — Session-aware Q&A after every triage result
- **JWT Authentication** — Secure registration, login, and per-user session history
- **Full Session History** — Every triage stored and retrievable per user account

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend Framework** | FastAPI (Python 3.10) |
| **Database** | SQLite + SQLAlchemy (async) |
| **LLM Provider** | NVIDIA NIM — `meta/llama-3.1-8b-instruct` |
| **Vector Store** | ChromaDB |
| **Embeddings** | `sentence-transformers/all-MiniLM-L6-v2` |
| **PDF Generation** | fpdf2 |
| **Authentication** | JWT (python-jose) + bcrypt (passlib) |
| **HTTP Client** | httpx (async) |
| **Frontend** | Vanilla HTML/CSS/JS — no framework needed |
| **Geolocation** | Browser Geolocation API + OpenStreetMap Overpass |
| **Fonts** | Instrument Serif + Cabinet Grotesk (Google Fonts) |

---

## Project Structure

```
medimind/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app, startup, CORS
│   │   ├── api/
│   │   │   ├── auth.py              # Register, Login, Me endpoints
│   │   │   ├── triage.py            # Core triage pipeline endpoints
│   │   │   ├── history.py           # Session history CRUD
│   │   │   ├── reports.py           # PDF generation endpoint
│   │   │   └── health.py            # Health check + LLM status
│   │   ├── core/
│   │   │   ├── config.py            # All settings via pydantic-settings
│   │   │   ├── database.py          # Async SQLAlchemy setup
│   │   │   └── security.py          # JWT + bcrypt helpers
│   │   ├── models/
│   │   │   ├── user.py              # User ORM model
│   │   │   ├── session.py           # TriageSession ORM model
│   │   │   └── schemas.py           # Pydantic request/response schemas
│   │   └── services/
│   │       ├── llm_service.py       # NVIDIA NIM LLM calls + fallback chain
│   │       ├── rag_service.py       # ChromaDB RAG retrieval
│   │       └── report_service.py    # PDF report builder (fpdf2)
│   ├── data/
│   │   └── knowledge_base/          # Medical JSON knowledge files
│   ├── .env.example                 # Environment template
│   └── requirements.txt
└── frontend/
    ├── index.html                   # Main HTML — all 3 pages
    ├── css/
    │   ├── base.css                 # Design tokens, reset, animations
    │   ├── layout.css               # Nav, buttons, modal, toast
    │   ├── home.css                 # Hero, features strip
    │   ├── triage.css               # Triage form, results, hospitals, chat
    │   └── history.css              # History list
    └── js/
        ├── app.js                   # Routing, auth, history (loads first)
        └── triage.js                # Triage logic, advice, hospitals, PDF
```

---

## Getting Started

### Prerequisites

- Python 3.10+
- A free NVIDIA NIM API key from [build.nvidia.com](https://build.nvidia.com)

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/MediMind.git
cd MediMind
```

### 2. Set up the backend

```bash
cd medimind/backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate
# Activate (Mac/Linux)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure environment

```bash
# Copy the example file
cp .env.example .env
```

Open `.env` and add your NVIDIA API key:

```env
OPENROUTER_API_KEY=nvapi-YOUR-KEY-HERE
OPENROUTER_BASE_URL=https://integrate.api.nvidia.com/v1
LLM_PRIMARY_MODEL=meta/llama-3.1-8b-instruct
```

Get your free key at [build.nvidia.com](https://build.nvidia.com) → click any model → **Get API Key**.

### 4. Start the backend

```bash
uvicorn app.main:app --reload --port 8000
```

You should see:
```
INFO: MediMind starting up...
INFO: RAG ready — 10 chunks indexed
INFO: MediMind ready!
INFO: Uvicorn running on http://127.0.0.1:8000
```

### 5. Start the frontend

```bash
cd ../frontend
python -m http.server 3000
```

Open **http://localhost:3000** in your browser.

### 6. Verify everything

Visit **http://127.0.0.1:8000/api/health** — you should see:

```json
{
  "status": "operational",
  "llm": { "status": "connected", "primary_model": "meta/llama-3.1-8b-instruct" },
  "rag": { "status": "ready", "chunks_indexed": 10 }
}
```

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | No | Create new account |
| `POST` | `/api/auth/login` | No | Login, get JWT token |
| `GET`  | `/api/auth/me` | Yes | Get current user |
| `POST` | `/api/triage/analyze` | Yes | Full triage (authenticated) |
| `POST` | `/api/triage/guest-analyze` | No | Triage without account |
| `POST` | `/api/triage/followup` | Yes | Follow-up question on session |
| `GET`  | `/api/history/` | Yes | List all user sessions |
| `GET`  | `/api/history/{id}` | Yes | Get single session detail |
| `POST` | `/api/reports/generate` | Yes | Generate PDF report |
| `GET`  | `/api/health` | No | Health check + LLM status |

Full interactive docs: **http://127.0.0.1:8000/docs**

---

## How the AI Pipeline Works

```
User describes symptoms
        │
        ▼
┌───────────────────────┐
│  RAG Retrieval        │  Semantic search over medical knowledge base
│  (ChromaDB)           │  Returns top 5 relevant medical chunks
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│  Single LLM Call      │  Sends symptoms + RAG context to NVIDIA NIM
│  (NVIDIA NIM)         │  Extracts structured symptoms AND classifies
│                       │  triage in one combined prompt
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│  Structured Result    │  EMERGENCY / URGENT / SELF_CARE
│                       │  + Symptoms, Red Flags, Actions, Warnings
│                       │  + Confidence Score, Reasoning
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│  Nearest Hospitals    │  Browser GPS → OpenStreetMap Overpass API
│  (Geolocation)        │  Real hospitals sorted by distance
└───────────────────────┘
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SECRET_KEY` | JWT signing secret | Any long random string |
| `DATABASE_URL` | SQLAlchemy DB URL | `sqlite+aiosqlite:///./medimind.db` |
| `OPENROUTER_API_KEY` | NVIDIA NIM API key | `nvapi-xxxxxxxxxxxx` |
| `OPENROUTER_BASE_URL` | LLM API base URL | `https://integrate.api.nvidia.com/v1` |
| `LLM_PRIMARY_MODEL` | Primary model name | `meta/llama-3.1-8b-instruct` |
| `LLM_SECONDARY_MODEL` | Fallback model | `mistralai/mistral-7b-instruct-v0.3` |
| `LLM_FALLBACK_MODEL` | Last resort model | `microsoft/phi-3-mini-4k-instruct` |
| `EMBEDDING_MODEL` | Sentence transformer | `all-MiniLM-L6-v2` |
| `CHROMA_PERSIST_DIR` | ChromaDB storage path | `./data/chroma_db` |

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

Distributed under the MIT License. See `LICENSE` for more information.

---

## Author

**Abdul Rafay**
- LinkedIn: [linkedin.com/in/AbdulRafay](https://linkedin.com/in/abdul-rafay19)
- GitHub: [github.com/AbdulRafay](https://github.com/YOUR_USERNAME)

---

<div align="center">
Built with FastAPI · ChromaDB · NVIDIA NIM · fpdf2 · Vanilla JS
</div>
