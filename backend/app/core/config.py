"""
Application configuration loaded from environment variables / .env file.
"""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Application
    APP_NAME: str = "CivicPulse AI"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "sqlite:///./civicpulse.db"

    # CORS — comma-separated list
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # File uploads
    MEDIA_DIR: str = "media"
    MAX_UPLOAD_SIZE_MB: int = 5

    # Security (placeholder — expand when auth is implemented)
    SECRET_KEY: str = "change-me-before-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # IBM watsonx Orchestrate — NOT YET INTEGRATED
    # These values are intentionally empty; the agent module checks for them
    # before attempting any real API call.
    WATSONX_API_KEY: str = ""
    WATSONX_PROJECT_ID: str = ""
    WATSONX_API_URL: str = "https://us-south.ml.cloud.ibm.com"


settings = Settings()
