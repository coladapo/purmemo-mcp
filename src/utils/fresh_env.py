"""
Utility to ensure fresh environment variable loading
Import this at the very beginning of any script that needs fresh env vars
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

def ensure_fresh_env():
    """Force reload of environment variables and clear module cache"""
    # Force reload .env file
    env_path = Path(__file__).parent.parent.parent / '.env'
    if env_path.exists():
        load_dotenv(env_path, override=True)
    else:
        load_dotenv(override=True)
    
    # Clear cached modules that might hold old environment values
    modules_to_clear = [
        'src.utils.config',
        'src.core.ai',
        'src.core.database',
        'src.core.memory',
        'src.core.knowledge_graph',
        'src.core.entity_extractor'
    ]
    
    for module in modules_to_clear:
        if module in sys.modules:
            del sys.modules[module]
    
    # Also clear the settings cache
    if 'src.utils.config' in sys.modules:
        del sys.modules['src.utils.config']

# Auto-run when imported
ensure_fresh_env()