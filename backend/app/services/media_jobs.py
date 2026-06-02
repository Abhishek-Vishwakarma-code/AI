import json
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models.models import MediaTask
from app.services.media_services import MediaService


@dataclass
class MediaJobRequest:
    prompt: str
    media_type: str
    aspect_ratio: str = "1:1"
    image_url: Optional[str] = None
    style: Optional[str] = None
    quality: str = "standard"
    duration_seconds: int = 5
    motion: Optional[str] = None
    voice_id: str = "default"


class MediaJobRunner:
    """Runs multimodal generation jobs and records task state in the database."""

    SUPPORTED_TYPES = {"image", "video", "image_to_video", "audio", "speech"}

    def __init__(self, media_service: MediaService):
        self.media_service = media_service

    def create_task(self, db: Session, request: MediaJobRequest, workspace_id: Optional[int] = None) -> MediaTask:
        normalized_type = self._normalize_type(request.media_type)
        task = MediaTask(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            type=normalized_type,
            prompt=request.prompt,
            status="queued",
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return task

    def run(self, db: Session, task_id: str, request: MediaJobRequest) -> Dict[str, Any]:
        task = db.query(MediaTask).filter(MediaTask.id == task_id).first()
        if not task:
            raise ValueError(f"Media task '{task_id}' not found")

        task.status = "running"
        db.commit()

        try:
            result = self._dispatch(request)
            task.status = "completed"
            task.result_url = result.get("url")
            task.error_message = None
            db.commit()
            return result
        except Exception as exc:
            task.status = "failed"
            task.error_message = str(exc)
            db.commit()
            raise

    def run_with_session_factory(self, session_factory, task_id: str, request: MediaJobRequest) -> None:
        db = session_factory()
        try:
            self.run(db, task_id, request)
        finally:
            db.close()

    def task_payload(self, task: MediaTask) -> Dict[str, Any]:
        return {
            "id": task.id,
            "type": task.type,
            "prompt": task.prompt,
            "status": task.status,
            "result_url": task.result_url,
            "error_message": task.error_message,
            "created_at": task.created_at,
        }

    def _dispatch(self, request: MediaJobRequest) -> Dict[str, Any]:
        media_type = self._normalize_type(request.media_type)
        if media_type == "image":
            return self.media_service.generate_image(
                prompt=request.prompt,
                aspect_ratio=request.aspect_ratio,
                style=request.style,
                quality=request.quality,
            )
        if media_type == "video":
            return self.media_service.generate_video(
                prompt=request.prompt,
                duration_seconds=request.duration_seconds,
                aspect_ratio=request.aspect_ratio,
                motion=request.motion,
            )
        if media_type == "image_to_video":
            if not request.image_url:
                raise ValueError("image_url is required for image_to_video jobs")
            return self.media_service.generate_image_to_video(
                image_url=request.image_url,
                prompt=request.prompt,
                duration_seconds=request.duration_seconds,
                aspect_ratio=request.aspect_ratio,
                motion=request.motion,
            )
        if media_type in {"audio", "speech"}:
            return self.media_service.generate_speech(request.prompt, request.voice_id)
        raise ValueError(f"Unsupported media_type '{request.media_type}'")

    def _normalize_type(self, media_type: str) -> str:
        normalized = media_type.strip().lower().replace("-", "_")
        aliases = {
            "text_to_image": "image",
            "text_to_video": "video",
            "image2video": "image_to_video",
            "i2v": "image_to_video",
            "talking": "speech",
            "talking_ai": "speech",
            "voice": "speech",
        }
        normalized = aliases.get(normalized, normalized)
        if normalized not in self.SUPPORTED_TYPES:
            raise ValueError(
                "media_type must be one of: "
                + ", ".join(sorted(self.SUPPORTED_TYPES))
            )
        return normalized
