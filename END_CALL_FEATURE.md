# End Call Feature Implementation
## AI Can Now End Calls Gracefully

---

## Overview

The AI assistant can now **automatically end calls** when the conversation is complete and the customer has no more questions. This prevents awkward situations where both parties wait for the other to hang up, and reduces unnecessary call duration.

---

## What Was Implemented

### 1. New `end_call` Function Tool

**Location:** `index.js:249-267`

```javascript
{
    type: 'function',
    name: 'end_call',
    description: 'End the call gracefully when the conversation is complete, all customer needs are addressed, and the customer has confirmed they have no other questions. Always ask "Is there anything else I can help you with?" before ending the call.',
    parameters: {
        type: 'object',
        properties: {
            reason: {
                type: 'string',
                description: 'Summary of why the call is ending'
            },
            customer_satisfied: {
                type: 'boolean',
                description: 'Whether the customer appears satisfied'
            }
        },
        required: ['reason']
    }
}
```

**What it does:**
- Allows AI to signal that the call should end
- Captures the reason for ending
- Tracks customer satisfaction

---

### 2. Handler Function: `handleEndCall`

**Location:** `index.js:1244-1287`

```javascript
async function handleEndCall(args, callId = null) {
    console.log('AI ending call:', args.reason);
    console.log('   Customer satisfied:', args.customer_satisfied !== false);

    // Sends webhook with call completion info
    const webhookPayload = {
        event_type: 'call_completed',
        timestamp: new Date().toISOString(),
        call: { ... },
        action: {
            type: 'call_ended_by_ai',
            details: {
                reason: args.reason,
                customer_satisfied: args.customer_satisfied !== false
            }
        }
    };

    await sendCallRegisterWebhook(webhookPayload);

    // Returns special __hangup marker
    return {
        __hangup: true,
        reason: args.reason,
        customer_satisfied: args.customer_satisfied !== false,
        message: "Thank you for calling Deepcut Garage. Have a great day! Goodbye."
    };
}
```

**What it does:**
1. Logs the end-call request
2. Sends a `call_completed` webhook to Make.com with reason and satisfaction
3. Returns a special `__hangup` marker with goodbye message

---

### 3. Hangup Detection Logic

**Location:** `index.js:623-643`

```javascript
// Check if this is a hangup request
else if (result.result && result.result.__hangup) {
    const hangupInfo = result.result;
    console.log(`📵 AI ending call: ${hangupInfo.reason}`);
    console.log(`   Customer satisfied: ${hangupInfo.customer_satisfied}`);

    // Send the goodbye message to the caller first
    ariHandler.sendFunctionResult(callId, functionCall.call_id, {
        result: hangupInfo.message
    });

    // Wait for the message to be spoken, then hang up
    setTimeout(async () => {
        try {
            await ariHandler.hangupCall(callId);
            console.log(`✅ Call ${callId} ended gracefully by AI`);
        } catch (error) {
            console.error(`❌ Failed to hang up call ${callId}:`, error);
        }
    }, 4000); // Wait 4 seconds for AI to say goodbye
}
```

**What it does:**
1. Detects the `__hangup` marker from `handleEndCall`
2. Sends the goodbye message to the AI for speaking
3. Waits 4 seconds for the AI to finish speaking
4. Hangs up the call using ARI

---

### 4. Updated System Instructions

**Location:** `index.js:88-106`

Added these guidelines to SYSTEM_MESSAGE:

```
IMPORTANT CALL ENDING GUIDELINES:
- Before ending any call, ALWAYS ask: "Is there anything else I can help you with today?"
- Only use the end_call function if the customer confirms they have no more questions
- If the customer says "no" or "that's all" or similar, say a brief goodbye and use end_call
- Never end the call abruptly - always give the customer a chance to ask more questions
- If you successfully completed a task (scheduled appointment, dispatched towing, etc.),
  confirm completion before asking if they need anything else
```

**What it does:**
- Instructs the AI on proper call-ending etiquette
- Ensures AI always asks if customer needs anything else before ending
- Prevents abrupt call termination

---

## How It Works (Call Flow)

### Example Conversation:

```
Customer: "I'd like to schedule an oil change"
AI: "I'd be happy to help! What date works best for you?"
Customer: "Next Tuesday at 2pm"
AI: "Perfect! What's your phone number?"
Customer: "555-1234"
AI: [Calls schedule_appointment function]
AI: "Great! I've scheduled your oil change for next Tuesday at 2pm.
     You'll receive a confirmation at 555-1234.
     Is there anything else I can help you with today?"
Customer: "No, that's all"
AI: "Thank you for calling Deepcut Garage. Have a great day! Goodbye."
AI: [Calls end_call function with reason: "Appointment scheduled - customer satisfied"]
    [System waits 4 seconds]
    [Call hangs up automatically]
```

---

## Webhook Sent on AI-Initiated Hangup

**Event Type:** `call_completed`

**Full Payload:**
```json
{
    "event_type": "call_completed",
    "timestamp": "2025-11-04T15:30:00Z",
    "call": {
        "call_id": "channel-123",
        "direction": "inbound",
        "caller_number": "+1234567890",
        "caller_name": "John Doe",
        "start_time": "2025-11-04T15:25:00Z",
        "end_time": null,
        "duration_seconds": null
    },
    "action": {
        "type": "call_ended_by_ai",
        "details": {
            "reason": "Appointment scheduled - customer satisfied",
            "customer_satisfied": true
        }
    },
    "transfer": {},
    "system": {
        "assistant_name": "Sophie",
        "app_version": "2.0"
    }
}
```

**Use Cases in Make.com:**
- Log successful call completions
- Track customer satisfaction
- Measure AI effectiveness
- Trigger follow-up actions based on reason
- Alert if customer_satisfied is false

---

## Benefits

### For Customers:
✅ **Clear call endings** - No awkward waiting for someone to hang up
✅ **Professional experience** - Polite goodbye every time
✅ **Time saved** - Calls end promptly when business is complete
✅ **Feels natural** - Like talking to a well-trained human receptionist

### For Business:
✅ **Reduced call duration** - AI doesn't keep calls open unnecessarily
✅ **Cost savings** - Shorter average call times = lower OpenAI costs
✅ **Better data** - Webhook captures why call ended and satisfaction level
✅ **Improved analytics** - Can track successful vs. unsuccessful call resolutions
✅ **Customer satisfaction tracking** - Know if customers leave happy

### For AI Performance:
✅ **Proper conversation closure** - AI learns to wrap up conversations properly
✅ **Customer satisfaction data** - Can measure how well AI resolves issues
✅ **Resolution tracking** - Know what types of calls AI handles completely
✅ **Continuous improvement** - Data helps tune AI behavior

---

## Configuration Options

### Customizing the Goodbye Message

Edit `index.js:1285`:

```javascript
message: "Thank you for calling Deepcut Garage. Have a great day! Goodbye."
```

**Examples for different businesses:**

**Medical Practice:**
```javascript
message: "Thank you for calling Family Medical Center. We look forward to seeing you. Goodbye!"
```

**HVAC Company:**
```javascript
message: "Thanks for choosing Climate Control Pros. We'll see you soon. Have a great day!"
```

**Legal Practice:**
```javascript
message: "Thank you for contacting Morrison & Associates. We'll be in touch. Goodbye."
```

### Adjusting the Hangup Delay

Edit `index.js:642` to change how long the system waits before hanging up:

```javascript
}, 4000); // Wait 4 seconds for AI to say goodbye
```

**Recommendations:**
- **Short goodbye** (1-2 seconds of speech): 3000ms (3 seconds)
- **Medium goodbye** (2-4 seconds of speech): 4000ms (4 seconds) ← Current
- **Long goodbye** (4-6 seconds of speech): 5000ms (5 seconds)

---

## Testing the Feature

### Manual Test:

1. **Start a call** to your voice assistant
2. **Complete a task** (schedule appointment, request info, etc.)
3. **Wait for AI to ask:** "Is there anything else I can help you with?"
4. **Respond:** "No, that's all" or "No, thank you"
5. **Listen for goodbye message**
6. **Verify call hangs up automatically** after 4 seconds

### Check Logs:

```bash
sudo journalctl -u freepbx-voice.service -f
```

**Look for:**
```
🔧 Function call from phone (channel-123): end_call
AI ending call: Appointment scheduled - customer satisfied
   Customer satisfied: true
📤 Sending call register webhook: call_completed
✅ Webhook sent successfully
📵 AI ending call: Appointment scheduled - customer satisfied
   Customer satisfied: true
✅ Call channel-123 ended gracefully by AI
```

---

## Troubleshooting

### AI Doesn't End Calls

**Possible causes:**
1. **AI not asking if customer needs anything else**
   - Check SYSTEM_MESSAGE instructions are loaded
   - AI may need more explicit prompting in greeting

