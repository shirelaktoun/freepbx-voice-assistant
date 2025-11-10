# Call Transfer Functionality

## Overview

The AI assistant can now seamlessly transfer calls to human agents when:
- The caller explicitly requests to speak with a human
- The issue is too complex for the AI to handle
- The caller needs specialized assistance
- Any other scenario where human intervention is needed

## How It Works

### For the Caller
1. Caller asks: "Can I speak to a person?" or "Transfer me to someone"
2. AI responds: "Certainly! I'm transferring you to a team member now. Please hold for a moment."
3. After ~3 seconds, the call is automatically transferred to extension 7021
4. Caller hears ringing and then connects with the human agent

### For the AI
The AI assistant has been given a new function called `transfer_to_human` that it can call automatically when appropriate. The AI has been instructed to use this function when:
- Caller requests to speak with a human
- Issue exceeds AI capabilities
- Specialized assistance is needed

## Technical Details

### Function Definition

```javascript
{
    type: 'function',
    name: 'transfer_to_human',
    description: 'Transfer the call to a human agent when the caller requests to speak to a person',
    parameters: {
        reason: {
            type: 'string',
            description: 'Reason for transfer'
        },
        extension: {
            type: 'string',
            description: 'Extension to transfer to (default: 7021)',
            default: '7021'
        }
    }
}
```

### Call Flow

```
1. Caller in conversation with AI
   │
   ├─> Caller: "I want to talk to a person"
   │
2. AI recognizes transfer request
   │
   ├─> AI calls transfer_to_human function
   │
3. Function handler processes request
   │
   ├─> Returns message: "I'm transferring you now..."
   │
4. AI speaks the message to caller
   │
   ├─> ~3 second delay for message to complete
   │
5. Transfer executed
   │
   ├─> Close OpenAI session
   ├─> Remove from bridge
   ├─> Hangup external media
   ├─> Destroy bridge
   ├─> Continue channel to dialplan
   │
6. Asterisk dials extension 7021
   │
   ├─> Extension rings
   │
7. Human agent answers
   │
   └─> Call connected to agent
```

### Files Modified

**index.js**:
- Added `transfer_to_human` to TOOLS array
- Added `handleTransferToHuman()` function
- Modified function call handler to detect transfer requests
- Added 3-second delay for AI message before transfer
- Added event listener for `call-transferred` event
- Updated SYSTEM_MESSAGE to inform AI about transfer capability

**ari-handler.js**:
- Added `transferCall(callId, extension, reason)` method
- Implements proper cleanup before transfer:
  - Closes OpenAI WebSocket session
  - Removes channel from bridge
  - Hangs up external media channel
  - Destroys the bridge
- Uses `channel.continueInDialplan()` to transfer
- Emits `call-transferred` event
- Cleans up call data and audio buffers

## Configuration

### Default Transfer Extension
Currently hardcoded to **7021** but can be customized per call:

```javascript
// Use default (7021)
transfer_to_human({ reason: "Customer requested human" })

// Use custom extension
transfer_to_human({ 
    reason: "Technical specialist needed",
    extension: "8000" 
})
```

### Transfer Context
Transfers go to the `from-internal` context in FreePBX, which is the standard context for internal calls.

## Testing

### Method 1: During a Call
1. Call into your system
2. When connected to AI, say: "I want to speak to a person"
3. AI should say: "Certainly! I'm transferring you..."
4. After 3 seconds, you'll hear extension 7021 ringing
5. If 7021 is registered and answers, you'll be connected

### Method 2: Logs Monitoring
```bash
sudo journalctl -u freepbx-voice.service -f
```

Watch for these log messages:
```
🔧 Function call from phone: transfer_to_human
Transfer to human requested: {reason: "..."}
   Transferring to extension: 7021
   Reason: Customer requested to speak with a human
📞 Transfer requested to extension 7021
🔀 Transferring call 1730123456.789 to extension 7021
   Closing OpenAI session...
   Removing channel from bridge...
   Hanging up external media channel...
   Destroying bridge...
   Continuing channel to extension 7021...
✅ Call 1730123456.789 transferred successfully to 7021
🔀 Call transferred: +1234567890 to extension 7021
   Reason: Customer requested to speak with a human
```

## Important Notes

### Extension 7021 Status
⚠️ **Remember**: Extension 7021 must be **registered and online** for transfers to work!

Check extension status:
```bash
node test-ari-diagnostics.js | grep 7021
```

