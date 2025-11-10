# Smart Call Transfer with Availability Check

## Overview

The AI assistant now **checks if extension 7021 is online** before attempting a transfer. If the extension is offline, it offers a callback instead of attempting the transfer.

## How It Works

### Scenario 1: Extension 7021 is ONLINE ✅

```
Caller: "Can I speak to a person?"
AI: "Certainly! I'm transferring you to a team member now. Please hold for a moment."
[3 second pause]
[Extension 7021 rings]
[Human agent answers]
Caller: [Connected to agent]
```

### Scenario 2: Extension 7021 is OFFLINE ❌

```
Caller: "Can I speak to a person?"
AI: "I'm sorry, but there's no one else available at the moment. 
     I'd be happy to have a team member call you back. 
     Could you please provide your phone number?"
Caller: "Sure, it's 555-1234"
AI: "Perfect! I've noted that you'd like a callback at 555-1234. 
     A team member will reach out to you as soon as possible. 
     Is there anything else I can help you with right now?"
```

## Technical Flow

### 1. Transfer Request Received

```javascript
// AI calls transfer_to_human function
transfer_to_human({
    reason: "Customer requested to speak with a human"
})
```

### 2. Endpoint Status Check

```javascript
// System checks if extension 7021 is online
const isOnline = await ariHandler.isEndpointOnline('7021');
```

Queries Asterisk ARI for endpoint list and checks:
- Technology: PJSIP
- Resource: 7021
- State: online vs offline

### 3. Decision Logic

**If ONLINE:**
- Proceed with transfer
- Return transfer message
- Execute transfer after 3 seconds

**If OFFLINE:**
- Skip transfer
- Return callback offer message
- AI will collect phone number using `request_callback` function

### 4. Callback Collection

When customer provides phone number:

```javascript
// AI automatically calls this function
request_callback({
    customer_phone: "555-1234",
    reason: "Wanted to speak with human agent - none available",
    preferred_time: "ASAP"
})
```

Callback data is sent to webhook (Make.com) for processing.

## Files Modified

### index.js

**Added:**
1. `request_callback` function to TOOLS array
2. `handleRequestCallback()` function
3. Availability check in `handleTransferToHuman()`

**Changes:**
```javascript
// Before: Always attempted transfer
return {
    __transfer: true,
    extension: '7021',
    message: "Transferring you now..."
};

// After: Checks availability first
const isOnline = await ariHandler.isEndpointOnline('7021');
if (!isOnline) {
    return "No one available. Can I get your number for callback?";
}
// Only transfer if online
```

### ari-handler.js

**Added:**
- `isEndpointOnline(extension)` method

Queries ARI endpoints and returns true/false based on state.

## Logs to Monitor

When transfer is requested:

### Extension ONLINE:
```
Transfer to human requested: {...}
   Checking availability of extension: 7021
📱 Endpoint 7021 status: online
   ✅ Extension 7021 is online - proceeding with transfer
🔀 Transferring call 1730123456.789 to extension 7021
✅ Call transferred successfully to 7021
```

### Extension OFFLINE:
```
Transfer to human requested: {...}
   Checking availability of extension: 7021
📱 Endpoint 7021 status: offline
   ❌ Extension 7021 is offline - offering callback instead
```

When callback is provided:
```
Callback requested: {...}
   Callback details: {
     customer_phone: "555-1234",
     reason: "Wanted to speak with human",
     preferred_time: "ASAP",
     timestamp: "2025-10-31T14:29:00.000Z"
   }
   ✅ Callback request sent to webhook
```

## Webhook Integration

Callback requests are sent to your Make.com webhook:

```json
{
  "type": "callback_request",
  "data": {
    "customer_phone": "555-1234",
    "customer_name": "Not provided",
    "reason": "Customer wanted to speak with agent",
    "preferred_time": "ASAP",
    "timestamp": "2025-10-31T14:29:00.000Z"
  },
  "timestamp": "2025-10-31T14:29:00.000Z"
}
```

You can create automation in Make.com to:
- Send notification to team
- Create ticket in CRM
- Schedule callback task
- Send SMS confirmation to customer

## Testing

### Test Scenario 1: Offline Extension (Current State)

1. Call your system
2. Say: "I want to speak to a person"
3. AI should say: "No one else available... provide your phone number"
4. Provide a number: "My number is 555-1234"
5. AI should confirm: "A team member will reach out..."

Watch logs:
```bash
sudo journalctl -u freepbx-voice.service -f
```

### Test Scenario 2: Online Extension (After Registration)

1. Register extension 7021 (make it online)
2. Call your system
3. Say: "I want to speak to a person"
4. AI should say: "Transferring you now..."
5. Extension 7021 should ring
6. Answer to complete transfer

## Configuration

### Change Target Extension

In `index.js`, find `handleTransferToHuman`:

```javascript
const extension = args.extension || '8000'; // Change from 7021
```

### Change Callback Message

In `handleRequestCallback`:

```javascript
return `Your custom confirmation message here at ${args.customer_phone}...`;
```

### Change Unavailable Message

In `handleTransferToHuman`:

```javascript
return `Your custom unavailable message...`;
```

## Benefits

✅ **No Failed Transfers** - Never attempts to transfer to offline extensions  
✅ **Better UX** - Clear communication about availability  
✅ **Callback Capture** - Automatically collects callback requests  
✅ **Webhook Integration** - Callback data sent to automation system  
✅ **Smart Fallback** - Graceful degradation when agent unavailable  
✅ **Real-time Status** - Checks actual endpoint status before transfer  

## Important Notes

### Extension Status

Check status anytime:
```bash
node test-ari-diagnostics.js | grep 7021
```

Currently:
- Extension 7021: **OFFLINE** ❌
- System will offer callback instead of transfer

When registered:
- Extension 7021: **ONLINE** ✅
- System will transfer calls

### No Other Extensions

The system **will NOT transfer to any other extension** if 7021 is offline. It will:
1. Only offer callback
2. Collect customer's phone number
3. Send callback request to webhook
4. Continue conversation or end call

This ensures:
- No unwanted transfers to wrong people
- Professional handling of unavailability
- Proper callback tracking

## Troubleshooting

### AI Still Tries to Transfer When Offline

Check logs for:
```
📱 Endpoint 7021 status: offline
```

If not appearing, ARI connection may have issues.

### Callback Not Recorded

Check webhook URL is configured:
```bash
grep MAKE_WEBHOOK_URL /opt/freepbx-voice-assistant/.env
```

Check logs for:
```
✅ Callback request sent to webhook
```

### Extension Shows Online But Still No Ring

- Check FreePBX dialplan for extension 7021
- Verify device is actually registered
- Check Asterisk logs: `/var/log/asterisk/full`

## Summary

The AI assistant now:

1. **Checks extension 7021 availability** before transfer
2. **Transfers only if online** - smooth handoff to agent
3. **Offers callback if offline** - professional alternative
4. **Collects callback info** - sent to webhook for follow-up
5. **Never transfers to wrong extensions** - 7021 only or callback

This ensures professional handling of transfer requests regardless of agent availability! 🎉
