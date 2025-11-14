#!/bin/bash
# FreePBX Voice Assistant - Diagnostic Script
# Run this to check your setup

echo "======================================"
echo " FreePBX Voice Assistant Diagnostics"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: .env file exists
echo -n "Checking .env file... "
if [ -f ".env" ]; then
    echo -e "${GREEN}✓ Found${NC}"

    # Check critical variables
    if grep -q "OPENAI_API_KEY=sk-" .env; then
        echo -e "  ${GREEN}✓${NC} OpenAI API key configured"
    else
        echo -e "  ${RED}✗${NC} OpenAI API key missing or invalid"
    fi

    if grep -q "ARI_HOST=" .env && ! grep -q "ARI_HOST=YOUR" .env; then
        echo -e "  ${GREEN}✓${NC} ARI_HOST configured"
    else
        echo -e "  ${RED}✗${NC} ARI_HOST not configured"
    fi

    if grep -q "SERVER_HOST=" .env && ! grep -q "SERVER_HOST=YOUR" .env; then
        echo -e "  ${GREEN}✓${NC} SERVER_HOST configured"
    else
        echo -e "  ${RED}✗${NC} SERVER_HOST not configured (critical for RTP)"
    fi
else
    echo -e "${RED}✗ Not found${NC}"
    echo "  Run: cp .env.example .env (if available)"
fi
echo ""

# Check 2: Node.js installed
echo -n "Checking Node.js... "
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓ Installed ($NODE_VERSION)${NC}"
else
    echo -e "${RED}✗ Not installed${NC}"
    echo "  Install: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt install -y nodejs"
fi
echo ""

# Check 3: Dependencies installed
echo -n "Checking npm dependencies... "
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓ Installed${NC}"
else
    echo -e "${RED}✗ Not installed${NC}"
    echo "  Run: npm install"
fi
echo ""

# Check 4: Application running
echo -n "Checking if application is running... "
if pgrep -f "node.*index.js" > /dev/null; then
    echo -e "${GREEN}✓ Running${NC}"
    PID=$(pgrep -f "node.*index.js")
    echo "  Process ID: $PID"
else
    echo -e "${RED}✗ Not running${NC}"
    echo "  Start: node index.js"
fi
echo ""

# Check 5: API endpoint
echo -n "Checking API endpoint... "
if curl -s http://localhost:3000/status > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Responding${NC}"

    # Get status details
    STATUS=$(curl -s http://localhost:3000/status)

    if echo "$STATUS" | grep -q '"ari_connected":true'; then
        echo -e "  ${GREEN}✓${NC} ARI connected to FreePBX"
    else
        echo -e "  ${RED}✗${NC} ARI not connected"
        echo "    - Check FreePBX ARI configuration"
        echo "    - Verify ARI credentials in .env"
    fi

    if echo "$STATUS" | grep -q '"rtp_server":true'; then
        echo -e "  ${GREEN}✓${NC} RTP server running"
    else
        echo -e "  ${RED}✗${NC} RTP server not running"
    fi
else
    echo -e "${RED}✗ Not responding${NC}"
    echo "  Application may not be running or port 3000 is blocked"
fi
echo ""

# Check 6: Ports
echo "Checking ports:"
echo -n "  Port 3000 (API)... "
if netstat -tuln 2>/dev/null | grep -q ":3000 " || ss -tuln 2>/dev/null | grep -q ":3000 "; then
    echo -e "${GREEN}✓ Listening${NC}"
else
    echo -e "${RED}✗ Not listening${NC}"
fi

echo -n "  Port 10000/udp (RTP)... "
if netstat -uln 2>/dev/null | grep -q ":10000 " || ss -uln 2>/dev/null | grep -q ":10000 "; then
    echo -e "${GREEN}✓ Listening${NC}"
else
    echo -e "${RED}✗ Not listening${NC}"
fi
echo ""

# Check 7: Connectivity to FreePBX (if configured)
if [ -f ".env" ]; then
    source .env
    if [ -n "$ARI_HOST" ] && [ "$ARI_HOST" != "YOUR_FREEPBX_IP" ]; then
        echo "Checking FreePBX connectivity:"
        echo -n "  Ping $ARI_HOST... "
        if ping -c 1 -W 2 $ARI_HOST > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Reachable${NC}"
        else
            echo -e "${RED}✗ Not reachable${NC}"
        fi

        echo -n "  ARI port ($ARI_HOST:$ARI_PORT)... "
        if timeout 2 bash -c "cat < /dev/null > /dev/tcp/$ARI_HOST/$ARI_PORT" 2>/dev/null; then
            echo -e "${GREEN}✓ Open${NC}"

            # Test ARI authentication
            echo -n "  ARI authentication... "
            if [ -n "$ARI_USERNAME" ] && [ -n "$ARI_PASSWORD" ]; then
                ARI_TEST=$(curl -s -u "$ARI_USERNAME:$ARI_PASSWORD" "http://$ARI_HOST:$ARI_PORT/ari/asterisk/info" 2>/dev/null)
                if echo "$ARI_TEST" | grep -q "asterisk"; then
                    echo -e "${GREEN}✓ Valid credentials${NC}"
                else
                    echo -e "${RED}✗ Invalid credentials${NC}"
                    echo "    Check ARI_USERNAME and ARI_PASSWORD in .env"
                    echo "    Verify user exists: asterisk -rx 'ari show users'"
                fi
            fi
        else
            echo -e "${RED}✗ Closed or filtered${NC}"
            echo "    - Check FreePBX firewall"
            echo "    - Verify ARI is enabled: asterisk -rx 'ari show status'"
        fi
        echo ""
    fi
fi

# Summary
echo "======================================"
echo " Summary"
echo "======================================"
echo ""
echo "Next steps:"
echo ""
echo "1. If .env is not configured:"
echo "   - Edit .env and add your settings"
echo "   - See SETUP_GUIDE.md for details"
echo ""
echo "2. If dependencies not installed:"
echo "   - Run: npm install"
echo ""
echo "3. If application not running:"
echo "   - Run: node index.js"
echo "   - Or set up as service (see SETUP_GUIDE.md)"
echo ""
echo "4. If ARI not connected:"
echo "   - Configure FreePBX ARI (see SETUP_GUIDE.md Part 2)"
echo "   - Check firewall rules"
echo ""
echo "5. For phone calls to work:"
echo "   - Configure FreePBX dialplan (SETUP_GUIDE.md Part 2)"
echo "   - Set up inbound routes"
echo "   - Test with extension 9999"
echo ""
echo "For detailed help: see SETUP_GUIDE.md"
echo ""
