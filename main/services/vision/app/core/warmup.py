import logging
import time
import numpy as np
from app.core.metrics import metrics
from app.core.model_loader import model_loader

logger = logging.getLogger("vision.warmup")


def run_warmup() -> None:
    """
    Executes a synthetic warm-up inference pass against the InsightFace pipeline
    so the first client verification or enrollment request does not suffer cold-start latency.
    Uses an in-memory synthetic numpy array (no disk image stored).
    """
    if not model_loader.is_loaded():
        logger.info("Model not yet ready for warm-up; skipping warm-up pass")
        return

    try:
        start = time.perf_counter()
        dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        # Run detection pass on dummy frame
        _ = model_loader.model.get(dummy_frame)
        duration_ms = (time.perf_counter() - start) * 1000.0
        metrics.set_warmup_duration(round(duration_ms, 2))
        logger.info(f"Vision model warm-up completed in {duration_ms:.2f}ms")
    except Exception as ex:
        logger.warning(f"Vision model warm-up failed: {ex}")

