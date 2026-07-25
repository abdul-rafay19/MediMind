from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    APP_NAME: str = "MediMind"
    DEBUG:    bool = False
    SECRET_KEY: str = "medimind-super-secret-key-change-this"
    ALGORITHM:  str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # SQLite — only used for users table (auth)
    DATABASE_URL: str = "sqlite+aiosqlite:///./medimind.db"

    # ── Firebase ───────────────────────────────────────────────
    # Path to your downloaded serviceAccountKey.json file
    FIREBASE_CREDENTIALS_PATH: str = "./serviceAccountKey.json"
    # Optional: paste the full serviceAccountKey.json contents as one env var.
    # If set, this takes priority over FIREBASE_CREDENTIALS_PATH. Useful for
    # hosts (Render/Railway) where you can't easily upload a key file.
    FIREBASE_CREDENTIALS_JSON: str = ""

    # ── NVIDIA NIM ─────────────────────────────────────────────
    OPENROUTER_API_KEY:  str = "nvapi-YOUR-KEY-HERE"
    OPENROUTER_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    LLM_PRIMARY_MODEL:   str = "meta/llama-3.1-8b-instruct"
    LLM_SECONDARY_MODEL: str = "mistralai/mistral-7b-instruct-v0.3"
    LLM_FALLBACK_MODEL:  str = "microsoft/phi-3-mini-4k-instruct"
    LLM_MAX_TOKENS:    int   = 1500
    LLM_TEMPERATURE:   float = 0.1

    APP_SITE_URL:  str = "http://localhost:3000"
    APP_SITE_NAME: str = "MediMind"
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000", "http://localhost:5173",
        "http://127.0.0.1:5500", "http://127.0.0.1:3000",
    ]

    # RAG
    CHROMA_PERSIST_DIR: str = "./data/chroma_db"
    KNOWLEDGE_BASE_DIR: str = "./data/knowledge_base"
    EMBEDDING_MODEL:    str = "all-MiniLM-L6-v2"
    RAG_TOP_K:          int = 5
    CHUNK_SIZE:         int = 512
    CHUNK_OVERLAP:      int = 50

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
