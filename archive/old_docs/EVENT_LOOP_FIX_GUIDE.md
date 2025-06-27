# PUO Memo Event Loop Fix Guide

## Problem Summary

The PUO Memo system was experiencing two critical async-related errors:
1. **"Task got Future attached to a different loop"** - Caused by multiple event loops and improper async handling
2. **"cannot perform operation: another operation is in progress"** - Caused by concurrent operations on a single database connection

## Root Causes

### 1. Manual Event Loop Creation
The original `api_server.py` was creating its own event loop:
```python
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
```

This conflicted with aiohttp's internal event loop management.

### 2. Shared Database Connection
`PuoMemoSimple` used a single connection (`self.conn`) shared across all requests, causing concurrency issues.

### 3. Mixed Async Patterns
The code mixed different async patterns:
- Manual `run_until_complete()` calls
- aiohttp's `web.run_app()`
- MCP's `asyncio.run()`

## Solution Implementation

### 1. Connection Pooling (`puo_memo_pooled.py`)
- Replaced single connection with asyncpg connection pool
- Pool handles 5-20 concurrent connections
- Each request gets its own connection from the pool
- Proper connection lifecycle management

### 2. Fixed API Server (`api_server_pooled.py`)
- Removed manual event loop creation
- Let aiohttp manage the event loop
- Proper async initialization with `create_app()`
- Clean startup/cleanup handlers

### 3. Fixed MCP Server (`server_pooled.py`)
- Uses `asyncio.run()` for proper event loop handling
- Shares the pooled connection system
- No event loop conflicts with API server

## Migration Steps

### 1. Update Dependencies
Ensure you have the latest asyncpg:
```bash
pip install asyncpg>=0.29.0
```

### 2. Replace Files
```bash
# Backup originals
cp api_server.py api_server_original.py
cp server.py server_original.py
cp puo_memo_simple.py puo_memo_simple_original.py

# Use new pooled versions
cp api_server_pooled.py api_server.py
cp server_pooled.py server.py
cp puo_memo_pooled.py puo_memo_simple.py
```

### 3. Update Configuration
No configuration changes needed - the pooled version uses the same environment variables.

### 4. Update Startup Scripts
Update any startup scripts to use the new files:
- API Server: `python api_server_pooled.py` (or renamed to `api_server.py`)
- MCP Server: `python server_pooled.py` (or renamed to `server.py`)

## Testing

### 1. Test Concurrent Requests
Run the test script to verify fixes:
```bash
python test_concurrent_requests.py
```

### 2. Monitor Logs
Check for absence of these errors:
- "Task got Future attached to a different loop"
- "cannot perform operation: another operation is in progress"

### 3. Verify Connection Pool
The health endpoint now shows pool status:
```bash
curl http://localhost:8000/
```

## Benefits

1. **No Event Loop Conflicts**: Proper async handling throughout
2. **Concurrent Request Support**: Multiple requests handled simultaneously
3. **Better Performance**: Connection pooling reduces overhead
4. **Improved Reliability**: No more async-related crashes
5. **Scalability**: Can handle more concurrent users

## Rollback Plan

If issues occur, restore original files:
```bash
cp api_server_original.py api_server.py
cp server_original.py server.py
cp puo_memo_simple_original.py puo_memo_simple.py
```

## Additional Notes

- The pooled version maintains full API compatibility
- All existing features work without changes
- Database schema remains unchanged
- Extension and Claude Desktop configs don't need updates

## Monitoring

Watch for these healthy indicators:
- "Connected to PostgreSQL with connection pool" in logs
- "pool_status": "active" in health checks
- Smooth handling of concurrent requests
- No async-related errors in logs