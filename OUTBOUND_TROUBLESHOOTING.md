# Outbound Calling Troubleshooting Guide

## The "Allocation Failed" Error - SOLVED

### Root Cause
The "Allocation failed" error occurs when trying to call an **offline/unregistered** endpoint on the Asterisk server.

### Your Configuration
- **Asterisk Server**: 87.106.72.7 (remote)
- **Application Server**: 194.164.23.100 (local)
- **Communication**: Via ARI over HTTP (port 8088)

### What Was Fixed

1. **Changed Default Context**
   - Old: `outbound-assistant` (doesn't exist)
   - New: `from-internal` (standard FreePBX context)

2. **Added Automatic Technology Detection**
   - Now tries both PJSIP and SIP automatically
   - Better error messages with troubleshooting tips

3. **Created Diagnostics Tool**
   - `/opt/freepbx-voice-assistant/test-ari-diagnostics.js`
   - Shows all available endpoints and their status

---

## Available Endpoints on Your Asterisk Server

From the diagnostic scan on 87.106.72.7:

### ✅ ONLINE (Can call these now):
```
PJSIP/OpenAI
PJSIP/soloi_login
PJSIP/to-capraz
```

### ⚠️ OFFLINE (Need to register first):
```
PJSIP/7021
PJSIP/1002
PJSIP/300
PJSIP/8000
PJSIP/200
PJSIP/7000
PJSIP/6006
PJSIP/100
PJSIP/777
PJSIP/dpma_endpoint
PJSIP/from_11labs
PJSIP/1a9f40e8-3b54-4405-9b67-4dda843a8755
```

---

## How to Test Outbound Calling

### Method 1: Web Interface
1. Open `http://your-server:3000/test-client.html`
2. Scroll to "📞 Outbound Calls" section
3. Try one of the **ONLINE** endpoints first:
   ```
   OpenAI
   soloi_login
   to-capraz
   ```
4. Click "Make Call"

### Method 2: API Call
```bash
curl -X POST http://localhost:3000/ari/originate \
  -H "Content-Type: application/json" \
  -d '{"destination": "OpenAI"}'
```

### Method 3: Test Script
```bash
cd /opt/freepbx-voice-assistant
./test-outbound-call.sh OpenAI
```

---

## Why Extension 7021 Failed

**Extension 7021 exists but is OFFLINE**

This means:
- The SIP device/softphone for extension 7021 is not registered
- It might be powered off or disconnected
- Or it's on a different network without registration

### To make 7021 work:
1. **Register the device** to the Asterisk server
2. **Check the device** is powered on and connected
3. **Verify SIP credentials** are correct
4. Once registered, it will show as "online" in diagnostics

---

## Running Diagnostics

Check endpoint status anytime:
```bash
cd /opt/freepbx-voice-assistant
node test-ari-diagnostics.js
```

This will show:
- All available endpoints
- Their online/offline status
- How to dial them (e.g., PJSIP/7021)
- Active channels

---

## Common Issues & Solutions

### Issue: "Allocation failed"
**Cause**: Trying to call an offline endpoint  
**Solution**: 
1. Run diagnostics to check endpoint status
2. Call only ONLINE endpoints
3. Or register the offline endpoint first

### Issue: "Context not found"
**Cause**: Wrong dialplan context  
**Solution**: Now fixed - using `from-internal` by default

### Issue: "Extension not found"
**Cause**: Extension doesn't exist on Asterisk server  
**Solution**: 
1. Run diagnostics to see available endpoints
2. Create the extension in FreePBX if needed

### Issue: "Permission denied"
**Cause**: ARI user lacks originate permissions  
**Solution**: Check ARI user permissions in FreePBX

---

## Understanding Endpoint States

### ONLINE
- Device is registered and connected
- Can receive calls immediately
- Example: PJSIP/OpenAI, PJSIP/soloi_login

### OFFLINE
- Device is not registered
- Cannot receive calls until it registers
- Example: PJSIP/7021, PJSIP/1002

### How to register an offline endpoint:
1. Configure the SIP device with correct credentials
2. Point it to your Asterisk server (87.106.72.7)
3. Ensure network connectivity
4. Device will show as "online" once registered

---

## Calling External Numbers

To call external phone numbers (not just extensions):

1. **Verify trunk configuration** on FreePBX
2. **Use full number** in E.164 format if possible
3. **May need outbound routes** configured on FreePBX

Example:
```bash
curl -X POST http://localhost:3000/ari/originate \
  -H "Content-Type: application/json" \
  -d '{"destination": "+1234567890"}'
```

**Note**: External calling requires:
- Configured SIP trunk on FreePBX
- Outbound routes set up correctly
- Sufficient account balance (if using paid trunk)

---

## Architecture Diagram

```
┌─────────────────────────┐
│  Application Server     │
│  194.164.23.100        │
│                        │
│  - Node.js App         │
│  - RTP Handler         │
│  - OpenAI Integration  │
└───────────┬─────────────┘
            │
            │ ARI/HTTP (8088)
            │ RTP (10000)
            │
┌───────────▼─────────────┐
│  Asterisk Server       │
│  87.106.72.7          │
│                        │
│  - FreePBX            │
│  - SIP Endpoints      │
│  - Dialplan           │
└───────────┬─────────────┘
            │
            │ SIP
            │
┌───────────▼─────────────┐
│  SIP Devices/Phones    │
│                        │
│  - Extension 7021     │
│  - Extension 1002     │
│  - etc.               │
└────────────────────────┘
```

---

## Call Flow for Outbound Calls

1. **Web UI / API Request** → Application Server
2. **Application** → ARI originate command → Asterisk Server
3. **Asterisk** → Checks if endpoint is online
4. **If ONLINE** → Dials endpoint via SIP
5. **SIP Device** → Rings/Answers
6. **Call enters Stasis** → Back to Application via ARI
7. **Bridge created** → RTP audio flows
8. **OpenAI session** → AI conducts conversation

---

## Quick Reference

### Test with online endpoint:
```bash
curl -X POST http://localhost:3000/ari/originate \
  -H "Content-Type: application/json" \
  -d '{"destination": "OpenAI"}'
```

### Check diagnostics:
```bash
node test-ari-diagnostics.js
```

### View logs:
```bash
sudo journalctl -u freepbx-voice.service -f
```

### List active calls:
```bash
curl http://localhost:3000/ari/calls
```

---

## Success Checklist

Before making an outbound call, verify:

- [ ] Asterisk server is accessible (87.106.72.7:8088)
- [ ] ARI credentials are correct
- [ ] Destination endpoint EXISTS (run diagnostics)
- [ ] Destination endpoint is ONLINE (not offline)
- [ ] Dialplan context exists (from-internal)
- [ ] Service is running (`systemctl status freepbx-voice.service`)

---

## Support

If you continue having issues:

1. **Check logs**: `sudo journalctl -u freepbx-voice.service -f`
2. **Run diagnostics**: `node test-ari-diagnostics.js`
3. **Check Asterisk logs** on 87.106.72.7: `/var/log/asterisk/full`
4. **Verify network**: Can application server reach 87.106.72.7:8088?
5. **Test basic ARI**: The diagnostics tool proves ARI works

---

## Summary

✅ **FIXED**: Changed context from `outbound-assistant` to `from-internal`  
✅ **FIXED**: Added automatic PJSIP/SIP technology detection  
✅ **ADDED**: Diagnostic tool to check endpoint status  
✅ **IDENTIFIED**: Extension 7021 is offline - needs registration  
✅ **AVAILABLE**: Can call OpenAI, soloi_login, or to-capraz (all online)

**Next steps**: Register extension 7021 or test with an online endpoint first!
