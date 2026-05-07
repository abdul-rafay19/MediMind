"""
MediMind LLM Service — NVIDIA NIM Edition
Uses https://integrate.api.nvidia.com/v1 (OpenAI-compatible, free tier)
Average response: 3-8 seconds on NVIDIA H100 cloud GPUs
"""

import json
import logging
import httpx
from typing import List, Dict, Any

from app.core.config import settings
from app.models.schemas import (
    SymptomProfile, TriageResult, ExtractedSymptom, TriageRequest,
)

logger = logging.getLogger(__name__)

MODEL_CHAIN = [
    settings.LLM_PRIMARY_MODEL,
    settings.LLM_SECONDARY_MODEL,
    settings.LLM_FALLBACK_MODEL,
]


class LLMService:

    def __init__(self):
        self.base_url = settings.OPENROUTER_BASE_URL
        self.api_key  = settings.OPENROUTER_API_KEY
        self.headers  = {
            "Content-Type":  "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

    async def _call(self, messages: List[Dict], max_tokens: int = None, temperature: float = None) -> str:
        last_error = None
        _temp = temperature if temperature is not None else settings.LLM_TEMPERATURE
        if _temp == 0: _temp = 0.01

        for model in MODEL_CHAIN:
            try:
                payload = {
                    "model":       model,
                    "messages":    messages,
                    "max_tokens":  max_tokens or settings.LLM_MAX_TOKENS,
                    "temperature": _temp,
                    "stream":      False,
                }
                logger.info(f"Calling model: {model}")

                async with httpx.AsyncClient(timeout=90.0) as client:
                    res = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers=self.headers,
                        json=payload,
                    )

                if res.status_code == 401:
                    raise RuntimeError(
                        "Invalid API key. Go to https://build.nvidia.com, "
                        "click any model, click 'Get API Key', paste it in .env as OPENROUTER_API_KEY"
                    )
                if res.status_code == 429:
                    logger.warning(f"Rate limit on {model}, trying next…")
                    last_error = "Rate limit"; continue
                if res.status_code == 404:
                    logger.warning(f"Model not found: {model}")
                    last_error = f"Model not found: {model}"; continue
                if res.status_code != 200:
                    logger.warning(f"HTTP {res.status_code} from {model}: {res.text[:200]}")
                    last_error = f"HTTP {res.status_code}"; continue

                data    = res.json()
                choices = data.get("choices", [])
                if not choices:
                    last_error = "Empty choices"; continue

                text = choices[0].get("message", {}).get("content", "")
                if not text:
                    last_error = "Empty content"; continue

                logger.info(f"✅ Response from {model} ({len(text)} chars)")
                return text

            except httpx.ConnectError:
                raise RuntimeError(
                    f"Cannot connect to {self.base_url}. Check your internet connection."
                )
            except httpx.TimeoutException:
                logger.warning(f"Timeout on {model}, trying next…")
                last_error = f"Timeout on {model}"; continue
            except RuntimeError: raise
            except Exception as e:
                logger.warning(f"Exception on {model}: {e}")
                last_error = str(e); continue

        raise RuntimeError(
            f"All models failed. Last error: {last_error}\n"
            f"Make sure OPENROUTER_API_KEY in .env is your NVIDIA NIM key (starts with nvapi-)\n"
            f"Get key free at: https://build.nvidia.com"
        )

    def _extract_json(self, text: str) -> dict:
        # Strip thinking tags (some reasoning models emit these)
        if "<think>" in text and "</think>" in text:
            text = text.split("</think>")[-1].strip()
        # Strip markdown code fences
        if "```" in text:
            for part in text.split("```"):
                part = part.strip()
                if part.startswith("json"): part = part[4:].strip()
                if part.startswith("{"):
                    try: return json.loads(part)
                    except: continue
        # Direct JSON parse
        start = text.find("{")
        end   = text.rfind("}") + 1
        if start != -1 and end > start:
            try: return json.loads(text[start:end])
            except: pass
        raise ValueError(f"No valid JSON in response: {text[:300]}")

    async def extract_and_triage(self, request: TriageRequest, rag_context: List[Dict[str, Any]]) -> tuple:
        """Single LLM call: extract symptoms + triage classification together."""
        rag_text = "\n\n".join(
            f"[{s['source']}]: {s['content'][:300]}" for s in rag_context
        ) if rag_context else "No specific references available."

        user_msg = f"""You are a medical triage AI. Analyze the patient input and return ONE JSON object.

PATIENT: "{request.symptoms}"
AGE: {request.age or 'Not provided'}
GENDER: {request.gender or 'Not provided'}
CONDITIONS: {request.existing_conditions or 'None'}

MEDICAL REFERENCES:
{rag_text}

TRIAGE LEVELS:
- EMERGENCY: life-threatening, call emergency services NOW
- URGENT: serious, see a doctor within 24-48 hours
- SELF_CARE: mild, manage at home

SAFETY RULE: If ANY red flag present → EMERGENCY. Red flags: chest pain, difficulty breathing,
sudden severe headache, loss of consciousness, stroke symptoms, uncontrolled bleeding,
high fever + stiff neck, severe allergic reaction.

Return ONLY this JSON, nothing else before or after:
{{
  "chief_complaint": "brief one-sentence summary",
  "symptoms": [
    {{"name": "symptom name", "severity": "mild|moderate|severe", "duration": "e.g. 2 days", "location": null}}
  ],
  "duration_overall": "e.g. 3 days",
  "severity_overall": "mild|moderate|severe|critical",
  "red_flags": [],
  "patient_age": {request.age if request.age is not None else 'null'},
  "patient_gender": "{request.gender or 'unknown'}",
  "existing_conditions": [],
  "triage_level": "EMERGENCY|URGENT|SELF_CARE",
  "triage_color": "red|amber|green",
  "confidence": 0.9,
  "headline": "5-8 word summary",
  "reasoning": "2-3 sentences of clinical reasoning",
  "response": "3-4 empathetic sentences for the patient",
  "actions": ["Action 1", "Action 2", "Action 3"],
  "warning_signs": ["Warning 1", "Warning 2"]
}}"""

        text = await self._call(
            messages=[{"role": "user", "content": user_msg}],
            max_tokens=1500,
        )
        data = self._extract_json(text)

        # Build SymptomProfile
        symptoms = [
            ExtractedSymptom(
                name     = (s.get("name") or "symptom").strip(),
                severity = (s.get("severity") or "moderate").strip(),
                duration = s.get("duration") or "unknown",
                location = s.get("location") or None,
            )
            for s in data.get("symptoms", []) if isinstance(s, dict)
        ]
        profile = SymptomProfile(
            chief_complaint     = data.get("chief_complaint", request.symptoms[:100]),
            symptoms            = symptoms,
            duration_overall    = data.get("duration_overall", "unknown"),
            severity_overall    = data.get("severity_overall", "moderate"),
            red_flags           = data.get("red_flags", []),
            patient_age         = data.get("patient_age"),
            patient_gender      = data.get("patient_gender"),
            existing_conditions = data.get("existing_conditions", []),
        )

        # Normalize triage level
        raw_level = data.get("triage_level", "URGENT").upper().replace("-", "_").replace(" ", "_")
        if raw_level not in ("EMERGENCY", "URGENT", "SELF_CARE"):
            raw_level = "URGENT"
        color_map = {"EMERGENCY": "red", "URGENT": "amber", "SELF_CARE": "green"}
        color = data.get("triage_color", color_map[raw_level]).lower()
        if color not in ("red", "amber", "green"):
            color = color_map[raw_level]

        triage = TriageResult(
            level         = raw_level,   # plain string now
            color         = color,
            confidence    = float(data.get("confidence", 0.9)),
            headline      = data.get("headline", profile.chief_complaint),
            reasoning     = data.get("reasoning", ""),
            response      = data.get("response", ""),
            actions       = data.get("actions", []),
            warning_signs = data.get("warning_signs", []),
            sources       = rag_context[:3],
        )
        return profile, triage

    async def answer_followup(self, question: str, session_ctx: Dict, rag_context: List[Dict], language: str = "en") -> str:
        rag_text = "\n".join(f"[{s['source']}]: {s['content'][:200]}" for s in rag_context) if rag_context else ""
        msg = f"""You are MediMind, a compassionate AI health assistant.
Context — Chief Complaint: {session_ctx.get('chief_complaint','')} | Level: {session_ctx.get('triage_level','')}
Medical Refs: {rag_text}
Patient question: {question}
Answer in 2-3 helpful sentences. End with: "Please consult a healthcare professional for personalized advice."
Do not diagnose. Do not name specific medications."""
        return await self._call(messages=[{"role": "user", "content": msg}], max_tokens=350, temperature=0.2)

    async def generate_report_narrative(self, session_data: Dict, patient_name: str) -> str:
        msg = f"""Write a professional 2-paragraph medical brief for a doctor visit.
Patient: {patient_name} | Triage: {session_data.get('triage_level','')}
Chief Complaint: {session_data.get('chief_complaint','')}
Assessment: {session_data.get('triage_response','')}
Paragraph 1: symptom summary. Paragraph 2: assessment and recommended next steps.
No diagnoses. No medication names."""
        return await self._call(messages=[{"role": "user", "content": msg}], max_tokens=400, temperature=0.3)

    # Legacy wrappers for backward compatibility
    async def extract_symptoms(self, request): profile, _ = await self.extract_and_triage(request, []); return profile
    async def classify_triage(self, profile, rag_context, language="en"):
        from app.models.schemas import TriageRequest as TR
        _, t = await self.extract_and_triage(TR(symptoms=profile.chief_complaint), rag_context)
        return t
