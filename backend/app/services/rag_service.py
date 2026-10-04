"""
MediMind RAG Service
Retrieval-Augmented Generation over medical knowledge base
"""

import os
import json
import logging
from pathlib import Path
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class RAGService:
    """
    Medical RAG pipeline using ChromaDB + sentence-transformers.
    Falls back gracefully if dependencies aren't installed.
    """

    def __init__(self):
        self.collection = None
        self.embedding_fn = None
        self.ready = False

    async def initialize(self):
        """Load or build the vector store."""
        try:
            import chromadb
            from chromadb.utils import embedding_functions
            from app.core.config import settings

            persist_dir = settings.CHROMA_PERSIST_DIR
            os.makedirs(persist_dir, exist_ok=True)

            self.embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
                model_name=settings.EMBEDDING_MODEL
            )

            client = chromadb.PersistentClient(path=persist_dir)
            self.collection = client.get_or_create_collection(
                name="medical_knowledge",
                embedding_function=self.embedding_fn,
                metadata={"hnsw:space": "cosine"},
            )

            # Seed knowledge base if empty
            if self.collection.count() == 0:
                await self._seed_knowledge_base(settings.KNOWLEDGE_BASE_DIR)

            self.ready = True
            logger.info(f"✅ RAG ready — {self.collection.count()} chunks indexed")

        except ImportError as e:
            logger.warning(f"⚠️ RAG dependencies missing ({e}). Using fallback mode.")
            self.ready = False
        except Exception as e:
            logger.error(f"❌ RAG init failed: {e}")
            self.ready = False

    async def _seed_knowledge_base(self, kb_dir: str):
        """Ingest JSON knowledge base files into ChromaDB."""
        kb_path = Path(kb_dir)
        if not kb_path.exists():
            logger.warning(f"Knowledge base dir not found: {kb_dir}")
            return

        docs, ids, metadatas = [], [], []
        idx = 0

        for json_file in kb_path.glob("*.json"):
            with open(json_file) as f:
                entries = json.load(f)
            for entry in entries:
                chunks = self._chunk_text(entry.get("content", ""))
                for chunk in chunks:
                    docs.append(chunk)
                    ids.append(f"doc_{idx}")
                    metadatas.append({
                        "source": entry.get("source", "Unknown"),
                        "title": entry.get("title", ""),
                        "category": entry.get("category", "general"),
                    })
                    idx += 1

        if docs:
            # Batch insert
            batch_size = 100
            for i in range(0, len(docs), batch_size):
                self.collection.add(
                    documents=docs[i:i+batch_size],
                    ids=ids[i:i+batch_size],
                    metadatas=metadatas[i:i+batch_size],
                )
            logger.info(f"✅ Indexed {len(docs)} chunks from {kb_dir}")

    def _chunk_text(self, text: str, size: int = 512, overlap: int = 50) -> List[str]:
        """Split text into overlapping chunks by word count."""
        words = text.split()
        chunks = []
        for i in range(0, len(words), size - overlap):
            chunk = " ".join(words[i:i + size])
            if chunk:
                chunks.append(chunk)
        return chunks

    async def retrieve(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """Retrieve top-k relevant medical chunks for a query."""
        if not self.ready or not self.collection:
            return self._fallback_retrieve(query)

        try:
            results = self.collection.query(
                query_texts=[query],
                n_results=min(top_k, self.collection.count()),
                include=["documents", "metadatas", "distances"],
            )
            sources = []
            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            ):
                sources.append({
                    "content": doc,
                    "source": meta.get("source", "Medical Reference"),
                    "title": meta.get("title", ""),
                    "relevance": round(1 - dist, 3),
                })
            return sources
        except Exception as e:
            logger.error(f"RAG retrieval error: {e}")
            return self._fallback_retrieve(query)

    def _fallback_retrieve(self, query: str) -> List[Dict[str, Any]]:
        """Minimal fallback when RAG unavailable."""
        return [
            {
                "content": "Always seek professional medical advice for accurate diagnosis and treatment.",
                "source": "WHO General Health Guidelines",
                "title": "Medical Disclaimer",
                "relevance": 0.5,
            }
        ]
