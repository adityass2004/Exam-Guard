import asyncio
import time
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from app.api.deps import verify_internal_key
from app.core.concurrency import concurrency_manager
from app.core.detector import ModelUnavailableException, detect_and_measure
from app.core.embedder import extract_embedding_b64
from app.core.limits import validate_and_decode_image
from app.core.metrics import metrics
from app.schemas import EmbedResponse

router = APIRouter(tags=["Vision Embedding"])


@router.post("/v1/embed", response_model=EmbedResponse)
async def generate_embedding(
    response: Response,
    image: UploadFile = File(...),
    angle: Optional[str] = Form(None),
    _auth: str = Depends(verify_internal_key),
) -> EmbedResponse:
    t_start = time.perf_counter()
    metrics.record_request()

    async with concurrency_manager.acquire():
        raw_bytes = await image.read()
        bgr_img = validate_and_decode_image(raw_bytes)

        try:
            faces_json, quality_metrics, reasons, raw_faces, duration_ms = await asyncio.to_thread(
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

        # Embed only if exactly 1 face with adequate score
        b64_emb, model_name, model_ver, dim = await asyncio.to_thread(
            extract_embedding_b64, raw_faces
        )

        total_duration_ms = round((time.perf_counter() - t_start) * 1000.0, 2)
        metrics.record_latency(total_duration_ms)

        return EmbedResponse(
            faceCount=len(faces_json),
            faces=faces_json,
            quality=quality_metrics,
            reasons=reasons,
            ms=total_duration_ms,
            embedding=b64_emb,
            modelName=model_name,
            modelVersion=model_ver,
            dim=dim,
        )
