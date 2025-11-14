# FreePBX Voice Assistant - Setup Guide for Phone Calls

## Problem: Web Client Works but Phone Calls Don't

The web client (test-client.html) connects directly to OpenAI, bypassing FreePBX entirely.
For **phone calls** to work, you need to configure FreePBX to route calls to your application.

---

## Part 1: Application Server Setup

### Step 1: Configure Environment Variables

Edit the `.env` file and replace the placeholder values:

```bash
nano .env
```

**Required changes:**
- `OPENAI_API_KEY` - Your OpenAI API key
- `FREEPBX_HOST` - IP address of your FreePBX server
- `ARI_HOST` - Same as FREEPBX_HOST
- `SERVER_HOST` - **This server's PUBLIC IP address** (critical for RTP audio)
- `RTP_HOST` - Same as SERVER_HOST
- `SIP_EXTENSION` / `SIP_PASSWORD` - Optional (only needed for SIP registration)
- `ARI_USERNAME` / `ARI_PASSWORD` - Must match what you configure in FreePBX

**Example:**
```bash
FREEPBX_HOST=192.168.1.100
ARI_HOST=192.168.1.100
SERVER_HOST=203.0.113.50  # Your PUBLIC IP
RTP_HOST=203.0.113.50
```

### Step 2: Install Dependencies

```bash
cd /home/user/freepbx-voice-assistant
npm install
```

### Step 3: Test Run the Application

```bash
node index.js
```

Look for these startup messages:
```
✅ Connected to Asterisk ARI
📱 Stasis application "voiceassistant" started
🎙️  RTP handler initialized
✅ Server started successfully!
```

If you see errors about ARI connection, proceed to Part 2 (FreePBX configuration).

---

## Part 2: FreePBX Configuration

### Step 1: Enable and Configure ARI

SSH into your FreePBX server:

```bash
ssh root@YOUR_FREEPBX_IP
```

Edit ARI configuration:

```bash
nano /etc/asterisk/ari.conf
```

Add or modify these lines:

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

**Note:** The username `voiceassistant` and password must match your `.env` file:
- `ARI_USERNAME=voiceassistant`
- `ARI_PASSWORD=VoiceAI2024Secure!`

Reload ARI module:

```bash
asterisk -rx "module reload res_ari.so"
asterisk -rx "ari show users"
```

You should see:
```
  Username: voiceassistant
  Read only?: No
```

### Step 2: Create Dialplan Context for Voice Assistant

Edit custom extensions:

```bash
nano /etc/asterisk/extensions_custom.conf
```

Add this context at the end:

```ini
; Voice Assistant Stasis Application
[from-pstn-voice-assistant]
exten => _X.,1,NoOp(Incoming call to Voice Assistant from ${CALLERID(num)})
 same => n,Answer()
 same => n,Wait(1)
 same => n,Stasis(voiceassistant)
 same => n,Hangup()

; Shortcut for internal testing
[voice-assistant-test]
exten => 9999,1,NoOp(Test call to Voice Assistant)
 same => n,Answer()
 same => n,Wait(1)
 same => n,Stasis(voiceassistant)
 same => n,Hangup()
```

Reload dialplan:

```bash
asterisk -rx "dialplan reload"
```

Verify it loaded:

```bash
asterisk -rx "dialplan show from-pstn-voice-assistant"
```

### Step 3: Configure Inbound Route (FreePBX GUI)

1. Log into FreePBX web interface
2. Go to **Connectivity** → **Inbound Routes**
3. Click **Add Inbound Route**
4. Configure:
   - **Description**: `Voice Assistant Route`
   - **DID Number**: Leave blank to match all calls, or enter specific DID
   - **Set Destination**:
     - Select **Custom Destination**
     - Enter: `from-pstn-voice-assistant,s,1`
5. Click **Submit**
6. Click **Apply Config**

### Step 4: Test Extension for Internal Testing

Go to **Applications** → **Misc Destinations**:

1. Click **Add Misc Destination**
2. Configure:
   - **Description**: `Voice Assistant Test`
   - **Dial**: `from-pstn-voice-assistant,s,1`
3. Submit and Apply Config

Now you can dial **9999** from any internal extension to test the voice assistant.

### Step 5: Configure Firewall

On FreePBX server:

```bash
# Allow ARI port from your application server
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="YOUR_APP_SERVER_IP" port port="8088" protocol="tcp" accept'

# Allow RTP from your application server
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="YOUR_APP_SERVER_IP" port port="10000" protocol="udp" accept'

# Reload firewall
firewall-cmd --reload
```

On application server:

```bash
# Allow RTP port for incoming audio from FreePBX
sudo ufw allow from YOUR_FREEPBX_IP to any port 10000 proto udp

# Allow API port (if accessing from other machines)
sudo ufw allow 3000/tcp
```

---

## Part 3: Testing

### Test 1: Verify ARI Connection

From your application server:

```bash
curl -u voiceassistant:VoiceAI2024Secure! \
  http://YOUR_FREEPBX_IP:8088/ari/asterisk/info
```

Expected: JSON response with Asterisk version info

### Test 2: Check Application Status

```bash
curl http://localhost:3000/status
```

Expected output:
```json
{
  "sip_registered": false,
  "ari_connected": true,
  "rtp_server": true,
  "active_calls": 0,
  "rtp_sessions": 0
}
```

**Key requirement:** `ari_connected` must be `true`

### Test 3: Make Internal Test Call

