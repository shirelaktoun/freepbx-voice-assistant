#!/bin/bash
#
# Test script for outbound calling functionality
# Usage: ./test-outbound-call.sh <destination_number>
#

DESTINATION=$1
SERVER_URL="http://localhost:3000"

if [ -z "$DESTINATION" ]; then
    echo "Usage: $0 <destination_number>"
    echo "Example: $0 1003"
    echo "Example: $0 +1234567890"
    exit 1
fi

echo "=========================================="
echo "Outbound Call Test"
echo "=========================================="
echo "Destination: $DESTINATION"
echo "Server: $SERVER_URL"
echo ""

# Initiate outbound call
echo "1. Initiating outbound call..."
RESPONSE=$(curl -s -X POST "$SERVER_URL/ari/originate" \
    -H "Content-Type: application/json" \
    -d "{
        \"destination\": \"$DESTINATION\",
        \"callerId\": \"1002\"
    }")

echo "Response:"
echo "$RESPONSE" | jq .

# Extract call ID
CALL_ID=$(echo "$RESPONSE" | jq -r '.callId // empty')

if [ -z "$CALL_ID" ]; then
    echo ""
    echo "❌ Failed to initiate call"
    exit 1
fi

echo ""
echo "✅ Call initiated successfully!"
echo "Call ID: $CALL_ID"
echo ""

# Wait a moment for the call to be established
sleep 2

# Get call status
echo "2. Checking call status..."
curl -s "$SERVER_URL/ari/calls/$CALL_ID" | jq .

echo ""
echo "3. Listing all active calls..."
curl -s "$SERVER_URL/ari/calls" | jq .

echo ""
echo "=========================================="
echo "Test complete!"
echo ""
echo "To hangup the call manually, run:"
echo "curl -X DELETE $SERVER_URL/ari/calls/$CALL_ID"
echo "=========================================="
