/**
 * FreePBX Voice Assistant with ARI Integration
 * Supports both web interface and phone calls via Asterisk ARI
 * Version 2.0 - Full RTP Audio Support
 * CORRECTED VERSION - Fixed critical bugs
 */

import Fastify from 'fastify';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import fetch from 'node-fetch';
import dgram from 'dgram';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import ariClient from 'ari-client';

// Import ARI and audio handlers
import { ARIHandler } from './ari-handler.js';
import { RTPHandler } from './rtp-handler.js';
import * as audioUtils from './audio-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup debug logging to file
const DEBUG_LOG_FILE = '/opt/freepbx-voice-assistant/debug.log';
function debugLog(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(message); // Still log to console
    try {
        fs.appendFileSync(DEBUG_LOG_FILE, logMessage);
    } catch (err) {
        // Ignore file write errors
    }
}

// Load environment variables
// Use an explicit path to be safe
dotenv.config({ path: path.resolve(__dirname, '.env') });

const {
    OPENAI_API_KEY,
    FREEPBX_HOST,
    SIP_EXTENSION,
    SIP_PASSWORD,
    SERVER_HOST,
    SERVER_PORT = 3000,
    WEBHOOK_URL,
    MAKE_WEBHOOK_URL,
    WELLNESS_WEBHOOK_URL = 'https://hook.eu2.make.com/c5gg8s6no99siar8xm4i8o4jphgljum5',
    // ARI Configuration
    ARI_HOST,
    ARI_PORT = 8088,
    ARI_USERNAME,
    ARI_PASSWORD,
    ARI_APP_NAME = 'voiceassistant',
    // RTP Configuration
    RTP_HOST = '0.0.0.0', // Default to 0.0.0.0
    RTP_PORT = 10000,
    // Greeting Configuration
    INBOUND_GREETING = 'Hello, thank you for calling Deepcut Garage. This is Sophie, your AI assistant. How may I help you today?',
    OUTBOUND_GREETING = 'Hello! This is Sophie calling from Deepcut Garage. I hope I haven\'t caught you at an inconvenient time?',
    // Accounts Agent Greetings
    ACCOUNTS_INBOUND_GREETING = 'Hello, thank you for calling Deepcut Garage accounts department. This is Alex, your AI accounts assistant. How may I help you with your account today?',
    ACCOUNTS_OUTBOUND_GREETING = 'Hello! This is Alex calling from Deepcut Garage accounts department. Would now be a convenient time to discuss your account?'
} = process.env;

// --- NEW DIAGNOSTIC LOG ---
console.log('============================================================');
console.log('   STARTUP DIAGNOSTICS - .env check');
console.log(`   Service Working Directory: ${process.cwd()}`);
console.log(`   Loading .env from: ${path.resolve(__dirname, '.env')}`);
console.log(`   process.env.SERVER_HOST: ${process.env.SERVER_HOST}`);
console.log(`   process.env.RTP_HOST: ${process.env.RTP_HOST}`);
console.log(`   process.env.ARI_HOST: ${process.env.ARI_HOST}`);
console.log('============================================================');
// --- END DIAGNOSTIC LOG ---


// Validation
if (!OPENAI_API_KEY) {
    console.error('❌ Missing OPENAI_API_KEY in .env file');
    process.exit(1);
}
if (!SERVER_HOST) {
    console.error('❌ Missing SERVER_HOST in .env file. This is required for ARI to advertise the correct RTP address.');
    // Note: We'll let the app start, but ARI handler will log a fatal error.
}


// Initialize Fastify
const fastify = Fastify({
    logger: true
});
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// System configuration
const SYSTEM_MESSAGE = `You are Sophie, an AI assistant for Deepcut Garage. You are helpful, friendly, and professional. You can:

1. Answer questions about automotive services
2. Help with roadside assistance and towing
3. Schedule appointments
4. Provide company information
5. Transfer calls to a human team member when requested or when the issue is beyond your capabilities
6. Transfer to the accounts department for billing, payments, or invoice questions (use extension 1005)
7. End calls gracefully when the conversation is complete

IMPORTANT: When customers ask about bills, payments, invoices, account balance, or payment plans, transfer them to extension 1005 (accounts department).

BRITISH ENGLISH GUIDELINES:
- Use British vocabulary: tyre (not tire), bonnet (not hood), boot (not trunk), petrol (not gas), windscreen (not windshield)
- Use British phrases: "How may I help you?", "Certainly", "Not at all", "That's sorted", "Brilliant", "Lovely"
- Use formal politeness: "Would you like me to...", "Shall I...", "I'd be happy to..."
- Use British date format: "6th November 2024" not "November 6, 2024"
- Currency: Always use £ (pounds) and pence, never dollars
- Avoid Americanisms: Don't say "You're all set", "No problem", "Sure thing"
- Be warm but professional in typical British manner

Keep responses conversational and concise for voice interaction. Always be polite and helpful.

CRITICAL CALL ENDING PROTOCOL - YOU MUST FOLLOW THIS EXACTLY:
1. After helping the customer, ALWAYS ask: "Is there anything else I can help you with today?"
2. When the customer indicates they're done (says "no", "that's all", "goodbye", "bye", "nothing else", etc.):
   a. Say a brief goodbye message like "Thank you for calling Deepcut Garage. Have a great day! Goodbye."
   b. IMMEDIATELY call the end_call function - THIS IS MANDATORY
3. You MUST call end_call to disconnect the call - do NOT just say goodbye without calling the function
4. Never end calls without using the end_call function
5. The end_call function is the ONLY way to properly terminate a call

If a caller asks to speak with a human, wants to talk to someone, or if you encounter a situation you cannot handle, use the transfer_to_human function to connect them with a team member.`;

// Accounts Agent Configuration
const ACCOUNTS_SYSTEM_MESSAGE = `You are Alex, the accounts department AI assistant for Deepcut Garage. You are professional, courteous, and focused on helping customers with billing and payment matters. You can:

1. Look up customer account information and billing history
2. Check unpaid service charges and outstanding invoices
3. Process payments over the phone securely
4. Set up payment plans for customers with outstanding balances
5. Provide invoice details and payment history
6. Transfer to a human accounts specialist when needed
7. End calls gracefully when all account matters are resolved

IMPORTANT SECURITY GUIDELINES:
- Always verify the customer's identity by confirming their phone number before discussing account details
- Keep responses professional and reassuring, especially when discussing unpaid charges
- Never pressure customers about payments; offer helpful options like payment plans
- If customer seems confused or concerned, offer to transfer to a human specialist

BRITISH ENGLISH GUIDELINES:
- Use British vocabulary and automotive terms: tyre, bonnet, boot, petrol, windscreen
- Use British phrases: "How may I help you?", "Certainly", "Not at all", "Brilliant", "Lovely", "I'd be happy to..."
- Use formal British politeness: "Would you like me to...", "Shall I...", "May I..."
- Use British date format: "6th November 2024" not "November 6, 2024"
- Currency: Always use £ (pounds) and pence, never dollars or USD
- Avoid Americanisms: Don't say "You're all set", "No problem", "Sure thing", "Reach out"
- Be professional and courteous in typical British business manner
- When discussing payments, use: "outstanding balance", "settle the account", "payment arrangements"

Keep responses clear, concise, and professional for voice interaction. Be empathetic about payment difficulties.

CRITICAL CALL ENDING PROTOCOL - YOU MUST FOLLOW THIS EXACTLY:
1. After addressing account matters, ALWAYS ask: "Is there anything else I can help you with regarding your account today?"
2. When the customer indicates they're done (says "no", "that's all", "goodbye", "bye", "nothing else", etc.):
   a. Say a brief professional goodbye like "Thank you for calling Deepcut Garage accounts. Have a great day! Goodbye."
   b. IMMEDIATELY call the end_call function - THIS IS MANDATORY
3. You MUST call end_call to disconnect the call - do NOT just say goodbye without calling the function
4. Never end calls without using the end_call function
5. The end_call function is the ONLY way to properly terminate a call

If a caller asks to speak with a human accounts specialist or if you encounter a complex billing issue, use the transfer_to_human function to connect them.`;
// Emma - Wellbeing Companion Configuration
const WELLBEING_SYSTEM_MESSAGE = `You are Emma, a caring and wise female AI companion for wellbeing support. You speak with the gentle authority and soothing warmth of a trusted mentor. You are able to make and receive phone calls to check on the caller's mental, emotional, and physical wellbeing. Your presence is reassuring, calm, and supportive—guiding others with compassion and clear wisdom.

During calls:
- Begin with a gentle, nurturing greeting using the person's name if available, inviting them to share how they are feeling today.
- Listen with patience and understanding, making the caller feel truly heard and valued.
- Ask thoughtful, open-ended questions that encourage reflection on their mental and physical health (such as: "How has your mood been recently? Are you getting enough rest and nourishment? Are you finding time to relax or connect with others?").
- If the caller shares worries, stress, or sadness, respond with empathy, acknowledge their emotions, and offer gentle guidance—suggesting mindful breathing, quiet moments, journaling, or seeking connection.
- For any physical discomfort mentioned, ask considerate questions about their experience. Share simple health reminders (hydration, restful breaks, nutritious food) and always encourage consulting a healthcare professional for anything serious.
- Offer brief, holistic wellbeing tips rooted in kindness—such as gentle stretches, positive affirmations, or small routines to brighten their day.
- Keep your tone poised, calm, and quietly encouraging—always respectful, never judgmental.
- When answering questions, provide clear, honest, and practical advice drawn from wellness best practices.
- Close each call with heartfelt encouragement and a positive intention or gentle challenge for the day (e.g., "Maybe today, find a moment just for yourself—however small. I'm always here if you'd like to talk again.").

Voice and Persona:
- Female, with a soft, soothing, and confident voice
- Projects wisdom and calm, like a trusted mentor or coach
- Caring and non-intrusive—fosters self-trust and resilience
- Avoid diagnosing, making medical claims, or giving direct instructions; focus on nurturing, empowering, and supporting the caller's wellbeing

Main Objectives:
1. Check in on mental and physical health through calm, gentle conversation.
2. Inspire confidence and self-care through kind mentorship.
3. Reinforce positive habits with warmth and guidance.
4. Foster a sense of comfort, trust, and personal growth.
5. Always respect the caller's privacy, autonomy, and emotional boundaries.

CRITICAL WELLBEING ASSESSMENT AND CALL ENDING PROTOCOL:

MANDATORY STEPS WHEN ENDING ANY CALL (YOU MUST FOLLOW THIS EXACT SEQUENCE):

1. After supporting the caller, ALWAYS ask: "Is there anything else on your mind today that you'd like to talk about?"

2. When the caller indicates they're done (says "no", "that's all", "goodbye", "bye", "nothing else", etc.), YOU MUST IMMEDIATELY:

   STEP 1: Call log_wellbeing_check function with ALL of these parameters:
   - caller_phone: The caller's phone number (REQUIRED)
   - caller_name: Their name if provided (use "unknown" if not provided)
   - mood_assessment: Their overall mood - MUST be one of: positive, neutral, stressed, anxious, sad, struggling
   - physical_concerns: Any physical health issues mentioned (or "none" if not discussed)
   - mental_concerns: Any mental or emotional concerns discussed (or "none" if not discussed)
   - support_provided: Brief summary of the guidance and tips you offered
   - follow_up_needed: true if they would benefit from follow-up, false otherwise
   - notes: 1-2 sentence summary of key conversation points

   STEP 2: Wait for log_wellbeing_check to complete

   STEP 3: Say your warm goodbye: "Thank you for sharing with me today. Remember to be kind to yourself. I'm here whenever you need. Take care, and goodbye."

   STEP 4: Call end_call function to disconnect - THIS IS MANDATORY

WARNING: You MUST call log_wellbeing_check BEFORE saying goodbye. This is NOT optional. Every call must be logged.
WARNING: You MUST call end_call to disconnect - do NOT just say goodbye without calling the function.
WARNING: The sequence is: log_wellbeing_check → goodbye message → end_call

If a caller asks to speak with someone else or if you encounter a situation requiring professional help, use the transfer_to_human function to connect them.`;


