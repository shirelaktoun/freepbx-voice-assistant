# Call Register Webhook Documentation

## Overview

The voice assistant sends standardized webhooks to Make.com for recording all call events and actions. This allows you to create a comprehensive call register and track all interactions with the AI assistant.

## Configuration

Set the webhook URL in your `.env` file:

```
MAKE_WEBHOOK_URL=https://hook.eu2.make.com/your-webhook-id
```

## Standardized Webhook Payload Structure

All webhooks follow the same structure to ensure consistency when mapping in Make.com:

```json
{
  "event_type": "string",
  "timestamp": "ISO 8601 datetime",
  "call": {
    "call_id": "string",
    "direction": "inbound|outbound|unknown",
    "caller_number": "string",
    "caller_name": "string",
    "start_time": "ISO 8601 datetime or empty",
    "end_time": "ISO 8601 datetime or null",
    "duration_seconds": "number or null"
  },
  "action": {
    "type": "string",
    "details": {}
  },
  "transfer": {
    "extension": "string",
    "reason": "string"
  },
  "system": {
    "assistant_name": "string",
    "app_version": "string"
  }
}
```

### Standard Fields

All webhooks include these fields:

- **event_type**: Type of event (see Event Types below)
- **timestamp**: When the event occurred (ISO 8601 format)
- **call**: Call information (may be empty for some fields)
- **action**: Action-specific data (empty object `{}` if no action)
- **transfer**: Transfer information (empty object `{}` if not transferred)
- **system**: System metadata

## Event Types

### 1. call_started

Sent when a call begins (inbound or outbound).

**Example:**
```json
{
  "event_type": "call_started",
  "timestamp": "2025-11-02T10:30:00.123Z",
  "call": {
    "call_id": "channel-123456",
    "direction": "inbound",
    "caller_number": "+1234567890",
    "caller_name": "John Doe",
    "start_time": "2025-11-02T10:30:00.123Z",
    "end_time": null,
    "duration_seconds": null
  },
  "action": {},
  "transfer": {},
  "system": {
    "assistant_name": "Sophie",
    "app_version": "2.0"
  }
}
```

### 2. call_ended

Sent when a call ends normally.

**Example:**
```json
{
  "event_type": "call_ended",
  "timestamp": "2025-11-02T10:35:30.456Z",
  "call": {
    "call_id": "channel-123456",
    "direction": "unknown",
    "caller_number": "+1234567890",
    "caller_name": "",
    "start_time": "",
    "end_time": "2025-11-02T10:35:30.456Z",
    "duration_seconds": 330
  },
  "action": {},
  "transfer": {},
  "system": {
    "assistant_name": "Sophie",
    "app_version": "2.0"
  }
}
```

### 3. call_transferred

Sent when a call is transferred to a human agent.

**Example:**
```json
{
  "event_type": "call_transferred",
  "timestamp": "2025-11-02T10:32:15.789Z",
  "call": {
    "call_id": "channel-123456",
    "direction": "unknown",
    "caller_number": "+1234567890",
    "caller_name": "",
    "start_time": "",
    "end_time": "2025-11-02T10:32:15.789Z",
    "duration_seconds": null
  },
  "action": {},
  "transfer": {
    "extension": "7021",
    "reason": "Customer requested to speak with a human"
  },
  "system": {
    "assistant_name": "Sophie",
    "app_version": "2.0"
  }
}
```

### 4. appointment

Sent when a customer schedules an appointment.

**Example:**
```json
{
  "event_type": "appointment",
  "timestamp": "2025-11-02T10:31:45.123Z",
  "call": {
    "call_id": "channel-123456",
    "direction": "inbound",
    "caller_number": "+1234567890",
    "caller_name": "John Doe",
    "start_time": "2025-11-02T10:30:00.123Z",
    "end_time": null,
    "duration_seconds": null
  },
  "action": {
    "type": "appointment",
    "details": {
      "service_type": "oil change",
      "preferred_date": "2025-11-05",
      "preferred_time": "14:00",
      "customer_name": "John Doe",
      "customer_phone": "+1234567890",
      "notes": "Need synthetic oil"
    }
  },
  "transfer": {},
  "system": {
    "assistant_name": "Sophie",
    "app_version": "2.0"
  }
}
```

### 5. towing

Sent when a customer requests towing service.

**Example:**
```json
{
  "event_type": "towing",
  "timestamp": "2025-11-02T10:31:45.123Z",
  "call": {
    "call_id": "channel-123456",
    "direction": "inbound",
    "caller_number": "+1234567890",
    "caller_name": "John Doe",
    "start_time": "2025-11-02T10:30:00.123Z",
    "end_time": null,
    "duration_seconds": null
  },
  "action": {
    "type": "towing",
    "details": {
      "location": "123 Main St, Springfield",
      "destination": "Mindenhurts Garage",
      "vehicle_type": "sedan",
      "urgency": "urgent",
      "customer_phone": "+1234567890"
    }
  },
  "transfer": {},
  "system": {
    "assistant_name": "Sophie",
    "app_version": "2.0"
  }
}
```

