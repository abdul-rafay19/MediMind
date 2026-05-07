"""
MediMind Report Service — PDF medical brief generator
Fixed: removed all emoji/unicode chars that latin-1 / Helvetica cannot encode
"""

import io
import logging
from datetime import datetime
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

COLOR_MAP = {
    "EMERGENCY": (192, 57,  43),
    "URGENT":    (230, 126, 34),
    "SELF_CARE": (39,  174, 96),
}


def _safe(text: str) -> str:
    """Strip any character outside latin-1 range so fpdf never crashes."""
    if not text:
        return ""
    return text.encode("latin-1", errors="ignore").decode("latin-1")


def generate_pdf_report(
    session_data: Dict[str, Any],
    patient_name: str = "Patient",
    narrative: str = "",
) -> bytes:
    try:
        from fpdf import FPDF
    except ImportError:
        raise RuntimeError("fpdf2 not installed — run: pip install fpdf2")

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    # ── Header bar ───────────────────────────────────────────────
    pdf.set_fill_color(26, 82, 118)
    pdf.rect(0, 0, 210, 28, "F")

    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(255, 255, 255)
    pdf.set_xy(10, 8)
    pdf.cell(130, 10, "MediMind Medical Brief", ln=0)

    pdf.set_font("Helvetica", "", 9)
    pdf.set_xy(150, 5)
    pdf.cell(55, 5, "AI-Powered Triage Report", ln=1, align="R")
    pdf.set_xy(150, 11)
    pdf.cell(55, 5, "NOT a medical diagnosis", align="R")
    pdf.set_xy(150, 17)
    pdf.set_font("Helvetica", "", 8)
    pdf.cell(55, 5, datetime.now().strftime("%d %B %Y, %H:%M"), align="R")

    pdf.set_text_color(0, 0, 0)
    pdf.ln(16)

    # ── Triage level banner ──────────────────────────────────────
    level  = session_data.get("triage_level", "UNKNOWN")
    r, g, b = COLOR_MAP.get(level, (100, 100, 100))
    pdf.set_fill_color(r, g, b)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 14)
    labels = {
        "EMERGENCY": "EMERGENCY  --  Seek Immediate Care Now",
        "URGENT":    "URGENT  --  See a Doctor Within 48 Hours",
        "SELF_CARE": "SELF-CARE  --  Manageable at Home",
    }
    pdf.cell(0, 12, labels.get(level, level), ln=True, align="C", fill=True)
    pdf.ln(4)
    pdf.set_text_color(0, 0, 0)

    # ── Patient information ──────────────────────────────────────
    _section_header(pdf, "Patient Information")
    extracted = session_data.get("symptoms_extracted") or {}
    _info_table(pdf, [
        ("Patient Name",       _safe(patient_name)),
        ("Age",                _safe(str(extracted.get("patient_age") or "Not provided"))),
        ("Gender",             _safe(str(extracted.get("patient_gender") or "Not provided"))),
        ("Existing Conditions",_safe(", ".join(extracted.get("existing_conditions", [])) or "None reported")),
        ("Date of Assessment", datetime.now().strftime("%d %B %Y")),
        ("Session ID",         str(session_data.get("id", "N/A"))),
    ])

    # ── Chief complaint ──────────────────────────────────────────
    _section_header(pdf, "Chief Complaint")
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 6, _safe(session_data.get("chief_complaint", "")))
    pdf.ln(3)

    # ── Symptoms table ───────────────────────────────────────────
    _section_header(pdf, "Reported Symptoms")
    symptoms = extracted.get("symptoms", [])
    if symptoms:
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(232, 245, 253)
        for header, w in [("Symptom", 70), ("Severity", 35), ("Duration", 45), ("Location", 40)]:
            pdf.cell(w, 7, header, border=1, fill=True)
        pdf.ln()
        pdf.set_font("Helvetica", "", 9)
        for s in symptoms:
            if not isinstance(s, dict):
                continue
            sev = s.get("severity", "")
            _sev_color(pdf, sev)
            pdf.cell(70, 6, _safe(s.get("name", "")),     border=1)
            pdf.cell(35, 6, _safe(sev.title()),           border=1)
            pdf.cell(45, 6, _safe(s.get("duration", "")), border=1)
            pdf.cell(40, 6, _safe(s.get("location") or "--"), border=1, ln=True)
            pdf.set_text_color(0, 0, 0)
    pdf.ln(3)

    # ── Red flags ────────────────────────────────────────────────
    red_flags = extracted.get("red_flags", [])
    if red_flags:
        _section_header(pdf, "WARNING SIGNS DETECTED", color=(192, 57, 43))
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(192, 57, 43)
        for flag in red_flags:
            pdf.cell(0, 6, _safe(f"  [!] {flag}"), ln=True)
        pdf.set_text_color(0, 0, 0)
        pdf.ln(2)

    # ── AI narrative ─────────────────────────────────────────────
    if narrative:
        _section_header(pdf, "AI Clinical Assessment Narrative")
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 6, _safe(narrative))
        pdf.ln(3)

    # ── Recommended actions ──────────────────────────────────────
    triage_response = session_data.get("triage_response", "")
    if triage_response:
        _section_header(pdf, "Recommended Actions")
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 6, _safe(triage_response))
        pdf.ln(3)

    # ── Follow-up Q&A ────────────────────────────────────────────
    qa_list = session_data.get("follow_up_qa") or []
    if qa_list:
        _section_header(pdf, "Follow-up Questions & Answers")
        for qa in qa_list:
            pdf.set_font("Helvetica", "B", 9)
            pdf.multi_cell(0, 6, _safe(f"Q: {qa.get('q', '')}"))
            pdf.set_font("Helvetica", "", 9)
            pdf.multi_cell(0, 6, _safe(f"A: {qa.get('a', '')}"))
            pdf.ln(2)

    # ── Questions for doctor ─────────────────────────────────────
    _section_header(pdf, "Questions to Ask Your Doctor")
    pdf.set_font("Helvetica", "", 10)
    for q in [
        "What is the most likely cause of my symptoms?",
        "What tests or investigations do you recommend?",
        "Are my symptoms related to any of my existing conditions?",
        "What warning signs should prompt me to seek emergency care?",
        "What is the expected timeline for recovery?",
    ]:
        pdf.cell(0, 6, _safe(f"  [ ]  {q}"), ln=True)

    # ── Disclaimer ───────────────────────────────────────────────
    pdf.ln(8)
    pdf.set_fill_color(244, 246, 247)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(100, 100, 100)
    pdf.multi_cell(
        0, 5,
        "DISCLAIMER: This report was generated by MediMind, an AI-powered health triage tool. "
        "It does NOT constitute a medical diagnosis and is intended solely as an informational aid. "
        "Always consult a qualified healthcare professional for medical advice, diagnosis, or treatment. "
        "In case of emergency, call 1122 (Rescue Punjab) or 115 (Edhi Foundation) immediately.",
        border=0, fill=True,
    )

    return bytes(pdf.output())


# ── Helpers ──────────────────────────────────────────────────────

def _section_header(pdf, title: str, color=(26, 82, 118)):
    r, g, b = color
    pdf.set_fill_color(r, g, b)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 8, _safe(f"  {title}"), ln=True, fill=True)
    pdf.set_text_color(0, 0, 0)
    pdf.ln(2)


def _info_table(pdf, rows):
    pdf.set_font("Helvetica", "", 9)
    for label, value in rows:
        pdf.set_fill_color(232, 245, 253)
        pdf.cell(55, 6, _safe(label), border=1, fill=True)
        pdf.set_fill_color(255, 255, 255)
        pdf.cell(0,  6, _safe(value), border=1, fill=True, ln=True)
    pdf.ln(3)


def _sev_color(pdf, severity: str):
    colors = {
        "mild":     (39,  174, 96),
        "moderate": (230, 126, 34),
        "severe":   (192, 57,  43),
        "critical": (142, 14,  14),
    }
    r, g, b = colors.get((severity or "").lower(), (0, 0, 0))
    pdf.set_text_color(r, g, b)