From any phone on your FreePBX system:

1. Dial **9999**
2. You should hear: "Hello, thank you for calling..."
3. Speak to the AI assistant

Watch the application logs:

```bash
# In the terminal where you ran: node index.js
```

Look for:
```
📞 Incoming call from: [extension]
✅ Call answered
🌉 Bridge created
🎙️ External media channel created
🤖 Starting OpenAI session
✅ OpenAI session connected
```

### Test 4: Make External Inbound Call

If you configured an inbound route:

1. Call your DID number
2. Should be routed to voice assistant
3. Watch logs for the same output as Test 3

---

## Part 4: Running as a Service

Once testing works, set up the application to run automatically.

Create systemd service file:

```bash
sudo nano /etc/systemd/system/freepbx-voice.service
```

Contents:

```ini
[Unit]
Description=FreePBX OpenAI Voice Assistant
After=network.target

[Service]
Type=simple
User=user
WorkingDirectory=/home/user/freepbx-voice-assistant
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Load environment variables from .env file
EnvironmentFile=/home/user/freepbx-voice-assistant/.env

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable freepbx-voice.service
sudo systemctl start freepbx-voice.service
sudo systemctl status freepbx-voice.service
```

View logs:

```bash
sudo journalctl -u freepbx-voice.service -f
```

---

## Troubleshooting Phone Call Issues

### Issue: "ARI not connected" in /status

**Cause:** Cannot reach FreePBX ARI interface

**Solutions:**
1. Verify ARI is enabled: `asterisk -rx "ari show status"`
2. Check ARI credentials in `.env` match `/etc/asterisk/ari.conf`
3. Test connectivity: `telnet YOUR_FREEPBX_IP 8088`
4. Check FreePBX firewall: `firewall-cmd --list-all`

### Issue: Calls don't enter Stasis app

**Cause:** Dialplan not routing to Stasis

**Solutions:**
1. Verify dialplan exists:
   ```bash
   asterisk -rx "dialplan show from-pstn-voice-assistant"
   ```
2. Check inbound route destination in FreePBX GUI
3. Enable dialplan debugging:
   ```bash
   asterisk -rx "dialplan set debug on"
   asterisk -rx "core set verbose 5"
   ```
4. Make a test call and watch Asterisk console:
   ```bash
   asterisk -rvvv
   ```

### Issue: No audio on calls

**Cause:** RTP configuration or network issues

**Solutions:**
1. Verify SERVER_HOST and RTP_HOST are your **public IP**:
   ```bash
   grep SERVER_HOST .env
   grep RTP_HOST .env
   ```
2. Check RTP port is open:
   ```bash
   sudo netstat -ulnp | grep 10000
   ```
3. On FreePBX, check RTP debug:
   ```bash
   asterisk -rx "rtp set debug on"
   ```
4. Check external media channels:
   ```bash
   asterisk -rx "channel show all" | grep UnicastRTP
   ```

### Issue: Web client works but phone doesn't

**Explanation:**
- Web client → Direct connection to OpenAI (bypasses FreePBX)
- Phone calls → Must go through: Phone → FreePBX → Dialplan → Stasis → Your App → OpenAI

**This is the most common issue.** If web works but phone doesn't:
1. FreePBX dialplan is not configured (Part 2, Step 2)
2. Inbound route not pointing to dialplan (Part 2, Step 3)
3. ARI not enabled or misconfigured (Part 2, Step 1)

---

## Quick Diagnostic Commands

On **Application Server**:
```bash
# Check if app is running
ps aux | grep node

# Check app status
curl http://localhost:3000/status

# Check ARI connectivity
curl -u voiceassistant:VoiceAI2024Secure! \
  http://YOUR_FREEPBX_IP:8088/ari/asterisk/info
```

On **FreePBX Server**:
```bash
# Check ARI status
asterisk -rx "ari show status"
asterisk -rx "ari show users"

# Check if Stasis app is registered
asterisk -rx "stasis show apps"

# Check dialplan
asterisk -rx "dialplan show from-pstn-voice-assistant"

# Check active channels during a call
asterisk -rx "core show channels"
```

---

## Summary Checklist

### Application Server:
- [ ] `.env` file configured with correct IPs and credentials
- [ ] `npm install` completed
- [ ] Application running (node index.js)
- [ ] `/status` endpoint shows `ari_connected: true`
- [ ] Port 10000/udp accessible from FreePBX

### FreePBX Server:
- [ ] ARI enabled in `/etc/asterisk/ari.conf`
- [ ] ARI user `voiceassistant` created
- [ ] Dialplan context `from-pstn-voice-assistant` exists
- [ ] Inbound route configured to use dialplan
- [ ] Port 8088/tcp accessible from app server
- [ ] Test extension 9999 works

### Network:
- [ ] App server can reach FreePBX:8088
- [ ] FreePBX can reach app server:10000
- [ ] Firewall rules configured on both sides

Once all boxes are checked, phone calls should work! 🎉

---

## Getting Help

If issues persist:

1. **Check application logs:**
   ```bash
   tail -f /var/log/node-app.log
   # or if running in terminal, watch console output
   ```

2. **Check Asterisk logs:**
   ```bash
   tail -f /var/log/asterisk/full
   ```

3. **Enable verbose debugging:**
   ```bash
   asterisk -rvvv
   ```
   Then make a test call and watch the console.

4. **Share error messages** - Look for lines starting with `❌` or `ERROR`
