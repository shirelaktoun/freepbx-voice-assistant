# Custom Greeting Configuration

## Overview

The voice assistant now supports different greetings for inbound and outbound calls. This allows you to provide context-appropriate greetings based on who initiated the call.

## Default Greetings

### Inbound Calls (Customer calls you)
```
"Hello, thank you for calling Deepcut Garage. This is Sophie, your AI assistant. How can I help you today?"
```

### Outbound Calls (You call the customer)
```
"Hello! This is Sophie calling from Deepcut Garage. Is this a good time to talk?"
```

## Customizing Greetings

You can customize the greetings by adding environment variables to your `.env` file.

### Step 1: Edit the .env file

```bash
cd /opt/freepbx-voice-assistant
nano .env
```

### Step 2: Add Custom Greetings

Add these lines to the end of your `.env` file:

```bash
# Custom Greeting Configuration
INBOUND_GREETING=Your custom inbound greeting here
OUTBOUND_GREETING=Your custom outbound greeting here
```

### Example 1: Professional and Formal

```bash
INBOUND_GREETING=Good day, you've reached Deepcut Garage. My name is Sophie, and I'm here to assist you. What can I do for you today?
OUTBOUND_GREETING=Good day, this is Sophie from Deepcut Garage calling. May I speak with you for a moment?
```

### Example 2: Casual and Friendly

```bash
INBOUND_GREETING=Hey there! Thanks for calling Deepcut Garage. I'm Sophie, your virtual assistant. What's up?
OUTBOUND_GREETING=Hi! This is Sophie from Deepcut Garage. Got a minute to chat?
```

### Example 3: Brief and Direct

```bash
INBOUND_GREETING=Deepcut Garage, Sophie speaking. How can I help?
OUTBOUND_GREETING=Hi, Sophie from Deepcut Garage here. Can we talk?
```

### Example 4: Multi-language (if needed)

```bash
INBOUND_GREETING=Hello, thank you for calling Deepcut Garage. Bonjour, merci d'avoir appelé. This is Sophie. How can I help you?
OUTBOUND_GREETING=Hello! This is Sophie from Deepcut Garage. Is this a good time?
```

## Tips for Writing Great Greetings

### For Inbound Calls

✅ **Do:**
- Thank the caller for calling
- Identify your business name
- Introduce the AI assistant by name
- Offer to help
- Keep it under 20 words for clarity

❌ **Don't:**
- Make it too long (caller loses interest)
- Skip the business name (caller might be confused)
- Sound too robotic ("How may I direct your call?")
- Use complex language

### For Outbound Calls

✅ **Do:**
- Identify yourself and business immediately
- Ask if it's a good time to talk (shows respect)
- Be friendly and warm
- Get to the point quickly

