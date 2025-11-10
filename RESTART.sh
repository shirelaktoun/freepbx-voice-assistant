#!/bin/bash
PASSWORD="***REMOVED***"

echo "🔄 Restarting FreePBX Voice Assistant service..."
echo "$PASSWORD" | sudo -S systemctl restart freepbx-voice.service
sleep 2
echo ""
echo "✅ Service restarted!"
echo ""
echo "$PASSWORD" | sudo -S systemctl status freepbx-voice.service --no-pager -l | head -20
echo ""
echo "📝 To monitor logs in real-time:"
echo "   ./view-logs.sh"
echo ""
echo "🐛 To check debug log:"
echo "   tail -f /opt/freepbx-voice-assistant/debug.log"
