"""
MediMind — Firebase Firestore Service
All data (triage sessions, medications, health profile, notes) lives in Firestore.
Users table stays in SQLite only for fast JWT auth — everything else is Firestore.

Firestore collections:
  triage_sessions/{doc_id}      — AI triage results
  medications/{doc_id}          — user medications
  health_profiles/{user_id}     — one document per user
  medical_notes/{doc_id}        — journal entries
"""

import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_db = None          # Firestore client (lazy init)
_initialized = False


def get_firestore():
    """
    Return the Firestore client.
    Initializes on first call using either:
      1. FIREBASE_CREDENTIALS_JSON — the full service account JSON pasted as a
         single env var (recommended for hosts like Render/Railway that don't
         let you upload a file, e.g. via a "Secret Environment Variable").
      2. FIREBASE_CREDENTIALS_PATH — a path to serviceAccountKey.json on disk
         (used for local development, or hosts that support secret files).
    """
    global _db, _initialized
    if _initialized:
        return _db
    try:
        import json
        import firebase_admin
        from firebase_admin import credentials, firestore
        from app.core.config import settings

        if not firebase_admin._apps:
            creds_json = getattr(settings, "FIREBASE_CREDENTIALS_JSON", None)
            if creds_json:
                cred = credentials.Certificate(json.loads(creds_json))
            else:
                cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
            firebase_admin.initialize_app(cred)

        _db = firestore.client()
        _initialized = True
        logger.info("✅ Firebase Firestore connected")
    except Exception as e:
        logger.error(f"❌ Firebase init failed: {e}")
        logger.error("Check FIREBASE_CREDENTIALS_PATH in .env points to your serviceAccountKey.json")
        _db = None
        _initialized = True   # Don't retry on every request
    return _db


# ── Helpers ────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _doc_to_dict(doc) -> Optional[Dict]:
    """Convert a Firestore DocumentSnapshot to a plain dict with 'id' field."""
    if not doc.exists:
        return None
    data = doc.to_dict()
    data["id"] = doc.id
    return data


def _sort_by_created(docs: List[Dict], reverse: bool = True) -> List[Dict]:
    """Sort in Python to avoid Firestore composite index requirements."""
    return sorted(docs, key=lambda d: d.get("created_at", ""), reverse=reverse)


def _where_equal(query, field: str, value):
    """Apply an equality filter across firebase-admin versions."""
    try:
        from google.cloud.firestore_v1.base_query import FieldFilter

        return query.where(filter=FieldFilter(field, "==", value))
    except Exception:
        return query.where(field, "==", value)


def _user_doc(db, user_id: int):
    return db.collection("users").document(str(user_id))


def _ensure_user_doc(db, user_id: int):
    _user_doc(db, user_id).set(
        {"user_id": str(user_id), "updated_at": _now_iso()},
        merge=True,
    )


def _user_collection(db, user_id: int, collection: str):
    return _user_doc(db, user_id).collection(collection)


def _user_health_profile_ref(db, user_id: int):
    return _user_collection(db, user_id, "health_profile").document("profile")


# ══════════════════════════════════════════════════════════════
#  TRIAGE SESSIONS
# ══════════════════════════════════════════════════════════════

