"""
Handwritten signature extraction and comparison engine.

Architecture:
1. Detect signature region in document using contour analysis
2. Extract and normalize the signature image
3. Compare against reference using a Siamese-style embedding model
4. Return similarity score with calibration information

When the pretrained model is unavailable, falls back to structural
similarity (SSIM) with a clear indicator that the model-based comparison
was not used.
"""

import io
import logging
from typing import Any

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger("document-ai.signature")


class SignatureEngine:
    def __init__(self):
        self._model = None
        self._model_version = "structural_similarity_v1"
        self._use_neural = False

        try:
            self._load_neural_model()
        except Exception as e:
            logger.warning(f"Neural signature model not available, using SSIM fallback: {e}")

    def _load_neural_model(self):
        """Attempt to load a pretrained Siamese signature verification model."""
        import torch

        model_path = "models/signature_siamese.pt"
        try:
            import os
            if os.path.exists(model_path):
                self._model = torch.jit.load(model_path, map_location="cpu")
                self._model.eval()
                self._model_version = "siamese_v1"
                self._use_neural = True
                logger.info("Neural signature model loaded")
            else:
                logger.info(f"No model at {model_path}; using SSIM fallback")
        except Exception as e:
            logger.warning(f"Failed to load signature model: {e}")

    def compare_handwritten(
        self,
        document_bytes: bytes,
        reference_bytes: bytes | None,
    ) -> dict[str, Any]:
        """Extract signature from document and compare against reference."""
        try:
            doc_img = self._decode_image(document_bytes)
            if doc_img is None:
                return {"signature_detected": False, "error": "Could not decode document image"}

            signature_region = self._extract_signature(doc_img)
            if signature_region is None:
                return {
                    "signature_detected": False,
                    "similarity": None,
                    "engine_version": self._model_version,
                }

            if reference_bytes is None:
                return {
                    "signature_detected": True,
                    "similarity": None,
                    "engine_version": self._model_version,
                    "note": "No reference signature provided for comparison",
                }

            ref_img = self._decode_image(reference_bytes)
            if ref_img is None:
                return {
                    "signature_detected": True,
                    "similarity": None,
                    "error": "Could not decode reference signature",
                    "engine_version": self._model_version,
                }

            ref_signature = self._preprocess_signature(ref_img)
            doc_signature = self._preprocess_signature(signature_region)

            if self._use_neural and self._model is not None:
                similarity = self._neural_compare(doc_signature, ref_signature)
            else:
                similarity = self._ssim_compare(doc_signature, ref_signature)

            return {
                "signature_detected": True,
                "similarity": round(float(similarity), 4),
                "engine_version": self._model_version,
                "comparison_method": "neural" if self._use_neural else "ssim",
            }
        except Exception as e:
            logger.error(f"Signature comparison error: {e}")
            return {"signature_detected": False, "error": str(e)}

    def _decode_image(self, image_bytes: bytes) -> np.ndarray | None:
        """Decode image bytes to OpenCV array."""
        try:
            arr = np.frombuffer(image_bytes, np.uint8)
            return cv2.imdecode(arr, cv2.IMREAD_COLOR)
        except Exception:
            return None

    def _extract_signature(self, img: np.ndarray) -> np.ndarray | None:
        """Detect and extract the signature region from a document image."""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape

        # Focus on the lower portion of the document where signatures typically appear
        roi_top = int(h * 0.5)
        roi = gray[roi_top:, :]

        blurred = cv2.GaussianBlur(roi, (5, 5), 0)
        _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (30, 5))
        dilated = cv2.dilate(thresh, kernel, iterations=3)

        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        best_contour = None
        best_area = 0

        for contour in contours:
            x, y, cw, ch = cv2.boundingRect(contour)
            area = cw * ch
            aspect_ratio = cw / max(ch, 1)

            if (area > 2000
                and aspect_ratio > 1.5
                and aspect_ratio < 10
                and cw > w * 0.1
                and ch > 15):
                if area > best_area:
                    best_area = area
                    best_contour = (x, y + roi_top, cw, ch)

        if best_contour is None:
            return None

        x, y, cw, ch = best_contour
        pad = 10
        x1 = max(0, x - pad)
        y1 = max(0, y - pad)
        x2 = min(w, x + cw + pad)
        y2 = min(h, y + ch + pad)

        return img[y1:y2, x1:x2]

    def _preprocess_signature(self, sig_img: np.ndarray) -> np.ndarray:
        """Normalize signature image for comparison."""
        gray = cv2.cvtColor(sig_img, cv2.COLOR_BGR2GRAY) if len(sig_img.shape) == 3 else sig_img
        resized = cv2.resize(gray, (256, 128))
        _, binary = cv2.threshold(resized, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        return binary

    def _ssim_compare(self, img1: np.ndarray, img2: np.ndarray) -> float:
        """Structural Similarity Index between two preprocessed signature images."""
        try:
            from skimage.metrics import structural_similarity
            score, _ = structural_similarity(img1, img2, full=True)
            return max(0.0, min(1.0, score))
        except ImportError:
            return self._simple_correlation(img1, img2)

    def _simple_correlation(self, img1: np.ndarray, img2: np.ndarray) -> float:
        """Fallback: normalized cross-correlation."""
        f1 = img1.astype(np.float64).flatten()
        f2 = img2.astype(np.float64).flatten()
        f1 = f1 - f1.mean()
        f2 = f2 - f2.mean()
        denom = np.linalg.norm(f1) * np.linalg.norm(f2)
        if denom == 0:
            return 0.0
        return float(np.dot(f1, f2) / denom)

    def _neural_compare(self, img1: np.ndarray, img2: np.ndarray) -> float:
        """Compare signatures using the Siamese neural network."""
        import torch

        t1 = torch.from_numpy(img1).unsqueeze(0).unsqueeze(0).float() / 255.0
        t2 = torch.from_numpy(img2).unsqueeze(0).unsqueeze(0).float() / 255.0

        with torch.no_grad():
            emb1 = self._model(t1)  # type: ignore
            emb2 = self._model(t2)  # type: ignore

        cos_sim = torch.nn.functional.cosine_similarity(emb1, emb2)
        return max(0.0, min(1.0, float(cos_sim.item())))
