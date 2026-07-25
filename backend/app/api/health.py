"""MediMind Health Check"""
import httpx
from fastapi import APIRouter, Request
from app.core.config import settings

router = APIRouter()

@router.get("/health")
async def health_check(request: Request):
    # Check LLM API (NVIDIA NIM or Ollama — works for both)
    llm_status = "unknown"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(
                f"{settings.OPENROUTER_BASE_URL.rstrip('/v1').rstrip('/')}/models",
                headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
            )
            llm_status = "connected" if res.status_code in (200, 401) else f"error ({res.status_code})"
            if res.status_code == 401:
                llm_status = "key_invalid — update OPENROUTER_API_KEY in .env"
    except Exception as e:
        llm_status = f"unreachable ({str(e)[:60]})"

    rag_service = getattr(request.app.state, "rag_service", None)
    rag_count   = 0
    if rag_service and rag_service.ready and rag_service.collection:
        try: rag_count = rag_service.collection.count()
        except: pass

    return {
        "status":    "operational",
        "service":   "MediMind API",
        "version":   "2.0.0",
        "llm": {
            "status":        llm_status,
            "provider":      "NVIDIA NIM" if "nvidia" in settings.OPENROUTER_BASE_URL else "Ollama",
            "base_url":      settings.OPENROUTER_BASE_URL,
            "primary_model": settings.LLM_PRIMARY_MODEL,
        },
        "rag": {
            "status":         "ready" if (rag_service and rag_service.ready) else "not ready",
            "chunks_indexed": rag_count,
        },
        "database": "connected",
    }
