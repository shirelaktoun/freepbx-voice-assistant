# Make.com Scenario Setup Guide

## Overview

This guide will help you create a Make.com scenario to receive and process webhooks from your voice assistant, building a comprehensive call register in Microsoft Excel.

## Quick Start: Basic Call Register

### Step 1: Create a New Scenario

1. Log into Make.com
2. Click "Create a new scenario"
3. Name it "Voice Assistant Call Register"

### Step 2: Add Webhook Trigger

1. Click the "+" button to add a module
2. Search for "Webhooks"
3. Select "Webhooks > Custom webhook"
4. Click "Add" to create a new webhook
5. Give it a name: "Voice Assistant Webhook"
6. Click "Save"
7. **Copy the webhook URL** - it will look like:
   ```
   https://hook.eu2.make.com/xxxxxxxxxxxxxxxxx
   ```
8. Add this URL to your `.env` file as `MAKE_WEBHOOK_URL`

### Step 3: Test Webhook Connection

1. In Make.com, click "Run once" to activate the webhook
2. Make a test call to your voice assistant
3. The webhook should receive data and show "Successfully determined" in Make.com
4. Click "OK" to save the data structure

### Step 4: Add Router for Event Types

1. Click the "+" after the webhook module
2. Search for "Router"
3. Add a Router module
4. You'll create routes for each event type

### Step 5: Create Routes

#### Route 1: Call Started Events

1. Click "Add route" on the Router
2. Name it "Call Started"
3. Set filter condition:
   - Field: `event_type`
   - Operator: "Equal to"
   - Value: `call_started`

#### Route 2: Call Ended Events

1. Click "Add route" on the Router
2. Name it "Call Ended"
3. Set filter condition:
   - Field: `event_type`
   - Operator: "Equal to"
   - Value: `call_ended`

#### Route 3: Appointment Events

1. Click "Add route" on the Router
2. Name it "Appointments"
3. Set filter condition:
   - Field: `event_type`
   - Operator: "Equal to"
   - Value: `appointment`

#### Route 4: Towing Events

1. Click "Add route" on the Router
2. Name it "Towing"
3. Set filter condition:
   - Field: `event_type`
   - Operator: "Equal to"
   - Value: `towing`

#### Route 5: Callback Requests

1. Click "Add route" on the Router
2. Name it "Callbacks"
3. Set filter condition:
   - Field: `event_type`
   - Operator: "Equal to"
   - Value: `callback_request`

#### Route 6: Call Transfers

1. Click "Add route" on the Router
2. Name it "Transfers"
3. Set filter condition:
   - Field: `event_type`
   - Operator: "Equal to"
   - Value: `call_transferred`

---

## Option A: Microsoft Excel (Office 365) Call Register

### Setup Excel Workbook

1. Create a new Excel workbook in OneDrive or SharePoint
2. Name it "Voice Assistant Call Register"
3. Create a table with these columns (Insert > Table):
   - A: Timestamp
   - B: Event Type
   - C: Call ID
   - D: Direction
   - E: Caller Number
   - F: Caller Name
   - G: Start Time
   - H: End Time
   - I: Duration (seconds)
   - J: Action Type
   - K: Action Details
   - L: Transfer Extension
   - M: Transfer Reason
4. Name the table "CallRegister" (Table Design > Table Name)

### Add Microsoft Excel Module

For **each route** in your Router:

1. Click the "+" after the route
2. Search for "Microsoft 365 Excel"
3. Select "Add a row into a table"
4. Connect your Microsoft 365 account
5. Select:
   - **Workbook**: Voice Assistant Call Register
   - **Worksheet**: Sheet1 (or your worksheet name)
   - **Table**: CallRegister
6. Map the fields:

```
Timestamp: {{1.timestamp}}
Event Type: {{1.event_type}}
Call ID: {{1.call.call_id}}
Direction: {{1.call.direction}}
Caller Number: {{1.call.caller_number}}
Caller Name: {{1.call.caller_name}}
Start Time: {{1.call.start_time}}
End Time: {{1.call.end_time}}
Duration: {{1.call.duration_seconds}}
Action Type: {{1.action.type}}
Action Details: {{toString(1.action.details)}}
Transfer Extension: {{1.transfer.extension}}
Transfer Reason: {{1.transfer.reason}}
```

### Excel Setup Tips

