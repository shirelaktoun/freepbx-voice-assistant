# FreePBX Voice Assistant - Cost Analysis Reference
**Generated: November 6, 2025**
**Currency: GBP (£)**
**Exchange Rate: USD to GBP = 0.79**

---

## 📊 Executive Summary

The FreePBX Voice Assistant using OpenAI's GPT-4o Mini Realtime API provides significant cost savings compared to traditional human-staffed solutions, with an estimated **92-95% cost reduction** versus hiring a full-time receptionist.

**Average Cost Per Call:** £0.008 - £0.020 (depending on duration)
**Monthly Cost (500 calls):** ~£85
**ROI vs Human Agent:** 95%+ savings

---

## 💷 OpenAI API Pricing (GPT-4o Mini Realtime)

### Base Rates (Converted to GBP)

| Component | USD Rate | GBP Rate (0.79x) | Per Minute Estimate |
|-----------|----------|------------------|---------------------|
| **Audio Input** | $0.60 / 1M tokens | £0.47 / 1M tokens | ~£0.0012/min |
| **Audio Output** | $2.40 / 1M tokens | £1.90 / 1M tokens | ~£0.0047/min |
| **Text/Function Calls** | $0.60 / 1M tokens | £0.47 / 1M tokens | ~£0.0001/call |

### Token Estimates

- **Audio Input**: ~1,500 tokens per minute (25 tokens/second)
- **Audio Output**: ~1,500 tokens per minute (25 tokens/second)
- **Function Calls**: ~200 tokens per function call (estimated)

---

## 📞 Cost Per Call Type

### Short Inquiry Call (1-2 minutes)
**Example**: "What are your hours?" → Answer → "Thank you, goodbye"

| Item | Tokens | Cost (GBP) |
|------|--------|------------|
| Audio Input | 3,000 | £0.0014 |
| Audio Output | 3,000 | £0.0057 |
| Function Calls | 200 | £0.0001 |
| **Total** | **6,200** | **£0.0072** |

**Monthly cost for 1,000 calls**: ~£7.20

---

### Medium Service Call (3-5 minutes)
**Example**: Service inquiry → Schedule appointment → Confirm details → Goodbye

| Item | Tokens | Cost (GBP) |
|------|--------|------------|
| Audio Input | 7,500 | £0.0036 |
| Audio Output | 7,500 | £0.0143 |
| Function Calls | 500 | £0.0002 |
| **Total** | **15,500** | **£0.0181** |

**Monthly cost for 1,000 calls**: ~£18.10

---

### Long Support Call (8-10 minutes)
**Example**: Complex issue → Multiple questions → Towing request → Transfer → Resolution

| Item | Tokens | Cost (GBP) |
|------|--------|------------|
| Audio Input | 15,000 | £0.0071 |
| Audio Output | 15,000 | £0.0285 |
| Function Calls | 800 | £0.0004 |
| **Total** | **30,800** | **£0.0360** |

**Monthly cost for 1,000 calls**: ~£36.00

---

### Transfer to Human Call
**Example**: AI conversation (2-3 min) → Transfer to extension 7021

| Item | Tokens | Cost (GBP) |
|------|--------|------------|
| AI portion (2-3 min) | 9,000 | £0.0118 |
| Human portion | 0 (no AI cost) | £0.00 |
| **Total AI Cost** | **9,000** | **£0.0118** |

**Note**: Human time has labor costs but no additional OpenAI costs

---

## 🖥️ Infrastructure Costs

### Current Setup (Self-Hosted)

| Component | Monthly Cost (GBP) | Notes |
|-----------|-------------------|-------|
| **VPS/Server** (194.164.23.100) | £8 - £40 | Varies by provider |
| **FreePBX/Asterisk** | Free | Self-hosted open source |
| **Bandwidth** | £4 - £16 | Depends on call volume |
| **Domain/SSL** | £1 - £4 | Annual cost divided |
| **Make.com** (webhooks) | £0 - £23 | Based on usage tier |
| **Total Infrastructure** | **£13 - £83/month** | Fixed costs |

---

## ☎️ Telephony Costs

### Inbound Calls
**FreePBX Setup** at 87.106.72.7 (costs depend on your SIP provider)

| Type | Typical Cost (GBP) |
|------|-------------------|
| **Local/Toll-Free Number** | £0.80 - £4/month |
| **Per-minute inbound** | £0.008 - £0.024/minute |

### Outbound Calls

| Type | Cost (GBP) |
|------|------------|
| **Local calls** | £0.008 - £0.016/minute |
| **International** | £0.040 - £0.400/minute |

---

## 💰 Total Cost Scenarios

### Scenario 1: Small Business (100 calls/month)
**Average call**: 3 minutes

| Item | Cost (GBP) |
|------|-----------|
| OpenAI API | £1.81 |
| Infrastructure | £24 |
| Telephony (inbound) | £2.40 |
| **Total** | **£28.21/month** |

