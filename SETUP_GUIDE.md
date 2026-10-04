# 🚀 MediMind — Complete Setup Guide (Ollama / Free Edition)

> **No API keys. No credit card. 100% free and offline.**

---

## Step 1: Install Ollama (Local AI)

**Windows:**
1. Go to https://ollama.com/download
2. Download and run the installer
3. Ollama will start automatically in the background

**Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Mac:**
Download from https://ollama.com/download/mac

---

## Step 2: Pull AI Models

Open a terminal and run these commands:

```bash
# Primary model (best quality, ~4GB) — REQUIRED
ollama pull mistral

# Fallback models (optional but recommended)
ollama pull llama3.2
ollama pull phi3
```

**Verify Ollama is working:**
```bash
ollama list                    # shows downloaded models
ollama run mistral "Hello!"    # test the model
```

> ⚡ **Speed tip:** Mistral is the best choice. First run downloads the model (~4GB).
> After that it's cached and loads in seconds.

---

## Step 3: Set Up Backend

Open a terminal in the `medimind/backend` folder:

```bash
# Navigate to backend
cd medimind/backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

> ⚠️ **Note:** Installing `sentence-transformers` downloads a ~90MB embedding model
> on first run. This is normal — it's needed for the RAG system.

---

## Step 4: Configure Environment

The `.env` file is already configured for Ollama. No changes needed!

```bash
# .env is already set up correctly:
# OPENROUTER_BASE_URL=http://localhost:11434/v1
# LLM_PRIMARY_MODEL=mistral
```

---

## Step 5: Start the Backend

```bash
# Make sure you're in medimind/backend with venv activated
uvicorn app.main:app --reload --port 8000
```

You should see:
```
INFO:     MediMind starting up...
INFO:     ✅ RAG ready — 50 chunks indexed
INFO:     ✅ MediMind ready!
INFO:     Uvicorn running on http://0.0.0.0:8000
```

---

## Step 6: Open the Frontend

```bash
# Option 1: Python server (simplest)
cd medimind/frontend
python -m http.server 3000

# Option 2: Direct (double-click the file)
# Just open medimind/frontend/index.html in your browser
```

Visit: **http://localhost:3000**

---

## Step 7: Verify Everything Works

Visit: **http://localhost:8000/api/health**

You should see:
```json
{
  "status": "operational",
  "ollama": {
    "status": "connected",
    "models_available": ["mistral:latest"]
  },
  "rag": {
    "status": "ready",
    "chunks_indexed": 50
  }
}
```

---

## Common Problems & Fixes

### ❌ "Cannot connect to Ollama"
```bash
# Start Ollama manually:
ollama serve
```

### ❌ "Model not found: mistral"
```bash
# Pull the model:
ollama pull mistral
```

### ❌ "ModuleNotFoundError: No module named 'passlib'"
```bash
# Reinstall dependencies:
pip install -r requirements.txt
```

### ❌ "argon2 not found" error
This is fixed in the new code — it now uses bcrypt instead of argon2.

### ❌ Response is very slow
- First response is slow because Ollama loads the model into RAM
- Subsequent responses are much faster (~5-15 seconds)
- If you have <8GB RAM, use `phi3` (smallest model):
  - Edit `.env`: `LLM_PRIMARY_MODEL=phi3`

### ❌ ChromaDB error on startup
```bash
# Delete and rebuild the vector store:
rm -rf data/chroma_db
# Restart the backend — it will rebuild automatically
```

---

## API Documentation

Once running, visit: **http://localhost:8000/docs**

This gives you an interactive UI to test all API endpoints.

---

## Test with curl

```bash
# 1. Register
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","full_name":"Test User","password":"pass123"}'

# 2. Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"pass123"}'

# 3. Guest triage (no login needed)
curl -X POST http://localhost:8000/api/triage/guest-analyze \
  -H "Content-Type: application/json" \
  -d '{"symptoms":"I have a severe headache and fever for 2 days","age":25,"language":"en"}'
```

---

## Project Structure

```
medimind/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry
│   │   ├── api/
│   │   │   ├── auth.py          # Register/Login/Me
│   │   │   ├── triage.py        # AI triage pipeline
│   │   │   ├── history.py       # Session history
│   │   │   ├── reports.py       # PDF generation
│   │   │   └── health.py        # Health check
│   │   ├── core/
│   │   │   ├── config.py        # All settings
│   │   │   ├── database.py      # SQLite/SQLAlchemy
│   │   │   └── security.py      # JWT + bcrypt
│   │   ├── models/
│   │   │   ├── user.py          # User table
│   │   │   ├── session.py       # TriageSession table
│   │   │   └── schemas.py       # Pydantic schemas
│   │   └── services/
│   │       ├── llm_service.py   # Ollama AI calls
│   │       ├── rag_service.py   # ChromaDB RAG
│   │       └── report_service.py # PDF with fpdf2
│   ├── data/
│   │   └── knowledge_base/      # Medical JSON data
│   ├── .env                     # Your config (gitignored)
│   ├── .env.example             # Template
│   └── requirements.txt
└── frontend/
    └── index.html               # Complete single-file UI
```
