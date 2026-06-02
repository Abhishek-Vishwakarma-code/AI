import os
from pathlib import Path
from pydantic_settings import BaseSettings
from typing import Optional

BACKEND_DIR = Path(__file__).resolve().parents[2]
BACKEND_APP_DIR = BACKEND_DIR / "app"
BACKEND_STATIC_DIR = BACKEND_APP_DIR / "static"

class Settings(BaseSettings):
    APP_NAME: str = "Ultimate Multimodal AI Platform"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SECRET_KEY: str = "SUPER_SECRET_KEY_CHANGE_IN_PRODUCTION_1234567890"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Databases
    DATABASE_URL: str = f"sqlite:///{(BACKEND_APP_DIR / 'platform.db').as_posix()}"
    REDIS_URL: Optional[str] = None
    STATIC_DIR: str = str(BACKEND_STATIC_DIR)
    GENERATED_MEDIA_DIR: str = str(BACKEND_STATIC_DIR / "generated")
    DOCUMENTS_DIR: str = str(BACKEND_STATIC_DIR / "documents")
    
    # Vector Search
    QDRANT_URL: Optional[str] = None  # If None, will run in-memory
    
    # Third Party APIs
    SEARCH_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_IMAGE_MODEL: str = "gpt-image-1.5"
    REPLICATE_API_TOKEN: Optional[str] = None
    
    # Operational Modes
    # "mock" runs all heavy pipelines (GPU models, search engines) in high-fidelity mock/simulator mode.
    # "real" tries to connect to actual models and APIs.
    INFERENCE_MODE: str = "mock"

    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()
