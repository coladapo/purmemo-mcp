"""
Configuration management for PUO Memo
"""
from typing import Optional
from pydantic import BaseSettings, Field


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
    
    # API Server Configuration
    api_host: str = Field('localhost', env='API_HOST')
    api_port: int = Field(8000, env='API_PORT')
    
    # Memory Settings
    default_context: str = Field('default', env='DEFAULT_CONTEXT')
    memory_search_limit: int = Field(10, env='MEMORY_SEARCH_LIMIT')
    memory_list_limit: int = Field(20, env='MEMORY_LIST_LIMIT')
    
    # Logging
    log_level: str = Field('INFO', env='LOG_LEVEL')
    
    class Config:
        env_file = '.env'
        env_file_encoding = 'utf-8'
        case_sensitive = False


# Global settings instance
settings = Settings()