"""
DeepGuard KYC adapter.

Integrates with DEEPGUARD-KYC (https://github.com/jordansoftware/DEEPGUARD-KYC)
for government ID analysis, document forensics, and facial recognition.

This adapter implements a provider interface. When DeepGuard is not installed
or configured, all methods return clear UNAVAILABLE status rather than
fabricated results.
"""

import io
import logging
import os
from typing import Any

logger = logging.getLogger("document-ai.deepguard")


class DeepGuardAdapter:
    def __init__(self):
        self._available = False
        self._deepguard = None

        deepguard_path = os.getenv("DEEPGUARD_MODEL_PATH", "")
        if not deepguard_path:
            logger.info(
                "DeepGuard KYC not configured. Set DEEPGUARD_MODEL_PATH to enable. "
                "See: https://github.com/jordansoftware/DEEPGUARD-KYC"
            )
            return

        try:
            # DeepGuard integration point — import and initialize when available
            # from deepguard import DeepGuardKYC
            # self._deepguard = DeepGuardKYC(model_path=deepguard_path)
            # self._available = True
            logger.info(
                "DeepGuard adapter initialized in stub mode. "
                "Full integration requires DeepGuard KYC installation and model files."
            )
        except ImportError:
            logger.warning("DeepGuard KYC package not installed")
        except Exception as e:
            logger.error(f"DeepGuard initialization error: {e}")

    def full_analysis(self, file_bytes: bytes, filename: str) -> dict[str, Any]:
        """Run full DeepGuard KYC analysis on a government ID document."""
        if not self._available:
            return self._unavailable("DeepGuard KYC is not configured or installed")

        try:
            # When DeepGuard is available, this would call:
            # result = self._deepguard.analyze(file_bytes, document_type="government_id")
            # return self._normalize_result(result)
            return self._unavailable("DeepGuard integration requires model files")
        except Exception as e:
            logger.error(f"DeepGuard analysis error: {e}")
            return self._unavailable(str(e))

    def analyze_forensics(self, file_bytes: bytes, filename: str) -> dict[str, Any]:
        """Run document forensics analysis."""
        if not self._available:
            return {
                "tampering_detected": None,
                "confidence": None,
                "forensic_indicators": [],
                "provider": "DEEPGUARD",
                "status": "UNAVAILABLE",
                "error": "DeepGuard KYC not configured",
            }

        try:
            return {
                "tampering_detected": None,
                "confidence": None,
                "forensic_indicators": [],
                "provider": "DEEPGUARD",
                "status": "UNAVAILABLE",
                "error": "DeepGuard forensics requires model files",
            }
        except Exception as e:
            return {
                "tampering_detected": None,
                "confidence": None,
                "provider": "DEEPGUARD",
                "status": "UNAVAILABLE",
                "error": str(e),
            }

    def face_match(self, file_bytes: bytes) -> dict[str, Any]:
        """Extract and match face from document photo."""
        if not self._available:
            return {
                "face_detected": None,
                "face_similarity": None,
                "liveness_passed": None,
                "provider": "DEEPGUARD",
                "status": "UNAVAILABLE",
                "error": "DeepGuard KYC not configured",
            }

        try:
            return {
                "face_detected": None,
                "face_similarity": None,
                "liveness_passed": None,
                "provider": "DEEPGUARD",
                "status": "UNAVAILABLE",
                "error": "DeepGuard face matching requires model files",
            }
        except Exception as e:
            return {
                "face_detected": None,
                "face_similarity": None,
                "provider": "DEEPGUARD",
                "status": "UNAVAILABLE",
                "error": str(e),
            }

    def _unavailable(self, reason: str) -> dict[str, Any]:
        return {
            "confidence": None,
            "extracted_fields": {},
            "forensic_indicators": [],
            "face_detected": None,
            "liveness_passed": None,
            "provider": "DEEPGUARD",
            "status": "UNAVAILABLE",
            "error": reason,
        }
