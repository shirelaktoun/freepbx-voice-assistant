#!/bin/bash
# Helper script to view logs easily

PASSWORD="2024!Paris"

echo "📊 FreePBX Voice Assistant - Live Logs"
echo "========================================"
echo ""
echo "Press Ctrl+C to stop viewing logs"
echo ""
sleep 1

echo "$PASSWORD" | sudo -S journalctl -u freepbx-voice.service -f --no-pager
