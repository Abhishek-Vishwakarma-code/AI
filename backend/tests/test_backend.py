import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import get_password_hash, verify_password, create_access_token
from app.services.search_engine import ResearchEngine
from app.agents.agent_framework import SupervisorOrchestrator
from app.models.database import Base
from app.models.models import MediaTask
from app.services.media_jobs import MediaJobRequest, MediaJobRunner


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


class FakeMediaService:
    def generate_image(self, prompt, aspect_ratio="1:1", style=None, quality="standard"):
        return {
            "url": "/static/generated/fake.png",
            "status": "completed",
            "metadata": {
                "prompt": prompt,
                "aspect_ratio": aspect_ratio,
                "style": style,
                "quality": quality,
            },
        }

    def generate_video(self, prompt, image_url=None, duration_seconds=5, aspect_ratio="16:9", motion=None):
        return {
            "url": "/static/generated/fake.mp4",
            "status": "completed",
            "metadata": {
                "prompt": prompt,
                "source_image_url": image_url,
                "duration_seconds": duration_seconds,
                "aspect_ratio": aspect_ratio,
                "motion": motion,
            },
        }

    def generate_image_to_video(self, image_url, prompt, duration_seconds=5, aspect_ratio="16:9", motion=None):
        return self.generate_video(prompt, image_url, duration_seconds, aspect_ratio, motion)

    def generate_speech(self, text, voice_id="default"):
        return {
            "url": "/static/generated/fake.mp3",
            "status": "completed",
            "metadata": {"text": text, "voice_id": voice_id},
        }

def test_password_hashing():
    password = "MySecurePassword123"
    hashed = get_password_hash(password)
    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("wrong_password", hashed) is False

def test_jwt_generation():
    payload = {"sub": "test@user.com"}
    token = create_access_token(payload)
    assert token is not None
    assert isinstance(token, str)

def test_scraped_credibility_scoring():
    engine = ResearchEngine()
    edu_score = engine._calculate_credibility_score("https://mit.edu/research")
    blogspot_score = engine._calculate_credibility_score("https://my-blog.blogspot.com/post")
    
    assert edu_score > blogspot_score
    assert edu_score == 0.95
    assert blogspot_score == 0.35

def test_supervisor_planning():
    supervisor = SupervisorOrchestrator()
    # Query related to coding
    plan = supervisor._create_execution_plan("Write a python script to parse logs")
    agents_involved = [item["assigned_agent"] for item in plan]
    
    assert "CodingAgent" in agents_involved

    # Query related to images
    plan_media = supervisor._create_execution_plan("Draw a beautiful landscape image")
    agents_involved_media = [item["assigned_agent"] for item in plan_media]
    
    assert "ImageAgent" in agents_involved_media

    plan_talking = supervisor._create_execution_plan("Create a talking AI voice intro")
    agents_involved_talking = [item["assigned_agent"] for item in plan_talking]
    assert "AudioAgent" in agents_involved_talking

    plan_chat = supervisor._create_execution_plan("Help me think through a product idea")
    agents_involved_chat = [item["assigned_agent"] for item in plan_chat]
    assert agents_involved_chat == ["ConversationalAgent"]


def test_media_job_runner_completes_image_task(db_session):
    runner = MediaJobRunner(FakeMediaService())
    request = MediaJobRequest(
        prompt="Generate a futuristic dashboard image",
        media_type="text-to-image",
        aspect_ratio="16:9",
        style="product render",
        quality="high",
    )

    task = runner.create_task(db_session, request)
    assert task.status == "queued"
    assert task.type == "image"

    result = runner.run(db_session, task.id, request)
    persisted = db_session.query(MediaTask).filter(MediaTask.id == task.id).first()

    assert result["url"] == "/static/generated/fake.png"
    assert persisted.status == "completed"
    assert persisted.result_url == "/static/generated/fake.png"
    assert persisted.error_message is None


def test_media_job_runner_requires_source_image_for_image_to_video(db_session):
    runner = MediaJobRunner(FakeMediaService())
    request = MediaJobRequest(
        prompt="Animate this into a smooth reveal",
        media_type="image-to-video",
    )
    task = runner.create_task(db_session, request)

    with pytest.raises(ValueError, match="image_url is required"):
        runner.run(db_session, task.id, request)

    persisted = db_session.query(MediaTask).filter(MediaTask.id == task.id).first()
    assert persisted.status == "failed"
    assert "image_url is required" in persisted.error_message


def test_media_job_runner_dispatches_speech_alias(db_session):
    runner = MediaJobRunner(FakeMediaService())
    request = MediaJobRequest(
        prompt="Welcome back. What would you like to create?",
        media_type="talking-ai",
        voice_id="studio",
    )

    task = runner.create_task(db_session, request)
    result = runner.run(db_session, task.id, request)

    assert task.type == "speech"
    assert result["url"] == "/static/generated/fake.mp3"
    assert result["metadata"]["voice_id"] == "studio"
