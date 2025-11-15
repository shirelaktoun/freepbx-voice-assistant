/**
 * ARI Handler - Manages Asterisk phone calls
 * Handles incoming calls, audio bridging, and OpenAI integration
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

export class ARIHandler extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.ari = null;
        this.activeCalls = new Map();
        this.openAiSessions = new Map();
        this.audioBuffers = new Map(); // Buffer audio until OpenAI is ready
        this.fallbackTimers = new Map(); // Track fallback hangup timers
    }

    /**
     * Connect to Asterisk ARI
     */
    async connect(ariClient) {
        try {
            console.log('🔌 Connecting to Asterisk ARI...');
            
            this.ari = await ariClient.connect(
                `http://${this.config.host}:${this.config.port}`,
                this.config.username,
                this.config.password
            );

            console.log('✅ Connected to Asterisk ARI');
            
            // Set up event handlers
            this.setupEventHandlers();
            
            // Start the Stasis application
            this.ari.start(this.config.appName);
            console.log(`📱 Stasis application "${this.config.appName}" started`);
            
            return this.ari;
        } catch (error) {
            console.error('❌ Failed to connect to ARI:', error);
            throw error;
        }
    }

    /**
     * Set up ARI event handlers
     */
    setupEventHandlers() {
        // Incoming call
        this.ari.on('StasisStart', async (event, channel) => {
            await this.handleIncomingCall(event, channel);
        });

        // Call ended
        this.ari.on('StasisEnd', async (event, channel) => {
            await this.handleCallEnd(event, channel);
        });

        // Channel destroyed
        this.ari.on('ChannelDestroyed', async (event, channel) => {
            await this.handleChannelDestroyed(event, channel);
        });

        // DTMF received
        this.ari.on('ChannelDtmfReceived', (event, channel) => {
            console.log(`📟 DTMF received: ${event.digit} on ${channel.name}`);
            this.emit('dtmf', { channel: channel.id, digit: event.digit });
        });
    }

    /**
     * Handle incoming call (both inbound and outbound)
     */
    async handleIncomingCall(event, channel) {
        const callId = channel.id;
        const callerNumber = channel.caller.number;
        const callerName = channel.caller.name;

        // Ignore external media channels entering Stasis - we only handle actual phone calls
        if (channel.name && channel.name.includes('UnicastRTP')) {
            console.log('⏭️  Ignoring external media channel:', callId);
            return;
        }

        // Ignore if we're already handling this call
        if (this.activeCalls.has(callId)) {
            console.log('⏭️  Call already being handled:', callId);
            return;
        }

        // Determine if this is an outbound call
        const isOutbound = event.args && event.args.includes('outbound');
        const callDirection = isOutbound ? 'outbound' : 'inbound';

        // Determine which agent to use based on event args
        const isAccountsAgent = event.args && event.args.includes('accounts');
        const isWellbeingAgent = event.args && event.args.includes('wellbeing');
        let agentType = 'service';  // default
        let agentName = 'Sophie (Service)';  // default

        if (isAccountsAgent) {
            agentType = 'accounts';
            agentName = 'Alex (Accounts)';
        } else if (isWellbeingAgent) {
            agentType = 'wellbeing';
            agentName = 'Emma (Wellbeing)';
        }

        console.log(`📞 ${isOutbound ? 'Outbound' : 'Incoming'} call ${isOutbound ? 'to' : 'from'}: ${callerName || 'Unknown'} ${callerNumber || 'Unknown'}`);
        console.log('📞 Channel ID:', callId);
        // console.log('📞 Call Direction:', callDirection);
        console.log(`🤖 Agent: ${agentName}`);

        try {
            // Answer the call (only for inbound calls - outbound are already answered)
            if (!isOutbound) {
                await channel.answer();
                // console.log('✅ Call answered');
            } else {
                // console.log('✅ Outbound call connected');
            }

            // Log channel codec information
            // console.log('📊 Channel details:');
            // console.log('   Name:', channel.name);
            // console.log('   Connected:', channel.connected?.name || 'none');
            if (channel.nativeformats) {
                // console.log('   Native formats:', channel.nativeformats);
            }

            // Store call info
            this.activeCalls.set(callId, {
                channel,
                callerNumber,
                callerName,
                startTime: new Date(),
                direction: callDirection,
                agentType: agentType,
                bridge: null,
                externalMedia: null
            });

            // Create a bridge for mixing audio
            const bridge = this.ari.Bridge();
            await bridge.create({ type: 'mixing', name: `bridge-${callId}` });
            // console.log('🌉 Bridge created:', bridge.id);

            // Add channel to bridge
            await bridge.addChannel({ channel: callId });
            // console.log('🔗 Channel added to bridge');

            // Store bridge reference
            const callData = this.activeCalls.get(callId);
            callData.bridge = bridge;

            // Create external media channel for OpenAI audio
            const externalMedia = this.ari.Channel();
            
            let rtpHost = this.config.serverHost;
            if (!rtpHost) {
                 console.error('❌ FATAL: SERVER_HOST is not set in .env file. ARI cannot configure external media. Falling back to 127.0.0.1, which will fail.');
                 rtpHost = '127.0.0.1'; // Log error but keep old broken fallback
            }
            
            await externalMedia.externalMedia({
                app: this.config.appName,
                external_host: `${rtpHost}:${this.config.rtpPort}`, // This MUST be the public IP
                format: 'ulaw', // 8kHz ulaw - this worked for internal calls
                encapsulation: 'rtp',
                transport: 'udp',
                connection_type: 'server', // We run RTP server, Asterisk sends to us first
                direction: 'both'
            });
            // console.log('🎙️ External media channel created:', externalMedia.id);
            // console.log('   RTP endpoint configured:', `${rtpHost}:${this.config.rtpPort}`);
            // console.log('   External media channel name:', externalMedia.name);
            if (externalMedia.nativeformats) {
                // console.log('   External media native formats:', externalMedia.nativeformats);
            }

            callData.externalMedia = externalMedia;

            // Add external media to bridge
            await bridge.addChannel({ channel: externalMedia.id });
            // console.log('🔗 External media added to bridge');

            // Log bridge details to help diagnose codec issues
            // console.log('🌉 Bridge details:');
            // console.log('   Bridge ID:', bridge.id);
            // console.log('   Bridge type:', bridge.bridge_type);
            // console.log('   Channels in bridge:', bridge.channels?.length || 0);

            // Start OpenAI session for this call
            await this.startOpenAISession(callId, callerNumber);

            // Emit call started event
            this.emit('call-started', {
                callId,
                callerNumber,
                callerName,
                direction: callDirection,
                channelId: channel.id,
                bridgeId: bridge.id,
                externalMediaId: externalMedia.id,
                agentType: agentType
            });

        } catch (error) {
            console.error('❌ Error handling incoming call:', error);
            
            // Clean up on error
            try {
                await channel.hangup();
            } catch (e) {
                console.error('Error hanging up channel:', e);
            }
            
            this.activeCalls.delete(callId);
        }
    }

    /**
     * Start OpenAI Realtime session for a call
     */
    async startOpenAISession(callId, callerNumber) {
        console.log(`🤖 Starting OpenAI session for call ${callId}`);

        try {
            // Get call direction from active calls
            const callData = this.activeCalls.get(callId);
            const callDirection = callData?.direction || 'inbound';

            const openAiWs = new WebSocket(
                'wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview',
                {
                    headers: {
                        'Authorization': `Bearer ${this.config.openaiApiKey}`,
                        'OpenAI-Beta': 'realtime=v1'
                    }
                }
            );

            // Store session reference
            this.openAiSessions.set(callId, {
                ws: openAiWs,
                callerNumber,
                startTime: new Date(),
                vadEnabled: false,
                direction: callDirection,
                hasActiveResponse: false
            });

            // Set up OpenAI WebSocket handlers
            openAiWs.on('open', () => {
                console.log('✅ OpenAI session connected for call', callId);
                console.log(`📞 Call direction: ${callDirection}`);

                // Initialize session with configuration
                this.initializeOpenAISession(openAiWs, callId, callerNumber, callDirection);
            });

            openAiWs.on('message', (data) => {
                this.handleOpenAIMessage(callId, data);
            });

            openAiWs.on('close', () => {
                console.log('🔌 OpenAI session closed for call', callId);
                this.openAiSessions.delete(callId);
            });

            openAiWs.on('error', (error) => {
                console.error('❌ OpenAI WebSocket error:', error);
            });

        } catch (error) {
            console.error('❌ Error starting OpenAI session:', error);
            throw error;
        }
    }

    /**
     * Initialize OpenAI session configuration
     */
    initializeOpenAISession(openAiWs, callId, callerNumber, callDirection = 'inbound') {
        // Get call data to determine agent type
        const callData = this.activeCalls.get(callId);
        const agentType = callData?.agentType || 'service';
        const isAccountsAgent = agentType === 'accounts';
        const isWellbeingAgent = agentType === 'wellbeing';

        // Select appropriate configuration based on agent type
        let systemMessage, tools, agentName;

        if (isAccountsAgent) {
            systemMessage = this.config.accountsSystemMessage;
            tools = this.config.accountsTools;
            agentName = 'Alex (Accounts)';
        } else if (isWellbeingAgent) {
            systemMessage = this.config.wellbeingSystemMessage;
            tools = this.config.wellbeingTools;
            agentName = 'Emma (Wellbeing)';
        } else {
            systemMessage = this.config.systemMessage;
            tools = this.config.tools;
            agentName = 'Sophie (Service)';
        }

        console.log(`🤖 Initializing OpenAI session for ${agentName}`);

        // Configure OpenAI to use g711_ulaw (8kHz)
        // This format worked for internal calls
        // Select voice based on agent type: echo (male) for Alex, shimmer (female) for Sophie/Emma
        let voice = 'shimmer';  // default for Sophie and Emma
        if (isAccountsAgent) {
            voice = 'echo';  // male voice for Alex
        }
        console.log(`🎤 Selected voice: ${voice} (Agent type: ${agentType})`);

        const sessionUpdate = {
            type: 'session.update',
            session: {
                turn_detection: null,  // Disabled initially - enable after greeting
                input_audio_format: 'g711_ulaw',  // 8kHz ulaw from Asterisk
                output_audio_format: 'g711_ulaw', // 8kHz ulaw back to Asterisk
                voice: voice,
                instructions: systemMessage,
                modalities: ['audio', 'text'],
                temperature: 0.8,
                tools: tools || []
            }
        };

        openAiWs.send(JSON.stringify(sessionUpdate));
        console.log('📤 Sent session configuration (using 8kHz g711_ulaw)');

        console.log('✅ Session ready - sending greeting...');

        // Determine greeting based on call direction and agent type
        let greetingText;
        if (callDirection === 'outbound') {
            // Outbound call greeting
            if (isAccountsAgent) {
                greetingText = this.config.accountsOutboundGreeting || "Hello! This is Alex calling from Deepcut Garage accounts department. Is this a good time to discuss your account?";
            } else if (isWellbeingAgent) {
                greetingText = this.config.wellbeingOutboundGreeting || "Hello, this is Emma calling to check in on you. I hope this is a good time. How have you been feeling lately?";
            } else {
                greetingText = this.config.outboundGreeting || "Hello! This is Sophie calling from Deepcut Garage. I hope I'm not catching you at a bad time.";
            }
            console.log(`📤 Using OUTBOUND greeting for ${agentName}`);
        } else {
            // Inbound call greeting (default)
            if (isAccountsAgent) {
                greetingText = this.config.accountsInboundGreeting || "Hello, thank you for calling Deepcut Garage accounts department. This is Alex, your AI accounts assistant. How can I help you with your account today?";
            } else if (isWellbeingAgent) {
                greetingText = this.config.wellbeingInboundGreeting || "Hello, this is Emma. Thank you for calling. I'm here to support you and check in on how you're doing. How are you feeling today?";
            } else {
                greetingText = this.config.inboundGreeting || "Hello, thank you for calling Deepcut Garage. This is Sophie, your AI assistant. How can I help you today?";
            }
            console.log(`📤 Using INBOUND greeting for ${agentName}`);
        }

        // Create a conversation item that represents the greeting we're about to play
        // Mark it as 'assistant' role so AI knows it already said this
        const conversationItem = {
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'assistant',
                content: [
                    {
                        type: 'text',
                        text: greetingText
                    }
                ]
            }
        };
        openAiWs.send(JSON.stringify(conversationItem));

        // Request a response to generate the greeting audio
        // The AI will speak the greeting and then STOP (not continue)
        const responseCreate = {
            type: 'response.create',
            response: {
                modalities: ['audio', 'text']
            }
        };
        openAiWs.send(JSON.stringify(responseCreate));

        console.log('📤 Requesting initial greeting with audio...');

        // ---
        // *** START OF CHANGE ***
        //
        // We are REMOVING the audio buffer flush from here.
        // We will now flush it in handleOpenAIMessage *after* this
        // greeting response is complete.
        //
        /*
        if (this.audioBuffers.has(callId)) {
            const bufferedAudio = this.audioBuffers.get(callId);
            console.log(`📦 Flushing ${bufferedAudio.length} buffered audio packets to OpenAI (after greeting request)`);
            bufferedAudio.forEach(audio => {
                openAiWs.send(JSON.stringify({
                    type: 'input_audio_buffer.append',
                    audio: audio
                }));
            });
            this.audioBuffers.delete(callId);
        }
        */
        //
        // *** END OF CHANGE ***
    }

    /**
     * Handle OpenAI WebSocket messages
     */
    handleOpenAIMessage(callId, data) {
        try {
            const message = JSON.parse(data.toString());
            
            // --- MODIFIED LINE: Added 'response.audio.delta' to the log filter ---
            if (['session.created', 'response.done', 'error', 'response.audio.delta'].includes(message.type)) {
                console.log(`📩 OpenAI event for ${callId}:`, message.type);
            }

            if (message.type === 'error') {
                console.error(`❌ OpenAI Error for call ${callId}:`, JSON.stringify(message.error, null, 2));
                return;
            }

            // Handle interruptions - when user starts speaking, cancel ongoing response
            if (message.type === 'input_audio_buffer.speech_started') {
                console.log(`🎤 User started speaking on ${callId}`);
                const session = this.openAiSessions.get(callId);
                if (session && session.ws && session.ws.readyState === 1) {
                    // Only cancel if there's an active response
                    if (session.hasActiveResponse) {
                        session.ws.send(JSON.stringify({
                            type: 'response.cancel'
                        }));
                        console.log(`⏸️  Cancelled active response for interruption on ${callId}`);
                        session.hasActiveResponse = false;
                    }

                    // Always clear the RTP audio queue to stop playback immediately
                    const callData = this.activeCalls.get(callId);
                    if (callData && callData.externalMediaId) {
                        this.emit('clear-audio-queue', callData.externalMediaId);
                    }
                }
                return;
            }

            // Log when speech ends (for debugging)
            if (message.type === 'input_audio_buffer.speech_stopped') {
                console.log(`🔇 User stopped speaking on ${callId}`);
                return;
            }

            // Handle when a response gets cancelled
            if (message.type === 'response.cancelled') {
                console.log(`🚫 Response cancelled for ${callId} (likely due to interruption)`);
                return;
            }

            if (message.type === 'response.done') {
                console.log(`🔍 Response details for ${callId}:`, JSON.stringify({
                    id: message.response?.id,
                    status: message.response?.status,
                    output_length: message.response?.output?.length,
                    modalities: message.response?.modalities,
                    has_audio: message.response?.output?.some(o => o.type === 'audio'),
                    output_types: message.response?.output?.map(o => o.type)
                }, null, 2));

                // DEBUG: Log the full output structure to understand message format
                if (message.response?.output && message.response.output.length > 0) {
                    console.log(`🐛 DEBUG - Full output structure:`, JSON.stringify(message.response.output, null, 2));
                }
                
                const session = this.openAiSessions.get(callId);
                // Clear active response flag
                if (session) {
                    session.hasActiveResponse = false;
                }
                if (session && !session.vadEnabled) {
                    console.log('🎙️ Enabling server VAD for conversation...');
                    session.ws.send(JSON.stringify({
                        type: 'session.update',
                        session: {
                            turn_detection: { 
                                type: 'server_vad',
                                threshold: 0.5,
                                prefix_padding_ms: 300,
                                silence_duration_ms: 500
                            }
                        }
                    }));
                    session.vadEnabled = true; // Mark as enabled

                    // ---
                    // *** START OF CHANGE ***
                    //
                    // Now that the first greeting is done and VAD is enabled,
                    // flush any audio that was buffered during the greeting.
                    // This ensures the caller's initial audio is processed
                    // as a response to the greeting, not as part of it.
                    //
                    if (this.audioBuffers.has(callId)) {
                        const bufferedAudio = this.audioBuffers.get(callId);
                        console.log(`📦 Flushing ${bufferedAudio.length} buffered audio packets (after greeting)`);
                        
                        // Check if session.ws is still valid before using it
                        if (session.ws && session.ws.readyState === WebSocket.OPEN) {
                            bufferedAudio.forEach(audio => {
                                session.ws.send(JSON.stringify({
                                    type: 'input_audio_buffer.append',
                                    audio: audio
                                }));
                            });
                        } else {
                            console.warn(`⚠️  Session closed before buffer for ${callId} could be flushed.`);
                        }
                        this.audioBuffers.delete(callId);
                    }
                    //
                    // *** END OF CHANGE ***
                }
            }

            // Forward audio to caller
            if (message.type === 'response.audio.delta' && message.delta) {
                // Track that we have an active response
                const session = this.openAiSessions.get(callId);
                if (session) {
                    session.hasActiveResponse = true;
                }
                // Debug: log first audio delta
                if (!this._audioDeltaLogged) {
                    this._audioDeltaLogged = true;
                    console.log(`🎤 Received first audio delta from OpenAI for call ${callId}`);
                }
                this.forwardAudioToCaller(callId, message.delta);
            }

            // Handle function calls
            if (message.type === 'response.done' && message.response.output) {
                let hasFunctionCall = false;
                let hasGoodbyeMessage = false;

                console.log(`🔍 Checking ${message.response.output.length} output items for function calls and goodbye...`);

                message.response.output.forEach((item, index) => {
                    console.log(`   Item ${index}: type=${item.type}`);

                    if (item.type === 'function_call') {
                        hasFunctionCall = true;
                        console.log(`   ✅ Found function_call: ${item.name}`);
                        this.handleFunctionCall(callId, item);
                    }
                    // Check if AI said goodbye without calling end_call
                    if (item.type === 'message' && item.content) {
                        console.log(`   📝 Message item with ${item.content.length} content parts`);
                        item.content.forEach((content, cIndex) => {
                            console.log(`      Content ${cIndex}: type=${content.type}`);

                            // Check both text content and audio transcript
                            let textToCheck = null;
                            if (content.type === 'text' && content.text) {
                                textToCheck = content.text;
                                console.log(`      Text preview: "${content.text.substring(0, 80)}..."`);
                            } else if (content.type === 'audio' && content.transcript) {
                                textToCheck = content.transcript;
                                console.log(`      Audio transcript: "${content.transcript.substring(0, 80)}..."`);
                            }

                            if (textToCheck) {
                                const text = textToCheck.toLowerCase();

                                // Smarter goodbye detection - check for actual closing phrases
                                // Exclude false positives like "take care of yourself" (health question)
                                const hasGoodbye =
                                    text.includes('goodbye') ||
                                    text.includes('good bye') ||
                                    text.match(/bye/) || // word boundary to avoid "maybe"
                                    text.includes('have a great day') ||
                                    text.includes('have a good day') ||
                                    text.includes('talk to you later') ||
                                    text.includes('thanks for calling') ||
                                    text.includes('thank you for calling') ||
                                    // Only detect "take care" if NOT followed by "of"
                                    (text.includes('take care') && !text.includes('take care of'));

                                if (hasGoodbye) {
                                    hasGoodbyeMessage = true;
                                    console.log(`      👋 DETECTED GOODBYE IN ${content.type.toUpperCase()}: "${textToCheck.substring(0, 100)}..."`);
                                }
                            }
                        });
                    }
                });

                // Warning if AI said goodbye but didn't call end_call
                if (hasGoodbyeMessage && !hasFunctionCall) {
                    console.warn(`⚠️  WARNING: AI said goodbye to ${callId} but did NOT call end_call function!`);
                    console.warn(`   🔧 FALLBACK: Automatically hanging up in 4 seconds...`);

                    // Clear any existing fallback timer for this call
                    if (this.fallbackTimers.has(callId)) {
                        clearTimeout(this.fallbackTimers.get(callId));
                    }

                    // FALLBACK: Automatically hang up the call after a delay
                    const timer = setTimeout(async () => {
                        try {
                            console.log(`📵 FALLBACK hangup triggered for ${callId}`);
                            await this.hangupCall(callId);
                            console.log(`✅ Call ${callId} ended via fallback mechanism`);
                            this.fallbackTimers.delete(callId);
                        } catch (error) {
                            console.error(`❌ Failed to hang up call ${callId} via fallback:`, error);
                            this.fallbackTimers.delete(callId);
                        }
                    }, 4000); // Wait 4 seconds for goodbye message to finish

                    this.fallbackTimers.set(callId, timer);
                }
            }

            this.emit('openai-message', { callId, message });

        } catch (error) {
            console.error('❌ Error handling OpenAI message:', error);
        }
    }

    /**
     * Forward audio from OpenAI to caller via external media channel
     */
    forwardAudioToCaller(callId, audioBase64) {
        const callData = this.activeCalls.get(callId);
        if (!callData) {
            console.error('❌ No callData found for call', callId);
            console.error('   Active calls:', Array.from(this.activeCalls.keys()));
            return;
        }
        if (!callData.externalMedia) {
            console.error('❌ No externalMedia in callData for call', callId);
            console.error('   CallData keys:', Object.keys(callData));
            return;
        }
        const externalMediaId = callData.externalMedia.id;

        // Debug: log first audio forward
        if (!this._audioForwardLogged) {
            this._audioForwardLogged = true;
            console.log(`🎵 Forwarding audio to caller:`);
            console.log(`   Phone channel: ${callId}`);
            console.log(`   External media: ${externalMediaId}`);
            console.log(`   Audio size: ${audioBase64.length} chars (base64)`);
        }

        this.emit('audio-to-caller', { callId: externalMediaId, audio: audioBase64 });
    }

    /**
     * Forward audio from caller to OpenAI
     */
    forwardAudioToOpenAI(callId, audioBase64) {
        const session = this.openAiSessions.get(callId);
        if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
            if (!this.audioBuffers.has(callId)) {
                this.audioBuffers.set(callId, []);
            }
            this.audioBuffers.get(callId).push(audioBase64);
            
            const buffer = this.audioBuffers.get(callId);
            if (buffer.length > 150) { // ~3 seconds of 20ms packets
                buffer.shift(); // Remove oldest
            }
            return;
        }

        try {
            session.ws.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: audioBase64
            }));
        } catch (error) {
            console.error('❌ Error forwarding audio to OpenAI:', error);
        }
    }

    /**
     * Handle function calls from OpenAI
     */
    async handleFunctionCall(callId, functionCall) {
        console.log(`🔧 Function call for ${callId}:`, functionCall.name);
        this.emit('function-call', { callId, functionCall });
    }

    /**
     * Send function result back to OpenAI
     */
    sendFunctionResult(callId, functionCallId, result) {
        const session = this.openAiSessions.get(callId);
        if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
            console.error('❌ OpenAI session not available for call', callId);
            return;
        }

        try {
            const response = {
                type: 'conversation.item.create',
                item: {
                    type: 'function_call_output',
                    call_id: functionCallId,
                    output: JSON.stringify(result)
                }
            };

            session.ws.send(JSON.stringify(response));
            
            session.ws.send(JSON.stringify({ 
                type: 'response.create',
                response: {
                    modalities: ['audio', 'text']
                }
            }));
            
            console.log('✅ Function result sent to OpenAI');
        } catch (error) {
            console.error('❌ Error sending function result:', error);
        }
    }

    /**
     * Handle call end
     */
    async handleCallEnd(event, channel) {
        const callId = channel.id;
        console.log('📵 Call ending:', callId);

        const callData = this.activeCalls.get(callId);
        if (!callData) {
            return;
        }

        try {
            const session = this.openAiSessions.get(callId);
            if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
                session.ws.close();
            }
            this.openAiSessions.delete(callId);

            if (callData.bridge) {
                try {
                    await callData.bridge.destroy();
                } catch (e) {
                    console.error('Error destroying bridge:', e);
                }
            }

            if (callData.externalMedia) {
                try {
                    await callData.externalMedia.hangup();
                } catch (e) {
                    console.error('Error hanging up external media:', e);
                }
            }

            const duration = Math.round((new Date() - callData.startTime) / 1000);
            console.log(`📞 Call ended. Duration: ${duration}s`);

            this.emit('call-ended', {
                callId,
                channelId: callId,
                callerNumber: callData.callerNumber,
                duration,
                direction: callData.direction,
                agentType: callData.agentType
            });

        } catch (error) {
            console.error('❌ Error handling call end:', error);
        } finally {
            // Clear fallback timer if exists
            if (this.fallbackTimers.has(callId)) {
                clearTimeout(this.fallbackTimers.get(callId));
                this.fallbackTimers.delete(callId);
                console.log(`   Cleared fallback timer for ${callId}`);
            }

            this.activeCalls.delete(callId);
            this.audioBuffers.delete(callId); // Clean up audio buffer
        }
    }

    /**
     * Handle channel destroyed
     */
    async handleChannelDestroyed(event, channel) {
        const callId = channel.id;
        console.log('💥 Channel destroyed:', callId);
        console.log('   Channel name:', channel.name);
        console.log('   Was in activeCalls:', this.activeCalls.has(callId));

        this.activeCalls.delete(callId);
        
        const session = this.openAiSessions.get(callId);
        if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
            session.ws.close();
        }
        this.openAiSessions.delete(callId);
    }

    /**
     * Get active call info
     */
    getCallInfo(callId) {
        return this.activeCalls.get(callId);
    }

    /**
     * Get all active calls
     */
    getActiveCalls() {
        return Array.from(this.activeCalls.entries()).map(([id, data]) => ({
            callId: id,
            callerNumber: data.callerNumber,
            callerName: data.callerName,
            direction: data.direction || 'inbound',
            startTime: data.startTime,
            duration: Math.round((new Date() - data.startTime) / 1000)
        }));
    }

    /**
     * Hangup a call
     */
    async hangupCall(callId) {
        const callData = this.activeCalls.get(callId);
        if (!callData) {
            throw new Error(`Call ${callId} not found`);
        }

        try {
            await callData.channel.hangup();
            console.log(`✅ Hung up call ${callId}`);
        } catch (error) {
            console.error(`❌ Error hanging up call ${callId}:`, error);
            throw error;
        }
    }

    /**
     * Make an outbound call with automatic endpoint detection
     */
    async makeOutboundCall(options) {
        const { destination, context, callerId, variables, technology } = options;

        if (!this.ari) {
            throw new Error('ARI not connected');
        }

        console.log(`📞 Originating outbound call to ${destination}`);
        console.log(`   Context: ${context || 'from-internal'}`);
        console.log(`   Caller ID: ${callerId || 'Unknown'}`);

        try {
            // Create the outbound channel using ARI originate
            const channel = this.ari.Channel();

            // Prepare channel variables
            const channelVars = {
                OUTBOUND_ASSISTANT: 'true',
                ...variables
            };

            // Build endpoint string
            // ALWAYS use Local channel to route through dialplan
            // This ensures outbound routes, digit manipulation, and all FreePBX rules apply
            let endpoint;
            let technologies = ['Local'];

            // Use the specified context or default to from-internal
            const dialContext = context || 'from-internal';

            // Remove + prefix if present
            const cleanNumber = destination.replace(/^\+/, '');
            endpoint = `Local/${cleanNumber}@${dialContext}`;

            console.log(`   Endpoint: ${endpoint}`);
            console.log(`   Context: ${dialContext}`);
            console.log(`   Routing through FreePBX dialplan for outbound routes`);

            // Try to originate the call
            let lastError = null;
            for (let i = 0; i < technologies.length; i++) {
                const tech = technologies[i];
                // Always use Local channel with dialplan context
                let tryEndpoint = `Local/${cleanNumber}@${dialContext}`;

                try {
                    console.log(`   Trying endpoint: ${tryEndpoint}`);

                    await channel.originate({
                        endpoint: tryEndpoint,
                        app: this.config.appName,
                        appArgs: 'outbound',
                        callerId: callerId,
                        timeout: 30,
                        variables: channelVars
                    });

                    console.log(`✅ Outbound call originated: ${channel.id}`);
                    console.log(`   Successful technology: ${tech}`);
                    console.log(`   Waiting for call to be answered...`);

                    return {
                        callId: channel.id,
                        destination: destination,
                        status: 'originated',
                        technology: tech
                    };

                } catch (err) {
                    console.log(`   ❌ Failed with ${tech}: ${err.message || JSON.stringify(err)}`);
                    lastError = err;

                    // If this is not the last technology to try, continue
                    if (i < technologies.length - 1) {
                        console.log(`   Trying next technology...`);
                        continue;
                    }
                }
            }

            // If we get here, all technologies failed
            console.error('❌ All endpoint technologies failed');
            console.error('   Troubleshooting tips:');
            console.error(`   1. Check if extension/number ${destination} exists in FreePBX`);
            console.error(`   2. Verify the technology (run: asterisk -rx "pjsip show endpoints" or "sip show peers")`);
            console.error(`   3. Check dialplan context exists (run: asterisk -rx "dialplan show ${context || 'from-internal'}")`);
            console.error(`   4. Verify ARI user has originate permissions`);
            console.error(`   5. Check Asterisk logs: tail -f /var/log/asterisk/full`);

            throw new Error(`Failed to originate call to ${destination}. Last error: ${lastError?.message || JSON.stringify(lastError)}. Check server logs for details.`);

        } catch (error) {
            console.error('❌ Error originating outbound call:', error);
            throw error;
        }
    }

    /**
     * Check if an endpoint is online/registered
     */
    async isEndpointOnline(extension) {
        if (!this.ari) {
            throw new Error('ARI not connected');
        }

        try {
            const endpoints = await this.ari.endpoints.list();

            // Look for the endpoint with matching resource
            const endpoint = endpoints.find(ep =>
                ep.technology === 'PJSIP' && ep.resource === extension
            );

            if (!endpoint) {
                console.log(`⚠️  Endpoint ${extension} not found`);
                return false;
            }

            const isOnline = endpoint.state === 'online';
            console.log(`📱 Endpoint ${extension} status: ${endpoint.state}`);

            return isOnline;
        } catch (error) {
            console.error(`❌ Error checking endpoint status for ${extension}:`, error);
            return false; // Assume offline if we can't check
        }
    }

    /**
     * Transfer a call to another extension
     */
    async transferCall(callId, extension, reason) {
        const callData = this.activeCalls.get(callId);
        if (!callData) {
            throw new Error(`Call ${callId} not found`);
        }

        console.log(`🔀 Transferring call ${callId} to extension ${extension}`);
        console.log(`   Reason: ${reason}`);

        try {
            const channel = callData.channel;

            // Clear fallback timer if exists (important for transfers)
            if (this.fallbackTimers.has(callId)) {
                clearTimeout(this.fallbackTimers.get(callId));
                this.fallbackTimers.delete(callId);
                console.log('   Cleared fallback timer before transfer');
            }

            // Close OpenAI session first
            const session = this.openAiSessions.get(callId);
            if (session && session.ws && session.ws.readyState === 1) {
                console.log('   Closing OpenAI session...');
                session.ws.close();
            }
            this.openAiSessions.delete(callId);

            // Hangup external media channel
            if (callData.externalMedia) {
                console.log('   Hanging up external media channel...');
                try {
                    await callData.externalMedia.hangup();
                } catch (e) {
                    console.log('   External media hangup failed:', e.message);
                }
            }

            // Destroy the bridge
            if (callData.bridge) {
                console.log('   Destroying AI bridge...');
                try {
                    await callData.bridge.destroy();
                } catch (e) {
                    console.log('   Bridge destruction failed:', e.message);
                }
            }

            // ---
            // *** START OF CHANGE ***
            //
            // Send the call back to the FreePBX dialplan to handle the transfer.
            // This is the most reliable way to transfer in FreePBX as it respects
            // all dialplan logic like follow-me, call forwarding, and voicemail.
            console.log(`   Sending call to dialplan: context=from-internal, extension=${extension}`);

            try {
                await channel.continueInDialplan({
                    context: 'from-internal',
                    extension: extension,
                    priority: 1
                });

                console.log(`✅ Call ${callId} sent to dialplan to dial ${extension}`);

            } catch (dialplanError) {
                console.error(`   ❌ Failed to send call to dialplan:`, dialplanError.message);
                console.error(`   ❌ Transfer for call ${callId} to ${extension} has failed.`);
                // We re-throw the error so the caller knows it failed.
                throw new Error(`Dialplan transfer failed: ${dialplanError.message}`);
            }
            //
            // *** END OF CHANGE ***
            //

            // Clean up call data
            this.activeCalls.delete(callId);
            this.audioBuffers.delete(callId);

            // Emit transfer event
            this.emit('call-transferred', {
                callId,
                extension,
                reason,
                callerNumber: callData.callerNumber
            });

        } catch (error) {
            console.error(`❌ Error transferring call ${callId}:`, error);
            throw error;
        }
    }

    /**
     * Disconnect from ARI
     */
    async disconnect() {
        console.log('🔌 Disconnecting from ARI...');

        for (const [callId] of this.activeCalls) {
            try {
                await this.hangupCall(callId);
            } catch (error) {
                console.error(`Error hanging up call ${callId}:`, error);
            }
        }

        if (this.ari) {
            this.ari.stop();
            console.log('✅ Disconnected from ARI');
        }
    }
}

export default ARIHandler;




