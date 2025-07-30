"""
Debug version to test database connection
"""

import os
import asyncio
import asyncpg

async def test_connection():
    """Test database connection with detailed logging"""
    database_url = os.getenv('DATABASE_URL')
    
    print(f"DATABASE_URL exists: {bool(database_url)}")
    if database_url:
        # Hide password in logs
        parts = database_url.split('@')
        if len(parts) > 1:
            print(f"Database host: ...@{parts[1]}")
        
        # Check URL format
        if database_url.startswith("postgres://"):
            print("⚠️  URL starts with 'postgres://' - updating to 'postgresql://'")
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        
        # Parse connection details
        try:
            # Try different connection methods
            print("\n1. Testing direct connection...")
            try:
                conn = await asyncpg.connect(database_url)
                print("✅ Direct connection successful!")
                await conn.close()
            except Exception as e:
                print(f"❌ Direct connection failed: {e}")
            
            # Try with SSL
            print("\n2. Testing with SSL...")
            ssl_url = database_url
            if "sslmode" not in ssl_url:
                ssl_url += ("&" if "?" in ssl_url else "?") + "sslmode=require"
            
            try:
                conn = await asyncpg.connect(ssl_url)
                print("✅ SSL connection successful!")
                await conn.close()
            except Exception as e:
                print(f"❌ SSL connection failed: {e}")
            
            # Try pool connection
            print("\n3. Testing pool connection...")
            try:
                pool = await asyncpg.create_pool(
                    ssl_url,
                    min_size=1,
                    max_size=2,
                    statement_cache_size=0
                )
                print("✅ Pool connection successful!")
                await pool.close()
            except Exception as e:
                print(f"❌ Pool connection failed: {e}")
                
        except Exception as e:
            print(f"Error during testing: {e}")
    else:
        print("❌ DATABASE_URL not found in environment!")

if __name__ == "__main__":
    asyncio.run(test_connection())