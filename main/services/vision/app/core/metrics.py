import threading
import time
from collections import deque
from typing import Dict, List, Optional


class VisionMetrics:
    def __init__(self, max_samples: int = 100):
        self._lock = threading.Lock()
        self._start_time: float = time.time()
        self._latencies: deque[float] = deque(maxlen=max_samples)
        self.total_requests: int = 0
        self.error_counts: Dict[str, int] = {}
        self.warmup_duration_ms: Optional[float] = None

    def record_request(self) -> None:
        with self._lock:
            self.total_requests += 1

    def record_latency(self, latency_ms: float) -> None:
        with self._lock:
            self._latencies.append(latency_ms)

    def record_error(self, error_code: str) -> None:
        with self._lock:
            self.error_counts[error_code] = self.error_counts.get(error_code, 0) + 1

    def set_warmup_duration(self, ms: float) -> None:
        with self._lock:
            self.warmup_duration_ms = ms

    @property
    def uptime_seconds(self) -> float:
        return time.time() - self._start_time

    def get_latency_stats(self) -> Dict[str, float]:
        with self._lock:
            samples: List[float] = list(self._latencies)

        if not samples:
            return {"p50Ms": 0.0, "p95Ms": 0.0, "sampleCount": 0}

        sorted_samples = sorted(samples)
        n = len(sorted_samples)

        def percentile(p: float) -> float:
            k = (n - 1) * p
            f = int(k)
            c = min(f + 1, n - 1)
            d0 = sorted_samples[f] * (c - k)
            d1 = sorted_samples[c] * (k - f)
            return round(d0 + d1, 2)

        return {
            "p50Ms": percentile(0.50),
            "p95Ms": percentile(0.95),
            "sampleCount": n,
        }

    def get_error_counts(self) -> Dict[str, int]:
        with self._lock:
            return dict(self.error_counts)


metrics = VisionMetrics()

