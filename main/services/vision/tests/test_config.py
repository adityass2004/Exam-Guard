from app.config import VisionSettings


def test_vision_config_defaults():
    cfg = VisionSettings()
    assert cfg.VISION_PORT == 8000
    assert cfg.VISION_HOST == "127.0.0.1"
    assert cfg.VISION_MAX_CONCURRENCY == 2
    assert cfg.VISION_ALLOW_MODEL_DOWNLOAD is True

