import os
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    APP_NAME: str = "Ultimate Multimodal AI Platform"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SECRET_KEY: str = "SUPER_SECRET_KEY_CHANGE_IN_PRODUCTION_1234567890"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Databases
    DATABASE_URL: str = "sqlite:///d:/Abhishek/AI/backend/app/platform.db"
    REDIS_URL: Optional[str] = None
    
    # Vector Search
    QDRANT_URL: Optional[str] = None  # If None, will run in-memory
    
    # Third Party APIs
    SEARCH_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    REPLICATE_API_TOKEN: Optional[str] = None
    
    # Operational Modes
    # "mock" runs all heavy pipelines (GPU models, search engines) in high-fidelity mock/simulator mode.
    # "real" tries to connect to actual models and APIs.
    INFERENCE_MODE: str = "mock"

    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()