### 6. callback_request

Sent when a customer requests a callback.

**Example:**
```json
{
  "event_type": "callback_request",
  "timestamp": "2025-11-02T10:31:45.123Z",
  "call": {
    "call_id": "channel-123456",
    "direction": "inbound",
    "caller_number": "+1234567890",
    "caller_name": "John Doe",
    "start_time": "2025-11-02T10:30:00.123Z",
    "end_time": null,
    "duration_seconds": null
  },
  "action": {
    "type": "callback_request",
    "details": {
      "customer_phone": "+1234567890",
      "customer_name": "John Doe",
      "reason": "Question about pricing",
      "preferred_time": "afternoon"
    }
  },
  "transfer": {},
  "system": {
    "assistant_name": "Sophie",
    "app_version": "2.0"
  }
}
```

## Mapping in Make.com

### Recommended Scenario Structure

1. **Webhook Trigger**: Use the "Webhooks > Custom webhook" module
2. **Router**: Route based on `event_type` field
3. **Data Store/Database**: Save to your preferred storage (Google Sheets, Airtable, MySQL, etc.)

### Example Make.com Mapping

For all event types, map these standard fields:

| Make.com Field | Webhook Path | Notes |
|----------------|--------------|-------|
| Event Type | `event_type` | Always present |
| Timestamp | `timestamp` | Always present |
| Call ID | `call.call_id` | May be empty |
| Direction | `call.direction` | inbound/outbound/unknown |
| Caller Number | `call.caller_number` | May be empty |
| Caller Name | `call.caller_name` | May be empty |
| Start Time | `call.start_time` | May be empty |
| End Time | `call.end_time` | May be null |
| Duration | `call.duration_seconds` | May be null |
| Action Type | `action.type` | Empty string if no action |
| Transfer Extension | `transfer.extension` | Empty if not transferred |
| Transfer Reason | `transfer.reason` | Empty if not transferred |
| Assistant Name | `system.assistant_name` | Always "Sophie" |
| App Version | `system.app_version` | Always "2.0" |

### Conditional Fields (Action Details)

Based on `action.type`, you can map additional fields:

**For appointment:**
- `action.details.service_type`
- `action.details.preferred_date`
- `action.details.preferred_time`
- `action.details.customer_name`
- `action.details.customer_phone`
- `action.details.notes`

**For towing:**
- `action.details.location`
- `action.details.destination`
- `action.details.vehicle_type`
- `action.details.urgency`
- `action.details.customer_phone`

**For callback_request:**
- `action.details.customer_phone`
- `action.details.customer_name`
- `action.details.reason`
- `action.details.preferred_time`

## Benefits of Standardized Structure

1. **Consistent Mapping**: All webhooks have the same base fields, making Make.com scenarios easier to build
2. **Empty Fields**: When fields are not relevant, they are set to empty strings, null, or empty objects - never missing
3. **Single Webhook URL**: One endpoint handles all event types
4. **Easy Filtering**: Filter by `event_type` to route to different actions
5. **Complete Records**: Combine `call_started`, actions, and `call_ended` events to build complete call records

## Implementation Details

### Code Location

The webhook implementation is in `/opt/freepbx-voice-assistant/index.js`:

- **sendCallRegisterWebhook()**: Sends standardized webhooks (line ~883)
- **buildCallData()**: Builds call data object (line ~917)
- Event handlers: `call-started` (~611), `call-ended` (~647), `call-transferred` (~685)
- Function handlers: `handleScheduleAppointment()` (~999), `handleRequestTowing()` (~1041), `handleRequestCallback()` (~1116)

### Error Handling

- Webhook failures are logged but do not interrupt call flow
- If `MAKE_WEBHOOK_URL` is not configured, webhooks are skipped with a warning

## Testing

1. Make a test call to your voice assistant
2. Check Make.com webhook history for incoming data
3. Verify all fields are present (even if empty)
4. Test each action type (appointment, towing, callback)
5. Test call transfer scenario

## Troubleshooting

**Webhook not received:**
- Check `MAKE_WEBHOOK_URL` in `.env` file
- Verify Make.com webhook is active
- Check application logs for webhook errors

**Missing fields:**
- All fields should be present. Check Make.com mapping
- Empty strings, null, or `{}` indicate field is not relevant for this event

**Multiple webhooks for same call:**
- This is expected. A call may generate:
  - 1x `call_started`
  - 0-N action webhooks (appointment, towing, callback)
  - 1x `call_ended` OR 1x `call_transferred`

## Support

For issues or questions:
1. Check application logs: `journalctl -u freepbx-voice.service -f`
2. Review this documentation
3. Test with a simple Make.com scenario first
