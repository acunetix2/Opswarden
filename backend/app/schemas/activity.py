from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ActivityEventOut(BaseModel):
    id: str
    case_id: str | None
    case_number: str | None = None
    actor_type: str
    actor_id: str | None
    actor_name: str | None = None
    event_type: str
    payload: dict[str, Any] | None = None
    created_at: datetime
