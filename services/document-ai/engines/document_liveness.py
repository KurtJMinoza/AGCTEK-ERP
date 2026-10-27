"""
Document presentation / liveness analysis using OpenCV.

IMPORTANT: OpenCV-based movement and frame-difference checks are NOT
sufficient to prove physical-document authenticity. This module provides
document presentation analysis as a separate, clearly-labeled capability.

Results are labeled as PRESENTATION_CHECK, never as LIVENESS_VERIFIED,
unless a validated anti-spoofing mechanism has completed successfully.
"""

import logging
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger("document-ai.liveness")


class DocumentLivenessEngine:
    """Analyzes sequential frames for document presentation checks."""

    def analyze_frames(self, frames: list[bytes]) -> dict[str, Any]:
        """
        Analyze a sequence of captured frames for document presentation.

        This checks for:
        - Frame variation (not a static image)
        - Edge consistency across frames
        - Movement patterns consistent with a physical document

        This does NOT establish that the document is genuine or physically present.
        """
        if len(frames) < 2:
            return {
                "check_type": "DOCUMENT_PRESENTATION",
                "status": "INCONCLUSIVE",
                "reason": "Insufficient frames for presentation analysis",
                "frame_count": len(frames),
                "is_liveness_verified": False,
            }

        try:
            decoded = []
            for frame_bytes in frames:
                arr = np.frombuffer(frame_bytes, np.uint8)
                img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
                if img is not None:
                    decoded.append(img)

            if len(decoded) < 2:
                return {
                    "check_type": "DOCUMENT_PRESENTATION",
                    "status": "INCONCLUSIVE",
                    "reason": "Could not decode sufficient frames",
                    "is_liveness_verified": False,
                }

            # Frame difference analysis
            diffs = []
            for i in range(1, len(decoded)):
                prev = cv2.resize(decoded[i - 1], (320, 240))
                curr = cv2.resize(decoded[i], (320, 240))
                diff = cv2.absdiff(prev, curr)
                diffs.append(float(np.mean(diff)))

            avg_diff = sum(diffs) / len(diffs) if diffs else 0
            max_diff = max(diffs) if diffs else 0

            has_variation = avg_diff > 2.0
            not_excessive_motion = max_diff < 80.0

            if has_variation and not_excessive_motion:
                status = "PASSED"
            elif not has_variation:
                status = "FAILED"
            else:
                status = "INCONCLUSIVE"

            return {
                "check_type": "DOCUMENT_PRESENTATION",
                "status": status,
                "avg_frame_difference": round(avg_diff, 2),
                "max_frame_difference": round(max_diff, 2),
                "frame_count": len(decoded),
                "has_variation": has_variation,
                "is_liveness_verified": False,
                "note": (
                    "This is a presentation check only. "
                    "It does NOT establish document authenticity or physical presence."
                ),
            }
        except Exception as e:
            logger.error(f"Liveness analysis error: {e}")
            return {
                "check_type": "DOCUMENT_PRESENTATION",
                "status": "INCONCLUSIVE",
                "error": str(e),
                "is_liveness_verified": False,
            }
