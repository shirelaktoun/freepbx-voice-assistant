# Audio Quality Optimization - G.722 Codec Configuration

## Summary
Configured to-capraz trunk to prefer G.722 wideband codec for improved audio quality.

## Changes Made

### FreePBX Configuration (87.106.72.7)
**File**: `/etc/asterisk/pjsip.endpoint.conf`

**Section**: `[to-capraz]`

**Change**:
```ini
# Before:
allow=ulaw,alaw,gsm,g726,g722,h264,mpeg4

# After:
allow=g722,ulaw,alaw,gsm,g726,h264,mpeg4
```

**Applied**: PJSIP module reloaded with `module reload res_pjsip.so`

## Results

### Outgoing Calls (to Capraz PBX)
✅ **Excellent quality** - using G.722 @ 16kHz (wideband)

### Incoming Calls (from Capraz PBX)
⚠️ **Standard quality** - remote PBX may not be sending G.722

## G.722 Codec Benefits

| Aspect | G.711 ulaw | G.722 |
|--------|------------|-------|
| Sample Rate | 8 kHz | 16 kHz |
| Bandwidth | Narrowband | Wideband |
| Quality | Telephone | HD Voice |
| Improvement | Baseline | 2x better |

## Remote PBX Configuration

For optimal incoming call quality, configure the remote Capraz PBX to:

1. **Enable G.722 codec**
2. **Prefer G.722 over G.711** (set it first in codec list)
3. **Verify codec negotiation** in SIP messages

### Typical Configuration
```ini
[trunk-to-deepcut]
type=endpoint
allow=g722,ulaw,alaw  ; G.722 first for best quality
```

## Verification

To check which codec is being used during a call:
```bash
ssh root@87.106.72.7
asterisk -rx 'pjsip show channels'
```

Look for the codec column - should show "g722" for best quality.

## Fallback

If remote PBX doesn't support G.722, the trunk automatically falls back to:
1. ulaw (8 kHz)
2. alaw (8 kHz)
3. Other configured codecs

No calls will fail due to codec mismatch.