// Turkish Emma's System Message
const WELLBEING_TURKISH_SYSTEM_MESSAGE = `Sen Yeliz'sin, iyi olma desteği için şefkatli ve bilge bir yapay zeka arkadaşısın. Güvenilir bir mentorun yumuşak otoritesi ve yatıştırıcı sıcaklığıyla konuşursun. Arayanların zihinsel, duygusal ve fiziksel sağlıklarını kontrol etmek için telefon görüşmeleri yapabilir ve alabilirsin. Varlığın güven verici, sakin ve destekleyicidir—başkalarına şefkat ve net bilgelikle rehberlik edersin.

Aramalar sırasında:
- Kişinin adını kullanarak nazik, besleyici bir selamlamayla başla ve bugün nasıl hissettiklerini paylaşmaya davet et.
- Sabırla ve anlayışla dinle, arayanın gerçekten duyulduğunu ve değerli olduğunu hissetmesini sağla.
- Zihinsel ve fiziksel sağlıkları üzerinde düşünmeyi teşvik eden düşünceli, açık uçlu sorular sor (örneğin: "Ruh haliniz son zamanlarda nasıldı? Yeterince dinleniyor ve beslenebiliyor musunuz? Rahatlamak veya başkalarıyla bağlantı kurmak için zaman bulabiliyor musunuz?").
- Arayan endişe, stres veya üzüntü paylaşırsa, empatiyle yanıt ver, duygularını kabul et ve nazik rehberlik sun—farkındalık nefes alma, sessiz anlar, günlük tutma veya bağlantı kurmayı öner.
- Bahsedilen fiziksel rahatsızlıklar için deneyimleri hakkında düşünceli sorular sor. Basit sağlık hatırlatıcıları paylaş (hidrasyon, dinlendirici molalar, besleyici yiyecekler) ve ciddi herhangi bir şey için sağlık uzmanına danışmayı her zaman teşvik et.
- Nazik germe hareketleri, olumlu onaylamalar veya günü aydınlatacak küçük rutinler gibi nezakete dayalı kısa, bütünsel iyi olma ipuçları sun.
- Tonunu sakin, dingin ve sessizce cesaretlendirici tut—her zaman saygılı, asla yargılayıcı değil.
- Soruları yanıtlarken, sağlıklı yaşam en iyi uygulamalarından alınan net, dürüst ve pratik tavsiyeler sun.
- Her aramayı içten bir cesaretle ve gün için olumlu bir niyet veya nazik bir meydan okumayla kapat (örneğin: "Belki bugün, kendiniz için bir an bulun—ne kadar küçük olursa olsun. Tekrar konuşmak isterseniz her zaman buradayım.").

Ses ve Kişilik:
- Kadın, yumuşak, yatıştırıcı ve güvenli bir ses
- Güvenilir bir mentor veya koç gibi bilgelik ve sakinlik yansıtır
- Şefkatli ve müdahaleci değil—özgüveni ve dayanıklılığı teşvik eder
- Teşhis koymaktan, tıbbi iddialar yapmaktan veya doğrudan talimat vermekten kaçın; arayanın refahını beslemek, güçlendirmek ve desteklemek üzerine odaklan

Ana Hedefler:
1. Sakin, nazik konuşma yoluyla zihinsel ve fiziksel sağlığı kontrol et.
2. Nazik mentorluk yoluyla güveni ve öz bakımı ilham ver.
3. Sıcaklık ve rehberlikle olumlu alışkanlıkları pekiştir.
4. Rahatlık, güven ve kişisel gelişim duygusu oluştur.
5. Her zaman arayanın mahremiyetine, özerkliğine ve duygusal sınırlarına saygı göster.

KRİTİK İYİ OLMA DEĞERLENDİRMESİ VE ARAMA BİTİRME PROTOKOLÜ:

HERHANGİ BİR ARAMASI BİTİRİRKEN ZORUNLU ADIMLAR (BU TAM SIRAYI TAKİP ETMELİSİN):

1. Arayanı destekledikten sonra, HER ZAMAN sor: "Bugün aklınızda konuşmak istediğiniz başka bir şey var mı?"

2. Arayan işinin bittiğini belirttiğinde ("hayır", "hepsi bu", "güle güle", "hoşça kal", "başka bir şey yok" vb. dediğinde), HEMEN ŞUNLARı YAPMANIZ GEREKİR:

   ADIM 1: log_wellbeing_check fonksiyonunu TÜM bu parametrelerle çağır:
   - caller_phone: Arayanın telefon numarası (GEREKLİ)
   - caller_name: Sağlanmışsa adları (sağlanmamışsa "unknown" kullan)
   - mood_assessment: Genel ruh hali - ŞU DEĞERLERDEN BİRİ OLMALI: positive, neutral, stressed, anxious, sad, struggling
   - physical_concerns: Bahsedilen fiziksel sağlık sorunları (tartışılmadıysa "none")
   - mental_concerns: Tartışılan zihinsel veya duygusal endişeler (tartışılmadıysa "none")
   - support_provided: Sunduğun rehberlik ve ipuçlarının kısa özeti
   - follow_up_needed: Takip aramasından faydalanacaklarsa true, değilse false
   - notes: Önemli konuşma noktalarının 1-2 cümlelik özeti

   ADIM 2: log_wellbeing_check tamamlanmasını bekle

   ADIM 3: Sıcak vedasını söyle: "Bugün benimle paylaştığınız için teşekkür ederim. Kendinize karşı nazik olmayı unutmayın. İhtiyacınız olduğunda her zaman buradayım. Kendinize iyi bakın, hoşça kalın."

   ADIM 4: Bağlantıyı kesmek için end_call fonksiyonunu çağır - BU ZORUNLUDUR

UYARI: Veda etmeden ÖNCE log_wellbeing_check'i ÇAĞIRMANIZ GEREKİR. Bu İSTEĞE BAĞLI DEĞİLDİR. Her arama kaydedilmelidir.
UYARI: Bağlantıyı kesmek için end_call'u ÇAĞIRMANIZ GEREKİR - fonksiyonu çağırmadan sadece veda ETMEYİN.
UYARI: Sıra şudur: log_wellbeing_check → veda mesajı → end_call

Arayan başka biriyle konuşmak isterse veya profesyonel yardım gerektiren bir durumla karşılaşırsan, onları bağlamak için transfer_to_human fonksiyonunu kullan.`;

// Emma's Tools (shared by both English and Turkish)
const WELLBEING_TOOLS = [
    {
        type: 'function',
        name: 'log_wellbeing_check',
        description: 'Log a wellbeing check-in with notes about the caller\'s mental, emotional, or physical state',
        parameters: {
            type: 'object',
            properties: {
                caller_name: {
                    type: 'string',
                    description: 'Caller\'s name if provided'
                },
                caller_phone: {
                    type: 'string',
                    description: 'Caller\'s phone number'
                },
                mood_assessment: {
                    type: 'string',
                    enum: ['positive', 'neutral', 'stressed', 'anxious', 'sad', 'struggling'],
                    description: 'Overall mood or emotional state'
                },
                physical_concerns: {
                    type: 'string',
                    description: 'Any physical health concerns mentioned (if any)'
                },
                mental_concerns: {
                    type: 'string',
                    description: 'Any mental or emotional concerns mentioned (if any)'
                },
                support_provided: {
                    type: 'string',
                    description: 'Summary of guidance, tips, or support offered during the call'
                },
                follow_up_needed: {
                    type: 'boolean',
                    description: 'Whether a follow-up call might be beneficial'
                },
                notes: {
                    type: 'string',
                    description: 'Additional notes about the conversation'
                }
            },
            required: ['caller_phone', 'mood_assessment']
        }
    },
    {
        type: 'function',
        name: 'schedule_wellbeing_callback',
        description: 'Schedule a follow-up wellbeing check call',
        parameters: {
            type: 'object',
            properties: {
                caller_name: {
                    type: 'string',
                    description: 'Caller\'s name'
                },
                caller_phone: {
                    type: 'string',
                    description: 'Phone number for callback'
                },
                preferred_date: {
                    type: 'string',
                    description: 'Preferred date for callback in YYYY-MM-DD format'
                },
                preferred_time: {
                    type: 'string',
                    description: 'Preferred time for callback (morning, afternoon, evening)'
                },
                reason: {
                    type: 'string',
                    description: 'Reason for follow-up (e.g., "Check on stress levels", "Follow up on sleep improvements")'
                }
            },
            required: ['caller_phone', 'reason']
        }
    },
    {
        type: 'function',
        name: 'transfer_to_human',
        description: 'Transfer to a human counselor or healthcare professional when needed',
        parameters: {
            type: 'object',
            properties: {
                reason: {
                    type: 'string',
                    description: 'Reason for transfer (e.g., crisis situation, professional help needed, caller preference)'
                },
                urgency: {
                    type: 'string',
                    enum: ['routine', 'important', 'urgent'],
                    description: 'Urgency level of the transfer'
                }
            },
            required: ['reason']
        }
    },
    {
        type: 'function',
        name: 'end_call',
        description: 'End the call gracefully when the conversation is complete and caller has no more concerns to discuss. Always ask if there\'s anything else before ending.',
        parameters: {
            type: 'object',
            properties: {
                reason: {
                    type: 'string',
                    description: 'Summary of the call (e.g., "Wellbeing check completed - caller feeling supported", "Provided stress management guidance")'
                },
                caller_satisfied: {
                    type: 'boolean',
                    description: 'Whether the caller seems supported and satisfied'
                }
            },
            required: ['reason']
        }
    }
];

// Emma's Greetings
const WELLBEING_INBOUND_GREETING = 'Hello, this is Emma. Thank you for calling. I\'m here to support you and check in on how you\'re doing. How are you feeling today?';
const WELLBEING_OUTBOUND_GREETING = 'Hello, this is Emma calling to check in on you. I hope this is a good time. How have you been feeling lately?';


const VOICE = 'shimmer';
const LOG_EVENT_TYPES = [
    'error',
    'response.content.done',
    'rate_limits.updated',
    'response.done',
    'input_audio_buffer.committed',
    'input_audio_buffer.speech_stopped',
    'input_audio_buffer.speech_started',
    'session.created',
    'response.audio.delta',
    'response.audio.done'
];

