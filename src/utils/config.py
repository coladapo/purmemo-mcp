"""
Configuration management for PUO Memo
"""
import os
from typing import Optional
try:
    from pydantic_settings import BaseSettings
    from pydantic import Field
except ImportError:
    # Fallback for older pydantic versions
    from pydantic import BaseSettings, Field
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Settings(BaseSettings):
    """Application settings with environment variable support"""
    
    # Database Configuration
    db_host: str = Field(..., env='DB_HOST')
    db_port: int = Field(5432, env='DB_PORT')
    db_name: str = Field(..., env='DB_NAME')
    db_user: str = Field(..., env='DB_USER')
    db_password: str = Field(..., env='DB_PASSWORD')
    
    # Connection Pool Settings
    db_pool_min_size: int = Field(5, env='DB_POOL_MIN_SIZE')
    db_pool_max_size: int = Field(20, env='DB_POOL_MAX_SIZE')
    db_command_timeout: int = Field(10, env='DB_COMMAND_TIMEOUT')
    
    # AI Configuration (Optional)
    gemini_api_key: Optional[str] = Field(None, env='GEMINI_API_KEY')
    
    # Google Cloud Storage (Optional)
    gcs_bucket_name: Optional[str] = Field(None, env='GCS_BUCKET_NAME')
    gcs_project_id: Optional[str] = Field(None, env='GCS_PROJECT_ID')
    gcs_credentials_path: Optional[str] = Field(None, env='GCS_CREDENTIALS_PATH')
    
    # API Server Configuration
    api_host: str = Field('localhost', env='API_HOST')
    api_port: int = Field(8000, env='API_PORT')
    
    # Authentication Configuration
    jwt_secret_key: str = Field('', env='JWT_SECRET_KEY')
    jwt_algorithm: str = Field('HS256', env='JWT_ALGORITHM')
    jwt_expiration_hours: int = Field(24, env='JWT_EXPIRATION_HOURS')
    api_key: str = Field('', env='API_KEY')
    
    # Security Configuration
    allowed_origins: str = Field('http://localhost:3000', env='ALLOWED_ORIGINS')
    rate_limit_per_minute: int = Field(100, env='RATE_LIMIT_PER_MINUTE')
    
    # ChatGPT Bridge Configuration
    chatgpt_bridge_api_key: Optional[str] = Field(None, env='CHATGPT_BRIDGE_API_KEY')
    
    # Memory Settings
    default_context: str = Field('default', env='DEFAULT_CONTEXT')
    memory_search_limit: int = Field(10, env='MEMORY_SEARCH_LIMIT')
    memory_list_limit: int = Field(20, env='MEMORY_LIST_LIMIT')
    
    # Deduplication Settings
    dedup_time_window_seconds: int = Field(300, env='DEDUP_TIME_WINDOW_SECONDS')
    dedup_time_window_claude: int = Field(600, env='DEDUP_TIME_WINDOW_CLAUDE')
    dedup_time_window_chatgpt: int = Field(300, env='DEDUP_TIME_WINDOW_CHATGPT')
    dedup_time_window_cursor: int = Field(900, env='DEDUP_TIME_WINDOW_CURSOR')
    dedup_similarity_threshold: float = Field(0.9, env='DEDUP_SIMILARITY_THRESHOLD')
    
    # Redis Cache Settings
    redis_url: Optional[str] = Field("redis://localhost:6379", env='REDIS_URL')
    cache_enabled: bool = Field(True, env='CACHE_ENABLED')
    cache_ttl_embeddings: int = Field(2592000, env='CACHE_TTL_EMBEDDINGS')  # 30 days
    cache_ttl_search: int = Field(3600, env='CACHE_TTL_SEARCH')  # 1 hour
    cache_ttl_memory: int = Field(86400, env='CACHE_TTL_MEMORY')  # 1 day
    
    # Search Settings
    semantic_search_threshold: float = Field(0.5, env='SEMANTIC_SEARCH_THRESHOLD')
    
    # Logging
    log_level: str = Field('INFO', env='LOG_LEVEL')
    
    class Config:
        env_file = '.env'
        env_file_encoding = 'utf-8'
        case_sensitive = False


# Don't create a global instance - create on demand instead
_settings = None

def get_settings(reload=False):
    """Get settings instance, optionally forcing a reload"""
    global _settings
    if _settings is None or reload:
        # Force reload environment variables
        from dotenv import load_dotenv
        load_dotenv(override=True)
        _settings = Settings()
    return _settings

# For backward compatibility
settings = get_settings()