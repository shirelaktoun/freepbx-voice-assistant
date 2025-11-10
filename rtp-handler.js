/**
 * RTP Handler
 * Manages RTP audio streams between Asterisk and OpenAI
 * Uses g711_ulaw (8kHz) format - no conversion needed
 */

import dgram from 'dgram';
import { EventEmitter } from 'events';

export class RTPHandler extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.socket = null;
        this.sessions = new Map(); // callId -> session info
        this.packetQueues = new Map(); // callId -> array of packets to send
        this.queueTimers = new Map(); // callId -> timer handle
        this.keepaliveTimers = new Map(); // callId -> keepalive timer handle
    }

    /**
     * Start RTP server
     */
    start() {
        return new Promise((resolve, reject) => {
            this.socket = dgram.createSocket('udp4');

            this.socket.on('message', (msg, rinfo) => {
                this.handleRTPPacket(msg, rinfo);
            });

            this.socket.on('error', (error) => {
                console.error('❌ RTP socket error:', error);
                this.emit('error', error);
            });

            this.socket.on('listening', () => {
                const address = this.socket.address();
                console.log(`🎙️ RTP server listening on ${address.address}:${address.port}`);
                resolve(address);
            });

            try {
                this.socket.bind(this.config.port, this.config.host);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Handle incoming RTP packet from Asterisk
     */
    handleRTPPacket(packet, rinfo) {
        try {
            if (packet.length < 12) {
                return; // Invalid packet
            }

            const payloadType = packet[1] & 0x7F;
            const ssrc = packet.readUInt32BE(8);

            // Expect payload type 0 for PCMU/ulaw
            if (payloadType !== 0) {
                console.warn(`⚠️  Unexpected payload type ${payloadType}, expected 0 for ulaw`);
            }

            let session = this.findSessionBySSRC(ssrc);
            let isNewEndpoint = false;
            
            if (!session) {
                session = this.findPendingSession();
                if (session) {
                    session.remoteAddress = rinfo.address;
                    session.remotePort = rinfo.port;
                    session.remoteSSRC = ssrc;
                    isNewEndpoint = true;
                    console.log(`✅ RTP session ${session.callId} learned remote endpoint:`);
                    console.log(`   Remote: ${rinfo.address}:${rinfo.port}`);
                    console.log(`   Remote SSRC: ${ssrc}`);
                }
            }
            
            if (session) {
                if (isNewEndpoint && session.pendingAudio.length > 0) {
                    console.log(`📦 Flushing ${session.pendingAudio.length} queued audio packets to ${session.callId}`);
                    session.pendingAudio.forEach(audioBase64 => {
                        this.sendRTPPacket(session.callId, audioBase64);
                    });
                    session.pendingAudio = [];
                }

                // Asterisk sends ulaw (8kHz), convert to base64 for OpenAI
                const headerLength = 12 + ((packet[0] & 0x0F) * 4);
                const audioPayload = packet.slice(headerLength);
                const openAIAudio = audioPayload.toString('base64');
                
                this.emit('audio', {
                    callId: session.callId,
                    audio: openAIAudio
                });

                session.packetsReceived++;
                session.lastPacketTime = Date.now();
            } else {
                console.log(`⚠️  Received RTP from unknown SSRC ${ssrc} at ${rinfo.address}:${rinfo.port}`);
            }

        } catch (error) {
            console.error('❌ Error handling RTP packet:', error);
        }
    }

    /**
     * Send RTP packet to Asterisk
     */
    sendRTPPacket(callId, audioBase64) {
        const session = this.sessions.get(callId);
        if (!session) {
            console.error(`❌ No RTP session found for call ${callId}`);
            return;
        }

        if (!session.remoteAddress || !session.remotePort) {
            console.warn(`⚠️  RTP session ${session.callId} doesn't have remote endpoint yet, queueing audio`);
            session.pendingAudio.push(audioBase64);
            return;
        }

        try {
            // OpenAI sends g711_ulaw (8kHz) as base64
            const asteriskAudio = Buffer.from(audioBase64, 'base64');

            // Split large audio chunks into proper RTP packet sizes
            const PACKET_SIZE = 160; // 160 bytes = 20ms at 8kHz

            // Debug: log the first packet
            if (session.packetsSent === 0) {
                console.log(`📦 First RTP packet for ${callId}:`);
                console.log(`   Audio chunk size: ${asteriskAudio.length} bytes`);
                console.log(`   Will split into ${Math.ceil(asteriskAudio.length / PACKET_SIZE)} packets of ${PACKET_SIZE} bytes`);
                console.log(`   Remote: ${session.remoteAddress}:${session.remotePort}`);
            }

            // Initialize packet queue for this call if needed
            if (!this.packetQueues.has(callId)) {
                this.packetQueues.set(callId, []);
            }

            // Split audio into packets and add to queue
            for (let offset = 0; offset < asteriskAudio.length; offset += PACKET_SIZE) {
                const chunk = asteriskAudio.slice(offset, offset + PACKET_SIZE);
                this.packetQueues.get(callId).push(chunk);
            }

            // Start packet sender if not already running
            if (!this.queueTimers.has(callId)) {
                const queue = this.packetQueues.get(callId);
                // Wait until we have at least 100ms of audio buffered before starting
                // This prevents jitter from queue running empty
                if (queue.length >= 5) { // 5 packets = 100ms
                    this.startPacketSender(callId);
                }
            }

        } catch (error) {
            console.error('❌ Error queueing RTP packets:', error);
        }
    }

    /**
     * Start sending packets from queue at 20ms intervals
     */
    startPacketSender(callId) {
        const sendNextPacket = () => {
            const session = this.sessions.get(callId);
            const queue = this.packetQueues.get(callId);

            if (!session || !queue) {
                this.stopPacketSender(callId);
                return;
            }

            if (queue.length === 0) {
                // Queue empty, stop timer and wait for more audio
                // Timer will restart when buffer threshold is reached
                this.stopPacketSender(callId);
                return;
            }

            const chunk = queue.shift();

            const header = Buffer.alloc(12);
            header[0] = 0x80;
            header[1] = 0; // Payload type 0 for PCMU/ulaw

            header.writeUInt16BE(session.sequenceNumber, 2);
            session.sequenceNumber = (session.sequenceNumber + 1) & 0xFFFF;

            header.writeUInt32BE(session.timestamp >>> 0, 4);
            session.timestamp = ((session.timestamp + chunk.length) & 0xFFFFFFFF) >>> 0;

            header.writeUInt32BE(session.ssrc >>> 0, 8);

            const packet = Buffer.concat([header, chunk]);

            this.socket.send(packet, session.remotePort, session.remoteAddress, (error) => {
                if (error) {
                    console.error('❌ Error sending RTP packet:', error);
                } else {
                    session.packetsSent++;
                    if (session.packetsSent % 50 === 0) {
                        console.log(`📡 Sent ${session.packetsSent} RTP packets (queue: ${queue.length})`);
                    }
                }
            });
        };

        // Send packets every 20ms
        const timer = setInterval(sendNextPacket, 20);
        this.queueTimers.set(callId, timer);
    }

    /**
     * Stop packet sender for a call
     */
    stopPacketSender(callId) {
        const timer = this.queueTimers.get(callId);
        if (timer) {
            clearInterval(timer);
            this.queueTimers.delete(callId);
        }
        this.packetQueues.delete(callId);
    }

    /**
     * Create RTP session for a call
     */
    createSession(callId, remoteAddress = null, remotePort = null) {
        const session = {
            callId,
            remoteAddress,
            remotePort,
            remoteSSRC: null,
            ssrc: (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0),
            sequenceNumber: Math.floor(Math.random() * 0xFFFF),
            timestamp: (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0),
            packetsReceived: 0,
            packetsSent: 0,
            lastPacketTime: null,
            createdAt: Date.now(),
            pendingAudio: []
        };

        this.sessions.set(callId, session);
        console.log(`✅ RTP session created for call ${callId}`);
        if (remoteAddress && remotePort) {
            console.log(`   Remote: ${remoteAddress}:${remotePort}`);
        } else {
            console.log(`   Remote endpoint will be learned from first RTP packet`);
        }
        console.log(`   Local SSRC: ${session.ssrc}`);

        // Start keepalive timer to prevent RTP timeout during silence
        this.startKeepalive(callId);

        return session;
    }

    /**
     * Start sending keepalive (silence) packets to prevent RTP timeout
     * Sends a silence packet every 100ms when no audio is being sent
     */
    startKeepalive(callId) {
        // Clear existing keepalive if any
        if (this.keepaliveTimers.has(callId)) {
            clearInterval(this.keepaliveTimers.get(callId));
        }

        const session = this.sessions.get(callId);
        if (!session) return;

        // Send silence packets every 100ms (5 packets to match our 100ms threshold)
        const keepaliveInterval = setInterval(() => {
            const currentSession = this.sessions.get(callId);
            if (!currentSession) {
                clearInterval(keepaliveInterval);
                this.keepaliveTimers.delete(callId);
                return;
            }

            // Only send keepalive if we're not actively sending audio
            const queue = this.packetQueues.get(callId);
            if (!queue || queue.length === 0) {
                // Send a silence packet (0xFF is ulaw silence)
                const silencePayload = Buffer.alloc(160, 0xFF); // 160 bytes = 20ms at 8kHz

                if (currentSession.remoteAddress && currentSession.remotePort) {
                    this.sendRawRTPPacket(callId, silencePayload);
                }
            }
        }, 100); // Every 100ms

        this.keepaliveTimers.set(callId, keepaliveInterval);
        console.log(`✅ RTP keepalive started for call ${callId}`);
    }

    /**
     * Send a raw RTP packet (used for keepalive silence packets)
     */
    sendRawRTPPacket(callId, payload) {
        const session = this.sessions.get(callId);
        if (!session || !session.remoteAddress || !session.remotePort) {
            return;
        }

        try {
            const header = Buffer.alloc(12);
            header[0] = 0x80;
            header[1] = 0; // Payload type 0 for PCMU/ulaw

            header.writeUInt16BE(session.sequenceNumber, 2);
            session.sequenceNumber = (session.sequenceNumber + 1) & 0xFFFF;

            header.writeUInt32BE(session.timestamp >>> 0, 4);
            session.timestamp = ((session.timestamp + payload.length) & 0xFFFFFFFF) >>> 0;

            header.writeUInt32BE(session.ssrc >>> 0, 8);

            const packet = Buffer.concat([header, payload]);

            this.socket.send(packet, session.remotePort, session.remoteAddress, (error) => {
                if (error) {
                    console.error('❌ Error sending keepalive RTP packet:', error);
                }
            });
        } catch (error) {
            console.error('❌ Error creating keepalive packet:', error);
        }
    }

    /**
     * Stop keepalive timer
     */
    stopKeepalive(callId) {
        if (this.keepaliveTimers.has(callId)) {
            clearInterval(this.keepaliveTimers.get(callId));
            this.keepaliveTimers.delete(callId);
            console.log(`   Stopped keepalive for ${callId}`);
        }
    }

    // --- Utility functions for audio conversion ---

    /**
     * Converts 16-bit PCM buffer to 8-bit U-law buffer
     */
    pcm16ToUlaw(pcmBuffer) {
        const ulawBuffer = Buffer.alloc(pcmBuffer.length / 2);
        for (let i = 0; i < ulawBuffer.length; i++) {
            const sample = pcmBuffer.readInt16LE(i * 2);
            ulawBuffer.writeUInt8(this.linearToUlaw(sample), i);
        }
        return ulawBuffer;
    }

    /**
     * μ-law compression algorithm
     */
    linearToUlaw(sample) {
        const BIAS = 0x84; // 132
        const MAX_SAMPLE = 32635;
        const SIGN_BIT = 0x80;
        const QUANT_MASK = 0x0F;
        const SEG_MASK = 0x70;
        const SEG_SHIFT = 4;

        if (sample < -MAX_SAMPLE) sample = -MAX_SAMPLE;
        if (sample > MAX_SAMPLE) sample = MAX_SAMPLE;

        let sign = (sample & 0x8000) != 0;
        if (sign) sample = -sample;

        sample += BIAS;

        let exponent = 7;
        for (let i = 0x4000; i > sample; i >>= 1) {
            exponent--;
        }
        
        let mantissa = (sample >> (exponent + 3)) & QUANT_MASK;
        let ulaw = (sign ? 0 : SIGN_BIT) | (exponent << SEG_SHIFT) | mantissa;
        return ~ulaw;
    }

    // --- (Rest of the session management functions) ---

    findSessionBySSRC(ssrc) {
        for (const session of this.sessions.values()) {
            if (session.remoteSSRC === ssrc) {
                return session;
            }
        }
        return null;
    }

    findPendingSession() {
        for (const session of this.sessions.values()) {
            if (!session.remoteAddress || !session.remotePort) {
                return session;
            }
        }
        return null;
    }

    getSession(callId) {
        return this.sessions.get(callId);
    }

    removeSession(callId) {
        const session = this.sessions.get(callId);
        if (session) {
            console.log(`🗑️ Removing RTP session for call ${callId}`);
            console.log(`   Packets received: ${session.packetsReceived}`);
            console.log(`   Packets sent: ${session.packetsSent}`);

            // Stop packet sender
            this.stopPacketSender(callId);

            // Stop keepalive
            this.stopKeepalive(callId);

            this.sessions.delete(callId);
        }
    }

    getSessions() {
        return Array.from(this.sessions.entries()).map(([callId, session]) => ({
            callId,
            remoteAddress: session.remoteAddress || 'pending',
            remotePort: session.remotePort || 'pending',
            packetsReceived: session.packetsReceived,
            packetsSent: session.packetsSent,
            duration: Math.round((Date.now() - session.createdAt) / 1000)
        }));
    }

    stop() {
        // Stop all packet senders
        for (const callId of this.queueTimers.keys()) {
            this.stopPacketSender(callId);
        }

        if (this.socket) {
            this.socket.close();
            this.socket = null;
            console.log('✅ RTP server stopped');
        }
        this.sessions.clear();
    }
}

export default RTPHandler;
