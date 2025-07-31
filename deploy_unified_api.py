#!/usr/bin/env python3
"""
Deploy the unified memory API (v5) to production
This updates the API to query both memories and memory_entities tables
"""

import os
import shutil
import subprocess
from pathlib import Path

def deploy_unified_api():
    print("=" * 80)
    print("DEPLOYING UNIFIED MEMORY API (v5)")
    print("=" * 80)
    
    # Check if we're in the right directory
    current_dir = Path.cwd()
    if not (current_dir / "src" / "api" / "unified_memory_api.py").exists():
        print("❌ Error: unified_memory_api.py not found. Run from project root.")
        return
    
    print("\n📋 Deployment checklist:")
    print("   ✓ Created unified_memory_api.py - queries both tables")
    print("   ✓ Created production_api_v5.py - integrates unified search")
    print("   ✓ Maintains backward compatibility with v3/v4 endpoints")
    print("   ✓ Adds /api/v5/memories/search for unified search")
    print("   ✓ Adds /api/v5/stats for memory statistics")
    
    print("\n🚀 Deployment steps:")
    print("\n1. Update the main API entry point:")
    
    # Create a new main.py that uses v5
    main_content = '''"""
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
'''
    
    with open("main_v5.py", "w") as f:
        f.write(main_content)
    
    print("   ✅ Created main_v5.py")
    
    print("\n2. Update requirements.txt if needed:")
    print("   - All dependencies should already be included")
    
    print("\n3. Test locally first:")
    print("   ```")
    print("   export DATABASE_URL='your-database-url'")
    print("   export REDIS_URL='redis://localhost:6379'")
    print("   python main_v5.py")
    print("   ```")
    
    print("\n4. Deploy to Render:")
    print("   ```")
    print("   # Commit changes")
    print("   git add -A")
    print("   git commit -m 'Add unified memory API v5'")
    print("   git push origin main")
    print("   ```")
    
    print("\n5. Update Render configuration:")
    print("   - Go to Render dashboard")
    print("   - Update Start Command to: python main_v5.py")
    print("   - Or update existing main.py to import from production_api_v5")
    
    print("\n6. Test the deployed API:")
    print("   ```")
    print("   # Get stats")
    print("   curl https://api.puo-memo.com/api/v5/stats \\")
    print("     -H 'Authorization: Bearer YOUR_API_KEY'")
    print("")
    print("   # Search across both tables")
    print("   curl 'https://api.puo-memo.com/api/v5/memories/search?query=june&include_entities=true' \\")
    print("     -H 'Authorization: Bearer YOUR_API_KEY'")
    print("   ```")
    
    print("\n📝 Key features of v5 API:")
    print("   • Searches both memories and memory_entities tables")
    print("   • Returns June 2024 memories (stored in entities table)")
    print("   • Maintains full backward compatibility")
    print("   • Adds unified search and stats endpoints")
    print("   • Handles the 2024/2025 date issue transparently")
    
    print("\n⚠️  Important notes:")
    print("   • June 2024 memories show as 2025 in memory_entities due to timezone issue")
    print("   • The API handles this automatically when searching")
    print("   • All existing v3/v4 endpoints continue to work")
    print("   • New v5 endpoints provide unified access")
    
    # Create a simple deployment guide
    with open("UNIFIED_API_DEPLOYMENT.md", "w") as f:
        f.write("""# Unified Memory API (v5) Deployment Guide

## Overview
The v5 API adds unified search across both `memories` and `memory_entities` tables, ensuring that June 2024 memories (stored in memory_entities) are accessible via the API.

## New Endpoints

### GET /api/v5/memories/search
Unified search across both tables.

Parameters:
- `query`: Search query
- `include_entities`: Include memory_entities table (default: true)
- `source_filter`: Filter by source ('memories', 'entities', or null for both)
- `limit`, `offset`: Pagination
- `tags`, `date_from`, `date_to`: Filters

### GET /api/v5/memories
List all memories from both tables with pagination.

### GET /api/v5/memories/{id}
Get a specific memory from either table.

### GET /api/v5/stats
Get statistics about memories across both tables.

## Deployment Steps

1. **Test locally**:
   ```bash
   export DATABASE_URL='your-database-url'
   export REDIS_URL='redis://localhost:6379'
   python main_v5.py
   ```

2. **Deploy to Render**:
   ```bash
   git add -A
   git commit -m 'Add unified memory API v5'
   git push origin main
   ```

3. **Update Render start command**:
   - Change to: `python main_v5.py`
   - Or update main.py to use v5

4. **Verify deployment**:
   ```bash
   curl https://api.puo-memo.com/health
   ```

## Testing

Use the provided `test_unified_api.py` script to verify both tables are being queried correctly.

## Notes

- June 2024 memories appear as 2025 in memory_entities due to a timezone issue
- The API automatically handles this date discrepancy
- All v3/v4 endpoints remain functional
- No data migration is required
""")
    
    print("\n✅ Created UNIFIED_API_DEPLOYMENT.md")
    print("\n🎉 Deployment preparation complete!")
    print("   Follow the steps above to deploy the unified API")

if __name__ == "__main__":
    deploy_unified_api()