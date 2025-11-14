#!/bin/bash
# Quick Asterisk Configuration Check for Voice Assistant
# Run this on the FreePBX server

echo "==========================================="
echo " Voice Assistant Asterisk Configuration"
echo "==========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: ARI Status
echo "1. Checking ARI Status..."
ARI_STATUS=$(asterisk -rx "ari show status" 2>/dev/null | grep -i enabled)
if echo "$ARI_STATUS" | grep -q "Enabled"; then
    echo -e "   ${GREEN}✓${NC} ARI is enabled"
else
    echo -e "   ${RED}✗${NC} ARI is NOT enabled"
    echo "   Fix: Edit /etc/asterisk/ari.conf and set enabled=yes"
fi
echo ""

# Check 2: ARI Users
echo "2. Checking ARI Users..."
ARI_USERS=$(asterisk -rx "ari show users" 2>/dev/null)
if echo "$ARI_USERS" | grep -q "voiceassistant"; then
    echo -e "   ${GREEN}✓${NC} User 'voiceassistant' exists"
    echo "$ARI_USERS" | grep voiceassistant
else
    echo -e "   ${RED}✗${NC} User 'voiceassistant' NOT found"
    echo "   Fix: Add [voiceassistant] section to /etc/asterisk/ari.conf"
fi
echo ""

# Check 3: Dialplan Context
echo "3. Checking Dialplan Context..."
DIALPLAN_CHECK=$(asterisk -rx "dialplan show voice-assistant-test" 2>/dev/null)
if echo "$DIALPLAN_CHECK" | grep -q "9999"; then
    echo -e "   ${GREEN}✓${NC} Context 'voice-assistant-test' exists"
    echo "   Extension 9999 configured"
else
    echo -e "   ${RED}✗${NC} Context 'voice-assistant-test' NOT found"
    echo "   Fix: Add dialplan to /etc/asterisk/extensions_custom.conf"
fi
echo ""

# Check 4: Stasis Apps (only shows if app is connected)
echo "4. Checking Stasis Applications..."
STASIS_APPS=$(asterisk -rx "stasis show apps" 2>/dev/null)
if echo "$STASIS_APPS" | grep -q "voiceassistant"; then
    echo -e "   ${GREEN}✓${NC} Stasis app 'voiceassistant' is registered"
    echo "   Your Node.js application is connected!"
else
    echo -e "   ${YELLOW}⚠${NC} Stasis app 'voiceassistant' NOT registered"
    echo "   This is normal if your Node.js app is not running yet"
    echo "   Start your app: node index.js"
fi
echo ""

# Check 5: Port 8088 listening
echo "5. Checking ARI Port..."
if netstat -tlnp 2>/dev/null | grep -q ":8088.*asterisk" || ss -tlnp 2>/dev/null | grep -q ":8088.*asterisk"; then
    echo -e "   ${GREEN}✓${NC} Port 8088 is listening (Asterisk)"
else
    echo -e "   ${RED}✗${NC} Port 8088 is NOT listening"
    echo "   ARI may not be properly configured"
fi
echo ""

# Check 6: Extension 9999 routing
echo "6. Checking Extension 9999 Routing..."
FROM_INTERNAL=$(asterisk -rx "dialplan show from-internal" 2>/dev/null | grep -A 2 "9999")
if echo "$FROM_INTERNAL" | grep -q "9999"; then
    echo -e "   ${GREEN}✓${NC} Extension 9999 exists in from-internal"
    echo "$FROM_INTERNAL" | head -3
else
    echo -e "   ${YELLOW}⚠${NC} Extension 9999 NOT in from-internal context"
    echo "   You need to route 9999 to voice-assistant-test context"
    echo "   Add to /etc/asterisk/extensions_custom.conf:"
    echo "   [from-internal-custom]"
    echo "   exten => 9999,1,Goto(voice-assistant-test,9999,1)"
fi
echo ""

# Check 7: Test ARI endpoint
echo "7. Testing ARI HTTP Endpoint..."
HTTP_TEST=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8088/ari/api-docs/resources.json 2>/dev/null)
if [ "$HTTP_TEST" = "200" ]; then
    echo -e "   ${GREEN}✓${NC} ARI HTTP endpoint responding (HTTP 200)"
elif [ "$HTTP_TEST" = "401" ]; then
    echo -e "   ${GREEN}✓${NC} ARI HTTP endpoint responding (needs auth)"
else
    echo -e "   ${RED}✗${NC} ARI HTTP endpoint not responding (HTTP $HTTP_TEST)"
fi
echo ""

# Summary
echo "==========================================="
echo " Summary"
echo "==========================================="
echo ""
echo "Configuration files to check/edit:"
echo "  - /etc/asterisk/ari.conf (ARI settings)"
echo "  - /etc/asterisk/extensions_custom.conf (dialplan)"
echo ""
echo "After making changes, reload:"
echo "  asterisk -rx 'module reload res_ari.so'"
echo "  asterisk -rx 'dialplan reload'"
echo ""
echo "To watch calls in real-time:"
echo "  asterisk -rvvvv"
echo ""
echo "To test: Dial 9999 from any internal phone"
echo ""
