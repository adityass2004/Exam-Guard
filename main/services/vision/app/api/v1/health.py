from fastapi import APIRouter, Depends
from app.api.deps import verify_internal_key
from app.core.metrics import metrics
from app.core.model_loader import model_loader
from app.schemas import ConcurrencyInfo, DiagnosticsResponse, HealthResponse, LatencyStats

router = APIRouter(tags=["Health & Diagnostics"])


@router.get("/v1/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    loaded = model_loader.is_loaded()
    return HealthResponse(
        status="OK" if loaded else "DEGRADED",
        modelLoaded=loaded,
    )


@router.get("/v1/diagnostics", response_model=DiagnosticsResponse)
def get_diagnostics(_auth: str = Depends(verify_internal_key)) -> DiagnosticsResponse:
    versions = model_loader.get_versions()
    mediapipe_ok = versions.get("mediapipe") is not None
    latency_data = metrics.get_latency_stats()
    return DiagnosticsResponse(
        versions=versions,
        executionProviders=model_loader.get_execution_providers(),
        modelName=model_loader.model_name,
        modelVersion=model_loader.model_version,
        modelState=model_loader.state,
        modelPathPresent=model_loader.check_model_path_present(),
        calibrationStatus="PROVISIONAL",
        concurrency=ConcurrencyInfo(
            inFlight=model_loader.in_flight,
            limit=model_loader.concurrency_limit,
        ),
        lastError=model_loader.last_error,
        poseSource="insightface_3d_68",
        mediapipeAvailable=mediapipe_ok,
        totalRequests=metrics.total_requests,
        errorCounts=metrics.get_error_counts(),
        latency=LatencyStats(
            p50Ms=latency_data["p50Ms"],
            p95Ms=latency_data["p95Ms"],
            sampleCount=int(latency_data["sampleCount"]),
        ),
        uptimeSeconds=round(metrics.uptime_seconds, 2),
        warmupDurationMs=metrics.warmup_duration_ms,
    )

