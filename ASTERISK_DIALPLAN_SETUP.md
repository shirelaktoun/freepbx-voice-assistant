# FreePBX Dialplan Configuration for Voice Assistant

## Problem Identified

Looking at your Asterisk logs, when you dial extension 9999:
```
Executing [9999@from-internal:5] Playback("PJSIP/7021-0000004c",
  "silence/1&cannot-complete-as-dialed&check-number-dial-again,noanswer")
```

This means:
- ✗ Extension 9999 doesn't exist in FreePBX
- ✗ No dialplan route to the Stasis application
- ✗ Call never reaches your voice assistant app

---

## Step-by-Step Fix

### Step 1: Check ARI Status First

Before configuring dialplan, verify ARI is working:

```bash
# SSH to FreePBX
ssh root@87.106.72.7

# Check ARI is enabled
asterisk -rx "ari show status"
```

**Expected output:**
```
Asterisk REST Interface: Enabled
```

**If disabled:**
```bash
nano /etc/asterisk/ari.conf
```

Make sure it has:
```ini
[general]
enabled = yes
```

Then:
```bash
asterisk -rx "module reload res_ari.so"
```

### Step 2: Verify ARI User Exists

```bash
asterisk -rx "ari show users"
```

**Expected output:**
```
r/o?  Username
----  --------
No    voiceassistant
```

**If not shown, create it:**

```bash
nano /etc/asterisk/ari.conf
```

Add at the end:
```ini
[voiceassistant]
type = user
read_only = no
password = VoiceAI2024
password_format = plain
```

Reload:
```bash
asterisk -rx "module reload res_ari.so"
asterisk -rx "ari show users"
```

### Step 3: Create Dialplan for Voice Assistant

```bash
nano /etc/asterisk/extensions_custom.conf
```

Add this at the **end** of the file:

```ini
; ================================================
; Voice Assistant Stasis Application
; ================================================

; Main context for voice assistant calls
[from-pstn-voice-assistant]
exten => _X.,1,NoOp(Voice Assistant Call from ${CALLERID(num)})
 same => n,Answer()
 same => n,Wait(0.5)
 same => n,Stasis(voiceassistant)
 same => n,Hangup()

; Test extension - dial 9999 to reach voice assistant
[voice-assistant-test]
exten => 9999,1,NoOp(Test Voice Assistant)
 same => n,Answer()
 same => n,Wait(0.5)
 same => n,Stasis(voiceassistant)
 same => n,Hangup()
```

Save and exit (Ctrl+X, Y, Enter).

### Step 4: Reload Dialplan

```bash
asterisk -rx "dialplan reload"
```

### Step 5: Verify Dialplan Loaded

```bash
asterisk -rx "dialplan show voice-assistant-test"
```

**Expected output:**
```
[ Context 'voice-assistant-test' created by 'pbx_config' ]
  '9999' =>         1. NoOp(Test Voice Assistant)           [pbx_config]
                    2. Answer()                              [pbx_config]
                    3. Wait(0.5)                             [pbx_config]
                    4. Stasis(voiceassistant)                [pbx_config]
                    5. Hangup()                              [pbx_config]
```

**If you see "No such context":**
- Check for syntax errors in extensions_custom.conf
- Make sure you saved the file
- Try `asterisk -rx "dialplan reload"` again

### Step 6: Route Extension 9999 to the Context

**Option A: Using FreePBX GUI (Recommended)**

1. Log into FreePBX web interface
2. Go to **Applications** → **Misc Destinations**
3. Click **Add Misc Destination**
4. Configure:
   - **Description**: `Voice Assistant Test`
   - **Dial**: `voice-assistant-test,9999,1`
5. Submit and Apply Config
6. Go to **Applications** → **Misc Applications**
7. Click **Add Misc Application**
8. Configure:
   - **Description**: `Voice Assistant`
   - **Feature Code**: `9999`
   - **Destination**: Select "Misc Destination: Voice Assistant Test"
9. Submit and Apply Config

**Option B: Using Custom Destination (Alternative)**

1. Go to **Admin** → **Custom Destinations**
2. Click **Add Custom Destination**
3. Configure:
   - **Description**: `Voice Assistant`
   - **Target**: `voice-assistant-test,9999,1`
4. Submit
5. Go to **Connectivity** → **Misc Destinations**
6. Add new with Feature Code `9999` pointing to this custom destination

**Option C: Direct Dialplan (Advanced)**

Add to `/etc/asterisk/extensions_custom.conf` in the `[from-internal-custom]` context:

```ini
[from-internal-custom]
; Route 9999 to voice assistant
exten => 9999,1,Goto(voice-assistant-test,9999,1)
```

Then reload:
```bash
asterisk -rx "dialplan reload"
```

### Step 7: Test the Connection

**From Asterisk console:**

```bash
asterisk -rvvvv
```

You should see something like:
```
Asterisk 20.x.x, Copyright (C) 1999 - 2024, Sangoma Technologies Corporation
...
```