- **Format columns**: Set Timestamp, Start Time, and End Time columns to "Date/Time" format
- **Number format**: Set Duration column to "Number" with 0 decimal places
- **Conditional formatting**: Highlight urgent towing requests (Urgency = "emergency")
- **Filters**: Enable AutoFilter for easy sorting and filtering
- **Formulas**: Add calculated columns (e.g., call date, day of week, hour)

---

## Option B: Multiple Excel Workbooks by Type

Create separate workbooks for different event types:

### Workbook 1: Call Log

**File**: "Call Log.xlsx"
**Table**: "Calls"
**Columns**:
- Timestamp
- Event Type (call_started/call_ended/call_transferred)
- Call ID
- Direction
- Caller Number
- Caller Name
- Start Time
- End Time
- Duration
- Transfer Extension
- Transfer Reason

**Routes**: Call Started, Call Ended, Call Transferred

---

### Workbook 2: Appointments

**File**: "Appointments.xlsx"
**Table**: "Appointments"
**Columns**:
- Timestamp
- Call ID
- Caller Number
- Caller Name
- Service Type
- Preferred Date
- Preferred Time
- Customer Name
- Customer Phone
- Notes
- Status (New/Confirmed/Completed)

**Routes**: Appointment events

**Field Mapping**:
```
Timestamp: {{1.timestamp}}
Call ID: {{1.call.call_id}}
Caller Number: {{1.call.caller_number}}
Caller Name: {{1.call.caller_name}}
Service Type: {{1.action.details.service_type}}
Preferred Date: {{1.action.details.preferred_date}}
Preferred Time: {{1.action.details.preferred_time}}
Customer Name: {{1.action.details.customer_name}}
Customer Phone: {{1.action.details.customer_phone}}
Notes: {{1.action.details.notes}}
Status: New
```

---

### Workbook 3: Towing Requests

**File**: "Towing Requests.xlsx"
**Table**: "TowingRequests"
**Columns**:
- Timestamp
- Call ID
- Caller Number
- Location
- Destination
- Vehicle Type
- Urgency
- Customer Phone
- Status (Pending/Dispatched/Completed)

**Routes**: Towing events

**Field Mapping**:
```
Timestamp: {{1.timestamp}}
Call ID: {{1.call.call_id}}
Caller Number: {{1.call.caller_number}}
Location: {{1.action.details.location}}
Destination: {{1.action.details.destination}}
Vehicle Type: {{1.action.details.vehicle_type}}
Urgency: {{1.action.details.urgency}}
Customer Phone: {{1.action.details.customer_phone}}
Status: Pending
```

---

### Workbook 4: Callback Requests

**File**: "Callbacks.xlsx"
**Table**: "Callbacks"
**Columns**:
- Timestamp
- Call ID
- Caller Number
- Customer Name
- Customer Phone
- Reason
- Preferred Time
- Status (Pending/Called/Completed)

**Routes**: Callback events

**Field Mapping**:
```
Timestamp: {{1.timestamp}}
Call ID: {{1.call.call_id}}
Caller Number: {{1.call.caller_number}}
Customer Name: {{1.action.details.customer_name}}
Customer Phone: {{1.action.details.customer_phone}}
Reason: {{1.action.details.reason}}
Preferred Time: {{1.action.details.preferred_time}}
Status: Pending
```

---

## Option C: Airtable Call Register

### Setup Airtable

1. Create a new Airtable base: "Voice Assistant Calls"
2. Create a table: "Call Register"
3. Add these fields:
   - Timestamp (Date with time)
   - Event Type (Single select: call_started, call_ended, call_transferred, appointment, towing, callback_request)
   - Call ID (Single line text)
   - Direction (Single select: inbound, outbound, unknown)
   - Caller Number (Phone number)
   - Caller Name (Single line text)
   - Start Time (Date with time)
   - End Time (Date with time)
   - Duration Seconds (Number)
   - Action Type (Single line text)
   - Action Details (Long text)
   - Transfer Extension (Single line text)
   - Transfer Reason (Long text)

### Add Airtable Module

For **each route** in your Router:

1. Click the "+" after the route
2. Search for "Airtable"
3. Select "Create a Record"
4. Connect your Airtable account
5. Select your Base and Table
6. Map the fields as shown above for Excel

---

## Option D: Database Storage (MySQL/PostgreSQL)

### Database Schema

```sql
CREATE TABLE call_register (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    call_id VARCHAR(100),
    direction VARCHAR(20),
    caller_number VARCHAR(50),
    caller_name VARCHAR(100),
    start_time DATETIME,
    end_time DATETIME,
    duration_seconds INT,
    action_type VARCHAR(50),
    action_details JSON,
    transfer_extension VARCHAR(20),
    transfer_reason TEXT,
    assistant_name VARCHAR(50),
    app_version VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_event_type (event_type),
    INDEX idx_call_id (call_id),
    INDEX idx_caller_number (caller_number),
    INDEX idx_timestamp (timestamp)
);
```

