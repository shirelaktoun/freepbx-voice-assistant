# Network Topology - FreePBX Voice Assistant

## Your Setup

```
┌─────────────────────────────────────────────────────────────┐
│                    Network Topology                          │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────┐                    ┌──────────────────────┐
│  FreePBX Server      │                    │  Application Server  │
│  87.106.72.7         │◄──────────────────►│  87.106.74.102       │
│                      │                    │                      │
│  - Asterisk/FreePBX  │    ARI (HTTP)      │  - Node.js App       │
│  - ARI Server        │    Port 8088       │  - OpenAI Client     │
│  - SIP/RTP           │                    │  - RTP Handler       │
│  - Dialplan          │    RTP (UDP)       │                      │
│                      │    Port 10000      │                      │
└──────────────────────┘                    └──────────────────────┘
         │                                             │
         │                                             │
         ▼                                             ▼
    Phone Calls                                  Internet
  (SIP Trunk/Extensions)                      (OpenAI API)
```

## Communication Flow

### For Inbound Calls:

```
1. Phone → FreePBX (87.106.72.7)
   - SIP signaling
   - Call enters dialplan

2. FreePBX → Application (87.106.74.102)
   - HTTP: ARI events over port 8088
   - Stasis(voiceassistant) triggers connection

3. Application → FreePBX (87.106.74.102 → 87.106.72.7)
   - HTTP: ARI commands (create bridge, external media)
   - RTP: Advertises 87.106.74.102:10000 as RTP endpoint

4. FreePBX → Application (87.106.72.7 → 87.106.74.102)
   - UDP: RTP audio stream to 87.106.74.102:10000

5. Application → OpenAI (87.106.74.102 → Internet)
   - WebSocket: Realtime API connection
   - Audio: Bidirectional streaming

6. Response flows back:
   OpenAI → Application → FreePBX → Phone
```

## Required Network Connectivity

### Application Server (87.106.74.102) MUST reach:

| Destination        | Port/Protocol | Purpose                    |
|--------------------|---------------|----------------------------|
| 87.106.72.7        | 8088/TCP      | ARI HTTP API               |
| api.openai.com     | 443/TCP       | OpenAI Realtime API (WSS)  |

### FreePBX Server (87.106.72.7) MUST reach:

| Destination        | Port/Protocol | Purpose                    |
|--------------------|---------------|----------------------------|
| 87.106.74.102      | 10000/UDP     | RTP audio to application   |

### Firewall Rules Required

#### On FreePBX Server (87.106.72.7):

```bash
# Allow ARI access from application server
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="87.106.74.102" port port="8088" protocol="tcp" accept'

# Allow RTP from FreePBX to application server (outbound - usually allowed by default)
# No specific rule needed for outbound UDP

# Reload firewall
firewall-cmd --reload
```

Verify:
```bash
firewall-cmd --list-all | grep 8088
```

#### On Application Server (87.106.74.102):

```bash
# Allow RTP from FreePBX server
sudo ufw allow from 87.106.72.7 to any port 10000 proto udp

# Allow HTTP API access (if you want to access from other machines)
sudo ufw allow 3000/tcp

# Verify
sudo ufw status
```

Expected output:
```
To                         Action      From
--                         ------      ----
10000/udp                  ALLOW       87.106.72.7
3000/tcp                   ALLOW       Anywhere
```

## Configuration Summary

### On Application Server (87.106.74.102):

**File: `/home/user/freepbx-voice-assistant/.env`**

```bash
# Points to FreePBX server
ARI_HOST=87.106.72.7
ARI_PORT=8088

# This server's IP (for RTP)
SERVER_HOST=87.106.74.102
RTP_HOST=87.106.74.102
RTP_PORT=10000
```

### On FreePBX Server (87.106.72.7):

**File: `/etc/asterisk/ari.conf`**

```ini
[general]
enabled = yes
allowed_origins = *

[voiceassistant]
type = user
read_only = no
password = VoiceAI2024
password_format = plain
```

**File: `/etc/asterisk/extensions_custom.conf`**

```ini
[voice-assistant-test]
exten => 9999,1,NoOp(Test Voice Assistant)
 same => n,Answer()
 same => n,Wait(0.5)
 same => n,Stasis(voiceassistant)
 same => n,Hangup()

[from-internal-custom]
exten => 9999,1,Goto(voice-assistant-test,9999,1)
```

## Testing Connectivity

### Test 1: Application → FreePBX ARI

From application server (87.106.74.102):

```bash
curl -u "voiceassistant:VoiceAI2024" http://87.106.72.7:8088/ari/asterisk/info
```