async def fs_create_session(user_id: int, session_data: Dict) -> Dict:
    db = get_firestore()
    doc_data = {
        **session_data,
        "user_id":    str(user_id) if user_id else None,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    if user_id:
        _ensure_user_doc(db, user_id)
        ref = _user_collection(db, user_id, "triage_sessions").document()
    else:
        ref = db.collection("triage_sessions").document()
    ref.set(doc_data)
    doc_data["id"] = ref.id
    return doc_data


async def fs_get_sessions(user_id: int, limit: int = 50) -> List[Dict]:
    db = get_firestore()
    docs = _user_collection(db, user_id, "triage_sessions").limit(limit).stream()
    results = [_doc_to_dict(d) for d in docs if d.exists]

    # Read older top-level records too, so existing user history is not lost.
    legacy_docs = (
        _where_equal(db.collection("triage_sessions"), "user_id", str(user_id))
        .limit(limit)
        .stream()
    )
    results.extend(_doc_to_dict(d) for d in legacy_docs if d.exists)
    return _sort_by_created(results)[:limit]


async def fs_get_session(doc_id: str, user_id: int) -> Optional[Dict]:
    db = get_firestore()
    doc = _user_collection(db, user_id, "triage_sessions").document(doc_id).get()
    data = _doc_to_dict(doc)
    if data:
        return data

    doc = db.collection("triage_sessions").document(doc_id).get()
    data = _doc_to_dict(doc)
    if not data:
        return None
    if data.get("user_id") != str(user_id):
        return None
    return data


async def fs_update_session(doc_id: str, updates: Dict, user_id: int = None) -> bool:
    db = get_firestore()
    updates["updated_at"] = _now_iso()
    if user_id:
        ref = _user_collection(db, user_id, "triage_sessions").document(doc_id)
        if ref.get().exists:
            ref.update(updates)
            return True

    ref = db.collection("triage_sessions").document(doc_id)
    if user_id:
        data = _doc_to_dict(ref.get())
        if not data or data.get("user_id") != str(user_id):
            return False
    ref.update(updates)
    return True


async def fs_delete_session(doc_id: str, user_id: int) -> bool:
    db = get_firestore()
    ref = _user_collection(db, user_id, "triage_sessions").document(doc_id)
    doc = ref.get()
    if doc.exists:
        ref.delete()
        return True

    doc = db.collection("triage_sessions").document(doc_id).get()
    data = _doc_to_dict(doc)
    if not data or data.get("user_id") != str(user_id):
        return False
    db.collection("triage_sessions").document(doc_id).delete()
    return True


# ══════════════════════════════════════════════════════════════
#  MEDICATIONS
# ══════════════════════════════════════════════════════════════

async def fs_create_medication(user_id: int, data: Dict) -> Dict:
    db = get_firestore()
    doc_data = {
        **data,
        "user_id":    str(user_id),
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    _ensure_user_doc(db, user_id)
    ref = _user_collection(db, user_id, "medications").document()
    ref.set(doc_data)
    doc_data["id"] = ref.id
    return doc_data


async def fs_get_medications(user_id: int, active_only: bool = False) -> List[Dict]:
    db = get_firestore()
    docs = _user_collection(db, user_id, "medications").stream()
    results = [_doc_to_dict(d) for d in docs if d.exists]
    legacy_query = _where_equal(db.collection("medications"), "user_id", str(user_id))
    legacy_docs = legacy_query.stream()
    results.extend(_doc_to_dict(d) for d in legacy_docs if d.exists)
    if active_only:
        results = [r for r in results if r.get("is_active") is True]
    return _sort_by_created(results)


async def fs_get_medication(doc_id: str, user_id: int) -> Optional[Dict]:
    db = get_firestore()
    doc = _user_collection(db, user_id, "medications").document(doc_id).get()
    data = _doc_to_dict(doc)
    if data:
        return data

    doc = db.collection("medications").document(doc_id).get()
    data = _doc_to_dict(doc)
    if not data or data.get("user_id") != str(user_id):
        return None
    return data


async def fs_update_medication(doc_id: str, user_id: int, updates: Dict) -> Optional[Dict]:
    db = get_firestore()
    ref = _user_collection(db, user_id, "medications").document(doc_id)
    doc = ref.get()
    data = _doc_to_dict(doc)
    if data:
        updates["updated_at"] = _now_iso()
        ref.update(updates)
        return {**data, **updates, "id": doc_id}

    doc = db.collection("medications").document(doc_id).get()
    data = _doc_to_dict(doc)
    if not data or data.get("user_id") != str(user_id):
        return None
    updates["updated_at"] = _now_iso()
    db.collection("medications").document(doc_id).update(updates)
    return {**data, **updates, "id": doc_id}


async def fs_delete_medication(doc_id: str, user_id: int) -> bool:
    db = get_firestore()
    ref = _user_collection(db, user_id, "medications").document(doc_id)
    doc = ref.get()
    if doc.exists:
        ref.delete()
        return True

    doc = db.collection("medications").document(doc_id).get()
    data = _doc_to_dict(doc)
    if not data or data.get("user_id") != str(user_id):
        return False
    db.collection("medications").document(doc_id).delete()
    return True


# ══════════════════════════════════════════════════════════════
#  HEALTH PROFILE (one per user — document ID = str(user_id))
# ══════════════════════════════════════════════════════════════

async def fs_get_health_profile(user_id: int) -> Optional[Dict]:
    db = get_firestore()
    doc = _user_health_profile_ref(db, user_id).get()
    data = _doc_to_dict(doc)
    if data:
        return data

    doc = db.collection("health_profiles").document(str(user_id)).get()
    return _doc_to_dict(doc)


async def fs_upsert_health_profile(user_id: int, data: Dict) -> Dict:
    db = get_firestore()
    _ensure_user_doc(db, user_id)
    ref   = _user_health_profile_ref(db, user_id)
    existing = ref.get()
    now   = _now_iso()
    if existing.exists:
        data["updated_at"] = now
        ref.update(data)
        merged = {**existing.to_dict(), **data, "id": str(user_id)}
    else:
        data["user_id"]    = str(user_id)
        data["created_at"] = now
        data["updated_at"] = now
        ref.set(data)
        merged = {**data, "id": str(user_id)}
    return merged


async def fs_delete_health_profile(user_id: int) -> bool:
    db = get_firestore()
    ref = _user_health_profile_ref(db, user_id)
    doc = ref.get()
    deleted = False
    if doc.exists:
        ref.delete()
        deleted = True

    legacy_ref = db.collection("health_profiles").document(str(user_id))
    legacy_doc = legacy_ref.get()
    if legacy_doc.exists:
        legacy_ref.delete()
        deleted = True
    return deleted


# ══════════════════════════════════════════════════════════════
#  MEDICAL NOTES
# ══════════════════════════════════════════════════════════════

async def fs_create_note(user_id: int, data: Dict) -> Dict:
    db = get_firestore()
    doc_data = {
        **data,
        "user_id":    str(user_id),
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    _ensure_user_doc(db, user_id)
    ref = _user_collection(db, user_id, "medical_notes").document()
    ref.set(doc_data)
    doc_data["id"] = ref.id
    return doc_data


async def fs_get_notes(user_id: int, category: str = None) -> List[Dict]:
    db = get_firestore()
    docs = _user_collection(db, user_id, "medical_notes").stream()
    results = [_doc_to_dict(d) for d in docs if d.exists]
    legacy_query = _where_equal(db.collection("medical_notes"), "user_id", str(user_id))
    legacy_docs = legacy_query.stream()
    results.extend(_doc_to_dict(d) for d in legacy_docs if d.exists)
    if category:
        results = [r for r in results if r.get("category") == category]
    return _sort_by_created(results)


async def fs_get_note(doc_id: str, user_id: int) -> Optional[Dict]:
    db = get_firestore()
    doc = _user_collection(db, user_id, "medical_notes").document(doc_id).get()
    data = _doc_to_dict(doc)
    if data:
        return data

    doc = db.collection("medical_notes").document(doc_id).get()
    data = _doc_to_dict(doc)
    if not data or data.get("user_id") != str(user_id):
        return None
    return data


async def fs_update_note(doc_id: str, user_id: int, updates: Dict) -> Optional[Dict]:
    db = get_firestore()
    ref = _user_collection(db, user_id, "medical_notes").document(doc_id)
    doc = ref.get()
    data = _doc_to_dict(doc)
    if data:
        updates["updated_at"] = _now_iso()
        ref.update(updates)
        return {**data, **updates, "id": doc_id}

    doc = db.collection("medical_notes").document(doc_id).get()
    data = _doc_to_dict(doc)
    if not data or data.get("user_id") != str(user_id):
        return None
    updates["updated_at"] = _now_iso()
    db.collection("medical_notes").document(doc_id).update(updates)
    return {**data, **updates, "id": doc_id}


async def fs_delete_note(doc_id: str, user_id: int) -> bool:
    db = get_firestore()
    ref = _user_collection(db, user_id, "medical_notes").document(doc_id)
    doc = ref.get()
    if doc.exists:
        ref.delete()
        return True

    doc = db.collection("medical_notes").document(doc_id).get()
    data = _doc_to_dict(doc)
    if not data or data.get("user_id") != str(user_id):
        return False
    db.collection("medical_notes").document(doc_id).delete()
    return True


# ══════════════════════════════════════════════════════════════
#  DELETE ALL USER DATA (called on account delete)
# ══════════════════════════════════════════════════════════════

async def fs_delete_all_user_data(user_id: int):
    """Delete everything from Firestore for a given user."""
    db = get_firestore()
    uid = str(user_id)
    for collection in ["triage_sessions", "medications", "medical_notes"]:
        docs = _user_collection(db, user_id, collection).stream()
        for doc in docs:
            doc.reference.delete()

        docs = _where_equal(db.collection(collection), "user_id", uid).stream()
        for doc in docs:
            doc.reference.delete()

    _user_health_profile_ref(db, user_id).delete()
    db.collection("health_profiles").document(uid).delete()
    logger.info(f"Deleted all Firestore data for user {user_id}")


# ══════════════════════════════════════════════════════════════
#  USERS — mirror to Firestore (for Firebase console visibility)
#  SQLite remains the source of truth for auth/JWT.
#  Firestore gets a copy so all users are visible in Firebase.
# ══════════════════════════════════════════════════════════════

async def fs_sync_user(user_id: int, email: str, full_name: str):
    """
    Write/update user record in Firestore users collection.
    Called on register and profile update.
    Document ID = str(user_id) for easy lookup.
    """
    db = get_firestore()
    if not db:
        return
    try:
        ref = db.collection("users").document(str(user_id))
        ref.set({
            "user_id":    str(user_id),
            "email":      email,
            "full_name":  full_name,
            "updated_at": _now_iso(),
        }, merge=True)  # merge=True so we don't overwrite created_at
    except Exception as e:
        logger.warning(f"Could not sync user to Firestore: {e}")


async def fs_delete_user(user_id: int):
    """Remove user document from Firestore users collection."""
    db = get_firestore()
    if not db:
        return
    try:
        db.collection("users").document(str(user_id)).delete()
    except Exception as e:
        logger.warning(f"Could not delete user from Firestore: {e}")