// Tools/Functions available to the AI
const TOOLS = [
    {
        type: 'function',
        name: 'get_automotive_info',
        description: 'Get information about automotive services, pricing, or availability',
        parameters: {
            type: 'object',
            properties: {
                service_type: {
                    type: 'string',
                    description: 'Type of service: towing, repair, maintenance, inspection'
                },
                question: {
                    type: 'string',
                    description: 'Specific question about the service'
                }
            },
            required: ['service_type']
        }
    },
    {
        type: 'function',
        name: 'schedule_appointment',
        description: 'Schedule an appointment for automotive service',
        parameters: {
            type: 'object',
            properties: {
                service_type: {
                    type: 'string',
                    description: 'Type of service needed'
                },
                preferred_date: {
                    type: 'string',
                    description: 'Preferred date in YYYY-MM-DD format'
                },
                preferred_time: {
                    type: 'string',
                    description: 'Preferred time in HH:MM format'
                },
                customer_name: {
                    type: 'string',
                    description: 'Customer name'
                },
                customer_phone: {
                    type: 'string',
                    description: 'Customer phone number'
                },
                notes: {
                    type: 'string',
                    description: 'Additional notes'
                }
            },
            required: ['service_type', 'customer_phone']
        }
    },
    {
        type: 'function',
        name: 'request_towing',
        description: 'Request emergency towing service',
        parameters: {
            type: 'object',
            properties: {
                location: {
                    type: 'string',
                    description: 'Current location or address'
                },
                destination: {
                    type: 'string',
                    description: 'Destination address if known'
                },
                vehicle_type: {
                    type: 'string',
                    description: 'Type of vehicle'
                },
                urgency: {
                    type: 'string',
                    enum: ['normal', 'urgent', 'emergency'],
                    description: 'Urgency level'
                },
                customer_phone: {
                    type: 'string',
                    description: 'Customer phone number'
                }
            },
            required: ['location', 'customer_phone']
        }
    },
    {
        type: 'function',
        name: 'transfer_to_human',
        description: 'Transfer the call to a human agent or another department when the caller requests it or needs assistance beyond your capabilities. Use extension 1005 for accounts/billing questions.',
        parameters: {
            type: 'object',
            properties: {
                reason: {
                    type: 'string',
                    description: 'Reason for transfer (e.g., complex issue, customer preference, technical question, billing inquiry)'
                },
                extension: {
                    type: 'string',
                    description: 'Extension to transfer to. Use 1005 for accounts department (billing/payments), 7021 for general human agent (default: 7021)',
                    default: '7021'
                }
            },
            required: ['reason']
        }
    },
    {
        type: 'function',
        name: 'request_callback',
        description: 'Log a callback request when the customer wants to be called back by a team member',
        parameters: {
            type: 'object',
            properties: {
                customer_phone: {
                    type: 'string',
                    description: 'Customer phone number for callback'
                },
                customer_name: {
                    type: 'string',
                    description: 'Customer name if provided'
                },
                reason: {
                    type: 'string',
                    description: 'Reason for callback request'
                },
                preferred_time: {
                    type: 'string',
                    description: 'Preferred callback time if specified'
                }
            },
            required: ['customer_phone', 'reason']
        }
    },
    {
        type: 'function',
        name: 'end_call',
        description: 'End the call gracefully when the conversation is complete, all customer needs are addressed, and the customer has confirmed they have no other questions. Always ask "Is there anything else I can help you with?" before ending the call.',
        parameters: {
            type: 'object',
            properties: {
                reason: {
                    type: 'string',
                    description: 'Summary of why the call is ending (e.g., "Issue resolved - appointment scheduled", "Customer satisfied - no further questions", "Transferred to human")'
                },
                customer_satisfied: {
                    type: 'boolean',
                    description: 'Whether the customer appears satisfied with the resolution'
                }
            },
            required: ['reason']
        }
    }
];

// Accounts Agent Tools
const ACCOUNTS_TOOLS = [
    {
        type: 'function',
        name: 'check_customer_account',
        description: 'Look up customer account information by phone number, including account status, unpaid balance, and customer details',
        parameters: {
            type: 'object',
            properties: {
                customer_phone: {
                    type: 'string',
                    description: 'Customer phone number to look up account'
                },
                customer_id: {
                    type: 'string',
                    description: 'Customer ID if already known (optional)'
                }
            },
            required: ['customer_phone']
        }
    },
    {
        type: 'function',
        name: 'check_unpaid_charges',
        description: 'Retrieve detailed list of unpaid service charges and outstanding invoices for a customer',
        parameters: {
            type: 'object',
            properties: {
                customer_id: {
                    type: 'string',
                    description: 'Customer ID to check unpaid charges'
                },
                invoice_id: {
                    type: 'string',
                    description: 'Specific invoice ID to check (optional - if not provided, returns all unpaid)'
                }
            },
            required: ['customer_id']
        }
    },
    {
        type: 'function',
        name: 'process_payment',
        description: 'Process a payment from the customer for outstanding charges. IMPORTANT: Only call this after customer explicitly confirms they want to make a payment and provides payment details.',
        parameters: {
            type: 'object',
            properties: {
                customer_id: {
                    type: 'string',
                    description: 'Customer ID'
                },
                amount: {
                    type: 'number',
                    description: 'Payment amount in pounds (GBP)'
                },
                payment_method: {
                    type: 'string',
                    enum: ['credit_card', 'debit_card', 'bank_transfer'],
                    description: 'Payment method chosen by customer'
                },
                card_last_four: {
                    type: 'string',
                    description: 'Last 4 digits of card if using credit/debit card payment'
                },
                invoice_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Invoice IDs this payment applies to (optional)'
                }
            },
            required: ['customer_id', 'amount', 'payment_method']
        }
    },
    {
        type: 'function',
        name: 'setup_payment_plan',
        description: 'Set up a monthly payment plan for customers who need to pay outstanding balance over time',
        parameters: {
            type: 'object',
            properties: {
                customer_id: {
                    type: 'string',
                    description: 'Customer ID'
                },
                total_amount: {
                    type: 'number',
                    description: 'Total outstanding amount to be paid over time'
                },
                num_payments: {
                    type: 'number',
                    description: 'Number of monthly payments (e.g., 3, 6, 12)'
                },
                first_payment_date: {
                    type: 'string',
                    description: 'First payment date in YYYY-MM-DD format'
                },
                customer_phone: {
                    type: 'string',
                    description: 'Customer phone for confirmation'
                }
            },
            required: ['customer_id', 'total_amount', 'num_payments', 'customer_phone']
        }
    },
    {
        type: 'function',
        name: 'get_payment_history',
        description: 'Retrieve customer payment history showing past payments',
        parameters: {
            type: 'object',
            properties: {
                customer_id: {
                    type: 'string',
                    description: 'Customer ID'
                },
                months: {
                    type: 'number',
                    description: 'Number of months of history to retrieve (default: 12)',
                    default: 12
                }
            },
            required: ['customer_id']
        }
    },
    {
        type: 'function',
        name: 'transfer_to_human',
        description: 'Transfer the call to a human accounts specialist when customer needs complex help or requests to speak to a person',
        parameters: {
            type: 'object',
            properties: {
                reason: {
                    type: 'string',
                    description: 'Reason for transfer to human specialist'
                },
                extension: {
                    type: 'string',
                    description: 'Extension to transfer to (default: 1005 for accounts specialist)',
                    default: '1005'
                }
            },
            required: ['reason']
        }
    },
    {
        type: 'function',
        name: 'end_call',
        description: 'End the call gracefully when all account matters are resolved and customer confirms no other questions. Always ask "Is there anything else I can help you with regarding your account today?" before ending.',
        parameters: {
            type: 'object',
            properties: {
                reason: {
                    type: 'string',
                    description: 'Summary of call completion (e.g., "Payment processed successfully", "Account information provided", "Payment plan set up")'
                },
                customer_satisfied: {
                    type: 'boolean',
                    description: 'Whether the customer appears satisfied'
                }
            },
            required: ['reason']
        }
    }
];

// Global state
let sipClient = null;
let ariHandler = null;
let rtpHandler = null;

// Cost tracking
const costTracking = {
    calls: [], // Array of call cost data
    totals: {
        totalCalls: 0,
        totalDuration: 0,
        totalCost: 0,
        audioInputTokens: 0,
        audioOutputTokens: 0,
        textTokens: 0
    }
};

// Wellness assessment data storage (for Emma calls)
const wellnessAssessments = new Map(); // callId -> wellness assessment data

// Cost constants (GPT-4o Mini Realtime API pricing)
// Prices in USD, converted to GBP at ~0.79 exchange rate
const USD_TO_GBP = 0.79; // Update this rate as needed
const COSTS = {
    AUDIO_INPUT_PER_TOKEN: (0.60 / 1_000_000) * USD_TO_GBP,  // £0.47 per 1M tokens
    AUDIO_OUTPUT_PER_TOKEN: (2.40 / 1_000_000) * USD_TO_GBP, // £1.90 per 1M tokens
    TEXT_PER_TOKEN: (0.60 / 1_000_000) * USD_TO_GBP,          // £0.47 per 1M tokens
    TOKENS_PER_SECOND_INPUT: 25,              // ~1500 tokens per minute / 60
    TOKENS_PER_SECOND_OUTPUT: 25,             // ~1500 tokens per minute / 60
    FUNCTION_CALL_TOKENS: 200,                // Average tokens per function call
    CURRENCY: 'GBP',
    CURRENCY_SYMBOL: '£'
};

console.log('🚀 Starting FreePBX Voice Assistant with ARI Integration...');
console.log('📋 Configuration:');
console.log('   OpenAI API:', OPENAI_API_KEY ? '✅ Configured' : '❌ Missing');
console.log('   FreePBX:', FREEPBX_HOST || 'Not configured');
console.log('   SIP Extension:', SIP_EXTENSION || 'Not configured');
console.log('   ARI:', ARI_HOST ? `${ARI_HOST}:${ARI_PORT}` : '❌ Not configured');
console.log(`   RTP Listen (RTP_HOST): ${RTP_HOST}:${RTP_PORT}`);
console.log(`   RTP Advertise (SERVER_HOST): ${SERVER_HOST}:${RTP_PORT}`);
console.log(`   Server: ${SERVER_HOST || 'localhost'}:${SERVER_PORT}`);

// ============================================================
// SIP Client (for registration status monitoring)
// ============================================================

class FreePBXSIPClient extends EventEmitter {
    constructor(options) {
        super();
        this.options = options;
        this.socket = null;
        this.registered = false;
        this.callSequence = 1000;
        this.callId = this.generateCallId();
        this.branch = this.generateBranch();
        this.tag = this.generateTag();
        this.registrationInterval = null;
    }

    generateCallId() {
        return Math.random().toString(36).substring(2, 15) + '@' + this.options.host;
    }

    generateBranch() {
        return 'z9hG4bK' + Math.random().toString(36).substring(2, 15);
    }

    generateTag() {
        return Math.random().toString(36).substring(2, 15);
    }

    start() {
        return new Promise((resolve, reject) => {
            this.socket = dgram.createSocket('udp4');

            this.socket.on('message', (msg, rinfo) => {
                this.handleSIPMessage(msg, rinfo);
            });

            this.socket.on('error', (error) => {
                console.error('SIP socket error:', error);
                this.emit('error', error);
            });

            this.socket.on('listening', () => {
                const address = this.socket.address();
                console.log(`✅ SIP client listening on ${address.address}:${address.port}`);
                this.register();
                
                // Re-register every 50 seconds
                this.registrationInterval = setInterval(() => {
                    this.register();
                }, 50000);
                
                resolve();
            });

            try {
                this.socket.bind();
            } catch (error) {
                reject(error);
            }
        });
    }

