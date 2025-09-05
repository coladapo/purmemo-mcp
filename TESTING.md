# 🧪 Purmemo MCP Testing Guide

## Production Tests

### Quick Test
```bash
npm test
```
Runs the production test suite against the current server (`src/server.js`).

### Brutal Honesty Test
```bash
npm run test:brutal
```
Runs comprehensive verification tests that check actual API saves vs success messages.

## Test Organization

### Production Test (`/test-production.js`)
- Tests the deployed ultimate server functionality
- Verifies all 4 production tools
- Confirms API integration
- Quick smoke test for production readiness

### Archived Tests (`/archive/tests/`)
Historical test files for reference:

#### Core Tests
- `test-ultimate.js` - Brutal honesty test suite (71% pass rate verified)
- `test-chunked.js` - Chunking functionality tests
- `test-size-limits.js` - Size limit investigation

#### Legacy Tests
- `test-enhanced-server.js` - For 8-tool enhanced server (archived)
- `test-smart-server.js` - For auto-extraction server (archived)
- `test-prompted-server.js` - For aggressive prompting (archived)

## Running Tests

### Test Production Server
```bash
# Quick production test
npm test

# Verbose with debug output
DEBUG=1 npm test

# Test with custom API key
PURMEMO_API_KEY="your-key" npm test
```

### Test Specific Features
```bash
# Test chunking (archived)
node archive/tests/test-chunked.js

# Test size limits (archived)
node archive/tests/test-size-limits.js
```

## Test Results

### Expected Pass Rate
- Production Test: 100% (all 6 tests)
- Brutal Honesty: 71%+ (5/7 core tests)

### Common Issues
1. **API Key Invalid**: Set `PURMEMO_API_KEY` environment variable
2. **Server Port Busy**: Kill existing process on port 3000
3. **Timeout Errors**: Increase delays in test scripts

## Claude Desktop Testing

### Manual Test Process
1. Update Claude Desktop config to point to server
2. Restart Claude Desktop
3. Ask: "What Purmemo tools are available?"
4. Test: "Use save_conversation to save our complete discussion"
5. Verify in Supabase MCP or API

### Test Commands
```
# In Claude Desktop:
"save this conversation with all details"
"recall my recent memories about testing"
"get details for memory [id]"
```

## API Verification

### Direct API Test
```bash
curl -H "Authorization: Bearer $PURMEMO_API_KEY" \
  https://api.purmemo.ai/api/v5/memories/?page_size=5
```

### Check Saved Memory
```bash
curl -H "Authorization: Bearer $PURMEMO_API_KEY" \
  https://api.purmemo.ai/api/v5/memories/{memory-id}
```

## Development Testing

When developing new features:
1. Create feature-specific test in `/archive/tests/`
2. Run production test to ensure no regression
3. Test manually in Claude Desktop
4. Verify API saves with curl or Supabase MCP

## Test Coverage

### What's Tested ✅
- Tool availability and descriptions
- Content validation (rejects insufficient)
- Small conversation saves (<15K chars)
- Large conversation chunking (>15K chars)
- Artifact preservation
- Memory recall
- API integration

### What's Not Automated ❌
- OAuth flow (requires browser)
- Session persistence
- Multi-user scenarios
- Rate limiting behavior

## Troubleshooting

### Server Won't Start
```bash
# Check if port is in use
lsof -i :3000

# Kill existing process
kill -9 [PID]
```

### Tests Timing Out
Increase delays in test scripts:
```javascript
await this.delay(5000); // Increase from 2000
```

### API Errors
Check API key validity:
```bash
node src/diagnose.js
```

## Contributing Tests

New tests should:
1. Follow the pattern in `test-production.js`
2. Include API verification (no fake successes)
3. Handle async operations properly
4. Clean up resources (kill server process)
5. Provide clear pass/fail output

---

*Testing Guide v8.0.0 - Ultimate Server*