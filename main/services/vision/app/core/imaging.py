import io
import cv2
import numpy as np


class InvalidImageException(Exception):
    pass


def decode_image(
    raw_bytes: bytes,
    max_bytes: int = 2 * 1024 * 1024,
    max_dim: int = 4096,
) -> np.ndarray:
    """
    Decodes raw JPEG/PNG image bytes into a BGR numpy array.
    Enforces maximum payload size and pixel dimension limits.
    """
    if not raw_bytes:
        raise InvalidImageException("Empty image payload")

    if len(raw_bytes) > max_bytes:
        raise InvalidImageException(f"Image payload size ({len(raw_bytes)} bytes) exceeds limit ({max_bytes} bytes)")

    # Read image via OpenCV
    np_arr = np.frombuffer(raw_bytes, np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if image is None:
        raise InvalidImageException("Failed to decode image; corrupt or unsupported format")

    h, w = image.shape[:2]
    if h == 0 or w == 0:
        raise InvalidImageException("Decoded image has zero dimensions")

    if h > max_dim or w > max_dim:
        raise InvalidImageException(f"Image dimensions ({w}x{h}) exceed maximum allowed dimension ({max_dim}px)")

    return image