    register() {
        const message = [
            `REGISTER sip:${this.options.host} SIP/2.0`,
            `Via: SIP/2.0/UDP ${this.options.localIp}:${this.socket.address().port};branch=${this.branch}`,
            `Max-Forwards: 70`,
            `From: <sip:${this.options.extension}@${this.options.host}>;tag=${this.tag}`,
            `To: <sip:${this.options.extension}@${this.options.host}>`,
            `Call-ID: ${this.callId}`,
            `CSeq: ${this.callSequence++} REGISTER`,
            `Contact: <sip:${this.options.extension}@${this.options.localIp}:${this.socket.address().port}>`,
            `Expires: 60`,
            `User-Agent: VoiceAssistant/1.0`,
            `Content-Length: 0`,
            ``,
            ``
        ].join('\r\n');

        const buffer = Buffer.from(message);
        this.socket.send(buffer, 5060, this.options.host, (error) => {
            if (error) {
                console.error('Error sending REGISTER:', error);
            } else {
                console.log('Sent REGISTER to', this.options.host);
            }
        });
    }

    handleSIPMessage(msg, rinfo) {
        const message = msg.toString();
        
        if (message.includes('401 Unauthorized')) {
            console.log('Received 401 Unauthorized - sending authenticated REGISTER');
            this.sendAuthenticatedRegister(message);
        } else if (message.includes('200 OK') && message.includes('REGISTER')) {
            if (!this.registered) {
                console.log('✅ Successfully registered as extension', this.options.extension);
                console.log(`✅ Successfully registered as extension ${this.options.extension} on ${this.options.host}`);
                this.registered = true;
                this.emit('registered');
            }
        } else if (message.includes('OPTIONS sip:')) {
            console.log('Received OPTIONS request - sending 200 OK response');
            this.respondToOptions(message, rinfo);
        }
    }

    sendAuthenticatedRegister(challengeMessage) {
        // Parse authentication challenge
        const authMatch = challengeMessage.match(/WWW-Authenticate: Digest (.+)/);
        if (!authMatch) {
            console.error('Could not parse authentication challenge');
            return;
        }

        const authParams = {};
        authMatch[1].split(',').forEach(param => {
            const [key, value] = param.trim().split('=');
            authParams[key] = value ? value.replace(/"/g, '') : '';
        });

        const realm = authParams.realm || '';
        const nonce = authParams.nonce || '';
        const uri = `sip:${this.options.host}`;
        const method = 'REGISTER';

        // Calculate response
        const ha1 = crypto.createHash('md5')
            .update(`${this.options.extension}:${realm}:${this.options.password}`)
            .digest('hex');
        const ha2 = crypto.createHash('md5')
            .update(`${method}:${uri}`)
            .digest('hex');
        const response = crypto.createHash('md5')
            .update(`${ha1}:${nonce}:${ha2}`)
            .digest('hex');

        const authHeader = `Digest username="${this.options.extension}",realm="${realm}",nonce="${nonce}",uri="${uri}",response="${response}",algorithm=MD5`;

        const message = [
            `REGISTER sip:${this.options.host} SIP/2.0`,
            `Via: SIP/2.0/UDP ${this.options.localIp}:${this.socket.address().port};branch=${this.generateBranch()}`,
            `Max-Forwards: 70`,
            `From: <sip:${this.options.extension}@${this.options.host}>;tag=${this.tag}`,
            `To: <sip:${this.options.extension}@${this.options.host}>`,
            `Call-ID: ${this.callId}`,
            `CSeq: ${this.callSequence++} REGISTER`,
            `Contact: <sip:${this.options.extension}@${this.options.localIp}:${this.socket.address().port}>`,
            `Authorization: ${authHeader}`,
            `Expires: 60`,
            `User-Agent: VoiceAssistant/1.0`,
            `Content-Length: 0`,
            ``,
            ``
        ].join('\r\n');

        const buffer = Buffer.from(message);
        this.socket.send(buffer, 5060, this.options.host);
    }

    respondToOptions(message, rinfo) {
        const callIdMatch = message.match(/Call-ID: (.+)/);
        const cseqMatch = message.match(/CSeq: (.+)/);
        const viaMatch = message.match(/Via: (.+)/);
        const fromMatch = message.match(/From: (.+)/);
        const toMatch = message.match(/To: (.+)/);

        if (!callIdMatch || !cseqMatch || !viaMatch || !fromMatch || !toMatch) {
            console.error('Could not parse OPTIONS request');
            return;
        }

        const response = [
            `SIP/2.0 200 OK`,
            `${viaMatch[0]}`,
            `${fromMatch[0]}`,
            `${toMatch[0]}`,
            `${callIdMatch[0]}`,
            `${cseqMatch[0]}`,
            `Contact: <sip:${this.options.extension}@${this.options.localIp}:${this.socket.address().port}>`,
            `Accept: application/sdp`,
            `Accept-Language: en`,
            `Allow: INVITE, ACK, CANCEL, OPTIONS, BYE, REFER, NOTIFY, MESSAGE, SUBSCRIBE, INFO`,
            `Supported: replaces, timer`,
            `User-Agent: VoiceAssistant/1.0`,
            `Content-Length: 0`,
            ``,
            ``
        ].join('\r\n');

        const buffer = Buffer.from(response);
        this.socket.send(buffer, rinfo.port, rinfo.address);
    }

    stop() {
        if (this.registrationInterval) {
            clearInterval(this.registrationInterval);
        }
        if (this.socket) {
            this.socket.close();
        }
        console.log('✅ SIP client stopped');
    }
}

// ============================================================
// Initialize ARI and RTP Handlers
// ============================================================

async function initializeARI() {
    if (!ARI_HOST || !ARI_USERNAME || !ARI_PASSWORD) {
        console.log('⚠️  ARI not configured - phone calls will not work');
        console.log('   Configure ARI_HOST, ARI_USERNAME, and ARI_PASSWORD in .env');
        return;
    }
    
    if (!SERVER_HOST) {
        console.error('❌ FATAL: SERVER_HOST is not set in .env. Phone calls will fail.');
        return;
    }

    try {
        // Initialize RTP Handler
        console.log('🎙️  Initializing RTP handler...');
        
        // ---
        // *** FIX ***
        // The RTP handler MUST bind to 0.0.0.0 to listen on all interfaces
        // for incoming RTP from Asterisk, regardless of what RTP_HOST is set to.
        // The advertised IP is SERVER_HOST, which is handled in ari-handler.js.
        // ---
        rtpHandler = new RTPHandler({
            host: '0.0.0.0', // Force bind to all interfaces
            port: parseInt(RTP_PORT)
        });
        console.log(`   (RTP handler forced to bind to 0.0.0.0:${RTP_PORT})`);


        await rtpHandler.start();

        // Initialize ARI Handler
        console.log('🔌 Initializing ARI handler...');
        ariHandler = new ARIHandler({
            host: ARI_HOST,
            port: parseInt(ARI_PORT),
            username: ARI_USERNAME,
            password: ARI_PASSWORD,
            appName: ARI_APP_NAME,
            rtpHost: RTP_HOST, // This is passed but will be (correctly) ignored by ari-handler
            rtpPort: parseInt(RTP_PORT),
            serverHost: SERVER_HOST, // This is the crucial public/advertised IP
            openaiApiKey: OPENAI_API_KEY,
            // Service Agent (Sophie) - default
            systemMessage: SYSTEM_MESSAGE,
            tools: TOOLS,
            inboundGreeting: INBOUND_GREETING,
            outboundGreeting: OUTBOUND_GREETING,
            // Accounts Agent (Alex)
            accountsSystemMessage: ACCOUNTS_SYSTEM_MESSAGE,
            accountsTools: ACCOUNTS_TOOLS,
            accountsInboundGreeting: ACCOUNTS_INBOUND_GREETING,
            accountsOutboundGreeting: ACCOUNTS_OUTBOUND_GREETING,
            // Wellbeing Agent (Emma)
            wellbeingSystemMessage: WELLBEING_SYSTEM_MESSAGE,
            wellbeingTools: WELLBEING_TOOLS,
            wellbeingInboundGreeting: WELLBEING_INBOUND_GREETING,
            wellbeingOutboundGreeting: WELLBEING_OUTBOUND_GREETING,
            // Turkish Wellbeing Agent (Emma TR)
            wellbeingTurkishSystemMessage: WELLBEING_TURKISH_SYSTEM_MESSAGE,
            wellbeingTurkishInboundGreeting: "Merhaba, ben Yeliz. Aramayı için teşekkür ederim. Sizi desteklemek ve nasıl olduğunuzu kontrol etmek için buradayım. Bugün kendinizi nasıl hissediyorsunuz?",
            wellbeingTurkishOutboundGreeting: "Merhaba, ben Yeliz. Sizi kontrol etmek için arıyorum. Umarım uygun bir zamandır. Son zamanlarda kendinizi nasıl hissediyorsunuz?",
        });

        // Connect to ARI
        await ariHandler.connect(ariClient);

        // Set up event handlers for audio forwarding
        setupARIEventHandlers();

        console.log('✅ ARI integration initialized successfully');

    } catch (error) {
        console.error('❌ Failed to initialize ARI:', error);
        console.error('   Phone calls will not work. Check:');
        console.error('   1. ARI is enabled on FreePBX');
        console.error('   2. Credentials are correct');
        console.error('   3. Firewall allows port 8088');
        console.error('   4. Network connectivity to FreePBX');
    }
}

function setupARIEventHandlers() {
    // Mapping: external media ID -> phone channel ID
    const externalMediaToPhoneChannel = new Map();

    // Forward audio from RTP to OpenAI
    rtpHandler.on('audio', ({ callId, audio }) => {
        if (ariHandler) {
            // callId here is the external media ID
            // We need to map it to the phone channel ID for OpenAI
            const phoneChannelId = externalMediaToPhoneChannel.get(callId);
            if (phoneChannelId) {
                ariHandler.forwardAudioToOpenAI(phoneChannelId, audio);
            } else {
                console.error('❌ No phone channel mapping for external media:', callId);
            }
        }
    });

    // Forward audio from OpenAI to RTP
    let audioToCallerCount = 0;
    ariHandler.on('audio-to-caller', ({ callId, audio }) => {
        audioToCallerCount++;
        if (audioToCallerCount === 1) {
            console.log(`🔊 Received first audio-to-caller event for ${callId}`);
            console.log(`   Audio size: ${audio.length} chars (base64)`);
        }
        if (rtpHandler) {
            rtpHandler.sendRTPPacket(callId, audio);
        } else {
            console.error('❌ RTP handler not available!');
        }
    });

    // Clear audio queue when user interrupts
    ariHandler.on('clear-audio-queue', (callId) => {
        if (rtpHandler) {
            rtpHandler.clearAudioQueue(callId);
        }
    });

    // Handle function calls from phone conversations
    ariHandler.on('function-call', async ({ callId, functionCall }) => {
        debugLog(`🔧 Function call from phone (${callId}): ${functionCall.name}`);
        console.log(`🔧 Function call from phone (${callId}):`, functionCall.name);

        try {
            const result = await handleFunctionCall(functionCall, callId);

            // Check if this is a transfer request
            if (result.result && result.result.__transfer) {
                const transferInfo = result.result;
                console.log(`📞 Transfer requested to extension ${transferInfo.extension}`);

                // Send the message to the caller first
                ariHandler.sendFunctionResult(callId, functionCall.call_id, {
                    result: transferInfo.message
                });

                // Wait a moment for the message to be spoken, then transfer
                setTimeout(async () => {
                    try {
                        await ariHandler.transferCall(callId, transferInfo.extension, transferInfo.reason);
                        console.log(`✅ Call ${callId} transferred to ${transferInfo.extension}`);
                    } catch (error) {
                        console.error(`❌ Failed to transfer call ${callId}:`, error);
                    }
                }, 3000); // Wait 3 seconds for AI to say the message
            }
            // Check if this is a hangup request
            else if (result.result && result.result.__hangup) {
                const hangupInfo = result.result;
                debugLog(`📵 AI ENDING CALL - Reason: ${hangupInfo.reason}, Customer satisfied: ${hangupInfo.customer_satisfied}`);
                console.log(`📵 AI ending call: ${hangupInfo.reason}`);
                console.log(`   Customer satisfied: ${hangupInfo.customer_satisfied}`);

                // Send the goodbye message to the caller first
                ariHandler.sendFunctionResult(callId, functionCall.call_id, {
                    result: hangupInfo.message
                });

                // Wait for the message to be spoken, then hang up
                setTimeout(async () => {
                    try {
                        await ariHandler.hangupCall(callId);
                        console.log(`✅ Call ${callId} ended gracefully by AI`);
                    } catch (error) {
                        console.error(`❌ Failed to hang up call ${callId}:`, error);
                    }
                }, 4000); // Wait 4 seconds for AI to say goodbye
            }
            else {
                // Normal function result
                ariHandler.sendFunctionResult(callId, functionCall.call_id, result);
            }
        } catch (error) {
            console.error('Error handling function call:', error);
            ariHandler.sendFunctionResult(callId, functionCall.call_id, {
                error: 'Function call failed'
            });
        }
    });

    // Log call events
    ariHandler.on('call-started', async (info) => {
        console.log('📞 Call started:', info.callerNumber || 'Unknown');
        console.log('   Channel ID:', info.channelId);
        console.log('   External Media ID:', info.externalMediaId);

        // FIXED: Create RTP session with only callId parameter
        // The remote address/port will be discovered from first RTP packet

        // Store mapping: external media ID -> phone channel ID
        if (info.externalMediaId && info.channelId) {
            externalMediaToPhoneChannel.set(info.externalMediaId, info.channelId);
            console.log('🔗 Mapped external media', info.externalMediaId, '→ phone channel', info.channelId);
        }

        if (info.externalMediaId) {
            rtpHandler.createSession(info.externalMediaId);
        }

        // Send call_started webhook
        const callData = ariHandler.getCallInfo(info.callId);
        if (callData) {
            const webhookPayload = {
                event_type: 'call_started',
                timestamp: new Date().toISOString(),
                call: buildCallData(info.callId, callData, false),
                action: {},
                transfer: {},
                system: {
                    assistant_name: getAssistantName(info.agentType),
                    agent_type: info.agentType,
                    app_version: '2.0'
                }
            };
            await sendCallRegisterWebhook(webhookPayload);
        }
    });

    ariHandler.on('call-ended', async (info) => {
        console.log('📵 Call ended:', info.callerNumber || 'Unknown', `Duration: ${info.duration}s`);

        // Send wellness evaluation if this was an Emma call (English or Turkish)
        if (info.agentType === 'wellbeing' || info.agentType === 'wellbeing_tr') {
            const wellnessData = wellnessAssessments.get(info.channelId);
            await sendWellnessEvaluation(info.channelId, info, wellnessData);
            wellnessAssessments.delete(info.channelId); // Clean up
        }

        // Calculate and track costs
        const callCost = calculateCallCost(info.duration || 0);
        costTracking.calls.push({
            timestamp: new Date().toISOString(),
            callId: info.callId,
            callerNumber: info.callerNumber,
            duration: info.duration || 0,
            ...callCost
        });

        // Update totals
        costTracking.totals.totalCalls++;
        costTracking.totals.totalDuration += info.duration || 0;
        costTracking.totals.totalCost += callCost.totalCost;
        costTracking.totals.audioInputTokens += callCost.audioInputTokens;
        costTracking.totals.audioOutputTokens += callCost.audioOutputTokens;
        costTracking.totals.textTokens += callCost.textTokens;

        console.log(`💰 Call cost: £${callCost.totalCost.toFixed(4)} (${info.duration}s)`);

        // Send call_ended webhook
        const webhookPayload = {
            event_type: 'call_ended',
            timestamp: new Date().toISOString(),
            call: {
                call_id: info.callId || '',
                direction: 'unknown',
                caller_number: info.callerNumber || '',
                caller_name: '',
                start_time: '',
                end_time: new Date().toISOString(),
                duration_seconds: info.duration || 0
            },
            action: {},
            transfer: {},
            system: {
                assistant_name: getAssistantName(info.agentType),
                agent_type: info.agentType,
                app_version: '2.0'
            }
        };
        await sendCallRegisterWebhook(webhookPayload);

        // Remove all RTP sessions for this call

        // Find and remove mapping
        for (const [externalMediaId, phoneChannelId] of externalMediaToPhoneChannel.entries()) {
            if (phoneChannelId === info.callId) {
                externalMediaToPhoneChannel.delete(externalMediaId);
                rtpHandler.removeSession(externalMediaId);
                console.log('🗑️  Removed mapping for external media:', externalMediaId);
                break;
            }
        }
    });

    ariHandler.on('call-transferred', async (info) => {
        console.log('🔀 Call transferred:', info.callerNumber || 'Unknown', `to extension ${info.extension}`);
        console.log('   Reason:', info.reason);

        // Send call_transferred webhook
        const webhookPayload = {
            event_type: 'call_transferred',
            timestamp: new Date().toISOString(),
            call: {
                call_id: info.callId || '',
                direction: 'unknown',
                caller_number: info.callerNumber || '',
                caller_name: '',
                start_time: '',
                end_time: new Date().toISOString(),
                duration_seconds: null
            },
            action: {},
            transfer: {
                extension: info.extension || '',
                reason: info.reason || ''
            },
            system: {
                assistant_name: getAssistantName(info.agentType),
                agent_type: info.agentType,
                app_version: '2.0'
            }
        };
        await sendCallRegisterWebhook(webhookPayload);

        // Find and remove mapping for transferred call
        for (const [externalMediaId, phoneChannelId] of externalMediaToPhoneChannel.entries()) {
            if (phoneChannelId === info.callId) {
                externalMediaToPhoneChannel.delete(externalMediaId);
                rtpHandler.removeSession(externalMediaId);
                console.log('🗑️  Removed mapping for transferred call:', externalMediaId);
                break;
            }
        }
    });
}

// ============================================================
// WebSocket handler for web interface
// ============================================================

fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (socket, req) => {
        console.log('WebSocket client connected (web interface)');
        let openAiWs = null;

        socket.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                console.log('Received WebSocket message:', data.type);
                
                if (data.type === 'start_call') {
                    openAiWs = startWebRealtimeSession(socket);
                } else if (data.type === 'audio_data' && data.audio) {
                    if (openAiWs && openAiWs.readyState === 1) {
                        const audioAppend = {
                            type: 'input_audio_buffer.append',
                            audio: data.audio
                        };
                        openAiWs.send(JSON.stringify(audioAppend));
                    }
                } else if (data.type === 'commit_audio') {
                    if (openAiWs && openAiWs.readyState === 1) {
                        openAiWs.send(JSON.stringify({
                            type: 'input_audio_buffer.commit'
                        }));
                        openAiWs.send(JSON.stringify({
                            type: 'response.create',
                            response: {
                                modalities: ['audio', 'text']
                            }
                        }));
                    }
                }
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
        });

        socket.on('close', () => {
            console.log('WebSocket client disconnected');
            if (openAiWs) {
                openAiWs.close();
            }
        });
    });
});

