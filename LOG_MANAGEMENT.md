# Log Management Guide

## Current Status

Your server's journalctl logs are currently using **4GB** of disk space, which can grow indefinitely without limits.

## What Was Configured

I've set up the following limits in `/etc/systemd/journald.conf`:

```ini
[Journal]
# Limit journal size
SystemMaxUse=500M          # Maximum disk space for all journal files
SystemKeepFree=1G          # Keep at least 1GB free on disk
MaxFileSec=1week           # Rotate logs weekly
MaxRetentionSec=2week      # Keep logs for 2 weeks maximum
# Compress old logs
Compress=yes               # Save space by compressing
```

### What These Settings Mean

- **SystemMaxUse=500M**: Journal will never use more than 500MB total
- **SystemKeepFree=1G**: Always keep at least 1GB free on the disk
- **MaxRetentionSec=2week**: Automatically delete logs older than 2 weeks
- **MaxFileSec=1week**: Create new log files weekly
- **Compress=yes**: Compress old logs to save space

## Manual Cleanup Commands

### Check Current Usage
```bash
sudo journalctl --disk-usage
```

### Clean Up Old Logs

**By size (keep only 500MB):**
```bash
sudo journalctl --vacuum-size=500M
```

**By time (keep only last 7 days):**
```bash
sudo journalctl --vacuum-time=7d
```

**By number of files (keep only 10 most recent):**
```bash
sudo journalctl --vacuum-files=10
```

## Application-Specific Logging

For your FreePBX Voice Assistant application specifically:

### View Recent Logs Only
Instead of viewing all history:
```bash
# Last 100 lines
sudo journalctl -u freepbx-voice.service -n 100

# Last hour
sudo journalctl -u freepbx-voice.service --since "1 hour ago"

# Today only
sudo journalctl -u freepbx-voice.service --since today

# Specific time range
sudo journalctl -u freepbx-voice.service --since "2025-10-31 14:00" --until "2025-10-31 15:00"
```

### Follow Live Logs (Real-time)
```bash
# All logs (verbose)
sudo journalctl -u freepbx-voice.service -f

# Only errors
sudo journalctl -u freepbx-voice.service -f -p err

# Only important events (grep filter)
sudo journalctl -u freepbx-voice.service -f | grep -E "transfer|call-started|error"
```

## Alternative: Use Application Logging

Instead of relying solely on journalctl, you can configure the application to write logs to files with rotation.

### Option 1: Configure Log Rotation for Application

Create `/etc/logrotate.d/freepbx-voice`:
```
/var/log/freepbx-voice/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
}
```

### Option 2: Reduce Application Logging Verbosity

In your `.env` file:
```bash
LOG_LEVEL=warn  # Only log warnings and errors (not info)
DEBUG=false     # Disable debug logging
```

This will significantly reduce log volume.

## Monitoring Disk Space

### Check Disk Usage
```bash
df -h
```

### Check Journal Specifically
```bash
sudo journalctl --disk-usage
```

### Find Large Log Files
```bash
sudo du -sh /var/log/journal/*
```

## Best Practices

1. **Regular Cleanup**: Set up a cron job to clean old logs monthly
2. **Monitor Disk Space**: Check available space weekly
3. **Use Filters**: When viewing logs, use time ranges and filters
4. **Archive Important Logs**: Save critical logs elsewhere before cleanup
5. **Adjust Verbosity**: Lower log level in production (warn/error only)

## Recommended Cron Job for Cleanup

Add to root crontab (`sudo crontab -e`):
```bash
# Clean journal logs older than 14 days, every Monday at 3am
0 3 * * 1 /usr/bin/journalctl --vacuum-time=14d
```

## Emergency Cleanup

If disk is full:
```bash
# Aggressive cleanup - keep only last 3 days
sudo journalctl --vacuum-time=3d

# Or keep only 200MB
sudo journalctl --vacuum-size=200M

# Restart journald
sudo systemctl restart systemd-journald
```

## Verification

After configuration changes:
```bash
# 1. Check configuration is loaded
sudo systemctl restart systemd-journald

# 2. Verify settings
sudo journalctl --header

# 3. Check current usage
sudo journalctl --disk-usage
```

## For Your Application

Current logging pattern generates a lot of output because:
- Every WebSocket message is logged
- Every audio packet event is logged  
- Real-time API events are logged

**Recommendations:**

1. **Reduce verbosity** - Only log important events:
   - Call starts/ends
   - Transfers
   - Errors
   - Function calls

2. **Filter in code** - Remove verbose logging:
   - `Received event: response.audio.delta` (happens hundreds of times per call)
   - `Received WebSocket message: audio_data` (very frequent)

3. **Use appropriate log levels**:
   - DEBUG: Development only
   - INFO: Important events
   - WARN: Potential issues
   - ERROR: Actual problems

## Summary

✅ **Journal limits configured**: Max 500MB, 2 weeks retention  
✅ **Compression enabled**: Saves space automatically  
✅ **Old logs will auto-delete**: After 2 weeks  
⚠️ **Current usage**: 4GB (will reduce over time)  

The system will now automatically manage log size and prevent disk space issues!
