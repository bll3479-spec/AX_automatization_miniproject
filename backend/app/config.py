from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"), extra="ignore")

    anthropic_api_key: str | None = None
    use_llm_fallback: bool = True
    security_llm_block: bool = True

    gmail_credentials_path: str = "credentials.json"
    gmail_token_path: str = "token.json"

    llm_model: str = "claude-haiku-4-5-20251001"

    def gmail_credentials_file(self) -> Path:
        return BASE_DIR / self.gmail_credentials_path

    def gmail_token_file(self) -> Path:
        return BASE_DIR / self.gmail_token_path


settings = Settings()
