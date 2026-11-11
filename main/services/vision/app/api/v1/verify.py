import asyncio
import time
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status

from app.api.deps import verify_internal_key
from app.core.calibration import calibration
from app.core.concurrency import concurrency_manager
from app.core.detector import ModelUnavailableException, detect_and_measure
from app.core.embedder import extract_embedding_vector
from app.core.limits import validate_and_decode_image
from app.core.metrics import metrics
from app.core.model_loader import model_loader
from app.core.similarity import (
    InvalidReferenceException,
    compute_cosine_similarity,
    compute_sample_similarities,
    validate_reference,
)
from app.schemas import VerifyResponse

router = APIRouter(tags=["Vision Verification"])


@router.post("/v1/verify", response_model=VerifyResponse)
async def verify_face(
    response: Response,
    image: UploadFile = File(...),
    reference: str = Form(...),
    samples: Optional[List[str]] = Form(None),
    _auth: str = Depends(verify_internal_key),
) -> VerifyResponse:
    t_start = time.perf_counter()
    metrics.record_request()

    # 1. Validate reference embedding
    try:
        ref_vec = validate_reference(reference)
    except InvalidReferenceException as ire:
        metrics.record_error("INVALID_REFERENCE")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_REFERENCE", "message": str(ire)},
        )

    # 2. Validate optional samples
    sample_list: Optional[List[str]] = None
    if samples:
        sample_list = []
        for s in samples:
            try:
                validate_reference(s)
                sample_list.append(s)
            except InvalidReferenceException as ire:
                metrics.record_error("INVALID_REFERENCE")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": "INVALID_REFERENCE", "message": str(ire)},
                )

    # 3. Acquire bounded concurrency slot (returns 503 BUSY if saturated)
    async with concurrency_manager.acquire():
        # 4. Decode and guard probe image
        raw_bytes = await image.read()
        bgr_img = validate_and_decode_image(raw_bytes)

        # 5. Detect and measure in worker thread to prevent event loop blocking
        try:
            faces_json, quality_metrics, _reasons, raw_faces, duration_ms = await asyncio.to_thread(
                detect_and_measure, bgr_img
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

        # 6. Proceed to embed only if exactly 1 face is detected
        if len(raw_faces) != 1:
            total_duration_ms = round((time.perf_counter() - t_start) * 1000.0, 2)
            metrics.record_latency(total_duration_ms)
            return VerifyResponse(
                faceCount=len(faces_json),
                faces=faces_json,
                quality=quality_metrics,
                similarityRaw=None,
                similarityPct=None,
                perSample=None,
                modelName=model_loader.model_name,
                modelVersion=model_loader.model_version,
                calibrationStatus=calibration.status,
                ms=total_duration_ms,
            )

        # 7. Extract embedding in worker thread
        emb_vec, model_name, model_ver, _dim = await asyncio.to_thread(
            extract_embedding_vector, raw_faces
        )
        if emb_vec is None:
            total_duration_ms = round((time.perf_counter() - t_start) * 1000.0, 2)
            metrics.record_latency(total_duration_ms)
            return VerifyResponse(
                faceCount=len(faces_json),
                faces=faces_json,
                quality=quality_metrics,
                similarityRaw=None,
                similarityPct=None,
                perSample=None,
                modelName=model_name or model_loader.model_name,
                modelVersion=model_ver or model_loader.model_version,
                calibrationStatus=calibration.status,
                ms=total_duration_ms,
            )

        # 8. Compute cosine similarity & calibrated percentage
        raw_sim = compute_cosine_similarity(emb_vec, ref_vec)
        sim_pct = calibration.raw_to_pct(raw_sim)
        per_samples = compute_sample_similarities(emb_vec, sample_list) if sample_list else None

        total_duration_ms = round((time.perf_counter() - t_start) * 1000.0, 2)
        metrics.record_latency(total_duration_ms)

        return VerifyResponse(
            faceCount=1,
            faces=faces_json,
            quality=quality_metrics,
            similarityRaw=round(raw_sim, 4),
            similarityPct=round(sim_pct, 2),
            perSample=[round(s, 4) for s in per_samples] if per_samples is not None else None,
            modelName=model_name or model_loader.model_name,
            modelVersion=model_ver or model_loader.model_version,
            calibrationStatus=calibration.status,
            ms=total_duration_ms,
        )