**Expected:** JSON response with Asterisk info
**If fails:** Check firewall on FreePBX server, verify ARI credentials

### Test 2: FreePBX → Application RTP

From FreePBX server (87.106.72.7):

```bash
# Test UDP port is reachable (requires nc/netcat)
echo "test" | nc -u 87.106.74.102 10000
```

**Note:** UDP is connectionless, so this just verifies the port isn't filtered.

Better test: Make a real call and check RTP flow.

### Test 3: Application → OpenAI

From application server (87.106.74.102):

```bash
curl -I https://api.openai.com/v1/models
```

**Expected:** HTTP 200 or 401 (means reachable)
**If fails:** Check internet connectivity, proxy settings

## Common Issues

### Issue: "ARI connection failed"

**Symptoms:**
- Application logs: `❌ Failed to connect to ARI`
- Status endpoint shows: `"ari_connected": false`

**Cause:** Application server cannot reach FreePBX ARI port.

**Fix:**
1. Test connectivity:
   ```bash
   telnet 87.106.72.7 8088
   ```
2. Check FreePBX firewall:
   ```bash
   firewall-cmd --list-all | grep 8088
   ```
3. Verify ARI is listening:
   ```bash
   netstat -tlnp | grep 8088
   ```

### Issue: "No audio on calls"

**Symptoms:**
- Call connects
- AI greeting doesn't play
- No audio in either direction

**Cause:** RTP cannot flow from FreePBX to application server.

**Fix:**
1. Verify SERVER_HOST in .env is `87.106.74.102`
2. Check port 10000/UDP is listening:
   ```bash
   sudo netstat -ulnp | grep 10000
   ```
3. Verify no firewall blocking on application server:
   ```bash
   sudo ufw status | grep 10000
   ```
4. Check FreePBX can route to 87.106.74.102:
   ```bash
   ping -c 3 87.106.74.102
   ```

### Issue: "Stasis app not registered"

**Symptoms:**
- Asterisk logs: `WARNING: Stasis app 'voiceassistant' not registered`
- Call plays "cannot complete as dialed"

**Cause:** Node.js application not connected to ARI.

**Fix:**
1. Check application is running:
   ```bash
   curl http://localhost:3000/status
   ```
2. Check application logs for ARI connection:
   ```bash
   # Look for: ✅ Connected to Asterisk ARI
   ```
3. Verify ARI credentials match between .env and ari.conf

## Security Considerations

### Firewall Best Practices

**FreePBX Server (87.106.72.7):**
- ✓ Only allow port 8088 from application server (87.106.74.102)
- ✓ Don't expose port 8088 to the internet
- ✓ Use strong ARI password

**Application Server (87.106.74.102):**
- ✓ Only allow RTP from FreePBX server (87.106.72.7)
- ✓ Don't expose port 10000 to the entire internet
- ✓ If exposing port 3000, add authentication

### Network Segmentation

If possible:
- Put both servers on a private VLAN
- Use private IPs for inter-server communication
- Only expose necessary ports to internet (SIP trunk on FreePBX)

## Monitoring

### Check Active Connections

**On Application Server:**
```bash
# Check established ARI connection
netstat -an | grep 87.106.72.7:8088

# Check RTP sessions
sudo netstat -unp | grep 10000
```

**On FreePBX Server:**
```bash
# Check ARI clients
asterisk -rx "http show status"

# Check RTP sessions
asterisk -rx "rtp show stats"
```

## IP Address Reference

Quick reference for your setup:

| Server              | IP Address      | Role                          |
|---------------------|-----------------|-------------------------------|
| FreePBX/Asterisk    | 87.106.72.7     | PBX, ARI server, RTP source   |
| Application/Node.js | 87.106.74.102   | Voice assistant, RTP receiver |

**DNS/Hostnames (optional):**

You can add to `/etc/hosts` on both servers for easier reference:

```
87.106.72.7     freepbx
87.106.74.102   voiceapp
```

Then you could use:
```bash
# Instead of: curl http://87.106.72.7:8088/...
curl http://freepbx:8088/...
```

## Summary

Your two-server setup is **correct and recommended**. The key is ensuring:

1. ✅ Application can reach FreePBX ARI (port 8088/TCP)
2. ✅ FreePBX can send RTP to application (port 10000/UDP)
3. ✅ Application can reach OpenAI (port 443/TCP)
4. ✅ Firewall rules allow the above
5. ✅ .env file has correct IPs for both servers

Once these are verified, calls should flow properly!
