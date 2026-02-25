from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_ENV: str = "development"
    SECRET_KEY: str = "change-me"
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379"

    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_REDIRECT_URI: str = "http://localhost:8000/api/auth/github/callback"

    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    GITHUB_WEBHOOK_SECRET: str = ""
    LEETCODE_SESSION_COOKIE: str = ""

    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    FRONTEND_URL: str = "http://localhost:3000"

    @property
    def is_dev(self) -> bool:
        return self.APP_ENV == "development"


settings = Settings()