### Add Database Module

For **each route** in your Router:

1. Click the "+" after the route
2. Search for your database (MySQL, PostgreSQL, etc.)
3. Select "Insert a record"
4. Configure connection
5. Map fields as above

---

## Advanced Scenario: Complete Call Records

This scenario combines multiple events into complete call records.

### Architecture

```
Webhook → Router → Data Store (Temporary) → Aggregator → Excel
```

### Implementation

#### Step 1: Create a Data Store

1. In Make.com, go to Data Stores
2. Create new data store: "Active Calls"
3. Add these data structure fields:
   - call_id (String)
   - caller_number (String)
   - caller_name (String)
   - direction (String)
   - start_time (String)
   - actions (Array)

#### Step 2: Modify Router Routes

**For Call Started:**
1. After route filter, add "Data store > Add a record"
2. Select "Active Calls" data store
3. Map:
   - Key: `{{1.call.call_id}}`
   - call_id: `{{1.call.call_id}}`
   - caller_number: `{{1.call.caller_number}}`
   - caller_name: `{{1.call.caller_name}}`
   - direction: `{{1.call.direction}}`
   - start_time: `{{1.call.start_time}}`
   - actions: `[]` (empty array)

**For Action Events (appointment/towing/callback):**
1. Add "Data store > Get a record"
2. Key: `{{1.call.call_id}}`
3. Add "Data store > Update a record"
4. Append action to actions array:
   - actions: `{{add(get("actions"); 1.action)}}`

**For Call Ended/Transferred:**
1. Add "Data store > Get a record"
2. Key: `{{1.call.call_id}}`
3. Add Microsoft Excel "Add a row into a table"
4. Map complete record including all actions
5. Add "Data store > Delete a record"
6. Key: `{{1.call.call_id}}`

---

## Scenario Templates by Use Case

### Template 1: Simple Call Log

**Purpose**: Log every webhook event as-is

**Modules**:
1. Webhook trigger
2. Microsoft 365 Excel "Add a row into a table" (all fields)

**Use when**: You want raw data and will process it later

---

### Template 2: Action-Based Routing

**Purpose**: Route different actions to different Excel workbooks

**Modules**:
1. Webhook trigger
2. Router (filter by event_type)
3. Appointments → Excel "Appointments.xlsx" + Outlook Calendar + Email notification
4. Towing → Excel "Towing.xlsx" + SMS Alert (Twilio) + Urgent Teams notification
5. Callbacks → Excel "Callbacks.xlsx" + CRM update
6. Calls → Excel "Call Log.xlsx"

**Use when**: Different teams handle different request types

---

### Template 3: Customer Record Update

**Purpose**: Update customer records with call history in Excel + CRM

**Modules**:
1. Webhook trigger
2. Router by event_type
3. Search customer in CRM by phone number
4. Update customer record in Excel customer database
5. Add entry to customer history table
6. Update CRM with:
   - Last call date
   - Call count
   - Latest action
   - Add note to timeline

**Use when**: You want call history in your CRM and Excel

---

### Template 4: Real-Time Notifications

**Purpose**: Alert team members immediately via Microsoft Teams

**Modules**:
1. Webhook trigger
2. Router by event_type
3. Appointments → Email to scheduler + Excel log
4. Towing (urgent) → Microsoft Teams alert + SMS to dispatch + Excel log
5. Callbacks → Teams notification + Excel log
6. Transfers → Teams message to extension user + Excel log

**Use when**: You need immediate awareness of customer needs

---

## Excel Advanced Features

### Create a Dashboard Sheet

In your Excel workbook, create a "Dashboard" sheet with:

**Summary Statistics**:
```excel
Total Calls Today: =COUNTIFS(CallRegister[Timestamp],">"&TODAY())
Appointments Today: =COUNTIFS(CallRegister[Event Type],"appointment",CallRegister[Timestamp],">"&TODAY())
Towing Requests: =COUNTIF(CallRegister[Event Type],"towing")
Average Call Duration: =AVERAGE(CallRegister[Duration])
```

**Charts**:
- Pie chart: Calls by Event Type
- Line chart: Calls over time
- Bar chart: Calls by hour of day
- Column chart: Appointments by service type

