# Fix ARI Credentials Issue

## Current Problem

You're getting "Access denied" with HTTP 403, not 401. This suggests:
- The authentication credentials **might** be reaching FreePBX
- But access is being denied by ARI configuration or firewall

## Your Current Password Issue

Your password `EvGj1YMItLhUW1EFV+s=` contains special characters that can cause problems:
- `+` (plus sign)
- `=` (equals sign)

These characters have special meaning in URLs and HTTP authentication.

---

## Solution 1: Change to a Simple Password (RECOMMENDED)

### Step 1: SSH to FreePBX

```bash
ssh root@87.106.72.7
```

### Step 2: Edit ARI Configuration

```bash
nano /etc/asterisk/ari.conf
```

Find or create the `[voiceassistant]` section:

```ini
[general]
enabled = yes
pretty = yes
allowed_origins = *

[voiceassistant]
type = user
read_only = no
password = VoiceAI2024Simple
password_format = plain
```

**Use a simple password with:**
- Letters (a-z, A-Z)
- Numbers (0-9)
- Dash (-) or underscore (_)
- **NO special characters like + = / ? & % $ # @ !**

### Step 3: Reload ARI

```bash
asterisk -rx "module reload res_ari.so"
asterisk -rx "ari show users"
```

You should see:
```
voiceassistant         No
```

### Step 4: Update .env File

On your application server:

```bash
nano /home/user/freepbx-voice-assistant/.env
```

Change to:
```
ARI_PASSWORD=VoiceAI2024Simple
```

### Step 5: Test

```bash
curl -u "voiceassistant:VoiceAI2024Simple" http://87.106.72.7:8088/ari/asterisk/info
```

Should return JSON with Asterisk info, not "Access denied".

---

## Solution 2: Check ARI Access Control (If Simple Password Doesn't Work)

### Check allowed_origins in ari.conf

```bash
cat /etc/asterisk/ari.conf | grep -A 10 "general"
```

Make sure it has:
```ini
[general]
enabled = yes
allowed_origins = *
```

If `allowed_origins` is restrictive, add your application server IP:
```ini
allowed_origins = http://YOUR_APP_SERVER_IP:3000
```

### Check ARI is actually enabled

```bash
asterisk -rx "ari show status"
```

Should show: `Asterisk REST Interface: Enabled`

---

## Solution 3: Check FreePBX Firewall

### Check if port 8088 is blocked

```bash
# On FreePBX server
firewall-cmd --list-all | grep 8088
```

If not listed, add it:

```bash
# Allow from your application server IP
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="YOUR_APP_SERVER_IP" port port="8088" protocol="tcp" accept'

# Or allow from anywhere (less secure)
firewall-cmd --permanent --add-port=8088/tcp

# Reload
firewall-cmd --reload
```

---

## Solution 4: Verify ARI User Permissions

```bash
# On FreePBX server
cat /etc/asterisk/ari.conf | grep -A 5 "voiceassistant"
```

Should show:
```ini
[voiceassistant]
type = user
read_only = no
password = YourPassword
password_format = plain
```

Make sure `read_only = no` (not yes).

---

## Quick Test Commands

### Test 1: From Application Server

```bash
curl -v -u "voiceassistant:YourNewPassword" http://87.106.72.7:8088/ari/asterisk/info
```

**Success looks like:**
```
< HTTP/1.1 200 OK
< Content-Type: application/json
...
{"build":{"date":"...","kernel":"...","machine":"x86_64"},...}
```

**Failure looks like:**
```
< HTTP/1.1 401 Unauthorized
Access denied
```

Or:
```
< HTTP/1.1 403 Forbidden
Access denied
```

### Test 2: Check ARI is listening

```bash
# On FreePBX server
netstat -tlnp | grep 8088
```

Should show:
```
tcp        0      0 0.0.0.0:8088            0.0.0.0:*               LISTEN      12345/asterisk
```

---

## Recommended Simple Password

Use something like:
- `VoiceAssist2024`
- `ARI-Voice-2024`
- `Voice_AI_Password`
- `SecureVoice123`

**Avoid:**
- Passwords with `+ = / ? & % $ # @ !`
- Passwords with spaces
- Passwords with quotes `'` or `"`

---

## After Fixing

1. **Update .env:**
   ```bash
   nano .env
   # Change ARI_PASSWORD to your new simple password
   ```

2. **Restart your application:**
   ```bash
   # If running manually
   Ctrl+C
   node index.js

   # If running as service
   sudo systemctl restart freepbx-voice.service
   ```

3. **Check status:**
   ```bash
   curl http://localhost:3000/status
   ```

   Should show:
   ```json
   {
     "ari_connected": true,
     ...
   }
   ```

---

## Still Not Working?

### Enable Asterisk HTTP Debug

```bash
# On FreePBX
asterisk -rx "http show status"
asterisk -rvvvv

# In the Asterisk console, watch for connections when you test curl
```

### Check Asterisk Full Logs

```bash
tail -f /var/log/asterisk/full | grep -i ari
```

### Verify No Proxy Interference

The test showed a proxy in the connection. If you're behind a corporate proxy, you may need to bypass it:

```bash
# Test without proxy
no_proxy="87.106.72.7" curl -u "voiceassistant:YourPassword" http://87.106.72.7:8088/ari/asterisk/info
```

---

## Summary

**Most likely fix:**
1. Change password to simple alphanumeric: `VoiceAI2024Simple`
2. Update both `/etc/asterisk/ari.conf` and `.env`
3. Reload ARI: `asterisk -rx "module reload res_ari.so"`
4. Test: `curl -u "voiceassistant:VoiceAI2024Simple" http://87.106.72.7:8088/ari/asterisk/info`

The special characters in your current password (`+` and `=`) are likely being misinterpreted in HTTP Basic Authentication.
