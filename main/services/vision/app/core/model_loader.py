import os
import sys
import threading
from typing import Dict, List, Literal, Optional
from app.config import settings

ModelState = Literal[
    "NOT_INSTALLED",
    "NOT_FOUND",
    "DOWNLOADING_DISABLED",
    "LOADING",
    "READY",
    "FAILED",
]


class ModelLoader:
    def __init__(self):
        self.state: ModelState = "NOT_FOUND"
        self.model = None
        self.last_error: Optional[str] = None
        self.model_name = "buffalo_l"
        self.model_version = "1.0"
        self._lock = threading.Lock()
        self.in_flight: int = 0
        self.concurrency_limit: int = settings.VISION_MAX_CONCURRENCY

    def check_model_path_present(self) -> bool:
        model_dir = os.path.abspath(settings.VISION_MODEL_DIR)
        if not os.path.isdir(model_dir):
            return False
        # Look for buffalo_l folder or onnx files in the model dir
        buffalo_dir = os.path.join(model_dir, "models", "buffalo_l")
        alt_buffalo_dir = os.path.join(model_dir, "buffalo_l")
        if os.path.isdir(buffalo_dir) or os.path.isdir(alt_buffalo_dir):
            return True
        # Check if direct onnx files exist
        entries = os.listdir(model_dir)
        return any(e.endswith(".onnx") or "buffalo" in e.lower() for e in entries)

    def load_model(self) -> None:
        with self._lock:
            if self.state in ("LOADING", "READY"):
                return
            self.state = "LOADING"
            self.last_error = None

        try:
            try:
                import insightface  # noqa: F401
                from insightface.app import FaceAnalysis
            except ImportError as ie:
                with self._lock:
                    self.state = "NOT_INSTALLED"
                    self.last_error = f"insightface library is not installed: {ie}"
                return

            try:
                import onnxruntime  # noqa: F401
            except ImportError as oe:
                with self._lock:
                    self.state = "NOT_INSTALLED"
                    self.last_error = f"onnxruntime library is not installed: {oe}"
                return

            model_dir = os.path.abspath(settings.VISION_MODEL_DIR)
            os.makedirs(model_dir, exist_ok=True)
            path_present = self.check_model_path_present()

            if not path_present and not settings.VISION_ALLOW_MODEL_DOWNLOAD:
                with self._lock:
                    self.state = "DOWNLOADING_DISABLED"
                    self.last_error = (
                        f"buffalo_l pack was not found in {model_dir} and "
                        "VISION_ALLOW_MODEL_DOWNLOAD is false."
                    )
                return

            # Initialize FaceAnalysis with CPUExecutionProvider
            os.environ["OMP_NUM_THREADS"] = str(settings.VISION_ORT_THREADS)
            os.environ["OPENBLAS_NUM_THREADS"] = str(settings.VISION_ORT_THREADS)
            os.environ["MKL_NUM_THREADS"] = str(settings.VISION_ORT_THREADS)

            app = FaceAnalysis(
                name=self.model_name,
                root=model_dir,
                providers=["CPUExecutionProvider"],
            )
            app.prepare(ctx_id=-1, det_size=(640, 640))

            with self._lock:
                self.model = app
                self.state = "READY"
                self.last_error = None

            try:
                from app.core.warmup import run_warmup
                run_warmup()
            except Exception as w_err:
                pass
        except Exception as ex:
            with self._lock:
                self.state = "FAILED"
                self.last_error = f"Failed to initialize FaceAnalysis: {type(ex).__name__}: {ex}"

    def is_loaded(self) -> bool:
        return self.state == "READY" and self.model is not None

    def get_versions(self) -> Dict[str, Optional[str]]:
        versions: Dict[str, Optional[str]] = {
            "python": sys.version.split()[0],
            "fastapi": None,
            "onnxruntime": None,
            "insightface": None,
            "opencv": None,
            "mediapipe": None,
            "numpy": None,
        }

        try:
            import fastapi

            versions["fastapi"] = fastapi.__version__
        except Exception:
            versions["fastapi"] = None

        try:
            import onnxruntime

            versions["onnxruntime"] = onnxruntime.__version__
        except Exception:
            versions["onnxruntime"] = None

        try:
            import insightface

            versions["insightface"] = insightface.__version__
        except Exception:
            versions["insightface"] = None

        try:
            import cv2

            versions["opencv"] = cv2.__version__
        except Exception:
            versions["opencv"] = None

        try:
            import mediapipe

            versions["mediapipe"] = mediapipe.__version__
        except Exception:
            versions["mediapipe"] = None

        try:
            import numpy

            versions["numpy"] = numpy.__version__
        except Exception:
            versions["numpy"] = None

        return versions

    def get_execution_providers(self) -> List[str]:
        try:
            import onnxruntime

            return onnxruntime.get_available_providers()
        except Exception:
            return []


model_loader = ModelLoader()

