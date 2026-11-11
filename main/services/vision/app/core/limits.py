import cv2
import numpy as np
from fastapi import HTTPException, status
from app.config import settings
from app.core.metrics import metrics


def validate_and_decode_image(image_bytes: bytes) -> np.ndarray:
    """
    Validates payload size, decodes image bytes, and enforces pixel count / edge dimension guards
    to prevent decompression bomb attacks and out-of-memory errors.
    """
    if not image_bytes or len(image_bytes) == 0:
        metrics.record_error("INVALID_IMAGE")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_IMAGE", "message": "Image file is empty"},
        )

    if len(image_bytes) > settings.VISION_MAX_UPLOAD_BYTES:
        metrics.record_error("INVALID_IMAGE")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_IMAGE",
                "message": f"Image file exceeds maximum upload size of {settings.VISION_MAX_UPLOAD_BYTES} bytes",
            },
        )

    # Decode image from buffer
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        metrics.record_error("INVALID_IMAGE")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_IMAGE", "message": "Failed to decode image from provided bytes"},
        )

    height, width = image.shape[:2]
    total_pixels = height * width

    if height > settings.VISION_MAX_IMAGE_EDGE or width > settings.VISION_MAX_IMAGE_EDGE:
        metrics.record_error("INVALID_IMAGE")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_IMAGE",
                "message": (
                    f"Image dimension ({width}x{height}) exceeds maximum allowed edge of "
                    f"{settings.VISION_MAX_IMAGE_EDGE}px"
                ),
            },
        )

    if total_pixels > settings.VISION_MAX_IMAGE_PIXELS:
        metrics.record_error("INVALID_IMAGE")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_IMAGE",
                "message": (
                    f"Image total pixel count ({total_pixels}) exceeds maximum safe limit of "
                    f"{settings.VISION_MAX_IMAGE_PIXELS} pixels (decompression bomb protection)"
                ),
            },
        )

    return image

