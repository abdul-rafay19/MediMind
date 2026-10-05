"""
MediMind RAG Service (lightweight)
BM25 retrieval over the medical knowledge base — pure Python, no torch /
sentence-transformers / chromadb, so it runs comfortably in ~100 MB RAM.
Public interface is unchanged: initialize(), retrieve(), .ready, .collection.count()
"""

import re
import json
import math
import logging
from pathlib import Path
from collections import Counter
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
    "i", "in", "is", "it", "its", "my", "of", "on", "or", "that", "the", "to",
    "was", "were", "will", "with", "am", "me", "do", "does", "not", "this", "so",
}


def _tokenize(text: str) -> List[str]:
    words = re.findall(r"[a-z0-9]+", text.lower())
    return [w for w in words if w not in _STOPWORDS and len(w) > 1]


class _Collection:
    """Tiny shim so existing code calling rag_service.collection.count() keeps working."""

    def __init__(self, service: "RAGService"):
        self._service = service

    def count(self) -> int:
        return len(self._service._docs)


class RAGService:
    def __init__(self):
        self.collection = None
        self.embedding_fn = None
        self.ready = False
        self._docs: List[Dict[str, Any]] = []
        self._tf: List[Counter] = []
        self._df: Counter = Counter()
        self._avgdl = 0.0

    async def initialize(self):
        """Load the knowledge base and build the BM25 index."""
        try:
            from app.core.config import settings

            kb_path = Path(settings.KNOWLEDGE_BASE_DIR)
            if not kb_path.exists():
                logger.warning(f"Knowledge base dir not found: {kb_path}")
                return

            for json_file in sorted(kb_path.glob("*.json")):
                with open(json_file, encoding="utf-8") as f:
                    entries = json.load(f)
                for entry in entries:
                    title = entry.get("title", "")
                    for chunk in self._chunk_text(entry.get("content", "")):
                        self._docs.append({
                            "content": chunk,
                            "source": entry.get("source", "Medical Reference"),
                            "title": title,
                            "category": entry.get("category", "general"),
                        })

            lengths = []
            for d in self._docs:
                # Title is included so title words also match
                tokens = _tokenize(d["title"] + " " + d["content"])
                tf = Counter(tokens)
                self._tf.append(tf)
                lengths.append(len(tokens))
                self._df.update(tf.keys())
            self._avgdl = (sum(lengths) / len(lengths)) if lengths else 0.0

            self.collection = _Collection(self)
            self.ready = bool(self._docs)
            logger.info(f"✅ RAG ready — {len(self._docs)} chunks indexed (BM25)")
        except Exception as e:
            logger.error(f"❌ RAG init failed: {e}")
            self.ready = False

    def _chunk_text(self, text: str, size: int = 200, overlap: int = 30) -> List[str]:
        words = text.split()
        chunks = []
        for i in range(0, len(words), size - overlap):
            chunk = " ".join(words[i:i + size])
            if chunk:
                chunks.append(chunk)
        return chunks

    def _score(self, q_tokens: List[str], idx: int, k1: float = 1.5, b: float = 0.75) -> float:
        tf = self._tf[idx]
        dl = sum(tf.values()) or 1
        n = len(self._docs)
        score = 0.0
        for t in q_tokens:
            f = tf.get(t, 0)
            if not f:
                continue
            idf = math.log(1 + (n - self._df[t] + 0.5) / (self._df[t] + 0.5))
            score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * dl / self._avgdl))
        return score

    async def retrieve(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        if not self.ready:
            return self._fallback_retrieve(query)
        try:
            q_tokens = _tokenize(query)
            scored = [(self._score(q_tokens, i), i) for i in range(len(self._docs))]
            scored = [s for s in scored if s[0] > 0]
            scored.sort(reverse=True)
            if not scored:
                return self._fallback_retrieve(query)

            best = scored[0][0]
            results = []
            for score, i in scored[:top_k]:
                d = self._docs[i]
                results.append({
                    "content": d["content"],
                    "source": d["source"],
                    "title": d["title"],
                    "relevance": round(score / best, 3),
                })
            return results
        except Exception as e:
            logger.error(f"RAG retrieval error: {e}")
            return self._fallback_retrieve(query)

    def _fallback_retrieve(self, query: str) -> List[Dict[str, Any]]:
        return [{
            "content": "Always seek professional medical advice for accurate diagnosis and treatment.",
            "source": "WHO General Health Guidelines",
            "title": "Medical Disclaimer",
            "relevance": 0.5,
        }]