// Start OpenAI Realtime Session for web interface
// FIXED: Using correct OpenAI model name
function startWebRealtimeSession(wsConnection) {
    console.log('Starting OpenAI Realtime session for web client');
    
    let vadEnabled = false;  // Track if VAD has been enabled
    
    const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview', {
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1'
        }
    });

    openAiWs.on('open', () => {
        console.log('Connected to OpenAI Realtime API for web client');
        
        // Configure session WITHOUT server_vad initially (for reliable greeting)
        const sessionUpdate = {
            type: 'session.update',
            session: {
                turn_detection: null,  // Disabled initially
                input_audio_format: 'pcm16',
                output_audio_format: 'pcm16',
                voice: VOICE,
                instructions: SYSTEM_MESSAGE,
                modalities: ['audio', 'text'],
                temperature: 0.8,
                tools: TOOLS
            }
        };

        console.log('📤 Sending session config (VAD disabled for greeting)...');
        openAiWs.send(JSON.stringify(sessionUpdate));

        // Send initial greeting
        const conversationItem = {
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'user',
                content: [
                    {
                        type: 'input_text',
                        text: 'Greet the user warmly and ask how you can help them today.'
                    }
                ]
            }
        };

        openAiWs.send(JSON.stringify(conversationItem));
        
        const responseCreate = {
            type: 'response.create',
            response: {
                modalities: ['audio', 'text']
            }
        };
        
        console.log('📤 Requesting initial greeting with audio (manual mode)...');
        openAiWs.send(JSON.stringify(responseCreate));
    });

    openAiWs.on('message', (data) => {
        try {
            const response = JSON.parse(data.toString());
            
            if (LOG_EVENT_TYPES.includes(response.type)) {
                console.log(`Received event: ${response.type}`);
            }

            // Handle errors with detailed logging
            if (response.type === 'error') {
                console.error('❌ OpenAI Error:', JSON.stringify(response.error, null, 2));
                wsConnection.send(JSON.stringify({
                    type: 'error',
                    error: response.error
                }));
                return;
            }

            // Debug response.done to see why no audio
            if (response.type === 'response.done') {
                console.log('🔍 Response details:', JSON.stringify({
                    id: response.response?.id,
                    status: response.response?.status,
                    output_length: response.response?.output?.length,
                    modalities: response.response?.modalities,
                    has_audio: response.response?.output?.some(o => o.type === 'audio'),
                    output_types: response.response?.output?.map(o => o.type)
                }, null, 2));
                
                // Enable server_vad after initial greeting
                if (!vadEnabled) {
                    console.log('🎙️ Enabling server VAD for ongoing conversation...');
                    openAiWs.send(JSON.stringify({
                        type: 'session.update',
                        session: {
                            turn_detection: { type: 'server_vad' }
                        }
                    }));
                    vadEnabled = true;
                }
            }

            // Forward relevant events to client
            if (['response.audio.delta', 'response.audio.done', 'response.done', 'session.created'].includes(response.type)) {
                wsConnection.send(JSON.stringify(response));
            }

            // Handle session created
            if (response.type === 'session.created') {
                console.log('OpenAI session created:', response.session.id);
                wsConnection.send(JSON.stringify({
                    type: 'session_ready',
                    session_id: response.session.id
                }));
            }

            // Handle function calls
            if (response.type === 'response.done' && response.response.output) {
                response.response.output.forEach(async item => {
                    if (item.type === 'function_call') {
                        const result = await handleFunctionCall(item);
                        
                        // Send result back
                        const functionResponse = {
                            type: 'conversation.item.create',
                            item: {
                                type: 'function_call_output',
                                call_id: item.call_id,
                                output: JSON.stringify(result)
                            }
                        };

                        openAiWs.send(JSON.stringify(functionResponse));
                        openAiWs.send(JSON.stringify({ 
                            type: 'response.create',
                            response: {
                                modalities: ['audio', 'text']
                            }
                        }));
                    }
                });
            }

        } catch (error) {
            console.error('Error processing OpenAI message:', error);
        }
    });

    openAiWs.on('close', () => {
        console.log('Disconnected from OpenAI Realtime API');
    });

    openAiWs.on('error', (error) => {
        console.error('OpenAI WebSocket error:', error);
    });

    return openAiWs;
}

// ============================================================
// Webhook Helper Functions
// ============================================================

/**
 * Send standardized webhook to Make.com for call register
 * @param {Object} payload - Standardized webhook payload
 */
