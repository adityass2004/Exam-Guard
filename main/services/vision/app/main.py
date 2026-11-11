import threading
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.v1.health import router as health_router
from app.api.v1.quality import router as quality_router
from app.api.v1.embed import router as embed_router
from app.api.v1.verify import router as verify_router
from app.core.model_loader import model_loader


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initiate lazy model load in a background thread so startup is non-blocking
    thread = threading.Thread(target=model_loader.load_model, daemon=True)
    thread.start()
    yield


app = FastAPI(
    title="ExamGuard Vision Service",
    description="Stateless vision service providing detection, quality, embedding, and verification.",
    version="0.1.0",
    lifespan=lifespan,
)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "code" in exc.detail:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.detail},
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": "HTTP_ERROR",
                "message": str(exc.detail),
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Invalid request parameters or payload",
                "details": exc.errors(),
            }
        },
    )


app.include_router(health_router)
app.include_router(quality_router)
app.include_router(embed_router)
app.include_router(verify_router)