**Cost per call**: £0.28

---

### Scenario 2: Growing Business (500 calls/month)
**Average call**: 4 minutes

| Item | Cost (GBP) |
|------|-----------|
| OpenAI API | £10.86 |
| Infrastructure | £40 |
| Telephony (inbound) | £12 |
| Make.com | £23 |
| **Total** | **£85.86/month** |

**Cost per call**: £0.17

---

### Scenario 3: High Volume (2,000 calls/month)
**Average call**: 3.5 minutes

| Item | Cost (GBP) |
|------|-----------|
| OpenAI API | £41.08 |
| Infrastructure | £63 |
| Telephony (inbound) | £47 |
| Make.com | £23 |
| **Total** | **£174.08/month** |

**Cost per call**: £0.09

---

## 📈 Cost Optimization Strategies

### Current Optimizations ✅

1. **Using GPT-4o Mini** - Most cost-effective OpenAI model
2. **Efficient greetings** - Concise initial messages
3. **Voice Activity Detection** - Optimized silence detection
4. **Function-based transfers** - Quick handoff to humans
5. **8kHz audio** - Efficient codec (g711_ulaw)

### Potential Improvements 💡

1. **Shorter greetings** - Reduce opening audio tokens
2. **Faster transfers** - Move complex issues to humans quicker
3. **Response optimization** - Minimize back-and-forth exchanges
4. **Call batching** - Group similar inquiries for efficiency
5. **Timeout optimization** - Auto-end abandoned calls faster

---

## 🔄 Cost Comparison with Alternatives

| Solution | Cost per Minute (GBP) | Monthly (500 calls, 4min avg) |
|----------|----------------------|-------------------------------|
| **AI Assistant (GPT-4o Mini)** | £0.0043 | **£85.86** |
| Full GPT-4o Realtime | £0.016 - £0.032 | £320 - £640 |
| Human agent (outsourced) | £0.40 - £1.20 | £800 - £2,400 |
| Full-time receptionist | N/A | £2,370 - £3,160 |
| Traditional IVR | £0.0008 - £0.0024 | £16 - £48* |

*IVR is cheaper but provides poor user experience and no AI intelligence

---

## 💼 Break-Even Analysis

### Replacing Human Receptionist

**Human receptionist cost**: £2,370 - £3,160/month (full-time at £14-18/hour)

**AI Assistant cost** (handling same volume):
- 2,000 calls/month: ~£174/month
- **Savings**: ~£2,196 - £2,986/month
- **ROI**: ~92-95% cost reduction
- **Payback period**: Immediate (no upfront investment)

### Break-Even Point

If handling calls that would otherwise cost:
- **Traditional call center**: Break-even at ~200 calls/month
- **Part-time receptionist**: Break-even at ~150 calls/month
- **Full-time receptionist**: Break-even at ~50 calls/month

---

## 📊 Detailed Cost Breakdown by Duration

| Duration | Audio Input | Audio Output | Functions | **Total Cost (£)** |
|----------|-------------|--------------|-----------|-------------------|
| 30 sec | £0.0004 | £0.0014 | £0.0001 | **£0.0019** |
| 1 min | £0.0007 | £0.0028 | £0.0001 | **£0.0036** |
| 2 min | £0.0014 | £0.0057 | £0.0001 | **£0.0072** |
| 3 min | £0.0021 | £0.0085 | £0.0001 | **£0.0107** |
| 4 min | £0.0028 | £0.0114 | £0.0001 | **£0.0143** |
| 5 min | £0.0036 | £0.0143 | £0.0002 | **£0.0181** |
| 10 min | £0.0071 | £0.0285 | £0.0004 | **£0.0360** |

---

## 🎯 Cost Projections for Deepcut Garage

### Estimated Call Volume: 200-500 calls/month
**Average call duration**: 3-4 minutes

| Metric | Conservative | Realistic | High Volume |
|--------|--------------|-----------|-------------|
| **Calls/month** | 200 | 350 | 500 |
| **Avg duration** | 3 min | 3.5 min | 4 min |
| **OpenAI costs** | £4.28 | £8.49 | £10.86 |
| **Infrastructure** | £30 | £35 | £40 |
| **Telephony** | £4.80 | £8.40 | £12 |
| **Make.com** | £0 | £23 | £23 |
| **Total/month** | **£39.08** | **£74.89** | **£85.86** |
| **Per call** | **£0.20** | **£0.21** | **£0.17** |

### Annual Projection
- **Conservative**: £469/year
- **Realistic**: £899/year
- **High Volume**: £1,030/year

**Compare to human receptionist**: £28,440 - £37,920/year

---

## 🔍 Hidden/Variable Costs to Consider

### Potential Additional Costs

1. **API rate limits** - May need OpenAI paid tier for high volume
2. **Call spikes** - Seasonal or promotional surges
3. **Development time** - Maintenance and updates
4. **Monitoring/logging** - Storage for call analytics
5. **Failed calls** - Retry attempts still incur costs
6. **Webhook executions** - Make.com scenario runs