❌ **Don't:**
- Start with "Is this [name]?" (AI doesn't know who answered)
- Launch into a pitch immediately
- Sound like a telemarketer
- Be overly formal or stiff

## Testing Your Greetings

### Test Inbound Greeting

1. Call your voice assistant number
2. Listen to the greeting
3. Adjust if needed

### Test Outbound Greeting

1. Use the dashboard or API to make an outbound call:
   ```bash
   curl -X POST http://localhost:3000/ari/originate \
     -H "Content-Type: application/json" \
     -d '{
       "destination": "YOUR_PHONE_NUMBER",
       "callerId": "1002"
     }'
   ```
2. Answer the call and listen to the greeting
3. Adjust if needed

## Apply Changes

After editing the `.env` file, restart the service:

```bash
sudo systemctl restart freepbx-voice.service
```

Check the logs to confirm the greetings are loaded:

```bash
sudo journalctl -u freepbx-voice.service -n 50
```

Look for:
- `📤 Using INBOUND greeting` (when inbound call starts)
- `📤 Using OUTBOUND greeting` (when outbound call starts)

## Advanced: Dynamic Greetings

If you need more complex greeting logic (e.g., time-based greetings, caller-specific greetings), you can modify the code in `ari-handler.js` around line 289-301.

### Example: Time-Based Greeting

```javascript
// In ari-handler.js, replace the greeting logic with:

const hour = new Date().getHours();
let timeGreeting = 'Hello';

if (hour < 12) {
    timeGreeting = 'Good morning';
} else if (hour < 17) {
    timeGreeting = 'Good afternoon';
} else {
    timeGreeting = 'Good evening';
}

if (callDirection === 'outbound') {
    greetingText = `${timeGreeting}! This is Sophie calling from Deepcut Garage. Is this a good time to talk?`;
} else {
    greetingText = `${timeGreeting}, thank you for calling Deepcut Garage. This is Sophie, your AI assistant. How can I help you today?`;
}
```

## How It Works

### Call Direction Detection

The system automatically detects call direction:

1. **Inbound**: When a customer calls your number and is routed to the Stasis application
2. **Outbound**: When you initiate a call via the `/ari/originate` API endpoint or dashboard

### Greeting Flow

```
Call Starts
    ↓
System detects direction (inbound/outbound)
    ↓
Loads appropriate greeting from config
    ↓
Sends greeting to OpenAI
    ↓
OpenAI speaks greeting to caller
    ↓
Enables voice detection for conversation
```

### Code Locations

- **Configuration**: `/opt/freepbx-voice-assistant/index.js` (line ~53-54)
- **Greeting Logic**: `/opt/freepbx-voice-assistant/ari-handler.js` (line ~289-301)
- **Environment Variables**: `/opt/freepbx-voice-assistant/.env`

## Troubleshooting

### Greeting Not Playing

**Check logs:**
```bash
sudo journalctl -u freepbx-voice.service -f
```

**Look for:**
- `📤 Using INBOUND greeting` or `📤 Using OUTBOUND greeting`
- `✅ OpenAI session connected`
- `📤 Requesting initial greeting with audio`

**Common issues:**
- Environment variable not set correctly (check for typos)
- Service not restarted after changing .env
- OpenAI connection failed

### Wrong Greeting Playing

**Verify call direction:**
- Check logs for: `📞 Call direction: inbound` or `📞 Call direction: outbound`
- For outbound calls, ensure you're using the originate API correctly

### Greeting Too Long or Too Short

**Adjust in .env:**
- Keep greetings under 20 words for best experience
- Test with real calls to get timing right
- Consider your audience's preferences

## Examples by Industry

### Auto Repair (Current)
```bash
INBOUND_GREETING=Hello, thank you for calling Deepcut Garage. This is Sophie, your AI assistant. How can I help you today?
OUTBOUND_GREETING=Hello! This is Sophie calling from Deepcut Garage. Is this a good time to talk?
```

### Medical Office
```bash
INBOUND_GREETING=Thank you for calling Deepcut Medical Center. I'm Sophie, your virtual assistant. How may I help you today?
OUTBOUND_GREETING=Hello, this is Sophie calling from Deepcut Medical Center. Is this a good time to speak with you?
```

### Restaurant
```bash
INBOUND_GREETING=Hi! Thanks for calling Deepcut Restaurant. I'm Sophie, and I can help with reservations and questions. What can I do for you?
OUTBOUND_GREETING=Hi! This is Sophie from Deepcut Restaurant. I'm calling about your reservation. Is now a good time?
```

### Real Estate
```bash
INBOUND_GREETING=Hello! You've reached Deepcut Realty. I'm Sophie, your virtual assistant. Are you looking to buy, sell, or rent?
OUTBOUND_GREETING=Hi! This is Sophie calling from Deepcut Realty regarding the property you inquired about. Do you have a moment?
```

### Retail Store
```bash
INBOUND_GREETING=Hi there! Thanks for calling Deepcut Store. I'm Sophie. How can I help you today?
OUTBOUND_GREETING=Hello! This is Sophie from Deepcut Store. We have an update about your order. Can we chat?
```

## Best Practices

1. **Keep It Natural**: Write how you would speak, not how you would write
2. **Test with Real People**: Get feedback from colleagues or customers
3. **Match Your Brand**: Greeting should reflect your business personality
4. **Update Seasonally**: Consider holiday greetings or seasonal messages
5. **Be Clear**: Make sure callers know they're talking to an AI assistant
6. **Be Respectful**: For outbound calls, always ask if it's a good time
7. **Monitor Feedback**: If callers seem confused, adjust the greeting

## Related Configuration

- System message (AI personality): `index.js` line ~85
- Voice selection: `ari-handler.js` line ~272 (currently "shimmer")
- Functions/tools: `index.js` line ~112-246

## Support

For questions or issues:
1. Check application logs: `sudo journalctl -u freepbx-voice.service -f`
2. Review this documentation
3. Test with simple greetings first, then add complexity
