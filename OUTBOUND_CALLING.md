# Outbound Calling Functionality

This document describes the new outbound calling feature added to the FreePBX Voice Assistant.

## Overview

The AI assistant can now initiate outbound phone calls to customers, allowing for automated appointment confirmations, follow-ups, reminders, and other proactive customer engagement.

## Features

- **Outbound Call Initiation**: Make calls via HTTP API
- **Call Status Tracking**: Monitor call progress and duration
- **Direction Detection**: System automatically detects inbound vs outbound calls
- **Call Management**: List, query, and hangup active calls
- **AI Integration**: Same OpenAI Realtime API integration for both call directions

## API Endpoints

### 1. Initiate Outbound Call

**Endpoint**: `POST /ari/originate`

**Request Body**:
```json
{
  "destination": "1003",           // Phone number or extension (required)
  "callerId": "1002",              // Caller ID to display (optional)
  "context": "outbound-assistant", // Asterisk context (optional)
  "variables": {}                  // Custom channel variables (optional)
}
```

**Response**:
```json
{
  "success": true,
  "callId": "1730375824.123",
  "destination": "1003",
  "message": "Outbound call initiated successfully"
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/ari/originate \
  -H "Content-Type: application/json" \
  -d '{"destination": "1003", "callerId": "1002"}'
```

### 2. Get Call Status

**Endpoint**: `GET /ari/calls/:callId`

**Response**:
```json
{
  "callId": "1730375824.123",
  "callerNumber": "1003",
  "callerName": "Extension 1003",
  "direction": "outbound",
  "startTime": "2025-10-31T12:30:24.000Z",
  "duration": 45,
  "status": "active"
}
```

**Example**:
```bash
curl http://localhost:3000/ari/calls/1730375824.123
```

### 3. List All Active Calls

**Endpoint**: `GET /ari/calls`

**Response**:
```json
{
  "activeCalls": [
    {
      "callId": "1730375824.123",
      "callerNumber": "1003",
      "callerName": "Extension 1003",
      "direction": "outbound",
      "startTime": "2025-10-31T12:30:24.000Z",
      "duration": 45
    }
  ]
}
```

### 4. Hangup Call

**Endpoint**: `DELETE /ari/calls/:callId`

**Response**:
```json
{
  "success": true,
  "message": "Call 1730375824.123 hung up successfully"
}
```

**Example**:
```bash
curl -X DELETE http://localhost:3000/ari/calls/1730375824.123
```

## How It Works

### Call Flow

1. **API Request**: HTTP POST to `/ari/originate` with destination number
2. **ARI Origination**: System uses Asterisk ARI to create outbound channel
3. **Dialing**: Asterisk dials the destination number
4. **Answer Detection**: When answered, channel enters Stasis application
5. **Bridge Creation**: Audio bridge established between parties
6. **AI Session**: OpenAI Realtime session started
7. **Conversation**: AI assistant converses with the called party
8. **Completion**: Call ends naturally or via hangup API

### Technical Details

**Channel Detection**:
- Outbound calls are tagged with `appArgs: 'outbound'` during origination
- `handleIncomingCall()` detects direction via `event.args.includes('outbound')`
- Outbound calls skip the `channel.answer()` step (already answered)

**Endpoint Format**:
- Local extensions (3-4 digits): `PJSIP/1003`
- External numbers: Uses configured trunk routing

**Audio Handling**:
- Same ulaw/8kHz audio pipeline as inbound calls
- RTP handler works bidirectionally
- No changes needed to audio infrastructure

## Testing

A test script is provided: `test-outbound-call.sh`

**Usage**:
```bash
cd /opt/freepbx-voice-assistant
./test-outbound-call.sh 1003
```

**Manual Testing**:
```bash
# 1. Initiate call
curl -X POST http://localhost:3000/ari/originate \
  -H "Content-Type: application/json" \
  -d '{"destination": "1003"}'

# 2. Check status
curl http://localhost:3000/ari/calls

# 3. Get specific call info
curl http://localhost:3000/ari/calls/<callId>

# 4. Hangup if needed
curl -X DELETE http://localhost:3000/ari/calls/<callId>
```