**Pivot Tables**:
1. Insert > PivotTable from CallRegister table
2. Rows: Event Type
3. Values: Count of Call ID
4. Filters: Timestamp (for date range)

### Conditional Formatting

Highlight important events:
- **Urgent towing**: IF Event Type = "towing" AND Action Details contains "urgent" → Red fill
- **Transfers**: IF Event Type = "call_transferred" → Yellow fill
- **Long calls**: IF Duration > 300 → Green fill
- **After hours**: IF HOUR(Timestamp) < 8 OR HOUR(Timestamp) > 18 → Orange fill

### Data Validation

Add dropdown lists for status tracking:
- Appointment Status: New, Confirmed, In Progress, Completed, Cancelled
- Towing Status: Pending, Dispatched, En Route, Completed
- Callback Status: Pending, Attempted, Reached, Completed

---

## Field Mapping Reference

### Standard Fields (Available in ALL events)

```
{{1.event_type}}           - Event type
{{1.timestamp}}            - Event timestamp
{{1.call.call_id}}         - Unique call identifier
{{1.call.direction}}       - inbound/outbound/unknown
{{1.call.caller_number}}   - Phone number
{{1.call.caller_name}}     - Caller name
{{1.call.start_time}}      - Call start time
{{1.call.end_time}}        - Call end time (may be null)
{{1.call.duration_seconds}} - Duration in seconds (may be null)
{{1.action.type}}          - Action type (may be empty)
{{1.transfer.extension}}   - Transfer extension (may be empty)
{{1.transfer.reason}}      - Transfer reason (may be empty)
{{1.system.assistant_name}} - "Sophie"
{{1.system.app_version}}   - "2.0"
```

### Action-Specific Fields

**For appointment events:**
```
{{1.action.details.service_type}}
{{1.action.details.preferred_date}}
{{1.action.details.preferred_time}}
{{1.action.details.customer_name}}
{{1.action.details.customer_phone}}
{{1.action.details.notes}}
```

**For towing events:**
```
{{1.action.details.location}}
{{1.action.details.destination}}
{{1.action.details.vehicle_type}}
{{1.action.details.urgency}}
{{1.action.details.customer_phone}}
```

**For callback events:**
```
{{1.action.details.customer_phone}}
{{1.action.details.customer_name}}
{{1.action.details.reason}}
{{1.action.details.preferred_time}}
```

---

## Testing Your Scenario

### Test Checklist

1. ✅ Activate scenario (Run once or turn on)
2. ✅ Make test call to voice assistant
3. ✅ Verify webhook received in Make.com history
4. ✅ Check all routes executed correctly
5. ✅ Verify data appears in Excel workbook
6. ✅ Test each action type:
   - Schedule appointment
   - Request towing
   - Request callback
   - Transfer to human
7. ✅ Verify call_ended event logged
8. ✅ Check Excel formulas and formatting work correctly

### Common Issues

**Webhook not triggering:**
- Scenario must be active (Run once or enabled)
- Check MAKE_WEBHOOK_URL in .env file
- Restart voice assistant service after changing .env

**Excel connection issues:**
- Workbook must be saved in OneDrive or SharePoint
- Table must be created (not just a range)
- Column names must match exactly
- Re-authenticate Microsoft 365 connection if needed

**Missing data in fields:**
- Use `{{emptystring}}` for optional fields
- Check field mapping uses correct path (e.g., `1.call.caller_number`)
- Excel may show blank cells for null values - this is normal

**Routes not executing:**
- Verify filter condition uses exact string match
- Check event_type spelling (underscore, not hyphen)

**Duplicate records:**
- This is expected - one call generates multiple events
- Use aggregation scenario if you want combined records

---

## Performance Optimization

### For High Call Volume

1. **Use Data Stores** for temporary storage (faster than direct Excel writes)
2. **Batch operations** using aggregators (write multiple rows at once)
3. **Limit routes** to only what you need
4. **Use filters** early to avoid unnecessary processing
5. **Archive old data** periodically to keep Excel files under 5MB

### For Cost Optimization

1. **Combine routes** where possible
2. **Use filters** to process only important events
3. **Batch Excel operations** (aggregate 10-20 records before writing)
4. **Use single workbook** instead of multiple (fewer API calls)
5. **Archive old data** to separate workbooks

---

## Example: Complete Basic Scenario

Here's a complete working scenario you can build in 15 minutes:

### Modules in Order:

1. **Webhooks > Custom webhook**
   - Create webhook and get URL
   - Add to .env as MAKE_WEBHOOK_URL

