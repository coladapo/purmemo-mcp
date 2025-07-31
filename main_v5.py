"""
PUO Memo API - Production Entry Point
Uses v5 API with unified memory search
"""

from src.api.production_api_v5 import app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        log_level="info"
    )
