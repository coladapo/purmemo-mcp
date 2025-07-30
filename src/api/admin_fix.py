"""
Fix for admin API endpoint to match existing schema
"""

import os
import hashlib
import secrets
import asyncpg
from fastapi import HTTPException
from pydantic import BaseModel

class AdminRequest(BaseModel):
    admin_secret: str

async def create_api_key_fixed(request: AdminRequest, db_pool):
    """Create an API key with fixed schema"""
    if request.admin_secret != os.getenv('ADMIN_SECRET', 'change-me-in-production'):
        raise HTTPException(status_code=403, detail="Invalid admin secret")
    
    # Generate API key
    api_key = f"puo_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    
    async with db_pool.acquire() as conn:
        # First, check if we have any users
        user_id = await conn.fetchval("SELECT id FROM users LIMIT 1")
        
        if not user_id:
            # Create a default user with required fields
            user_id = await conn.fetchval("""
                INSERT INTO users (email, password_hash, full_name, is_active, is_verified)
                VALUES ('admin@puo-memo.com', 'not-used', 'Admin User', true, true)
                RETURNING id
            """)
        
        # Check if api_keys has all required columns
        api_key_cols = await conn.fetch("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'api_keys'
        """)
        
        col_names = [col['column_name'] for col in api_key_cols]
        
        # Build insert query based on existing columns
        if 'permissions' in col_names:
            # Use permissions as JSONB
            await conn.execute("""
                INSERT INTO api_keys (key_hash, name, permissions, user_id, created_at, is_active)
                VALUES ($1, 'First API Key', '["memory:create", "memory:read", "memory:delete"]'::jsonb, $2, CURRENT_TIMESTAMP, true)
            """, key_hash, user_id)
        else:
            # Simpler version without permissions
            await conn.execute("""
                INSERT INTO api_keys (key_hash, name, user_id, created_at, is_active)
                VALUES ($1, 'First API Key', $2, CURRENT_TIMESTAMP, true)
            """, key_hash, user_id)
        
        return {
            "api_key": api_key,
            "user_id": str(user_id),
            "message": "Save this API key - it won't be shown again!"
        }