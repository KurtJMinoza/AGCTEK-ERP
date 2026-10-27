"""
PaddleOCR engine for document text extraction and classification.

Uses PaddleOCR for:
- Text detection and recognition
- Document orientation correction
- Layout analysis
- Structured field extraction
- Document type classification via text pattern matching
"""

import io
import re
import logging
from typing import Any

import numpy as np
from PIL import Image

logger = logging.getLogger("document-ai.paddleocr")


class PaddleOcrEngine:
    def __init__(self):
        from paddleocr import PaddleOCR

        self._ocr = PaddleOCR(
            use_angle_cls=True,
            lang="en",
            show_log=False,
            use_gpu=False,
        )
        logger.info("PaddleOCR model loaded")

    def extract(self, file_bytes: bytes, filename: str) -> dict[str, Any]:
        """Extract text and structured fields from a document image or PDF."""
        try:
            image = self._load_image(file_bytes, filename)
            if image is None:
                return {"confidence": 0, "extracted_fields": {}, "raw_text": "", "error": "Could not load image"}

            result = self._ocr.ocr(image, cls=True)
            if not result or not result[0]:
                return {"confidence": 0, "extracted_fields": {}, "raw_text": ""}

            lines = []
            confidences = []
            for line in result[0]:
                text = line[1][0]
                conf = line[1][1]
                lines.append(text)
                confidences.append(conf)

            raw_text = "\n".join(lines)
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0

            extracted_fields = self._extract_fields(raw_text)

            return {
                "confidence": round(avg_confidence, 4),
                "extracted_fields": extracted_fields,
                "raw_text": raw_text,
                "line_count": len(lines),
            }
        except Exception as e:
            logger.error(f"OCR extraction error: {e}")
            return {"confidence": 0, "extracted_fields": {}, "raw_text": "", "error": str(e)}

    def classify(self, file_bytes: bytes, filename: str) -> dict[str, Any]:
        """Classify document type based on extracted text patterns."""
        try:
            extracted = self.extract(file_bytes, filename)
            raw_text = extracted.get("raw_text", "").upper()

            doc_type, confidence = self._classify_text(raw_text)

            return {
                "document_type": doc_type,
                "confidence": confidence,
            }
        except Exception as e:
            logger.error(f"Classification error: {e}")
            return {"document_type": None, "confidence": 0, "error": str(e)}

    def _load_image(self, file_bytes: bytes, filename: str) -> np.ndarray | None:
        """Load image from bytes, handling JPEG, PNG, and single-page PDF."""
        try:
            if filename.lower().endswith(".pdf") or file_bytes[:4] == b"%PDF":
                return self._pdf_first_page(file_bytes)
            img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
            return np.array(img)
        except Exception as e:
            logger.error(f"Image load error: {e}")
            return None

    def _pdf_first_page(self, file_bytes: bytes) -> np.ndarray | None:
        """Render first page of PDF to image for OCR."""
        try:
            import fitz  # PyMuPDF

            doc = fitz.open(stream=file_bytes, filetype="pdf")
            if len(doc) == 0:
                return None
            page = doc[0]
            pix = page.get_pixmap(dpi=300)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            return np.array(img)
        except ImportError:
            logger.warning("PyMuPDF not installed; PDF OCR unavailable")
            return None
        except Exception as e:
            logger.error(f"PDF rendering error: {e}")
            return None

    def _extract_fields(self, raw_text: str) -> dict[str, str | None]:
        """Extract common document fields from raw OCR text using patterns."""
        fields: dict[str, str | None] = {}
        text = raw_text.upper()

        # Full name patterns
        name_patterns = [
            r"(?:NAME|PANGALAN|FULL\s*NAME)\s*[:\-]?\s*(.+)",
            r"(?:LAST\s*NAME|APELYIDO)\s*[:\-]?\s*(.+)",
        ]
        for p in name_patterns:
            m = re.search(p, text)
            if m:
                fields["fullName"] = m.group(1).strip().title()
                break

        # Date of birth
        dob_patterns = [
            r"(?:DATE\s*OF\s*BIRTH|BIRTHDAY|PETSA\s*NG\s*KAPANGANAKAN|DOB)\s*[:\-]?\s*([\d/\-\.]+)",
            r"(\d{2}[/\-\.]\d{2}[/\-\.]\d{4})",
        ]
        for p in dob_patterns:
            m = re.search(p, text)
            if m:
                fields["birthdate"] = m.group(1).strip()
                break

        # Document number
        doc_num_patterns = [
            r"(?:ID\s*(?:NO|NUMBER)|DOCUMENT\s*NO|LICENSE\s*NO|CARD\s*NO)\s*[:\-]?\s*([\w\-]+)",
            r"(?:CRN|PCN|UMID\s*NO)\s*[:\-]?\s*([\w\-]+)",
        ]
        for p in doc_num_patterns:
            m = re.search(p, text)
            if m:
                fields["documentNumber"] = m.group(1).strip()
                break

        # Address
        addr_match = re.search(r"(?:ADDRESS|TIRAHAN)\s*[:\-]?\s*(.+)", text)
        if addr_match:
            fields["address"] = addr_match.group(1).strip().title()

        # Expiry date
        exp_match = re.search(r"(?:EXPIRY|EXPIRATION|VALID\s*(?:UNTIL|THRU))\s*[:\-]?\s*([\d/\-\.]+)", text)
        if exp_match:
            fields["expirationDate"] = exp_match.group(1).strip()

        # Issue date
        issue_match = re.search(r"(?:DATE\s*(?:OF\s*)?ISSUE|ISSUED)\s*[:\-]?\s*([\d/\-\.]+)", text)
        if issue_match:
            fields["issueDate"] = issue_match.group(1).strip()

        return fields

    def _classify_text(self, text: str) -> tuple[str | None, float]:
        """Classify document type from OCR text using keyword patterns."""
        classifications = [
            ("NATIONAL_ID", ["PHILIPPINE IDENTIFICATION", "PHILSYS", "PHIL ID", "NATIONAL ID"], 0.85),
            ("PASSPORT", ["PASSPORT", "PASAPORTE", "REPUBLIC OF THE PHILIPPINES"], 0.80),
            ("DRIVERS_LICENSE", ["DRIVER", "LICENSE", "LTO", "LAND TRANSPORTATION"], 0.82),
            ("UMID", ["UMID", "UNIFIED MULTI-PURPOSE"], 0.85),
            ("PRC_ID", ["PROFESSIONAL REGULATION", "PRC"], 0.80),
            ("POSTAL_ID", ["POSTAL", "PHILPOST"], 0.78),
            ("SSS_ID", ["SOCIAL SECURITY", "SSS"], 0.80),
            ("PSA_BIRTH_CERTIFICATE", ["CERTIFICATE OF LIVE BIRTH", "PSA", "BIRTH CERTIFICATE"], 0.82),
            ("PSA_MARRIAGE_CERTIFICATE", ["CERTIFICATE OF MARRIAGE", "MARRIAGE CERTIFICATE"], 0.82),
            ("SEC_REGISTRATION", ["SECURITIES AND EXCHANGE", "SEC REGISTRATION"], 0.80),
            ("DTI_REGISTRATION", ["DEPARTMENT OF TRADE", "DTI", "BUSINESS NAME REGISTRATION"], 0.80),
            ("BIR_CERTIFICATE", ["BUREAU OF INTERNAL REVENUE", "BIR", "TIN"], 0.78),
            ("BUSINESS_PERMIT", ["BUSINESS PERMIT", "MAYOR'S PERMIT"], 0.75),
        ]

        best_type = None
        best_score = 0.0

        for doc_type, keywords, base_confidence in classifications:
            matches = sum(1 for kw in keywords if kw in text)
            if matches > 0:
                score = base_confidence * min(matches / len(keywords) + 0.5, 1.0)
                if score > best_score:
                    best_score = score
                    best_type = doc_type

        return best_type, round(best_score, 4)
