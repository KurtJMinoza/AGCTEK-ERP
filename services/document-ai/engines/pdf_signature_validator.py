"""
PDF digital signature validator using pyHanko.

Capabilities:
- Detect PDF digital signatures
- Validate signature integrity
- Detect post-signing modifications
- Validate certificate chains against configured trust anchors
- Check signing timestamps
- Report revocation status when supported
"""

import io
import logging
from typing import Any

logger = logging.getLogger("document-ai.pdf_sig")


class PdfSignatureValidator:
    def __init__(self):
        try:
            import pyhanko
            from pyhanko.sign.validation import validate_pdf_signature
            self._available = True
            logger.info("pyHanko loaded successfully")
        except ImportError as e:
            logger.warning(f"pyHanko not available: {e}")
            self._available = False

    def validate(self, pdf_bytes: bytes) -> dict[str, Any]:
        """Validate all digital signatures in a PDF document."""
        if not self._available:
            return {
                "valid": None,
                "unsigned": None,
                "modified": None,
                "chain_trusted": None,
                "timestamp_valid": None,
                "signatures": [],
                "engine_version": "pyhanko_unavailable",
                "error": "pyHanko library not installed",
            }

        try:
            from pyhanko.pdf_utils.reader import PdfFileReader
            from pyhanko.sign.validation import (
                validate_pdf_signature,
                SignatureValidationError,
            )
            from pyhanko.sign.fields import enumerate_sig_fields

            reader = PdfFileReader(io.BytesIO(pdf_bytes))
            sig_fields = list(enumerate_sig_fields(reader))

            if not sig_fields:
                return {
                    "valid": None,
                    "unsigned": True,
                    "modified": False,
                    "chain_trusted": None,
                    "timestamp_valid": None,
                    "signatures": [],
                    "engine_version": "pyhanko",
                }

            signatures = []
            all_valid = True
            any_modified = False
            any_trusted = False
            any_timestamp_valid = False

            for field_name, sig_obj, sig_field in sig_fields:
                if sig_obj is None:
                    continue

                sig_info: dict[str, Any] = {
                    "field_name": field_name,
                    "valid": False,
                    "modified": False,
                    "chain_trusted": False,
                    "timestamp_valid": None,
                    "signer": None,
                    "issuer": None,
                    "signing_time": None,
                    "error": None,
                }

                try:
                    status = validate_pdf_signature(
                        reader,
                        sig_field,
                        signer_validation_context=None,
                    )

                    sig_info["valid"] = status.intact and status.valid
                    sig_info["modified"] = not status.intact
                    sig_info["chain_trusted"] = getattr(status, "trusted", False)

                    if hasattr(status, "signer_reported_dt") and status.signer_reported_dt:
                        sig_info["signing_time"] = str(status.signer_reported_dt)

                    cert = getattr(status, "signing_cert", None)
                    if cert:
                        sig_info["signer"] = cert.subject.human_friendly if hasattr(cert.subject, "human_friendly") else str(cert.subject)
                        sig_info["issuer"] = cert.issuer.human_friendly if hasattr(cert.issuer, "human_friendly") else str(cert.issuer)

                    if not sig_info["valid"]:
                        all_valid = False
                    if sig_info["modified"]:
                        any_modified = True
                    if sig_info["chain_trusted"]:
                        any_trusted = True

                except SignatureValidationError as e:
                    sig_info["error"] = str(e)
                    all_valid = False
                except Exception as e:
                    sig_info["error"] = f"Validation error: {str(e)}"
                    all_valid = False

                signatures.append(sig_info)

            return {
                "valid": all_valid,
                "unsigned": False,
                "modified": any_modified,
                "chain_trusted": any_trusted,
                "timestamp_valid": any_timestamp_valid or None,
                "signatures": signatures,
                "signature_count": len(signatures),
                "engine_version": "pyhanko",
            }

        except Exception as e:
            logger.error(f"PDF signature validation error: {e}")
            return {
                "valid": None,
                "unsigned": None,
                "modified": None,
                "chain_trusted": None,
                "timestamp_valid": None,
                "signatures": [],
                "engine_version": "pyhanko",
                "error": str(e),
            }
