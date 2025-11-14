#!/bin/bash
# Test ARI Connection Script

echo "======================================"
echo " ARI Connection Test"
echo "======================================"
echo ""

# Load .env file
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi

echo "Testing ARI connection with credentials from .env:"
echo "Host: $ARI_HOST"
echo "Port: $ARI_PORT"
echo "Username: $ARI_USERNAME"
echo "Password: ${ARI_PASSWORD:0:3}***${ARI_PASSWORD: -3}"
echo ""

# Test 1: Basic connectivity
echo "Test 1: Network connectivity"
if ping -c 1 -W 2 $ARI_HOST > /dev/null 2>&1; then
    echo "✓ Host is reachable"
else
    echo "✗ Host is not reachable"
    exit 1
fi
echo ""

# Test 2: Port accessibility
echo "Test 2: ARI port accessibility"
if timeout 2 bash -c "cat < /dev/null > /dev/tcp/$ARI_HOST/$ARI_PORT" 2>/dev/null; then
    echo "✓ Port $ARI_PORT is open"
else
    echo "✗ Port $ARI_PORT is closed or filtered"
    exit 1
fi
echo ""

# Test 3: ARI authentication (raw curl)
echo "Test 3: ARI authentication"
echo "Running: curl -v -u username:password http://$ARI_HOST:$ARI_PORT/ari/asterisk/info"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -u "$ARI_USERNAME:$ARI_PASSWORD" \
    "http://$ARI_HOST:$ARI_PORT/ari/asterisk/info" 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')

echo "HTTP Status Code: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ Authentication successful!"
    echo ""
    echo "Response:"
    echo "$BODY" | head -20
    exit 0
elif [ "$HTTP_CODE" = "401" ]; then
    echo "✗ Authentication failed (401 Unauthorized)"
    echo ""
    echo "Common causes:"
    echo "1. Password contains special characters that need escaping"
    echo "2. Username/password doesn't match FreePBX configuration"
    echo "3. ARI user doesn't exist or is disabled"
    echo ""
    echo "Response:"
    echo "$BODY"
    echo ""
    echo "----------------------------------------"
    echo "TROUBLESHOOTING STEPS:"
    echo "----------------------------------------"
    echo ""
    echo "1. Check if ARI user exists on FreePBX:"
    echo "   SSH to FreePBX and run: asterisk -rx 'ari show users'"
    echo ""
    echo "2. Check ari.conf on FreePBX:"
    echo "   cat /etc/asterisk/ari.conf | grep -A 5 '\[voiceassistant\]'"
    echo ""
    echo "3. If password has special characters (+, =, /, etc):"
    echo "   Option A: Change to simpler password (letters, numbers, dash, underscore only)"
    echo "   Option B: URL encode the password in .env file"
    echo ""
    echo "4. Test manually from command line:"
    echo "   curl -u '$ARI_USERNAME:$ARI_PASSWORD' http://$ARI_HOST:$ARI_PORT/ari/asterisk/info"
    echo ""
    exit 1
else
    echo "✗ Unexpected HTTP code: $HTTP_CODE"
    echo ""
    echo "Response:"
    echo "$BODY"
    exit 1
fi
