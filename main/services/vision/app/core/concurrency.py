import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import HTTPException, status
from app.config import settings
from app.core.metrics import metrics
from app.core.model_loader import model_loader


class ConcurrencyManager:
    def __init__(self, max_concurrency: int, queue_timeout_ms: int):
        self.max_concurrency = max_concurrency
        self.queue_timeout_sec = queue_timeout_ms / 1000.0
        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(max_concurrency)

    @asynccontextmanager
    async def acquire(self) -> AsyncGenerator[None, None]:
        try:
            acquired = await asyncio.wait_for(
                self._semaphore.acquire(),
                timeout=self.queue_timeout_sec,
            )
        except asyncio.TimeoutError:
            metrics.record_error("BUSY")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "BUSY",
                    "message": "Vision inference service is saturated with concurrent requests, please retry shortly",
                },
                headers={"Retry-After": "1"},
            )

        model_loader.in_flight += 1
        try:
            yield
        finally:
            model_loader.in_flight = max(0, model_loader.in_flight - 1)
            self._semaphore.release()


concurrency_manager = ConcurrencyManager(
    max_concurrency=settings.VISION_MAX_CONCURRENCY,
    queue_timeout_ms=settings.VISION_QUEUE_TIMEOUT_MS,
)