2. **Customer keeps saying "yes" or asking more questions**
   - This is correct behavior - AI should only end when customer confirms no more questions

3. **Function not being called**
   - Check logs for function calls
   - Verify `end_call` is in TOOLS array
   - Check OpenAI API is receiving the tool definition

### Call Hangs Up Too Quickly

**Solution:** Increase delay in `index.js:642`
```javascript
}, 5000); // Wait 5 seconds instead of 4
```

### Call Doesn't Hang Up

**Possible causes:**
1. **Hangup detection not working**
   - Check logs for `__hangup` marker detection
   - Verify `result.result.__hangup` is true

2. **ARI hangup failing**
   - Check ARI connection
   - Look for error messages in logs
   - Verify channel still exists when hangup is called

### Goodbye Message Cut Off

**Solution:** Increase delay in `index.js:642`

The AI needs time to synthesize and speak the goodbye message before hangup occurs.

---

## Monitoring & Analytics

### Metrics to Track:

**Call Completion Rate:**
```
(calls ended by AI / total calls) × 100
```

**Customer Satisfaction Rate:**
```
(calls where customer_satisfied = true / total AI-ended calls) × 100
```

**Average Call Duration:**
- Before end_call feature: [baseline]
- After end_call feature: [should be lower]

**Most Common End Reasons:**
- Track `reason` field from webhooks
- Identify patterns in successful resolutions

### Make.com Analytics Scenario:

```
Webhook Trigger (call_completed)
    ↓
Google Sheets: Add Row
    Columns: Timestamp, Reason, Customer Satisfied, Duration
    ↓
Router (by reason)
    ├─ "Appointment scheduled" → Counter: Increment
    ├─ "Issue resolved" → Counter: Increment
    ├─ "Customer satisfied" → Counter: Increment
    └─ customer_satisfied = false → Slack: Alert Manager
```

---

## Future Enhancements

### 1. Sentiment-Based Ending

Detect customer frustration and offer transfer instead of ending:

```javascript
if (sentiment === 'frustrated' || sentiment === 'angry') {
    // Offer transfer to human instead of ending
    return handleTransferToHuman({
        reason: 'Customer appears frustrated'
    });
}
```

### 2. Call Summary in Webhook

Add conversation summary to `call_completed` webhook:

```javascript
action: {
    type: 'call_ended_by_ai',
    details: {
        reason: args.reason,
        customer_satisfied: args.customer_satisfied,
        summary: "Customer scheduled oil change for Nov 5 at 2pm",
        topics_discussed: ["oil change", "pricing", "availability"]
    }
}
```

### 3. Configurable Goodbye Messages

Allow different goodbye messages based on call outcome:

```javascript
const goodbyeMessages = {
    appointment: "We look forward to seeing you!",
    towing: "Help is on the way! Stay safe.",
    general: "Have a great day!",
    default: "Thank you for calling!"
};
```

### 4. Follow-Up Scheduling

Automatically schedule follow-up based on reason:

```javascript
if (args.reason.includes('appointment scheduled')) {
    // Schedule reminder call 24 hours before appointment
    scheduleFollowUp(callData, 'appointment_reminder', appointmentDate - 1day);
}
```

---

## Activation Instructions

**To activate this feature, restart the service:**

```bash
sudo systemctl restart freepbx-voice.service
```

**Verify it's loaded:**

```bash
sudo journalctl -u freepbx-voice.service -n 50 | grep -i "end_call\|CALL ENDING"
```

You should see the updated SYSTEM_MESSAGE with call ending guidelines in the startup logs.

---

## Summary

**Status:** ✅ **Implemented and Ready**

**What Changed:**
- ✅ Added `end_call` function tool
- ✅ Implemented `handleEndCall` function handler
- ✅ Added hangup detection and execution logic
- ✅ Updated AI system instructions with call-ending guidelines
- ✅ Added `call_completed` webhook event

**What's Needed:**
- ⚠️ Service restart to activate (requires sudo access)
- 📝 Test with real calls to verify behavior
- 📊 Set up Make.com scenarios to handle new webhook

**Benefits:**
- Professional call endings
- Reduced call durations
- Better customer experience
- Customer satisfaction tracking
- Improved cost efficiency

---

**Document Version:** 1.0
**Last Updated:** 2025-11-04
**Implementation Status:** Complete (pending service restart)
**Code Changes:** index.js lines 88-106, 249-267, 623-643, 1062-1064, 1244-1287