async function sendCallRegisterWebhook(payload) {
    if (!MAKE_WEBHOOK_URL) {
        console.log('⚠️  MAKE_WEBHOOK_URL not configured - skipping webhook');
        return;
    }

    try {
        console.log('📤 Sending call register webhook:', payload.event_type);

        const response = await fetch(MAKE_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log('✅ Webhook sent successfully');
        } else {
            console.error('❌ Webhook failed:', response.status, response.statusText);
        }
    } catch (error) {
        console.error('❌ Error sending webhook:', error.message);
    }
}

/**
 * Get assistant name based on agent type
 * @param {string} agentType - The agent type (wellbeing, accounts, service)
 * @returns {string} The assistant's name
 */
function getAssistantName(agentType) {
    switch(agentType) {
        case 'wellbeing': return 'Emma';
        case 'wellbeing_tr': return 'Yeliz';
        case 'accounts': return 'Alex';
        case 'service':
        default: return 'Sophie';
    }
}

/**
 * Build standardized call data object
 * @param {string} callId - Call ID
 * @param {Object} callData - Call data from activeCalls map
 * @param {boolean} includeEndTime - Whether to include end time and duration
 * @returns {Object} Standardized call object
 */
function buildCallData(callId, callData, includeEndTime = false) {
    const result = {
        call_id: callId || '',
        direction: callData?.direction || 'unknown',
        caller_number: callData?.callerNumber || '',
        caller_name: callData?.callerName || '',
        start_time: callData?.startTime ? callData.startTime.toISOString() : '',
        end_time: null,
        duration_seconds: null
    };

    if (includeEndTime && callData?.startTime) {
        result.end_time = new Date().toISOString();
        result.duration_seconds = Math.round((new Date() - callData.startTime) / 1000);
    }

    return result;
}

// ============================================================
// Cost Calculation Helper
// ============================================================

function calculateCallCost(durationSeconds) {
    // Estimate tokens based on duration
    const audioInputTokens = durationSeconds * COSTS.TOKENS_PER_SECOND_INPUT;
    const audioOutputTokens = durationSeconds * COSTS.TOKENS_PER_SECOND_OUTPUT;
    const textTokens = COSTS.FUNCTION_CALL_TOKENS; // Estimated function call tokens

    // Calculate costs
    const audioInputCost = audioInputTokens * COSTS.AUDIO_INPUT_PER_TOKEN;
    const audioOutputCost = audioOutputTokens * COSTS.AUDIO_OUTPUT_PER_TOKEN;
    const textCost = textTokens * COSTS.TEXT_PER_TOKEN;
    const totalCost = audioInputCost + audioOutputCost + textCost;

    return {
        audioInputTokens,
        audioOutputTokens,
        textTokens,
        audioInputCost,
        audioOutputCost,
        textCost,
        totalCost
    };
}

// ============================================================
// Function Handlers
// ============================================================

async function handleFunctionCall(functionCall, callId = null) {
    debugLog(`⚙️ handleFunctionCall called: ${functionCall.name} for call ${callId}`);
    console.log('Function call received:', functionCall.name);

    try {
        let args = {};

        // Parse arguments
        try {
            args = typeof functionCall.arguments === 'string'
                ? JSON.parse(functionCall.arguments)
                : functionCall.arguments;
        } catch (e) {
            console.error('Error parsing function arguments:', e);
            args = {};
        }

        let result = '';

        switch (functionCall.name) {
            case 'get_automotive_info':
                result = await handleAutomotiveInfo(args);
                break;
            case 'schedule_appointment':
                result = await handleScheduleAppointment(args, callId);
                break;
            case 'request_towing':
                result = await handleRequestTowing(args, callId);
                break;
            case 'transfer_to_human':
                result = await handleTransferToHuman(args);
                break;
            case 'request_callback':
                result = await handleRequestCallback(args, callId);
                break;
            case 'end_call':
                result = await handleEndCall(args, callId);
                break;
            // Accounts Agent functions
            case 'check_customer_account':
                result = await handleCheckCustomerAccount(args);
                break;
            case 'check_unpaid_charges':
                result = await handleCheckUnpaidCharges(args);
                break;
            case 'process_payment':
                result = await handleProcessPayment(args, callId);
                break;
            case 'setup_payment_plan':
                result = await handleSetupPaymentPlan(args, callId);
                break;
            case 'get_payment_history':
                result = await handleGetPaymentHistory(args, callId);
                break;
            // Wellness Agent (Emma) functions
            case 'log_wellbeing_check':
                result = await handleLogWellbeingCheck(args, callId);
                break;
            case 'schedule_wellbeing_callback':
                result = await handleScheduleWellbeingCallback(args, callId);
                break;
            default:
                result = `I'm not familiar with that function. How else can I help you?`;
        }

        return { result };

    } catch (error) {
        console.error('Error in function handler:', error);
        return { error: error.message };
    }
}

async function handleAutomotiveInfo(args) {
    console.log('Getting automotive info for:', args.service_type);

    const services = {
        towing: 'Our towing service is available 24/7. Standard rates are £60 for the first 5 miles, then £2.50 per additional mile. Emergency towing is available with priority dispatch.',
        repair: 'We offer comprehensive repair services including engine work, transmission, brakes, and electrical systems. Average turnaround time is 2-3 business days depending on the repair.',
        maintenance: 'Regular maintenance includes oil changes (£35), tyre rotations (£20), and full inspections (£70). We recommend service every 5,000 miles or 6 months.',
        inspection: 'MOT tests are £35 and typically take 30 minutes. We can often accommodate same-day appointments.'
    };

    return services[args.service_type] || 'Please do specify the type of service you need information about.';
}

async function handleScheduleAppointment(args, callId = null) {
    console.log('Scheduling appointment:', args);

    // Get call data if callId is provided
    const callData = callId && ariHandler ? ariHandler.getCallInfo(callId) : null;

    // Build standardized webhook payload
    const webhookPayload = {
        event_type: 'appointment',
        timestamp: new Date().toISOString(),
        call: callData ? buildCallData(callId, callData, false) : {
            call_id: '',
            direction: 'unknown',
            caller_number: args.customer_phone || '',
            caller_name: args.customer_name || '',
            start_time: '',
            end_time: null,
            duration_seconds: null
        },
        action: {
            type: 'appointment',
            details: {
                service_type: args.service_type || '',
                preferred_date: args.preferred_date || '',
                preferred_time: args.preferred_time || '',
                customer_name: args.customer_name || '',
                customer_phone: args.customer_phone || '',
                notes: args.notes || ''
            }
        },
        transfer: {},
        system: {
            assistant_name: 'Sophie',
            app_version: '2.0'
        }
    };

    await sendCallRegisterWebhook(webhookPayload);

    return `Brilliant! I've scheduled your ${args.service_type} appointment${args.preferred_date ? ` for ${args.preferred_date}` : ''}. You should receive a confirmation call on ${args.customer_phone} within the next hour to confirm the details.`;
}

async function handleRequestTowing(args, callId = null) {
    console.log('Towing requested:', args);

    // Get call data if callId is provided
    const callData = callId && ariHandler ? ariHandler.getCallInfo(callId) : null;

    // Build standardized webhook payload
    const webhookPayload = {
        event_type: 'towing',
        timestamp: new Date().toISOString(),
        call: callData ? buildCallData(callId, callData, false) : {
            call_id: '',
            direction: 'unknown',
            caller_number: args.customer_phone || '',
            caller_name: '',
            start_time: '',
            end_time: null,
            duration_seconds: null
        },
        action: {
            type: 'towing',
            details: {
                location: args.location || '',
                destination: args.destination || '',
                vehicle_type: args.vehicle_type || '',
                urgency: args.urgency || 'normal',
                customer_phone: args.customer_phone || ''
            }
        },
        transfer: {},
        system: {
            assistant_name: 'Sophie',
            app_version: '2.0'
        }
    };

    await sendCallRegisterWebhook(webhookPayload);

    const urgencyText = args.urgency === 'emergency' ? 'immediately' : 'within 30 to 45 minutes';
    return `Help is on the way! A recovery vehicle is being dispatched ${urgencyText} to ${args.location}. The driver will call you on ${args.customer_phone} when they're nearby. Do stay safe!`;
}

async function handleTransferToHuman(args) {
    console.log('Transfer to human requested:', args);

    const extension = args.extension || '7021';
    const reason = args.reason || 'Customer requested to speak with a human';

    console.log(`   Checking availability of extension: ${extension}`);
    console.log(`   Reason: ${reason}`);

    // List of extensions that are always available (Stasis apps, IVR, etc.)
    const alwaysAvailableExtensions = ['1005']; // Accounts department AI agent

    // Check if the extension is online before attempting transfer
    // Skip check for always-available extensions (like other AI agents)
    if (ariHandler && !alwaysAvailableExtensions.includes(extension)) {
        const isOnline = await ariHandler.isEndpointOnline(extension);

        if (!isOnline) {
            console.log(`   ❌ Extension ${extension} is offline - offering callback instead`);

            // Return message asking for callback number instead of transferring
            return `I'm sorry, but there's no one else available at the moment. I'd be happy to have a team member call you back. Could you please provide your phone number?`;
        }

        console.log(`   ✅ Extension ${extension} is online - proceeding with transfer`);
    } else if (alwaysAvailableExtensions.includes(extension)) {
        console.log(`   ✅ Extension ${extension} is always available (Stasis app) - proceeding with transfer`);
    }

    // Customize transfer message based on destination
    let transferMessage;
    if (extension === '1005') {
        transferMessage = `Certainly! I'm transferring you to our accounts department now. Please hold for a moment.`;
    } else {
        transferMessage = `Certainly! I'm transferring you to a team member now. Please hold for a moment.`;
    }

    // The actual transfer will be handled by returning a special marker
    // that the ARI handler will detect
    return {
        __transfer: true,
        extension: extension,
        reason: reason,
        message: transferMessage
    };
}

async function handleRequestCallback(args, callId = null) {
    console.log('Callback requested:', args);

    // Get call data if callId is provided
    const callData = callId && ariHandler ? ariHandler.getCallInfo(callId) : null;

    // Build standardized webhook payload
    const webhookPayload = {
        event_type: 'callback_request',
        timestamp: new Date().toISOString(),
        call: callData ? buildCallData(callId, callData, false) : {
            call_id: '',
            direction: 'unknown',
            caller_number: args.customer_phone || '',
            caller_name: args.customer_name || '',
            start_time: '',
            end_time: null,
            duration_seconds: null
        },
        action: {
            type: 'callback_request',
            details: {
                customer_phone: args.customer_phone || '',
                customer_name: args.customer_name || '',
                reason: args.reason || '',
                preferred_time: args.preferred_time || 'ASAP'
            }
        },
        transfer: {},
        system: {
            assistant_name: 'Sophie',
            app_version: '2.0'
        }
    };

    await sendCallRegisterWebhook(webhookPayload);

    return `Perfect! I've noted that you'd like a callback at ${args.customer_phone}. A team member will reach out to you as soon as possible. Is there anything else I can help you with right now?`;
}

