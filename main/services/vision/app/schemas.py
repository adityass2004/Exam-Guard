from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["OK", "DEGRADED"]
    modelLoaded: bool


class ConcurrencyInfo(BaseModel):
    inFlight: int
    limit: int


class LatencyStats(BaseModel):
    p50Ms: float
    p95Ms: float
    sampleCount: int


class DiagnosticsResponse(BaseModel):
    versions: Dict[str, Optional[str]]
    executionProviders: List[str]
    modelName: Optional[str]
    modelVersion: Optional[str]
    modelState: Literal[
        "NOT_INSTALLED",
        "NOT_FOUND",
        "DOWNLOADING_DISABLED",
        "LOADING",
        "READY",
        "FAILED",
    ]
    modelPathPresent: bool
    calibrationStatus: Literal["PROVISIONAL", "CALIBRATED"]
    concurrency: ConcurrencyInfo
    lastError: Optional[str]
    poseSource: Optional[str] = "insightface_3d_68"
    mediapipeAvailable: bool = False
    totalRequests: int = 0
    errorCounts: Dict[str, int] = Field(default_factory=dict)
    latency: LatencyStats = Field(default_factory=lambda: LatencyStats(p50Ms=0.0, p95Ms=0.0, sampleCount=0))
    uptimeSeconds: float = 0.0
    warmupDurationMs: Optional[float] = None


class FaceDetection(BaseModel):
    box: List[float]  # [x1, y1, x2, y2]
    detScore: float
    yaw: Optional[float] = None
    pitch: Optional[float] = None
    roll: Optional[float] = None
    poseSource: Optional[str] = None


class QualityMetrics(BaseModel):
    blur: float
    brightness: float
    faceSizeRatio: float
    faceInFrame: bool
    poseOk: bool
    underExposureFraction: float = 0.0
    overExposureFraction: float = 0.0


class QualityResponse(BaseModel):
    faceCount: int
    faces: List[FaceDetection]
    quality: QualityMetrics
    reasons: List[str]
    ms: float


class EmbedResponse(BaseModel):
    faceCount: int
    faces: List[FaceDetection]
    quality: QualityMetrics
    reasons: List[str]
    ms: float
    embedding: Optional[str] = None
    modelName: Optional[str] = None
    modelVersion: Optional[str] = None
    dim: Optional[int] = None


class VerifyResponse(BaseModel):
    faceCount: int
    faces: List[FaceDetection]
    quality: QualityMetrics
    similarityRaw: Optional[float] = None
    similarityPct: Optional[float] = None
    perSample: Optional[List[float]] = None
    modelName: Optional[str] = None
    modelVersion: Optional[str] = None
    calibrationStatus: Literal["PROVISIONAL", "CALIBRATED"] = "PROVISIONAL"
    ms: float


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[Any] = None


class ErrorEnvelope(BaseModel):
    error: ErrorDetail