## Use Cases

### 1. Appointment Confirmations
```javascript
// After scheduling an appointment via function call
await fetch('http://localhost:3000/ari/originate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    destination: customerPhone,
    variables: { APPOINTMENT_ID: '12345' }
  })
});
```

### 2. Automated Reminders
Schedule calls to remind customers about upcoming service:
```bash
curl -X POST http://localhost:3000/ari/originate \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "+1234567890",
    "variables": {
      "REMINDER_TYPE": "service_due",
      "CUSTOMER_ID": "67890"
    }
  }'
```

### 3. Follow-up Calls
Call customers after service completion:
```bash
curl -X POST http://localhost:3000/ari/originate \
  -H "Content-Type: application/json" \
  -d '{"destination": "1003", "callerId": "1002"}'
```

## Configuration Requirements

### FreePBX/Asterisk Setup

1. **ARI User Permissions**: The ARI user must have permission to originate calls
2. **Dialplan Context**: Ensure the context allows outbound dialing
3. **Trunk Configuration**: For external numbers, configure a SIP trunk
4. **Firewall**: Ensure RTP ports are open for two-way audio

### Environment Variables

All existing `.env` variables work for outbound calls:
- `ARI_HOST`, `ARI_PORT`, `ARI_USERNAME`, `ARI_PASSWORD`
- `SERVER_HOST`, `RTP_PORT`
- `OPENAI_API_KEY`
- `SIP_EXTENSION` (used as default caller ID)

## Error Handling

### Common Errors

**503 - ARI Not Initialized**:
```json
{"error": "ARI not initialized", "message": "Phone call system is not available"}
```
- Check ARI connection in server logs
- Verify ARI credentials in `.env`

**400 - Missing Destination**:
```json
{"error": "Missing required parameter: destination"}
```
- Include `destination` in request body

**500 - Origination Failed**:
```json
{"error": "Failed to initiate outbound call", "message": "..."}
```
- Check FreePBX logs: `/var/log/asterisk/full`
- Verify extension/number is valid
- Check trunk configuration for external numbers

**404 - Call Not Found**:
```json
{"error": "Call not found", "message": "No active call with ID 1730375824.123"}
```
- Call may have already ended
- Verify call ID is correct

## Monitoring

### View Active Calls
```bash
curl http://localhost:3000/ari/calls
```

### Check Server Status
```bash
curl http://localhost:3000/status
```

### View Logs
```bash
sudo journalctl -u freepbx-voice.service -f
```

## Code Changes Summary

### Files Modified

1. **index.js**:
   - Added `POST /ari/originate` endpoint
   - Added `GET /ari/calls/:callId` endpoint
   - Added `DELETE /ari/calls/:callId` endpoint

2. **ari-handler.js**:
   - Added `makeOutboundCall()` method
   - Modified `handleIncomingCall()` to detect call direction
   - Updated call storage to track `direction`
   - Updated `getActiveCalls()` to include direction

### New Files

1. **test-outbound-call.sh**: Test script for outbound calling

## Future Enhancements

Potential improvements for future versions:

- [ ] Call queuing and scheduling
- [ ] Retry logic for failed calls
- [ ] Call recording integration
- [ ] Analytics and reporting
- [ ] Webhook callbacks for call events
- [ ] Campaign management for bulk calling
- [ ] Custom AI instructions per call
- [ ] Integration with CRM systems

## Support

For issues or questions:
1. Check server logs: `sudo journalctl -u freepbx-voice.service -f`
2. Check Asterisk logs: `/var/log/asterisk/full`
3. Verify ARI connection: `curl http://localhost:3000/status`
4. Test with local extension first before external numbers

## License

Same as main FreePBX Voice Assistant application.