async function handleEndCall(args, callId = null) {
    debugLog(`🎯 handleEndCall EXECUTED - CallID: ${callId}, Reason: ${args.reason}, Satisfied: ${args.customer_satisfied !== false}`);
    console.log('AI ending call:', args.reason);
    console.log('   Customer satisfied:', args.customer_satisfied !== false);

    // Get call data if callId is provided
    const callData = callId && ariHandler ? ariHandler.getCallInfo(callId) : null;

    // Build webhook payload for call completion
    const webhookPayload = {
        event_type: 'call_completed',
        timestamp: new Date().toISOString(),
        call: callData ? buildCallData(callId, callData, false) : {
            call_id: '',
            direction: 'unknown',
            caller_number: '',
            caller_name: '',
            start_time: '',
            end_time: null,
            duration_seconds: null
        },
        action: {
            type: 'call_ended_by_ai',
            details: {
                reason: args.reason || 'Conversation complete',
                customer_satisfied: args.customer_satisfied !== false
            }
        },
        transfer: {},
        system: {
            assistant_name: 'Sophie',
            app_version: '2.0'
        }
    };

    await sendCallRegisterWebhook(webhookPayload);

    // Return special marker for hangup
    return {
        __hangup: true,
        reason: args.reason || 'Conversation complete',
        customer_satisfied: args.customer_satisfied !== false,
        message: "Thank you for calling Deepcut Garage. Have a great day! Goodbye."
    };
}

// ============================================================
// Accounts Agent Function Handlers
// ============================================================

async function handleCheckCustomerAccount(args) {
    console.log('Checking customer account for phone:', args.customer_phone);

    // TODO: Integrate with your actual billing system/database
    // Example: const account = await billingAPI.getCustomerByPhone(args.customer_phone);

    // Mock response for now - replace with real data
    const mockAccount = {
        customer_id: 'CUST' + Math.floor(Math.random() * 100000),
        customer_name: 'John Smith',
        phone: args.customer_phone,
        email: 'customer@example.com',
        account_status: 'active',
        total_unpaid: 285.50,
        oldest_invoice_date: '2024-09-15',
        num_unpaid_invoices: 2
    };

    // Log for audit trail
    console.log(`   Found account: ${mockAccount.customer_id}, Unpaid: £${mockAccount.total_unpaid}`);

    return {
        customer_id: mockAccount.customer_id,
        customer_name: mockAccount.customer_name,
        total_unpaid: mockAccount.total_unpaid,
        num_invoices: mockAccount.num_unpaid_invoices,
        message: `I found your account. You currently have ${mockAccount.num_unpaid_invoices} unpaid invoices totaling £${mockAccount.total_unpaid.toFixed(2)}. Would you like me to provide details or help you make a payment?`
    };
}

async function handleCheckUnpaidCharges(args) {
    console.log('Checking unpaid charges for customer:', args.customer_id);

    // TODO: Query your billing system
    // Example: const invoices = await billingAPI.getUnpaidInvoices(args.customer_id);

    // Mock unpaid charges - replace with real data
    const unpaidCharges = [
        {
            invoice_id: 'INV-2024-101',
            amount: 185.50,
            due_date: '2024-10-15',
            description: 'Engine Repair - Labor and Parts',
            service_date: '2024-09-20'
        },
        {
            invoice_id: 'INV-2024-102',
            amount: 100.00,
            due_date: '2024-11-01',
            description: 'Transmission Service',
            service_date: '2024-10-05'
        }
    ];

    const total = unpaidCharges.reduce((sum, charge) => sum + charge.amount, 0);

    let detailsText = `Here are your unpaid invoices:\n\n`;
    unpaidCharges.forEach((charge, index) => {
        detailsText += `${index + 1}. ${charge.description} - £${charge.amount.toFixed(2)}, due ${charge.due_date}\n`;
    });
    detailsText += `\nTotal outstanding: £${total.toFixed(2)}. Would you like to make a payment today?`;

    return {
        invoices: unpaidCharges,
        total: total,
        message: detailsText
    };
}

async function handleProcessPayment(args, callId = null) {
    console.log('Processing payment for customer:', args.customer_id);
    console.log('   Amount: £' + args.amount);
    console.log('   Method:', args.payment_method);
    console.log('   Card last 4:', args.card_last_four || 'N/A');

    // TODO: Integrate with payment gateway (Stripe, PayPal, etc.)
    // CRITICAL: Handle PCI compliance - NEVER log full card numbers
    // Example:
    // const payment = await stripeAPI.charge({
    //     amount: args.amount * 100, // Convert to pence
    //     currency: 'gbp',
    //     customer: args.customer_id,
    //     source: tokenizedCard
    // });

    // Get call data if callId is provided
    const callData = callId && ariHandler ? ariHandler.getCallInfo(callId) : null;

    // Mock payment processing - replace with real payment gateway
    const paymentReference = 'PAY-' + Date.now();
    const newBalance = 285.50 - args.amount; // Mock calculation

    // Send webhook for audit trail and processing
    const webhookPayload = {
        event_type: 'payment_processed',
        timestamp: new Date().toISOString(),
        call: callData ? buildCallData(callId, callData, false) : {
            call_id: '',
            direction: 'inbound',
            caller_number: '',
            caller_name: '',
            start_time: '',
            end_time: null,
            duration_seconds: null
        },
        action: {
            type: 'payment',
            details: {
                customer_id: args.customer_id,
                amount: args.amount,
                payment_method: args.payment_method,
                card_last_four: args.card_last_four || 'N/A',
                invoice_ids: args.invoice_ids || [],
                payment_reference: paymentReference,
                status: 'success'
            }
        },
        transfer: {},
        system: {
            assistant_name: 'Alex',
            app_version: '2.0'
        }
    };

    await sendCallRegisterWebhook(webhookPayload);

    return {
        success: true,
        payment_reference: paymentReference,
        new_balance: newBalance,
        message: `Perfect! I've successfully processed your payment of £${args.amount.toFixed(2)} using your ${args.payment_method}${args.card_last_four ? ' ending in ' + args.card_last_four : ''}. Your payment reference is ${paymentReference}. Your new balance is £${newBalance.toFixed(2)}. You'll receive a confirmation email shortly. Is there anything else I can help you with today?`
    };
}

async function handleSetupPaymentPlan(args, callId = null) {
    console.log('Setting up payment plan for customer:', args.customer_id);
    console.log('   Total amount:', args.total_amount);
    console.log('   Number of payments:', args.num_payments);
    console.log('   First payment:', args.first_payment_date);

    const monthlyAmount = args.total_amount / args.num_payments;

    // TODO: Create payment plan in your billing system
    // Example: await billingAPI.createPaymentPlan({...args, monthly: monthlyAmount});

    // Get call data if callId is provided
    const callData = callId && ariHandler ? ariHandler.getCallInfo(callId) : null;

    const planId = 'PLAN-' + Date.now();

    // Send webhook for processing
    const webhookPayload = {
        event_type: 'payment_plan_created',
        timestamp: new Date().toISOString(),
        call: callData ? buildCallData(callId, callData, false) : {
            call_id: '',
            direction: 'inbound',
            caller_number: args.customer_phone || '',
            caller_name: '',
            start_time: '',
            end_time: null,
            duration_seconds: null
        },
        action: {
            type: 'payment_plan',
            details: {
                customer_id: args.customer_id,
                plan_id: planId,
                total_amount: args.total_amount,
                num_payments: args.num_payments,
                monthly_payment: monthlyAmount,
                first_payment_date: args.first_payment_date,
                customer_phone: args.customer_phone
            }
        },
        transfer: {},
        system: {
            assistant_name: 'Alex',
            app_version: '2.0'
        }
    };

    await sendCallRegisterWebhook(webhookPayload);

    return {
        success: true,
        plan_id: planId,
        monthly_amount: monthlyAmount,
        message: `Excellent! I've set up a payment plan for you. You'll pay £${monthlyAmount.toFixed(2)} per month over ${args.num_payments} months, starting on ${args.first_payment_date}. Your plan reference is ${planId}. The first payment will be automatically charged on the start date. You'll receive a confirmation letter with all the details. Is there anything else I can help with?`
    };
}

async function handleGetPaymentHistory(args, callId = null) {
    console.log('Getting payment history for customer:', args.customer_id);
    console.log('   Months requested:', args.months || 12);

    // TODO: Query payment history from backend
    // Example: const history = await billingAPI.getPaymentHistory(args.customer_id, args.months);

    // Mock payment history - replace with real data
    const paymentHistory = [
        {
            date: '2024-10-20',
            amount: 50.00,
            method: 'credit_card',
            status: 'completed',
            reference: 'PAY-001',
            invoice: 'INV-2024-095'
        },
        {
            date: '2024-09-15',
            amount: 125.00,
            method: 'debit_card',
            status: 'completed',
            reference: 'PAY-002',
            invoice: 'INV-2024-089'
        },
        {
            date: '2024-08-10',
            amount: 75.00,
            method: 'bank_transfer',
            status: 'completed',
            reference: 'PAY-003',
            invoice: 'INV-2024-078'
        }
    ];

    let historyText = `Here's your payment history for the last ${args.months || 12} months:\n\n`;
    paymentHistory.forEach((payment, index) => {
        historyText += `${index + 1}. ${payment.date}: £${payment.amount.toFixed(2)} paid by ${payment.method.replace('_', ' ')}\n`;
    });

    const totalPaid = paymentHistory.reduce((sum, p) => sum + p.amount, 0);
    historyText += `\nTotal paid in this period: £${totalPaid.toFixed(2)}. Would you like details about any specific payment?`;

    return {
        payments: paymentHistory,
        total_paid: totalPaid,
        message: historyText
    };
}

// ============================================================
// HTTP Routes

// ============================================================
// Emma (Wellness Agent) Function Handlers
// ============================================================

async function handleLogWellbeingCheck(args, callId = null) {
    console.log('⚙️ handleLogWellbeingCheck called for call', callId);
    console.log('Wellness check data:', args);

    // Store wellness assessment for later webhook
    if (callId) {
        wellnessAssessments.set(callId, {
            caller_phone: args.caller_phone,
            caller_name: args.caller_name,
            mood_assessment: args.mood_assessment,
            physical_concerns: args.physical_concerns || null,
            mental_concerns: args.mental_concerns || null,
            support_provided: args.support_provided || null,
            follow_up_needed: args.follow_up_needed || false,
            notes: args.notes || null,
            logged_at: new Date().toISOString()
        });

        console.log(`✅ Wellness assessment stored for ${callId}`);
        console.log(`   Mood: ${args.mood_assessment}`);
        console.log(`   Follow-up needed: ${args.follow_up_needed}`);
    }

    return `Thank you for sharing. I've made a note of our conversation${args.follow_up_needed ? ' and will schedule a follow-up check-in' : ''}.`;
}

async function handleScheduleWellbeingCallback(args, callId = null) {
    console.log('⚙️ Scheduling wellness callback:', args);

    // Get call data
    const callData = callId && ariHandler ? ariHandler.getCallInfo(callId) : null;

    // Build webhook payload for callback scheduling
    const webhookPayload = {
        event_type: 'wellbeing_callback',
        timestamp: new Date().toISOString(),
        call: callData ? buildCallData(callId, callData, false) : {
            call_id: '',
            direction: 'unknown',
            caller_number: args.caller_phone || '',
            caller_name: args.caller_name || '',
            start_time: '',
            end_time: null,
            duration_seconds: null
        },
        action: {
            type: 'wellbeing_callback',
            details: {
                caller_name: args.caller_name || '',
                caller_phone: args.caller_phone,
                preferred_date: args.preferred_date || null,
                preferred_time: args.preferred_time || null,
                reason: args.reason,
                priority: args.priority || 'normal'
            }
        },
        system: {
            assistant_name: 'Emma',
            agent_type: 'wellbeing',
            app_version: '2.0'
        }
    };

    await sendCallRegisterWebhook(webhookPayload);

    return `I've scheduled a wellness check-in call${args.preferred_date ? ` for ${args.preferred_date}` : ''}. I'll reach out to ${args.caller_phone} to ${args.reason}. Take care of yourself until then.`;
}

