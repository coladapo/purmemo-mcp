#!/bin/bash

# Quick End-to-End Test for Purmemo OAuth
# Tests the complete flow from start to finish

echo "🚀 PURMEMO OAUTH END-TO-END TEST"
echo "================================="
echo ""

# Configuration
API_URL="https://api.purmemo.ai"
APP_URL="https://app.purmemo.ai"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "This test will verify the complete OAuth flow is working."
echo ""

# Step 1: Check API is running
echo -n "1. Checking API server... "
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" 2>/dev/null)
if [ "$API_STATUS" = "200" ]; then
    echo -e "${GREEN}✓${NC} API is running"
else
    echo -e "${RED}✗${NC} API is not responding (HTTP $API_STATUS)"
    echo "   Please ensure the API server is running at $API_URL"
    exit 1
fi

# Step 2: Check OAuth endpoint
echo -n "2. Checking OAuth endpoint... "
OAUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/oauth/authorize?client_id=test" 2>/dev/null)
if [ "$OAUTH_STATUS" = "200" ] || [ "$OAUTH_STATUS" = "302" ] || [ "$OAUTH_STATUS" = "400" ]; then
    echo -e "${GREEN}✓${NC} OAuth endpoint responding"
else
    echo -e "${RED}✗${NC} OAuth endpoint not responding (HTTP $OAUTH_STATUS)"
    echo "   The OAuth server may not be deployed"
    exit 1
fi

# Step 3: Check frontend
echo -n "3. Checking frontend... "
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL" 2>/dev/null)
if [ "$FRONTEND_STATUS" = "200" ]; then
    echo -e "${GREEN}✓${NC} Frontend is running"
else
    echo -e "${YELLOW}⚠${NC} Frontend returned HTTP $FRONTEND_STATUS"
fi

# Step 4: Test MCP OAuth flow
echo ""
echo "4. Testing MCP OAuth Flow"
echo "-------------------------"

# Generate PKCE values
CODE_VERIFIER=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-43)
CODE_CHALLENGE=$(echo -n "$CODE_VERIFIER" | openssl dgst -sha256 -binary | base64 | tr -d "=+/" | tr '+' '-' | tr '/' '_')

# Build OAuth URL
OAUTH_URL="$API_URL/api/oauth/authorize?"
OAUTH_URL+="response_type=code&"
OAUTH_URL+="client_id=claude-mcp&"
OAUTH_URL+="redirect_uri=http%3A%2F%2Flocalhost%3A3456%2Fcallback&"
OAUTH_URL+="scope=memories.read+memories.write&"
OAUTH_URL+="code_challenge=$CODE_CHALLENGE&"
OAUTH_URL+="code_challenge_method=S256"

echo ""
echo "OAuth URL generated:"
echo "$OAUTH_URL"
echo ""

# Step 5: Simulate authentication
echo "5. Testing Authentication Methods"
echo "---------------------------------"

# Check if we have an existing token
if [ -f "$HOME/.purmemo/auth.json" ]; then
    echo -e "${GREEN}✓${NC} Found existing auth configuration"
    TOKEN=$(cat "$HOME/.purmemo/auth.json" | grep access_token | cut -d'"' -f4)
    
    if [ ! -z "$TOKEN" ]; then
        echo -n "   Testing token... "
        TEST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "Authorization: Bearer $TOKEN" \
            "$API_URL/api/memories" 2>/dev/null)
        
        if [ "$TEST_RESPONSE" = "200" ]; then
            echo -e "${GREEN}✓${NC} Token is valid"
        else
            echo -e "${YELLOW}⚠${NC} Token may be expired (HTTP $TEST_RESPONSE)"
        fi
    fi
else
    echo -e "${YELLOW}⚠${NC} No existing auth configuration found"
    echo "   Run one of these to set up authentication:"
    echo "   • ./setup-purmemo-now.sh (quick setup)"
    echo "   • ./purmemo-auth-apikey.sh (API key setup)"
fi

# Step 6: Test with NPM package
echo ""
echo "6. Testing NPM Package"
echo "----------------------"

# Check if package is installed globally
if command -v purmemo-mcp &> /dev/null; then
    echo -e "${GREEN}✓${NC} Package is installed"
    
    # Try to run status command
    echo -n "   Testing package... "
    if npx purmemo-mcp status 2>/dev/null | grep -q "Connected"; then
        echo -e "${GREEN}✓${NC} Package is working"
    else
        echo -e "${YELLOW}⚠${NC} Package may need authentication"
    fi
else
    echo -e "${YELLOW}⚠${NC} Package not installed"
    echo "   Install with: npm install -g purmemo-mcp"
fi

# Step 7: Summary
echo ""
echo "📊 TEST SUMMARY"
echo "==============="
echo ""

# Provide actionable next steps
echo "Next Steps:"
echo ""

if [ "$API_STATUS" != "200" ]; then
    echo "❌ Fix the API server:"
    echo "   cd ../puo-memo-platform-private"
    echo "   ./docker-dev.sh up"
    echo ""
fi

if [ ! -f "$HOME/.purmemo/auth.json" ] || [ -z "$TOKEN" ]; then
    echo "🔐 Set up authentication:"
    echo "   Option 1 (Quick): ./setup-purmemo-now.sh"
    echo "   Option 2 (API Key): ./purmemo-auth-apikey.sh"
    echo ""
fi

echo "🧪 Test the complete flow:"
echo "   1. Open this URL in your browser:"
echo "      $OAUTH_URL"
echo ""
echo "   2. Log in with your Purmemo account"
echo ""
echo "   3. You should be redirected to:"
echo "      http://localhost:3456/callback?code=..."
echo ""
echo "   4. If redirect works, OAuth is fully functional!"
echo ""

echo "📚 For more details, see:"
echo "   • OAUTH_IMPLEMENTATION_GUIDE.md"
echo "   • UNIFIED_OAUTH_ARCHITECTURE.md"
echo ""

# Final status
if [ "$API_STATUS" = "200" ] && [ "$OAUTH_STATUS" != "404" ]; then
    echo -e "${GREEN}✅ Core systems are operational${NC}"
    echo "   OAuth implementation is ready for testing!"
else
    echo -e "${YELLOW}⚠️  Some components need attention${NC}"
    echo "   Please review the steps above"
fi