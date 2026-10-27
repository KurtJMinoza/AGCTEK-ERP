"""
AGCTEK ERP — Document AI Microservice
Provides OCR, document classification, quality analysis, signature verification,
PDF digital signature validation, and DeepGuard KYC adapter.

Run: uvicorn main:app --host 0.0.0.0 --port 8100
"""

import os
import time
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("document-ai")

API_KEY = os.getenv("IDV_DOCUMENT_AI_API_KEY", "")

# Lazy-loaded engines (heavy imports deferred to startup)
_ocr_engine = None
_quality_engine = None
_signature_engine = None
_pdf_sig_engine = None
_deepguard_adapter = None
_classifier_engine = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize AI engines on startup."""
    global _ocr_engine, _quality_engine, _signature_engine
    global _pdf_sig_engine, _deepguard_adapter, _classifier_engine

    logger.info("Initializing document AI engines...")

    try:
        from engines.paddleocr_engine import PaddleOcrEngine
        _ocr_engine = PaddleOcrEngine()
        _classifier_engine = _ocr_engine  # Classification reuses OCR layout analysis
        logger.info("PaddleOCR engine initialized")
    except Exception as e:
        logger.warning(f"PaddleOCR initialization failed (OCR will be unavailable): {e}")

    try:
        from engines.document_quality import DocumentQualityEngine
        _quality_engine = DocumentQualityEngine()
        logger.info("Document quality engine initialized")
    except Exception as e:
        logger.warning(f"Quality engine initialization failed: {e}")

    try:
        from engines.signature_engine import SignatureEngine
        _signature_engine = SignatureEngine()
        logger.info("Signature engine initialized")
    except Exception as e:
        logger.warning(f"Signature engine initialization failed: {e}")

    try:
        from engines.pdf_signature_validator import PdfSignatureValidator
        _pdf_sig_engine = PdfSignatureValidator()
        logger.info("PDF signature validator initialized")
    except Exception as e:
        logger.warning(f"PDF signature validator initialization failed: {e}")

    try:
        from engines.deepguard_adapter import DeepGuardAdapter
        _deepguard_adapter = DeepGuardAdapter()
        logger.info("DeepGuard adapter initialized")
    except Exception as e:
        logger.warning(f"DeepGuard adapter initialization failed: {e}")

    logger.info("Document AI service ready")
    yield
    logger.info("Shutting down document AI service")


app = FastAPI(
    title="AGCTEK Document AI",
    version="1.0.0",
    lifespan=lifespan,
)


def _check_api_key(x_api_key: str | None):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


# ─── Health ───────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "engines": {
            "ocr": _ocr_engine is not None,
            "quality": _quality_engine is not None,
            "signature": _signature_engine is not None,
            "pdf_signature": _pdf_sig_engine is not None,
            "deepguard": _deepguard_adapter is not None,
        },
    }


# ─── OCR ──────────────────────────────────────────────────────────────

@app.post("/api/v1/ocr")
async def ocr(
    file: UploadFile = File(...),
    session_id: str = Form(""),
    document_id: str = Form(""),
    analysis_id: str = Form(""),
    x_api_key: str | None = Header(None),
):
    _check_api_key(x_api_key)
    if not _ocr_engine:
        raise HTTPException(503, "OCR engine not available")

    content = await file.read()
    start = time.time()
    result = _ocr_engine.extract(content, file.filename or "document")
    elapsed_ms = int((time.time() - start) * 1000)

    return {
        "analysis_id": analysis_id,
        "session_id": session_id,
        "document_id": document_id,
        "confidence": result.get("confidence"),
        "extracted_fields": result.get("extracted_fields"),
        "raw_text": result.get("raw_text"),
        "processing_ms": elapsed_ms,
    }


# ─── Classification ──────────────────────────────────────────────────

@app.post("/api/v1/classify")
async def classify(
    file: UploadFile = File(...),
    session_id: str = Form(""),
    document_id: str = Form(""),
    analysis_id: str = Form(""),
    x_api_key: str | None = Header(None),
):
    _check_api_key(x_api_key)
    if not _classifier_engine:
        raise HTTPException(503, "Classification engine not available")

    content = await file.read()
    start = time.time()
    result = _classifier_engine.classify(content, file.filename or "document")
    elapsed_ms = int((time.time() - start) * 1000)

    return {
        "analysis_id": analysis_id,
        "session_id": session_id,
        "document_id": document_id,
        "document_type": result.get("document_type"),
        "confidence": result.get("confidence"),
        "processing_ms": elapsed_ms,
    }


# ─── Quality ─────────────────────────────────────────────────────────

@app.post("/api/v1/quality")
async def quality(
    file: UploadFile = File(...),
    session_id: str = Form(""),
    document_id: str = Form(""),
    analysis_id: str = Form(""),
    x_api_key: str | None = Header(None),
):
    _check_api_key(x_api_key)
    if not _quality_engine:
        raise HTTPException(503, "Quality engine not available")

    content = await file.read()
    start = time.time()
    result = _quality_engine.analyze(content)
    elapsed_ms = int((time.time() - start) * 1000)

    return {
        "analysis_id": analysis_id,
        "session_id": session_id,
        "document_id": document_id,
        "quality_metrics": result,
        "confidence": result.get("overall_score"),
        "processing_ms": elapsed_ms,
    }


# ─── Forensics (DeepGuard) ───────────────────────────────────────────

@app.post("/api/v1/forensics")
async def forensics(
    file: UploadFile = File(...),
    session_id: str = Form(""),
    document_id: str = Form(""),
    analysis_id: str = Form(""),
    x_api_key: str | None = Header(None),
):
    _check_api_key(x_api_key)
    if not _deepguard_adapter:
        raise HTTPException(503, "DeepGuard adapter not available")

    content = await file.read()
    start = time.time()
    result = _deepguard_adapter.analyze_forensics(content, file.filename or "document")
    elapsed_ms = int((time.time() - start) * 1000)

    return {
        "analysis_id": analysis_id,
        "session_id": session_id,
        "document_id": document_id,
        **result,
        "processing_ms": elapsed_ms,
    }


# ─── Face Match (DeepGuard) ──────────────────────────────────────────

@app.post("/api/v1/face-match")
async def face_match(
    file: UploadFile = File(...),
    session_id: str = Form(""),
    document_id: str = Form(""),
    analysis_id: str = Form(""),
    x_api_key: str | None = Header(None),
):
    _check_api_key(x_api_key)
    if not _deepguard_adapter:
        raise HTTPException(503, "DeepGuard adapter not available")

    content = await file.read()
    start = time.time()
    result = _deepguard_adapter.face_match(content)
    elapsed_ms = int((time.time() - start) * 1000)

    return {
        "analysis_id": analysis_id,
        "session_id": session_id,
        "document_id": document_id,
        **result,
        "processing_ms": elapsed_ms,
    }


# ─── DeepGuard KYC ───────────────────────────────────────────────────

@app.post("/api/v1/deepguard")
async def deepguard(
    file: UploadFile = File(...),
    session_id: str = Form(""),
    document_id: str = Form(""),
    analysis_id: str = Form(""),
    x_api_key: str | None = Header(None),
):
    _check_api_key(x_api_key)
    if not _deepguard_adapter:
        raise HTTPException(503, "DeepGuard adapter not available")

    content = await file.read()
    start = time.time()
    result = _deepguard_adapter.full_analysis(content, file.filename or "document")
    elapsed_ms = int((time.time() - start) * 1000)

    return {
        "analysis_id": analysis_id,
        "session_id": session_id,
        "document_id": document_id,
        **result,
        "processing_ms": elapsed_ms,
    }


# ─── Handwritten Signature ───────────────────────────────────────────

@app.post("/api/v1/signature/handwritten")
async def signature_handwritten(
    document: UploadFile = File(...),
    session_id: str = Form(""),
    check_id: str = Form(""),
    reference: UploadFile | None = File(None),
    x_api_key: str | None = Header(None),
):
    _check_api_key(x_api_key)
    if not _signature_engine:
        raise HTTPException(503, "Signature engine not available")

    doc_content = await document.read()
    ref_content = await reference.read() if reference else None

    start = time.time()
    result = _signature_engine.compare_handwritten(doc_content, ref_content)
    elapsed_ms = int((time.time() - start) * 1000)

    return {
        "check_id": check_id,
        "session_id": session_id,
        **result,
        "processing_ms": elapsed_ms,
    }


# ─── PDF Digital Signature ───────────────────────────────────────────

@app.post("/api/v1/signature/pdf")
async def signature_pdf(
    document: UploadFile = File(...),
    session_id: str = Form(""),
    check_id: str = Form(""),
    x_api_key: str | None = Header(None),
):
    _check_api_key(x_api_key)
    if not _pdf_sig_engine:
        raise HTTPException(503, "PDF signature validator not available")

    content = await document.read()
    start = time.time()
    result = _pdf_sig_engine.validate(content)
    elapsed_ms = int((time.time() - start) * 1000)

    return {
        "check_id": check_id,
        "session_id": session_id,
        **result,
        "processing_ms": elapsed_ms,
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("IDV_AI_PORT", "8100"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
