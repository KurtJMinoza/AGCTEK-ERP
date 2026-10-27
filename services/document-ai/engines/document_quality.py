"""
Document quality analysis using OpenCV.

Evaluates:
- Blur detection (Laplacian variance)
- Lighting (brightness histogram analysis)
- Glare detection (overexposed regions)
- Resolution adequacy
- Document boundary detection
"""

import io
import logging

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger("document-ai.quality")


class DocumentQualityEngine:
    # Configurable thresholds
    BLUR_THRESHOLD = 100.0
    MIN_BRIGHTNESS = 40
    MAX_BRIGHTNESS = 220
    GLARE_PERCENT_THRESHOLD = 5.0
    MIN_RESOLUTION = 640

    def analyze(self, file_bytes: bytes) -> dict:
        """Analyze document image quality and return metrics."""
        try:
            img_array = np.frombuffer(file_bytes, np.uint8)
            img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            if img is None:
                return self._failed("Could not decode image")

            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            h, w = gray.shape

            blur_score = self._detect_blur(gray)
            brightness = self._analyze_brightness(gray)
            glare_percent = self._detect_glare(gray)
            resolution_ok = min(h, w) >= self.MIN_RESOLUTION
            boundary = self._detect_boundary(img)

            blur_status = "PASSED" if blur_score >= self.BLUR_THRESHOLD else "FAILED"
            lighting_status = "PASSED" if self.MIN_BRIGHTNESS <= brightness <= self.MAX_BRIGHTNESS else "FAILED"
            glare_status = "PASSED" if glare_percent < self.GLARE_PERCENT_THRESHOLD else "FAILED"
            resolution_status = "PASSED" if resolution_ok else "FAILED"

            statuses = [blur_status, lighting_status, glare_status, resolution_status]
            failed_count = statuses.count("FAILED")
            overall = 1.0 - (failed_count * 0.25)

            return {
                "blur": blur_status,
                "blur_score": round(blur_score, 2),
                "lighting": lighting_status,
                "brightness": round(brightness, 2),
                "glare": glare_status,
                "glare_percent": round(glare_percent, 2),
                "resolution": resolution_status,
                "width": w,
                "height": h,
                "boundary_detected": boundary,
                "overall_score": round(max(overall, 0), 4),
            }
        except Exception as e:
            logger.error(f"Quality analysis error: {e}")
            return self._failed(str(e))

    def _detect_blur(self, gray: np.ndarray) -> float:
        """Laplacian variance — lower = blurrier."""
        return float(cv2.Laplacian(gray, cv2.CV_64F).var())

    def _analyze_brightness(self, gray: np.ndarray) -> float:
        """Mean pixel brightness (0-255)."""
        return float(np.mean(gray))

    def _detect_glare(self, gray: np.ndarray) -> float:
        """Percentage of overexposed pixels (>250 intensity)."""
        total = gray.size
        glare_pixels = np.sum(gray > 250)
        return float(glare_pixels / total * 100)

    def _detect_boundary(self, img: np.ndarray) -> bool:
        """Detect if a rectangular document boundary is visible."""
        try:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)
            edges = cv2.Canny(blurred, 50, 150)
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            img_area = img.shape[0] * img.shape[1]
            for contour in contours:
                peri = cv2.arcLength(contour, True)
                approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
                area = cv2.contourArea(approx)
                if len(approx) == 4 and area > img_area * 0.1:
                    return True
            return False
        except Exception:
            return False

    def _failed(self, error: str) -> dict:
        return {
            "blur": "UNKNOWN",
            "lighting": "UNKNOWN",
            "glare": "UNKNOWN",
            "resolution": "UNKNOWN",
            "overall_score": 0,
            "error": error,
        }