### Cost Risk Factors

- **Unusually long calls** - Extended conversations increase costs
- **API price changes** - OpenAI may adjust pricing
- **Exchange rate fluctuations** - USD/GBP conversion varies
- **Bandwidth overages** - High-quality audio transmission
- **Storage costs** - Call recording if implemented

---

## 📱 Cost Monitoring Dashboard

### Accessing Cost Analytics

**Dashboard URL**: http://194.164.23.100:3000/dashboard

**Features**:
- Real-time cost tracking per call
- Period filters (hour, day, week, month, all-time)
- Cost breakdown (input, output, functions)
- Projections (daily, weekly, monthly)
- Individual call costs with timestamps
- Budget monitoring and alerts

### API Endpoints

- **GET** `/api/costs?period={hour|day|week|month|all}` - Cost analytics
- **POST** `/api/costs/reset` - Reset cost tracking (testing only)

---

## 💡 Cost-Saving Recommendations

### Immediate Actions (No Code Changes)

1. **Monitor peak times** - Identify and staff accordingly
2. **Set call duration targets** - Train AI for conciseness
3. **Quick transfers** - Move complex issues to humans faster
4. **Review analytics** - Weekly cost reviews in dashboard

### Medium-Term Improvements (Requires Development)

1. **Caching common responses** - Reduce repeated queries
2. **Conversation templates** - Pre-defined flows for common scenarios
3. **Sentiment analysis** - Auto-transfer frustrated customers
4. **Call summary logging** - Track conversation patterns
5. **A/B testing greetings** - Find most efficient opening

### Long-Term Optimization (Strategic)

1. **Multi-tier pricing** - Different AI models for different call types
2. **Hybrid approach** - AI for simple, humans for complex
3. **Off-peak incentives** - Encourage callback during low-cost times
4. **Self-service options** - SMS/web for simple queries
5. **Volume discounts** - Negotiate with OpenAI at scale

---

## 📋 Cost Summary Cheat Sheet

### Quick Reference

| Metric | Value |
|--------|-------|
| **Cost per minute** | £0.0043 |
| **Cost per second** | £0.000072 |
| **Typical 3-min call** | £0.0107 |
| **Average call** | £0.015 - £0.020 |
| **Monthly (500 calls)** | £85.86 |
| **Cost vs human** | 95% cheaper |

### When to Use AI vs Human

| Scenario | Recommendation | Reason |
|----------|----------------|--------|
| Simple inquiry | **AI** | Cost-effective (£0.01/call) |
| Appointment booking | **AI** | Automated & accurate |
| Pricing questions | **AI** | Instant responses |
| Complex technical | **Transfer to human** | Better expertise |
| Upset customer | **Transfer to human** | Empathy required |
| After 3+ transfers | **Keep with human** | Avoid frustration |

---

## 🔧 Technical Configuration

### Current Setup

- **Model**: GPT-4o Mini Realtime Preview
- **Audio Format**: 8kHz g711_ulaw
- **Sampling Rate**: 24kHz (WebSocket), 8kHz (phone)
- **Voice Activity Detection**: Server VAD enabled
- **Turn Detection**: Optimized for natural conversation
- **Function Calling**: Enabled (6 functions available)

### Cost-Related Settings

```javascript
// Cost constants in index.js (line 313)
const USD_TO_GBP = 0.79; // Update for current exchange rate
const COSTS = {
    AUDIO_INPUT_PER_TOKEN: (0.60 / 1_000_000) * USD_TO_GBP,
    AUDIO_OUTPUT_PER_TOKEN: (2.40 / 1_000_000) * USD_TO_GBP,
    TEXT_PER_TOKEN: (0.60 / 1_000_000) * USD_TO_GBP,
    TOKENS_PER_SECOND_INPUT: 25,
    TOKENS_PER_SECOND_OUTPUT: 25,
    FUNCTION_CALL_TOKENS: 200,
    CURRENCY: 'GBP',
    CURRENCY_SYMBOL: '£'
};
```

---

## 📞 Contact & Support

For questions about cost optimization or billing:

1. **Review dashboard**: http://194.164.23.100:3000/dashboard (Costs tab)
2. **Check this document**: `/opt/freepbx-voice-assistant/COST_ANALYSIS.md`
3. **OpenAI pricing updates**: https://openai.com/pricing
4. **Update exchange rate**: Edit `USD_TO_GBP` constant in `index.js`

---

## 📅 Document Version Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-06 | Initial cost analysis created |
| | | Currency converted to GBP (£) |
| | | Dashboard integration complete |

---

**Last Updated**: November 6, 2025
**Next Review**: Monthly or when OpenAI pricing changes
**Document Location**: `/opt/freepbx-voice-assistant/COST_ANALYSIS.md`
