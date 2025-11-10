# FreePBX Voice Assistant - Complete Documentation

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Function Descriptions](#function-descriptions)
4. [Application Server Setup](#application-server-setup)
5. [FreePBX/Asterisk Configuration](#freepbxasterisk-configuration)
6. [API Reference](#api-reference)
7. [Make.com Integration](#makecom-integration)
8. [User Guide](#user-guide)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The FreePBX Voice Assistant is an AI-powered phone system that uses OpenAI's GPT-4 Realtime API to handle both inbound and outbound calls. It integrates with FreePBX/Asterisk using ARI (Asterisk REST Interface) and provides real-time audio conversation capabilities.

### Key Features

- **Inbound Call Handling**: Answers calls and assists customers
- **Outbound Call Capability**: Makes calls programmatically
- **AI-Powered Conversations**: Natural language understanding
- **Function Calling**: Schedules appointments, requests towing, callbacks
- **Call Transfer**: Seamlessly transfers to human agents
- **Webhook Integration**: Logs all call events to Make.com
- **Customizable Greetings**: Different greetings for inbound/outbound calls

### Technology Stack

- **Application**: Node.js with Fastify
- **AI**: OpenAI GPT-4 Realtime API
- **PBX**: FreePBX 17 with Asterisk
- **Protocol**: ARI (Asterisk REST Interface)
- **Audio**: RTP/ulaw (8kHz)
- **Webhooks**: Make.com automation

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Call Flow Diagram                       │
└─────────────────────────────────────────────────────────────┘

Inbound Call:
Caller → SIP Trunk → Asterisk → Dialplan → Stasis App → ARI Handler
                                                              ↓
                                                    OpenAI Realtime API
                                                              ↓
                                            RTP Audio (bidirectional)
                                                              ↓
                                                        AI Response
                                                              ↓
                                               Function Calls (optional)
                                                              ↓
                                                   Webhooks → Make.com

Outbound Call:
API Request → ARI Handler → Asterisk → Local Channel → from-internal
                                            ↓
                                    Outbound Routes
                                            ↓
                                       SIP Trunk
                                            ↓
                                      Destination
```

### Components

1. **Application Server** (194.164.23.100:3000)
   - Node.js application
   - Handles ARI events
   - Manages OpenAI sessions
   - Processes RTP audio
   - Sends webhooks

2. **FreePBX/Asterisk Server** (87.106.72.7)
   - SIP registration
   - Call routing
   - External media channels
   - Bridge management

3. **OpenAI API**
   - Real-time voice conversation
   - Function calling
   - Text-to-Speech (TTS)
   - Speech-to-Text (STT)

4. **Make.com**
   - Webhook receiver
   - Call logging
   - Excel integration
   - Notifications

---

## Function Descriptions

The voice assistant has several built-in functions that can be triggered during conversations.

### 1. get_automotive_info

**Purpose**: Provides information about automotive services.

**Parameters**:
- `service_type` (required): Type of service (towing, repair, maintenance, inspection)
- `question` (optional): Specific question about the service

**Example Conversation**:
```
Customer: "How much is an oil change?"
Assistant: [Calls get_automotive_info with service_type="maintenance"]
Assistant: "Regular maintenance includes oil changes at $45..."
```

**Implementation**:
```javascript
{
    type: 'function',
    name: 'get_automotive_info',
    description: 'Get information about automotive services, pricing, or availability',
    parameters: {
        type: 'object',
        properties: {
            service_type: {
                type: 'string',
                description: 'Type of service: towing, repair, maintenance, inspection'
            },
            question: {
                type: 'string',
                description: 'Specific question about the service'
            }
        },
        required: ['service_type']
    }
}
```

---

### 2. schedule_appointment

**Purpose**: Books an appointment for automotive service.

**Parameters**:
- `service_type` (required): Type of service needed
- `customer_phone` (required): Customer phone number
- `preferred_date` (optional): Date in YYYY-MM-DD format
- `preferred_time` (optional): Time in HH:MM format
- `customer_name` (optional): Customer name
- `notes` (optional): Additional notes

**Example Conversation**:
```
Customer: "I'd like to schedule an oil change for tomorrow at 2pm"
Assistant: [Calls schedule_appointment]
Assistant: "Great! I've scheduled your oil change appointment..."
```

**Webhook Sent**:
```json
{
  "event_type": "appointment",
  "timestamp": "2025-11-02T12:00:00Z",
  "call": { ... },
  "action": {
    "type": "appointment",
    "details": {
      "service_type": "oil change",
      "preferred_date": "2025-11-03",
      "preferred_time": "14:00",
      "customer_name": "John Doe",
      "customer_phone": "+1234567890",
      "notes": ""
    }
  }
}
```

---

### 3. request_towing

**Purpose**: Requests emergency towing service.

**Parameters**:
- `location` (required): Current location or address
- `customer_phone` (required): Customer phone number
- `destination` (optional): Destination address
- `vehicle_type` (optional): Type of vehicle
- `urgency` (optional): normal, urgent, or emergency

**Example Conversation**:
```
Customer: "I need a tow truck, I'm broken down on Highway 95"
Assistant: [Calls request_towing]
Assistant: "Help is on the way! A tow truck is being dispatched..."
```

**Webhook Sent**:
```json
{
  "event_type": "towing",
  "action": {
    "type": "towing",
    "details": {
      "location": "Highway 95",
      "destination": "",
      "vehicle_type": "",
      "urgency": "urgent",
      "customer_phone": "+1234567890"
    }
  }
}
```

---

### 4. transfer_to_human

**Purpose**: Transfers the call to a human agent.

**Parameters**:
- `reason` (required): Reason for transfer
- `extension` (optional): Extension to transfer to (default: 7021)

**Example Conversation**:
```
Customer: "Can I speak to someone?"
Assistant: [Calls transfer_to_human]
Assistant: "Certainly! I'm transferring you to a team member now..."
[Call transfers to extension 7021]
```

**Process**:
1. Checks if extension is online
2. If offline, offers callback instead
3. If online, speaks message to caller
4. Waits 3 seconds
5. Transfers call via dialplan
6. Cleans up AI session

**Webhook Sent**:
```json
{
  "event_type": "call_transferred",
  "transfer": {
    "extension": "7021",
    "reason": "Customer requested to speak with a human"
  }
}
```

---

### 5. request_callback

**Purpose**: Logs a callback request from the customer.

**Parameters**:
- `customer_phone` (required): Phone number for callback
- `reason` (required): Reason for callback
- `customer_name` (optional): Customer name
- `preferred_time` (optional): Preferred callback time

**Example Conversation**:
```
Customer: "Can someone call me back about pricing?"
Assistant: [Calls request_callback]
Assistant: "Perfect! I've noted that you'd like a callback..."
```

**Webhook Sent**:
```json
{
  "event_type": "callback_request",
  "action": {
    "type": "callback_request",
    "details": {
      "customer_phone": "+1234567890",
      "customer_name": "Jane Smith",
      "reason": "Question about pricing",
      "preferred_time": "afternoon"
    }
  }
}
```

---

## Application Server Setup

### Prerequisites

- Ubuntu 20.04+ or Debian 11+
- Node.js 18+
- Network connectivity to FreePBX server
- OpenAI API key
- Public IP address (for RTP audio)

### Step 1: Install Node.js

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v18.x or higher
npm --version
```

### Step 2: Create Application Directory

```bash
# Create directory
sudo mkdir -p /opt/freepbx-voice-assistant
sudo chown $USER:$USER /opt/freepbx-voice-assistant
cd /opt/freepbx-voice-assistant
```

### Step 3: Upload Application Files

Upload these files to `/opt/freepbx-voice-assistant`:
- `index.js` - Main application
- `ari-handler.js` - ARI event handler
- `rtp-handler.js` - RTP audio handler
- `audio-utils.js` - Audio utilities
- `package.json` - Dependencies
- `.env` - Configuration
- `dashboard.html` - Web dashboard
- `test-client.html` - Test interface

### Step 4: Install Dependencies

```bash
cd /opt/freepbx-voice-assistant
npm install
```

Dependencies installed:
- `fastify` - Web server
- `@fastify/formbody` - Form parsing
- `@fastify/websocket` - WebSocket support
- `ws` - WebSocket client
- `ari-client` - Asterisk ARI client
- `node-fetch` - HTTP client
- `dotenv` - Environment variables

### Step 5: Configure Environment Variables

Create `.env` file:

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-proj-YOUR_API_KEY_HERE

# FreePBX/SIP Configuration
FREEPBX_HOST=87.106.72.7
SIP_EXTENSION=1002
SIP_PASSWORD=your_sip_password

# ARI Configuration
ARI_HOST=87.106.72.7
ARI_PORT=8088
ARI_USERNAME=voiceassistant
ARI_PASSWORD=VoiceAI2024Secure!
ARI_APP_NAME=voiceassistant

# Server Configuration
SERVER_HOST=194.164.23.100
SERVER_PORT=3000

# RTP Configuration
RTP_HOST=194.164.23.100
RTP_PORT=10000

# Webhook URLs
MAKE_WEBHOOK_URL=https://hook.eu2.make.com/YOUR_WEBHOOK_ID

# Greeting Configuration
INBOUND_GREETING="Hello, thank you for calling Deepcut Garage. This is Sophie, your AI assistant. How can I help you today?"
OUTBOUND_GREETING="Hello! This is Sophie calling from Deepcut Garage. I hope I'm not catching you at a bad time."

# Debug Options
DEBUG=true
LOG_LEVEL=info
```

**Important Configuration Notes**:

- `SERVER_HOST`: Must be your PUBLIC IP address (for RTP)
- `RTP_HOST`: Same as SERVER_HOST
- `ARI_HOST`: FreePBX server IP
- `MAKE_WEBHOOK_URL`: Get from Make.com webhook module

### Step 6: Set Directory Permissions

```bash
sudo chmod +rx /opt/freepbx-voice-assistant
sudo chmod 600 /opt/freepbx-voice-assistant/.env
```

### Step 7: Create Systemd Service

Create `/etc/systemd/system/freepbx-voice.service`:

```ini
[Unit]
Description=FreePBX OpenAI Voice Assistant
After=network.target

[Service]
Type=simple
User=make-sftp
WorkingDirectory=/opt/freepbx-voice-assistant
ExecStart=/bin/bash -c 'set -a && source /opt/freepbx-voice-assistant/.env && set +a && /usr/bin/node index.js'
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable freepbx-voice.service
sudo systemctl start freepbx-voice.service
sudo systemctl status freepbx-voice.service
```

### Step 8: Configure Firewall

```bash
# Allow HTTP API
sudo ufw allow 3000/tcp

# Allow RTP audio
sudo ufw allow 10000/udp

# Reload firewall
sudo ufw reload
```

### Step 9: Verify Installation

```bash
# Check service status
sudo systemctl status freepbx-voice.service

# Check logs
sudo journalctl -u freepbx-voice.service -f

# Test API
curl http://localhost:3000/status
```

Expected output:
```json
{
  "sip_registered": true,
  "ari_connected": true,
  "rtp_server": true,
  "active_calls": 0,
  "rtp_sessions": 0
}
```

---

## FreePBX/Asterisk Configuration

### Prerequisites

- FreePBX 17 or later
- Asterisk 20 or later
- ARI enabled
- Admin access to FreePBX

### Step 1: Enable ARI

```bash
# SSH into FreePBX server
ssh root@87.106.72.7

# Edit ARI configuration
nano /etc/asterisk/ari.conf
```

Add/modify:

```ini
[general]
enabled = yes
pretty = yes
allowed_origins = *

[voiceassistant]
type = user
read_only = no
password = VoiceAI2024Secure!
password_format = plain
```

Reload Asterisk:

```bash
asterisk -rx "module reload res_ari.so"
asterisk -rx "ari show users"
```

### Step 2: Create SIP Extension

In FreePBX GUI:

1. Go to **Applications** → **Extensions**
2. Click **Add Extension** → **Add New PJSIP Extension**
3. Configure:
   - **Extension**: 1002
   - **Display Name**: Voice Assistant
   - **Secret**: [strong password]
   - **Context**: from-internal
4. Click **Submit** and **Apply Config**

### Step 3: Create Stasis Dialplan

SSH into FreePBX:

```bash
nano /etc/asterisk/extensions_custom.conf
```

Add this context:

```ini
[from-pstn-voice-assistant]
exten => _X.,1,NoOp(Incoming call to Voice Assistant: ${CALLERID(num)})
 same => n,Answer()
 same => n,Wait(1)
 same => n,Stasis(voiceassistant)
 same => n,Hangup()

; Optional: Direct DID routing
[from-trunk-voice-assistant]
exten => YOUR_DID,1,Goto(from-pstn-voice-assistant,${EXTEN},1)
```

Reload dialplan:

```bash
asterisk -rx "dialplan reload"
```

### Step 4: Configure Inbound Route

In FreePBX GUI:

1. Go to **Connectivity** → **Inbound Routes**
2. Click **Add Inbound Route**
3. Configure:
   - **Description**: Voice Assistant Route
   - **DID Number**: [Your DID or leave blank for any]
   - **Set Destination**: Custom Destination → `from-pstn-voice-assistant,s,1`
4. Click **Submit** and **Apply Config**

### Step 5: Verify ARI Connection

From application server:

```bash
# Test ARI connectivity
curl -u voiceassistant:VoiceAI2024Secure! \
  http://87.106.72.7:8088/ari/asterisk/info

# Expected output: JSON with Asterisk info
```

From application logs:

```bash
sudo journalctl -u freepbx-voice.service -n 50 | grep ARI
```

Look for:
- `✅ Connected to Asterisk ARI`
- `📱 Stasis application "voiceassistant" started`

### Step 6: Configure Outbound Routes (for Outbound Calls)

The application uses Local channels to route through `from-internal` context, which means your existing outbound routes will work automatically.

**Verify outbound routing**:

```bash
asterisk -rx "dialplan show from-internal" | grep -A 3 "6000"
```

Your outbound routes (like `calls_to_capraz`) should handle the calls normally.

### Step 7: Test Call Flow

**Test Inbound**:
1. Call your DID
2. Should hear: "Hello, thank you for calling Deepcut Garage..."
3. Check logs: `sudo journalctl -u freepbx-voice.service -f`

**Test Outbound**:
```bash
curl -X POST http://194.164.23.100:3000/ari/originate \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "6000",
    "callerId": "1002"
  }'
```

### Troubleshooting FreePBX Issues

**ARI connection fails**:
```bash
# Check if ARI is enabled
asterisk -rx "ari show status"

# Check ARI users
asterisk -rx "ari show users"

# Check firewall
sudo ufw status | grep 8088
```

**Calls not entering Stasis**:
```bash
# Check dialplan
asterisk -rx "dialplan show from-pstn-voice-assistant"

# Enable dialplan debugging
asterisk -rx "dialplan set debug on"

# Make a test call and watch
asterisk -rx "core show channels verbose"
```

**Audio issues**:
```bash
# Check RTP in Asterisk
asterisk -rx "rtp set debug on"

# Check external media channels
asterisk -rx "channel show all" | grep UnicastRTP
```

---

## API Reference

### Base URL

```
http://194.164.23.100:3000
```

### Authentication

Currently no authentication. Secure with firewall rules or add auth middleware.

---

### GET /status

Get service status.

**Response**:
```json
{
  "sip_registered": true,
  "ari_connected": true,
  "rtp_server": true,
  "active_calls": 0,
  "rtp_sessions": 0
}
```

---

### GET /diagnostics

Get detailed diagnostics.

**Response**:
```json
{
  "timestamp": "2025-11-02T12:00:00Z",
  "uptime": 3600,
  "memory": {...},
  "config": {
    "freepbx_host": "87.106.72.7",
    "ari_configured": true,
    "rtp_port": 10000
  },
  "status": {
    "sip_registered": true,
    "ari_connected": true,
    "active_calls": 0
  }
}
```

---

### GET /ari/calls

List active calls.

**Response**:
```json
{
  "activeCalls": [
    {
      "callId": "channel-123",
      "callerNumber": "+1234567890",
      "callerName": "John Doe",
      "direction": "inbound",
      "startTime": "2025-11-02T12:00:00Z",
      "duration": 45
    }
  ]
}
```

---

### POST /ari/originate

Make an outbound call.

**Request**:
```json
{
  "destination": "6000",
  "callerId": "1002",
  "context": "from-internal",
  "variables": {
    "CUSTOM_VAR": "value"
  }
}
```

**Parameters**:
- `destination` (required): Phone number or extension
- `callerId` (optional): Caller ID to display
- `context` (optional): Dialplan context (default: from-internal)
- `variables` (optional): Channel variables

**Response** (Success):
```json
{
  "success": true,
  "callId": "channel-456",
  "destination": "6000",
  "message": "Outbound call initiated successfully"
}
```

**Response** (Error):
```json
{
  "error": "Failed to initiate outbound call",
  "message": "Extension not found"
}
```

**Example with curl**:
```bash
curl -X POST http://194.164.23.100:3000/ari/originate \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "+1234567890",
    "callerId": "Deepcut Garage",
    "variables": {
      "CAMPAIGN": "follow_up"
    }
  }'
```

---

### GET /ari/calls/:callId

Get specific call details.

**Response**:
```json
{
  "callId": "channel-123",
  "callerNumber": "+1234567890",
  "callerName": "John Doe",
  "direction": "inbound",
  "startTime": "2025-11-02T12:00:00Z",
  "duration": 45,
  "status": "active"
}
```

---

### DELETE /ari/calls/:callId

Hangup a specific call.

**Response**:
```json
{
  "success": true,
  "message": "Call channel-123 hung up successfully"
}
```

---

### GET /dashboard

Access web dashboard (HTML interface).

Features:
- Real-time call status
- System diagnostics
- Initiate outbound calls
- View active sessions

---

## Make.com Integration

### Overview

The voice assistant sends webhooks to Make.com for all call events, enabling automation, logging, and notifications.

### Step 1: Create Webhook in Make.com

1. Log into Make.com
2. Create new scenario
3. Add **Webhooks → Custom webhook** module
4. Click "Add" to create webhook
5. Copy the webhook URL (e.g., `https://hook.eu2.make.com/xxxxx`)
6. Add to `.env` file as `MAKE_WEBHOOK_URL`

### Step 2: Test Webhook

```bash
# Send test webhook
curl -X POST https://hook.eu2.make.com/YOUR_WEBHOOK_ID \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "call_started",
    "timestamp": "2025-11-02T12:00:00Z",
    "call": {
      "call_id": "test-123",
      "direction": "inbound",
      "caller_number": "+1234567890",
      "caller_name": "Test User",
      "start_time": "2025-11-02T12:00:00Z",
      "end_time": null,
      "duration_seconds": null
    },
    "action": {},
    "transfer": {},
    "system": {
      "assistant_name": "Sophie",
      "app_version": "2.0"
    }
  }'
```

In Make.com, click "Run once" and send the test. The webhook should show "Successfully determined".

### Step 3: Trigger Outbound Calls from Make.com

#### Module Setup

1. In Make.com scenario, add **HTTP → Make a request** module
2. Configure:
   - **URL**: `http://194.164.23.100:3000/ari/originate`
   - **Method**: POST
   - **Headers**: `Content-Type: application/json`
   - **Body**: (see examples below)

#### Example 1: Simple Outbound Call

```json
{
  "destination": "{{1.phone_number}}",
  "callerId": "1002"
}
```

Map `{{1.phone_number}}` from previous module (e.g., from Excel row or form submission).

#### Example 2: Call with Campaign Tracking

```json
{
  "destination": "{{1.phone_number}}",
  "callerId": "Deepcut Garage",
  "variables": {
    "CAMPAIGN": "{{1.campaign_name}}",
    "CUSTOMER_ID": "{{1.customer_id}}",
    "REFERENCE": "{{1.reference_number}}"
  }
}
```

#### Example 3: Call from Spreadsheet Trigger

**Scenario Flow**:
```
Excel: New Row → HTTP: Make Call → Router (by response) → Excel: Update Status
```

**HTTP Request Body**:
```json
{
  "destination": "{{1.Customer Phone}}",
  "callerId": "{{1.Assigned Agent}}",
  "variables": {
    "LEAD_ID": "{{1.ID}}",
    "SOURCE": "{{1.Lead Source}}"
  }
}
```

**Parse Response**:
- Success: `{{1.success}}` = true → Update row with "Called"
- Error: `{{1.error}}` exists → Update row with "Failed", log error

#### Example 4: Scheduled Callback

**Trigger**: Schedule every 15 minutes

**Filter**: Where callback time <= now

**HTTP Request**:
```json
{
  "destination": "{{1.callback_phone}}",
  "callerId": "1002",
  "variables": {
    "CALLBACK_REASON": "{{1.reason}}",
    "ORIGINAL_CALL_ID": "{{1.original_call_id}}"
  }
}
```

### Step 4: Handle Webhook Responses in Make.com

All call events send webhooks. Create routers to handle each type:

```
Webhook → Router
           ├─ call_started → Log to Excel
           ├─ call_ended → Update duration
           ├─ appointment → Create calendar event
           ├─ towing → Send urgent Teams alert
           ├─ callback_request → Create task
           └─ call_transferred → Notify agent
```

### Step 5: Advanced Automation Examples

#### Auto-Follow-Up Calls

```
Webhook (appointment) → Wait 1 day → HTTP (make outbound call)
                                          ↓
                              "Hi, this is Sophie from Deepcut Garage.
                               I'm calling to confirm your appointment
                               tomorrow at 2pm..."
```

#### Failed Call Retry

```
HTTP (originate) → Router
                     ├─ Success: Log success
                     └─ Error: Wait 1 hour → Retry (max 3 times)
```

#### Intelligent Routing

```
Webhook (call_started) → Get customer from CRM → Router
                                                   ├─ VIP: Immediately transfer
                                                   ├─ Has open ticket: Load context
                                                   └─ New: Standard greeting
```

---

## User Guide

### For End Users (Customers)

#### Calling In (Inbound Calls)

1. **Dial** the business number
2. **Sophie answers**: "Hello, thank you for calling Deepcut Garage..."
3. **Speak naturally**: Describe what you need
4. **Available actions**:
   - Get information about services
   - Schedule appointments
   - Request towing
   - Ask for a callback
   - Transfer to a human

**Example Conversations**:

```
Customer: "I need to schedule an oil change"
Sophie: "I'd be happy to help you schedule an oil change.
         What date works best for you?"
Customer: "How about next Tuesday at 2pm?"
Sophie: "Great! I've scheduled your oil change for next Tuesday
         at 2pm. What's the best phone number to reach you?"
Customer: "555-1234"
Sophie: "Perfect! You should receive a confirmation call at
         555-1234 within the next hour. Is there anything else?"
```

```
Customer: "I'm broken down on Highway 95"
Sophie: "I'm sorry to hear that. Let me get a tow truck to you
         right away. You're on Highway 95. What's your phone number?"
Customer: "555-9876"
Sophie: "Help is on the way! A tow truck is being dispatched to
         Highway 95. The driver will call you at 555-9876 when
         they're close. Stay safe!"
```

```
Customer: "Can I talk to someone?"
Sophie: "Certainly! I'm transferring you to a team member now.
         Please hold for a moment."
[Call transfers to human agent]
```

#### Receiving Calls (Outbound)

1. **Phone rings** from business number
2. **Answer the call**
3. **Sophie introduces**: "Hello! This is Sophie calling from Deepcut Garage..."
4. **Have a conversation** just like inbound

---

### For Administrators

#### Making Outbound Calls

**Via API (curl)**:
```bash
curl -X POST http://194.164.23.100:3000/ari/originate \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "+1234567890",
    "callerId": "Deepcut Garage"
  }'
```

**Via Make.com**:
See [Make.com Integration](#makecom-integration) section above.

**Via Dashboard**:
1. Navigate to `http://194.164.23.100:3000/dashboard`
2. Enter destination number
3. Click "Originate Call"

#### Monitoring Calls

**Real-time logs**:
```bash
sudo journalctl -u freepbx-voice.service -f
```

**Active calls**:
```bash
curl http://194.164.23.100:3000/ari/calls
```

**System status**:
```bash
curl http://194.164.23.100:3000/status
```

#### Customizing Greetings

Edit `/opt/freepbx-voice-assistant/.env`:

```bash
INBOUND_GREETING="Your custom inbound greeting here"
OUTBOUND_GREETING="Your custom outbound greeting here"
```

Restart service:
```bash
sudo systemctl restart freepbx-voice.service
```

See `GREETING_CONFIGURATION.md` for best practices.

#### Customizing System Message (AI Personality)

Edit `/opt/freepbx-voice-assistant/index.js`:

Find `SYSTEM_MESSAGE` constant (around line 85):

```javascript
const SYSTEM_MESSAGE = `You are Sophie, an AI assistant for Deepcut Garage.
You are helpful, friendly, and professional. You can:

1. Answer questions about automotive services
2. Help with roadside assistance and towing
3. Schedule appointments
4. Provide company information
5. Transfer calls to a human team member when requested

Keep responses conversational and concise for voice interaction.`;
```

Restart service after editing.

#### Managing Function Responses

Edit function handlers in `/opt/freepbx-voice-assistant/index.js`:

**Example: Update pricing**:
```javascript
async function handleAutomotiveInfo(args) {
    const services = {
        maintenance: 'Oil changes are $49.99, tire rotations $29.99...',
        // Update prices here
    };
    return services[args.service_type] || 'Please specify service type.';
}
```

---

## Troubleshooting

### Service Won't Start

**Check logs**:
```bash
sudo journalctl -u freepbx-voice.service -n 100
```

**Common issues**:
- Missing `.env` file → Create it
- Syntax error in `.env` → Check quotes around greetings
- Port already in use → Check `netstat -tulpn | grep 3000`
- Node.js not found → Install Node.js 18+

### No Audio on Calls

**Check RTP configuration**:
```bash
# Verify RTP_HOST is public IP
grep RTP_HOST /opt/freepbx-voice-assistant/.env

# Verify firewall
sudo ufw status | grep 10000

# Check RTP sessions
curl http://localhost:3000/ari/rtp-sessions
```

**Asterisk side**:
```bash
asterisk -rx "rtp set debug on"
# Make a call and watch for RTP packets
```

### Outbound Calls Fail

**Check dialplan routing**:
```bash
# On FreePBX server
asterisk -rx "dialplan show from-internal" | grep -A 5 "6000"
```

**Check logs for routing**:
```bash
sudo journalctl -u freepbx-voice.service -f
# Look for: "Routing through FreePBX dialplan"
```

### Webhooks Not Sending

**Verify webhook URL**:
```bash
grep MAKE_WEBHOOK_URL /opt/freepbx-voice-assistant/.env
```

**Test manually**:
```bash
curl -X POST https://hook.eu2.make.com/YOUR_ID \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

**Check logs**:
```bash
sudo journalctl -u freepbx-voice.service -f | grep webhook
# Look for: "✅ Webhook sent successfully"
```

### AI Not Responding Correctly

**Check OpenAI API key**:
```bash
grep OPENAI_API_KEY /opt/freepbx-voice-assistant/.env
```

**Check logs for OpenAI errors**:
```bash
sudo journalctl -u freepbx-voice.service -f | grep -i openai
```

**Common issues**:
- Invalid API key → Update in `.env`
- Rate limit exceeded → Wait or upgrade plan
- Model not available → Check OpenAI status

### Call Quality Issues

**Check codec**:
- System uses g711_ulaw at 8kHz
- Verify trunk supports ulaw

**Check network**:
```bash
ping -c 10 87.106.72.7  # Check latency to FreePBX
```

**Check bandwidth**:
- ulaw requires ~64 kbps per call
- Ensure sufficient bandwidth

---

## Additional Resources

- **Webhook Documentation**: `WEBHOOK_DOCUMENTATION.md`
- **Make.com Scenario Guide**: `MAKE_COM_SCENARIO_GUIDE.md`
- **Greeting Configuration**: `GREETING_CONFIGURATION.md`
- **OpenAI Realtime API**: https://platform.openai.com/docs/guides/realtime
- **Asterisk ARI**: https://docs.asterisk.org/Asterisk_REST_Interface/
- **FreePBX Documentation**: https://wiki.freepbx.org/

---

## Support

For issues or questions:
1. Check logs: `sudo journalctl -u freepbx-voice.service -f`
2. Review this documentation
3. Check component status: `curl http://localhost:3000/diagnostics`
4. Test individual components (ARI, RTP, OpenAI)

## Version

- **Application**: v2.0
- **Documentation**: v1.0
- **Last Updated**: 2025-11-02