Should show:
```
Technology: PJSIP
Resource: 7021
State: online    ← Must be "online" not "offline"
```

If 7021 is offline:
- The transfer will ring but no one will answer
- The call may eventually timeout
- Register the extension or use a different extension

### Using Alternative Extensions

To transfer to a different extension, modify the default in index.js:

```javascript
// In handleTransferToHuman function
const extension = args.extension || '8000'; // Change 7021 to 8000
```

Or pass it dynamically (requires modifying the TOOLS definition to allow the AI to choose).

## Phrases That Trigger Transfer

The AI has been instructed to transfer calls when callers say things like:
- "Can I speak to a person?"
- "I want to talk to someone"
- "Transfer me to a representative"
- "Let me speak with a human"
- "Connect me to an agent"
- "I need to talk to someone else"

The AI may also proactively transfer if it determines the issue is beyond its capabilities.

## Customization

### Changing the Transfer Message
In `index.js`, find `handleTransferToHuman`:

```javascript
return {
    __transfer: true,
    extension: extension,
    reason: reason,
    message: `Certainly! I'm transferring you to a team member now. Please hold for a moment.`
    //       ↑ Customize this message
};
```

### Changing the Wait Time
In `index.js`, find the `setTimeout` in the function-call handler:

```javascript
setTimeout(async () => {
    // Transfer logic
}, 3000); // ← Change 3000ms (3 seconds) to desired delay
```

### Adding Multiple Transfer Options
You could extend the system to support transfers to different departments:

```javascript
// Example: Transfer to different extensions based on need
{
    type: 'function',
    name: 'transfer_to_human',
    parameters: {
        department: {
            type: 'string',
            enum: ['sales', 'technical', 'billing'],
            description: 'Which department to transfer to'
        }
    }
}

// In handler:
const extensionMap = {
    'sales': '7021',
    'technical': '8000',
    'billing': '7000'
};
const extension = extensionMap[args.department] || '7021';
```

## Troubleshooting

### Transfer Fails with "Call not found"
- Check logs to see if call ended before transfer
- Verify timing of transfer execution

### Transfer Rings but No Answer
- Extension 7021 is offline - register it
- Extension doesn't exist - verify in FreePBX
- Extension is busy - caller will hear busy signal

### AI Doesn't Transfer When Asked
- Check OpenAI function calling is working
- Verify TOOLS array includes transfer_to_human
- Check system message mentions transfer capability
- Look for function call in logs

### Transfer Succeeds but Call Drops
- Check dialplan in FreePBX for extension 7021
- Verify from-internal context exists
- Check Asterisk full logs: `/var/log/asterisk/full`

## Benefits

✅ **Seamless Escalation**: Smooth transition from AI to human  
✅ **Context Preserved**: Call stays connected, no re-dialing needed  
✅ **Intelligent Decision**: AI knows when to transfer  
✅ **Flexible Configuration**: Easy to change target extension  
✅ **Proper Cleanup**: All resources cleaned up correctly  
✅ **Event Tracking**: Transfer events logged for monitoring  

## API Reference

### transferCall Method

```javascript
/**
 * Transfer a call to another extension
 * @param {string} callId - The call ID to transfer
 * @param {string} extension - Target extension
 * @param {string} reason - Reason for transfer
 * @throws {Error} If call not found or transfer fails
 */
await ariHandler.transferCall(callId, '7021', 'Customer requested human');
```

### Call Transfer Event

```javascript
ariHandler.on('call-transferred', (info) => {
    console.log('Call transferred:', info);
    // info.callId - The transferred call ID
    // info.extension - Target extension
    // info.reason - Transfer reason
    // info.callerNumber - Original caller number
});
```

## Future Enhancements

Potential improvements:
- [ ] Warm transfers (announce caller to agent first)
- [ ] Transfer queue (if agent busy, queue the call)
- [ ] Call back option (if agent unavailable)
- [ ] Transfer to voicemail option
- [ ] Multiple department routing
- [ ] Transfer statistics and reporting
- [ ] Blind vs attended transfer options

## Summary

The AI assistant can now intelligently transfer calls to extension 7021 when needed. The system:
- Properly cleans up AI resources
- Smoothly transitions to human agent
- Maintains call connection throughout
- Logs all transfer events
- Works with existing FreePBX dialplan

**Remember**: Extension 7021 must be registered/online for successful transfers!
