import json
from pathlib import Path
from typing import Literal

DEFAULT_CALIBRATION_PATH = Path(__file__).resolve().parent.parent.parent / "calibration.json"


class CalibrationConfig:
    def __init__(self, path: Path = DEFAULT_CALIBRATION_PATH):
        self.path = path
        self.status: Literal["PROVISIONAL", "CALIBRATED"] = "PROVISIONAL"
        self.floor_raw: float = 0.20
        self.anchor_raw: float = 0.45
        self.ceiling_raw: float = 0.70
        self.notes: str = ""
        self.load()

    def load(self) -> None:
        if self.path.exists():
            with open(self.path, "r", encoding="utf-8") as f:
                data = json.load(f)
                self.status = data.get("status", "PROVISIONAL")
                self.floor_raw = float(data.get("floor_raw", 0.20))
                self.anchor_raw = float(data.get("anchor_raw", 0.45))
                self.ceiling_raw = float(data.get("ceiling_raw", 0.70))
                self.notes = str(data.get("notes", ""))

        if not (self.floor_raw < self.anchor_raw < self.ceiling_raw):
            raise ValueError(
                f"Invalid calibration anchors: must satisfy floor ({self.floor_raw}) "
                f"< anchor ({self.anchor_raw}) < ceiling ({self.ceiling_raw})"
            )

    def raw_to_pct(self, raw_cosine: float) -> float:
        """
        Piecewise-linear mapping of raw ArcFace cosine similarity to calibrated percentage.
        - Monotonic and clamped to [0.0, 100.0].
        - raw <= floor_raw maps to 0.0.
        - raw == anchor_raw maps to exactly 75.0.
        - raw >= ceiling_raw maps to 100.0.
        """
        if raw_cosine <= self.floor_raw:
            return 0.0
        elif raw_cosine < self.anchor_raw:
            ratio = (raw_cosine - self.floor_raw) / (self.anchor_raw - self.floor_raw)
            val = ratio * 75.0
            return float(min(max(val, 0.0), 75.0))
        elif raw_cosine == self.anchor_raw:
            return 75.0
        elif raw_cosine < self.ceiling_raw:
            ratio = (raw_cosine - self.anchor_raw) / (self.ceiling_raw - self.anchor_raw)
            val = 75.0 + ratio * 25.0
            return float(min(max(val, 75.0), 100.0))
        else:
            return 100.0


calibration = CalibrationConfig()

