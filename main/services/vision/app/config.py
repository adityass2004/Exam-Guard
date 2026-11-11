import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class VisionSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=os.environ.get("ENV_FILE", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    VISION_PORT: int = 8000
    VISION_HOST: str = "127.0.0.1"
    VISION_INTERNAL_KEY: str = "REPLACE_ME"
    VISION_MODEL_DIR: str = "./services/vision/models"
    VISION_ALLOW_MODEL_DOWNLOAD: bool = True
    VISION_MAX_CONCURRENCY: int = 2
    VISION_QUEUE_TIMEOUT_MS: int = 250
    VISION_MAX_UPLOAD_BYTES: int = 10 * 1024 * 1024  # 10 MB
    VISION_MAX_IMAGE_EDGE: int = 4096
    VISION_MAX_IMAGE_PIXELS: int = 16_000_000  # 16 MP
    VISION_ORT_THREADS: int = 2
    VISION_REQUEST_TIMEOUT_MS: int = 4000


settings = VisionSettings()