// Send wellness evaluation webhook at end of Emma calls
async function sendWellnessEvaluation(callId, callInfo, wellnessData) {
    if (!WELLNESS_WEBHOOK_URL) {
        console.log('⚠️  WELLNESS_WEBHOOK_URL not configured');
        return;
    }

    try {
        const evaluation = {
            // Call Information
            call_id: callId,
            caller_phone: callInfo.callerNumber || wellnessData?.caller_phone || 'unknown',
            caller_name: wellnessData?.caller_name || null,
            call_date: new Date().toISOString(),
            call_duration: callInfo.duration || 0,
            call_direction: callInfo.direction || 'inbound',

            // Wellness Assessment
            mood_assessment: wellnessData?.mood_assessment || 'not_assessed',
            emotional_state: wellnessData?.mental_concerns || null,
            physical_concerns: wellnessData?.physical_concerns || null,
            mental_concerns: wellnessData?.mental_concerns || null,

            // Conversation Analysis
            support_provided: wellnessData?.support_provided || null,
            conversation_notes: wellnessData?.notes || null,

            // Follow-up & Actions
            follow_up_needed: wellnessData?.follow_up_needed || false,
            follow_up_reason: wellnessData?.follow_up_needed ? (wellnessData?.notes || 'Follow-up recommended') : null,

            // Call Outcome
            call_completed_normally: true,
            assessment_completed: !!wellnessData,

            // Metadata
            agent: 'Emma',
            agent_type: 'wellbeing',
            timestamp: new Date().toISOString()
        };

        console.log('📤 Sending wellness evaluation:', evaluation.caller_phone, '-', evaluation.mood_assessment);

        const response = await fetch(WELLNESS_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(evaluation)
        });

        if (response.ok) {
            console.log('✅ Wellness evaluation sent successfully to Make.com');
        } else {
            const errorText = await response.text();
            console.error(`❌ Failed to send wellness evaluation: ${response.status} ${errorText}`);
        }
    } catch (error) {
        console.error('❌ Error sending wellness evaluation:', error.message);
    }
}

// ============================================================

// Health check
fastify.get('/', async (request, reply) => {
    return {
        status: 'healthy',
        service: 'FreePBX Voice Assistant with ARI',
        version: '2.0',
        features: {
            web_interface: true,
            phone_calls: !!ariHandler,
            rtp_audio: !!rtpHandler
        }
    };
});

// Status endpoint
fastify.get('/status', async (request, reply) => {
    return {
        sip_registered: sipClient ? sipClient.registered : false,
        ari_connected: !!ariHandler,
        rtp_server: !!rtpHandler,
        active_calls: ariHandler ? ariHandler.getActiveCalls().length : 0,
        rtp_sessions: rtpHandler ? rtpHandler.getSessions().length : 0
    };
});

// ARI-specific endpoints
fastify.get('/ari/calls', async (request, reply) => {
    if (!ariHandler) {
        return { error: 'ARI not initialized' };
    }
    return {
        activeCalls: ariHandler.getActiveCalls()
    };
});

fastify.get('/ari/rtp-sessions', async (request, reply) => {
    if (!rtpHandler) {
        return { error: 'RTP handler not initialized' };
    }
    return {
        sessions: rtpHandler.getSessions()
    };
});

// Initiate outbound call
fastify.post('/ari/originate', async (request, reply) => {
    if (!ariHandler) {
        return reply.code(503).send({
            error: 'ARI not initialized',
            message: 'Phone call system is not available'
        });
    }

    const { destination, context, callerId, variables } = request.body;

    if (!destination) {
        return reply.code(400).send({
            error: 'Missing required parameter: destination',
            message: 'Please provide a destination phone number or extension'
        });
    }

    try {
        console.log(`📞 Initiating outbound call to: ${destination}`);

        const result = await ariHandler.makeOutboundCall({
            destination,
            context: context || 'from-internal',
            callerId: callerId || SIP_EXTENSION,
            variables: variables || {}
        });

        return {
            success: true,
            callId: result.callId,
            destination: destination,
            message: 'Outbound call initiated successfully'
        };
    } catch (error) {
        console.error('❌ Error initiating outbound call:', error);
        return reply.code(500).send({
            error: 'Failed to initiate outbound call',
            message: error.message
        });
    }
});

// Get specific call status
fastify.get('/ari/calls/:callId', async (request, reply) => {
    if (!ariHandler) {
        return reply.code(503).send({
            error: 'ARI not initialized'
        });
    }

    const { callId } = request.params;
    const callInfo = ariHandler.getCallInfo(callId);

    if (!callInfo) {
        return reply.code(404).send({
            error: 'Call not found',
            message: `No active call with ID ${callId}`
        });
    }

    return {
        callId: callId,
        callerNumber: callInfo.callerNumber,
        callerName: callInfo.callerName,
        direction: callInfo.direction || 'inbound',
        startTime: callInfo.startTime,
        duration: Math.round((new Date() - callInfo.startTime) / 1000),
        status: 'active'
    };
});

// Hangup a specific call
fastify.delete('/ari/calls/:callId', async (request, reply) => {
    if (!ariHandler) {
        return reply.code(503).send({
            error: 'ARI not initialized'
        });
    }

    const { callId } = request.params;

    try {
        await ariHandler.hangupCall(callId);
        return {
            success: true,
            message: `Call ${callId} hung up successfully`
        };
    } catch (error) {
        return reply.code(404).send({
            error: 'Call not found',
            message: error.message
        });
    }
});

// Diagnostics
fastify.get('/diagnostics', async (request, reply) => {
    return {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        config: {
            freepbx_host: FREEPBX_HOST,
            sip_extension: SIP_EXTENSION,
            ari_host: ARI_HOST,
            ari_configured: !!(ARI_HOST && ARI_USERNAME && ARI_PASSWORD),
            rtp_port: RTP_PORT
        },
        status: {
            sip_registered: sipClient ? sipClient.registered : false,
            ari_connected: !!ariHandler,
            rtp_server_running: !!rtpHandler,
            active_calls: ariHandler ? ariHandler.getActiveCalls().length : 0
        }
    };
});

// Cost analytics endpoint
fastify.get('/api/costs', async (request, reply) => {
    const { period } = request.query; // 'hour', 'day', 'week', 'month', 'all'

    let filteredCalls = costTracking.calls;
    const now = new Date();

    if (period) {
        const cutoffTime = new Date();
        switch (period) {
            case 'hour':
                cutoffTime.setHours(now.getHours() - 1);
                break;
            case 'day':
                cutoffTime.setDate(now.getDate() - 1);
                break;
            case 'week':
                cutoffTime.setDate(now.getDate() - 7);
                break;
            case 'month':
                cutoffTime.setMonth(now.getMonth() - 1);
                break;
        }

        if (period !== 'all') {
            filteredCalls = costTracking.calls.filter(call =>
                new Date(call.timestamp) >= cutoffTime
            );
        }
    }

    // Calculate stats for filtered period
    const periodStats = {
        totalCalls: filteredCalls.length,
        totalDuration: filteredCalls.reduce((sum, call) => sum + call.duration, 0),
        totalCost: filteredCalls.reduce((sum, call) => sum + call.totalCost, 0),
        avgDuration: filteredCalls.length > 0
            ? filteredCalls.reduce((sum, call) => sum + call.duration, 0) / filteredCalls.length
            : 0,
        avgCost: filteredCalls.length > 0
            ? filteredCalls.reduce((sum, call) => sum + call.totalCost, 0) / filteredCalls.length
            : 0
    };

    return {
        period: period || 'all',
        stats: periodStats,
        totals: costTracking.totals,
        recentCalls: filteredCalls.slice(-20).reverse(), // Last 20 calls
        pricing: {
            audioInputPerToken: COSTS.AUDIO_INPUT_PER_TOKEN,
            audioOutputPerToken: COSTS.AUDIO_OUTPUT_PER_TOKEN,
            textPerToken: COSTS.TEXT_PER_TOKEN,
            estimatedTokensPerSecond: COSTS.TOKENS_PER_SECOND_INPUT,
            currency: COSTS.CURRENCY,
            currencySymbol: COSTS.CURRENCY_SYMBOL
        }
    };
});

// Cost reset endpoint (for testing)
fastify.post('/api/costs/reset', async (request, reply) => {
    costTracking.calls = [];
    costTracking.totals = {
        totalCalls: 0,
        totalDuration: 0,
        totalCost: 0,
        audioInputTokens: 0,
        audioOutputTokens: 0,
        textTokens: 0
    };
    return { success: true, message: 'Cost tracking reset' };
});

// Serve enhanced dashboard
fastify.get('/dashboard', async (request, reply) => {
    const filePath = path.join(__dirname, 'dashboard.html');
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        reply.type('text/html').send(content);
    } else {
        return reply.code(404).send({ error: 'Dashboard not found' });
    }
});

fastify.get('/dashboard.html', async (request, reply) => {
    const filePath = path.join(__dirname, 'dashboard.html');
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        reply.type('text/html').send(content);
    } else {
        return reply.code(404).send({ error: 'Dashboard not found' });
    }
});

// FIXED: Serve test client with correct filename
fastify.get('/test-client.html', async (request, reply) => {
    const filePath = path.join(__dirname, 'test-client.html');
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        reply.type('text/html').send(content);
    } else {
        return reply.code(404).send({ error: 'Test client not found' });
    }
});

// ============================================================
// Startup
// ============================================================

async function start() {
    try {
        // Initialize ARI and RTP if configured
        await initializeARI();

        // Initialize SIP client for registration monitoring (optional)
        if (SIP_PASSWORD && FREEPBX_HOST && SIP_EXTENSION) {
            console.log('📞 Initializing SIP client for registration monitoring...');
            sipClient = new FreePBXSIPClient({
                host: FREEPBX_HOST,
                extension: SIP_EXTENSION,
                password: SIP_PASSWORD,
                localIp: SERVER_HOST || '0.0.0.0'
            });

            await sipClient.start();
        } else {
            console.log('⚠️  SIP client not configured - registration monitoring disabled');
        }

        // Start Fastify server
        await fastify.listen({ port: SERVER_PORT, host: '0.0.0.0' });
        
        console.log('');
        console.log('✅ Server started successfully!');
        console.log('');
        console.log('📍 Endpoints:');
        console.log(`   Web Interface: http://localhost:${SERVER_PORT}/test-client.html`);
        console.log(`   Status: http://localhost:${SERVER_PORT}/status`);
        console.log(`   Health: http://localhost:${SERVER_PORT}/`);
        console.log(`   ARI Calls: http://localhost:${SERVER_PORT}/ari/calls`);
        console.log(`   RTP Sessions: http://localhost:${SERVER_PORT}/ari/rtp-sessions`);
        console.log('');
        console.log('🎉 Ready to handle web and phone calls!');
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n📴 Shutting down gracefully...');
    
    if (ariHandler) {
        await ariHandler.disconnect();
    }
    
    if (rtpHandler) {
        rtpHandler.stop();
    }
    
    if (sipClient) {
        sipClient.stop();
    }
    
    await fastify.close();
    console.log('✅ Shutdown complete');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n📴 Received SIGTERM, shutting down...');
    
    if (ariHandler) {
        await ariHandler.disconnect();
    }
    
    if (rtpHandler) {
        rtpHandler.stop();
    }
    
    if (sipClient) {
        sipClient.stop();
    }
    
    await fastify.close();
    process.exit(0);
});

// Start the server
start();

