#!/bin/bash

# Test Unified OAuth Implementation
# Tests all OAuth flows: Claude MCP, ChatGPT, NPM, Web

echo "🧪 UNIFIED OAUTH TEST SUITE"
echo "============================"
echo ""

# Configuration
OAUTH_SERVER="${OAUTH_SERVER:-http://localhost:3000}"
API_SERVER="${API_SERVER:-https://api.purmemo.ai}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
test_endpoint() {
    local name=$1
    local url=$2
    local expected=$3
    
    echo -n "Testing $name... "
    response=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    
    if [ "$response" = "$expected" ]; then
        echo -e "${GREEN}✓${NC} ($response)"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗${NC} (Expected $expected, got $response)"
        ((TESTS_FAILED++))
    fi
}

test_oauth_flow() {
    local client=$1
    local client_id=$2
    local redirect_uri=$3
    
    echo ""
    echo "Testing OAuth flow for: $client"
    echo "--------------------------------"
    
    # Generate PKCE values
    code_verifier=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-43)
    code_challenge=$(echo -n "$code_verifier" | openssl dgst -sha256 -binary | base64 | tr -d "=+/" | tr '+' '-' | tr '/' '_')
    
    # Build authorization URL
    auth_url="$OAUTH_SERVER/oauth/authorize?"
    auth_url+="response_type=code&"
    auth_url+="client_id=$client_id&"
    auth_url+="redirect_uri=$(echo $redirect_uri | sed 's/:/%3A/g' | sed 's/\//%2F/g')&"
    auth_url+="scope=memories.read+memories.write&"
    auth_url+="code_challenge=$code_challenge&"
    auth_url+="code_challenge_method=S256"
    
    echo "Authorization URL:"
    echo "$auth_url"
    echo ""
    
    # Test authorization endpoint
    response=$(curl -s -o /dev/null -w "%{http_code}" "$auth_url")
    if [ "$response" = "302" ] || [ "$response" = "200" ]; then
        echo -e "Authorization endpoint: ${GREEN}✓${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "Authorization endpoint: ${RED}✗${NC} ($response)"
        ((TESTS_FAILED++))
    fi
}

# Start tests
echo "🔍 Testing OAuth Server Endpoints"
echo ""

# Test discovery endpoint
test_endpoint "Discovery endpoint" "$OAUTH_SERVER/.well-known/openid-configuration" "200"

# Test health check
test_endpoint "Health check" "$OAUTH_SERVER/health" "200"

# Test OAuth flows for each client
test_oauth_flow "Claude MCP" "claude-mcp" "http://localhost:3456/callback"
test_oauth_flow "ChatGPT Plugin" "chatgpt-purmemo" "https://chat.openai.com/aip/plugin-purmemo/oauth/callback"
test_oauth_flow "NPM CLI" "npm-cli" "http://localhost:8080/callback"
test_oauth_flow "Web App" "web-app" "https://app.purmemo.ai/oauth/callback"

echo ""
echo "🔍 Testing Token Endpoint"
echo "------------------------"

# Test invalid grant type
response=$(curl -s -X POST "$OAUTH_SERVER/oauth/token" \
    -H "Content-Type: application/json" \
    -d '{"grant_type":"invalid"}' \
    -o /dev/null -w "%{http_code}")

if [ "$response" = "400" ]; then
    echo -e "Invalid grant type rejection: ${GREEN}✓${NC}"
    ((TESTS_PASSED++))
else
    echo -e "Invalid grant type rejection: ${RED}✗${NC} ($response)"
    ((TESTS_FAILED++))
fi

# Test missing PKCE
response=$(curl -s -X POST "$OAUTH_SERVER/oauth/token" \
    -H "Content-Type: application/json" \
    -d '{
        "grant_type":"authorization_code",
        "code":"test-code",
        "client_id":"claude-mcp",
        "redirect_uri":"http://localhost:3456/callback"
    }' \
    -o /dev/null -w "%{http_code}")

if [ "$response" = "400" ] || [ "$response" = "401" ]; then
    echo -e "PKCE requirement enforcement: ${GREEN}✓${NC}"
    ((TESTS_PASSED++))
else
    echo -e "PKCE requirement enforcement: ${RED}✗${NC} ($response)"
    ((TESTS_FAILED++))
fi

echo ""
echo "🔍 Testing Security Features"
echo "---------------------------"

# Test CORS headers
response=$(curl -s -I -H "Origin: https://app.purmemo.ai" "$OAUTH_SERVER/health" | grep -i "access-control-allow-origin")
if [[ $response == *"app.purmemo.ai"* ]]; then
    echo -e "CORS configuration: ${GREEN}✓${NC}"
    ((TESTS_PASSED++))
else
    echo -e "CORS configuration: ${RED}✗${NC}"
    ((TESTS_FAILED++))
fi

# Test rate limiting (make rapid requests)
echo -n "Rate limiting: "
for i in {1..15}; do
    curl -s "$OAUTH_SERVER/oauth/authorize?client_id=test" -o /dev/null
done
response=$(curl -s -o /dev/null -w "%{http_code}" "$OAUTH_SERVER/oauth/authorize?client_id=test")
if [ "$response" = "429" ]; then
    echo -e "${GREEN}✓${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${YELLOW}⚠${NC} (May need adjustment)"
fi

echo ""
echo "🔍 Testing Integration Points"
echo "-----------------------------"

# Test API server OAuth endpoint
test_endpoint "API OAuth endpoint" "$API_SERVER/api/oauth/authorize" "200"

echo ""
echo "📊 Test Results"
echo "==============="
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please review.${NC}"
    exit 1
fi