2. **Router** with 6 routes:
   - call_started → Excel "Call Log" table (all fields)
   - call_ended → Excel "Call Log" table (all fields)
   - appointment → Excel "Appointments" table (action details)
   - towing → Excel "Towing Requests" table + Teams alert
   - callback_request → Excel "Callbacks" table + Outlook task
   - call_transferred → Excel "Transfers" table (call + transfer info)

3. **Error Handler** (optional but recommended):
   - Add error handler to catch failures
   - Log to "Errors" sheet or send Teams notification

### Time to Build: ~15 minutes
### Operations per call: 2-4 (depending on actions taken)
### Cost estimate: ~1,000 operations = $0.10 USD (Make.com free tier: 1,000 ops/month)

---

## Microsoft Integration Add-ons

### Add Microsoft Teams Notifications

After each Excel write:
1. Add "Microsoft Teams > Create a message"
2. Select team and channel
3. Message content:
```
New {{1.event_type}} event
Caller: {{1.call.caller_name}} ({{1.call.caller_number}})
Time: {{formatDate(1.timestamp; "DD/MM/YYYY HH:mm")}}
Details: {{1.action.details}}
```

### Add Outlook Calendar Events (for appointments)

After appointment Excel write:
1. Add "Microsoft 365 Calendar > Create an event"
2. Map:
   - Subject: `Appointment - {{1.action.details.service_type}}`
   - Start: `{{1.action.details.preferred_date}} {{1.action.details.preferred_time}}`
   - Duration: 60 minutes
   - Description: Customer: {{1.action.details.customer_name}} - Phone: {{1.action.details.customer_phone}} - Notes: {{1.action.details.notes}}

### Add Outlook Tasks (for callbacks)

After callback Excel write:
1. Add "Microsoft To Do > Create a task"
2. Map:
   - Title: `Call back {{1.action.details.customer_name}}`
   - Due: Today
   - Notes: Phone: {{1.action.details.customer_phone}} - Reason: {{1.action.details.reason}} - Preferred time: {{1.action.details.preferred_time}}

---

## Support and Troubleshooting

### Debug Webhooks

1. View incoming webhooks in Make.com:
   - Go to scenario history
   - Click "View details" on execution
   - Check raw webhook data

2. View application logs:
   ```bash
   sudo journalctl -u freepbx-voice.service -f
   ```

3. Look for these log messages:
   - `📤 Sending call register webhook: [event_type]`
   - `✅ Webhook sent successfully`
   - `❌ Webhook failed: [error]`

### Test Webhook Manually

Use curl to test your webhook:

```bash
curl -X POST https://hook.eu2.make.com/YOUR_WEBHOOK_ID \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "call_started",
    "timestamp": "2025-11-02T10:30:00.000Z",
    "call": {
      "call_id": "test-123",
      "direction": "inbound",
      "caller_number": "+1234567890",
      "caller_name": "Test User",
      "start_time": "2025-11-02T10:30:00.000Z",
      "end_time": null,
      "duration_seconds": null
    },
    "action": {},
    "transfer": {},
    "system": {
      "assistant_name": "Sophie",
      "app_version": "2.0"
    }
  }'
```

### Excel-Specific Troubleshooting

**"Table not found" error:**
- Ensure table exists (Insert > Table)
- Table name must match exactly in Make.com
- Table must have headers matching column names

**"Workbook not accessible" error:**
- File must be in OneDrive or SharePoint
- Check sharing permissions
- Re-authenticate Microsoft 365 in Make.com

**Slow performance:**
- Excel files over 5MB slow down significantly
- Archive old data monthly
- Use multiple smaller workbooks instead of one large file

---

## Next Steps

1. ✅ Build basic scenario with Excel
2. ✅ Test with real calls
3. ✅ Add Microsoft Teams notifications for important events
4. ✅ Create Excel dashboard with charts and pivot tables
5. ✅ Add Outlook Calendar integration for appointments
6. ✅ Optimize based on your workflow
7. ✅ Add integrations (CRM, Microsoft To Do, etc.)

## Additional Resources

- Make.com Documentation: https://www.make.com/en/help
- Microsoft 365 Excel connector: https://www.make.com/en/help/app/microsoft-365-excel
- Webhook Documentation: See WEBHOOK_DOCUMENTATION.md
- Voice Assistant Logs: `sudo journalctl -u freepbx-voice.service -f`

---

**Need Help?** Check the application logs first, then review Make.com execution history to see exactly what data was sent and received.