Now dial 9999 from a phone. Watch the console for:
```
NoOp(Test Voice Assistant)
Answer()
Stasis(voiceassistant)
```

**Look for Stasis app registration:**
```
Stasis(voiceassistant)
```

If you see an error like:
```
WARNING: Stasis app 'voiceassistant' not registered
```

This means your Node.js application is **not connected** to ARI yet.

### Step 8: Verify Application is Running and Connected

On your application server:

```bash
# Check if app is running
curl http://localhost:3000/status
```

**Should return:**
```json
{
  "ari_connected": true,
  "rtp_server": true,
  ...
}
```

**If `ari_connected: false`:**

1. Check .env has correct credentials
2. Test ARI manually:
   ```bash
   curl -u "voiceassistant:VoiceAI2024" http://87.106.72.7:8088/ari/asterisk/info
   ```
3. If that works, restart your app:
   ```bash
   node index.js
   ```

Look for these startup messages:
```
🔌 Connecting to Asterisk ARI...
✅ Connected to Asterisk ARI
📱 Stasis application "voiceassistant" started
```

---

## Complete Test Procedure

### On FreePBX Server:

```bash
# 1. Check ARI
asterisk -rx "ari show status"
asterisk -rx "ari show users"

# 2. Check dialplan
asterisk -rx "dialplan show voice-assistant-test"

# 3. Watch live (in separate terminal)
asterisk -rvvvv
```

### On Application Server:

```bash
# 1. Check app status
curl http://localhost:3000/status

# 2. If not running, start it
cd /home/user/freepbx-voice-assistant
node index.js
```

Watch for:
```
✅ Connected to Asterisk ARI
📱 Stasis application "voiceassistant" started
```

### From Your Phone:

1. Dial **9999**
2. Wait for answer

**Expected behavior:**
- Call answers
- You hear AI greeting: "Hello, thank you for calling..."
- You can speak to the AI

**In Asterisk console, you should see:**
```
NoOp(Voice Assistant Call from 7021)
Answer()
Stasis(voiceassistant)
```

**In Node.js app console, you should see:**
```
📞 Incoming call from: 7021
✅ Call answered
🌉 Bridge created
🎙️ External media channel created
🤖 Starting OpenAI session
✅ OpenAI session connected
```

---

## Troubleshooting

### Issue: "Stasis app 'voiceassistant' not registered"

**Cause:** Your Node.js app is not connected to ARI.

**Fix:**
1. Verify ARI credentials in .env match ari.conf
2. Test curl command:
   ```bash
   curl -u "voiceassistant:VoiceAI2024" http://87.106.72.7:8088/ari/asterisk/info
   ```
3. Restart Node.js app and watch for connection messages

### Issue: Still plays "cannot-complete-as-dialed"

**Cause:** Dialplan not loaded or route not configured.

**Fix:**
1. Check dialplan exists:
   ```bash
   asterisk -rx "dialplan show voice-assistant-test"
   ```
2. If exists but still fails, add to `[from-internal-custom]`:
   ```ini
   exten => 9999,1,Goto(voice-assistant-test,9999,1)
   ```
3. Reload: `asterisk -rx "dialplan reload"`

### Issue: Call connects but no audio

**Cause:** RTP configuration issue.

**Fix:**
1. Check SERVER_HOST in .env is your public IP
2. Check port 10000/udp is open
3. See SETUP_GUIDE.md audio troubleshooting section

### Issue: Call immediately hangs up

**Cause:** OpenAI connection failed.

**Fix:**
1. Check OPENAI_API_KEY in .env
2. Check Node.js logs for OpenAI errors
3. Verify internet connectivity from app server

---

## Quick Verification Commands

Run these to verify everything is configured:

```bash
# On FreePBX
asterisk -rx "ari show status"           # Should show "Enabled"
asterisk -rx "ari show users"            # Should show "voiceassistant"
asterisk -rx "dialplan show voice-assistant-test"  # Should show extension 9999
asterisk -rx "stasis show apps"          # Should show "voiceassistant" when app is connected

# On App Server
curl http://localhost:3000/status        # Should show ari_connected: true
```

---

## Expected Working Flow

```
1. You dial 9999
   ↓
2. FreePBX routes to voice-assistant-test context
   ↓
3. Dialplan executes Stasis(voiceassistant)
   ↓
4. Call enters Stasis app (your Node.js app)
   ↓
5. Node.js creates bridge and external media channel
   ↓
6. Node.js connects to OpenAI Realtime API
   ↓
7. RTP audio flows: Phone ↔ FreePBX ↔ Node.js RTP ↔ OpenAI
   ↓
8. You hear AI greeting and can talk
```

---

## Next Steps

Once extension 9999 works:

1. **Configure inbound routes** to route real calls to voice assistant
2. **Test outbound calling** via the API
3. **Set up as systemd service** for auto-start
4. **Configure webhooks** for call logging

See SETUP_GUIDE.md for these advanced configurations.
