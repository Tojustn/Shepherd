from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    app_name: str = "Shepherd API"
    debug: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/shepherd"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # CORS
    allowed_origins: list[str] = ["http://localhost:3000"]

    # Security
    secret_key: str = "change-me-in-production"


settings = Settings()
