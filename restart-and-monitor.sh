#!/bin/bash

echo "🔄 Restarting FreePBX Voice Assistant..."
sudo systemctl restart freepbx-voice.service

echo "⏳ Waiting for service to start..."
sleep 3

echo "✅ Service status:"
sudo systemctl status freepbx-voice.service --no-pager -l

echo ""
echo "📝 Debug log location: /opt/freepbx-voice-assistant/debug.log"
echo ""
echo "🎯 Ready for testing! To monitor logs in real-time, run:"
echo "   tail -f /opt/freepbx-voice-assistant/debug.log"
