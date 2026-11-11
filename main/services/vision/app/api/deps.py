from typing import Optional
import secrets
from fastapi import Header, HTTPException, status
from app.config import settings


def verify_internal_key(
    x_internal_key: Optional[str] = Header(None, alias="X-Internal-Key"),
) -> str:
    if not x_internal_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "BAD_INTERNAL_KEY",
                "message": "Missing X-Internal-Key authorization header",
            },
        )

    expected_key = settings.VISION_INTERNAL_KEY
    if not expected_key or expected_key == "REPLACE_ME":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "BAD_INTERNAL_KEY",
                "message": "Vision internal key is not properly configured on server",
            },
        )

    if not secrets.compare_digest(x_internal_key, expected_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "BAD_INTERNAL_KEY",
                "message": "Invalid internal authorization key",
            },
        )

    return x_internal_key

