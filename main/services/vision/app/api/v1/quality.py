import asyncio
import time
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from app.api.deps import verify_internal_key
from app.core.concurrency import concurrency_manager
from app.core.detector import ModelUnavailableException, detect_and_measure
from app.core.limits import validate_and_decode_image
from app.core.metrics import metrics
from app.schemas import QualityResponse

router = APIRouter(tags=["Vision Quality"])


@router.post("/v1/quality", response_model=QualityResponse)
async def check_quality(
    response: Response,
    image: UploadFile = File(...),
    angle: Optional[str] = Form(None),
    _auth: str = Depends(verify_internal_key),
) -> QualityResponse:
    t_start = time.perf_counter()
    metrics.record_request()

    async with concurrency_manager.acquire():
        raw_bytes = await image.read()
        bgr_img = validate_and_decode_image(raw_bytes)

        try:
            faces_json, quality_metrics, reasons, _, duration_ms = await asyncio.to_thread(
                detect_and_measure, bgr_img, angle
            )
        except ModelUnavailableException as mue:
            metrics.record_error("MODEL_UNAVAILABLE")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "MODEL_UNAVAILABLE", "message": str(mue)},
            )
        except Exception as ex:
            metrics.record_error("INTERNAL_ERROR")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"code": "INTERNAL_ERROR", "message": f"Detection error: {ex}"},
            )

        total_duration_ms = round((time.perf_counter() - t_start) * 1000.0, 2)
        metrics.record_latency(total_duration_ms)

        h, w = bgr_img.shape[:2]
        return QualityResponse(
            faceCount=len(faces_json),
            faces=faces_json,
            quality=quality_metrics,
            reasons=reasons,
            ms=total_duration_ms,
            frameWidth=w,
            frameHeight=h,
        )
