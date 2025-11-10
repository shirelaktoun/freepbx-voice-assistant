/**
 * Audio Utilities
 * Handles audio format conversion and resampling between Asterisk and OpenAI
 */

/**
 * Convert PCM16 audio from one sample rate to another
 * Simple linear interpolation resampling
 */
export function resampleAudio(inputBuffer, inputRate, outputRate) {
    if (inputRate === outputRate) {
        return inputBuffer;
    }

    const ratio = inputRate / outputRate;
    const outputLength = Math.floor(inputBuffer.length / ratio);
    const output = new Int16Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
        const position = i * ratio;
        const index = Math.floor(position);
        const fraction = position - index;

        if (index + 1 < inputBuffer.length) {
            // Linear interpolation
            output[i] = Math.round(
                inputBuffer[index] * (1 - fraction) +
                inputBuffer[index + 1] * fraction
            );
        } else {
            output[i] = inputBuffer[index];
        }
    }

    return output;
}

/**
 * Convert Int16Array to Base64 string
 */
export function int16ArrayToBase64(int16Array) {
    const uint8Array = new Uint8Array(int16Array.buffer);
    return Buffer.from(uint8Array).toString('base64');
}

/**
 * Convert Base64 string to Int16Array
 */
export function base64ToInt16Array(base64) {
    const buffer = Buffer.from(base64, 'base64');
    return new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
}

/**
 * Convert Asterisk slin16 (16kHz PCM16) to OpenAI format (24kHz PCM16)
 */
export function asteriskToOpenAI(audioData) {
    // audioData is Buffer from Asterisk RTP (16kHz, 16-bit signed PCM, little-endian)
    const inputSamples = new Int16Array(
        audioData.buffer,
        audioData.byteOffset,
        audioData.length / 2
    );

    // Resample from 16kHz to 24kHz
    const resampled = resampleAudio(inputSamples, 16000, 24000);

    // Convert to base64
    return int16ArrayToBase64(resampled);
}

/**
 * Convert OpenAI format (24kHz PCM16) to Asterisk slin16 (16kHz PCM16)
 */
export function openAIToAsterisk(base64Audio) {
    // Convert base64 to Int16Array
    const samples24k = base64ToInt16Array(base64Audio);

    // Resample from 24kHz to 16kHz
    const resampled = resampleAudio(samples24k, 24000, 16000);

    // Convert to Buffer for Asterisk
    return Buffer.from(resampled.buffer);
}

/**
 * Get audio duration in milliseconds
 */
export function getAudioDuration(samples, sampleRate) {
    return (samples.length / sampleRate) * 1000;
}

/**
 * Chunk audio buffer into smaller pieces
 */
export function chunkAudioBuffer(buffer, chunkSize = 960) {
    const chunks = [];
    for (let i = 0; i < buffer.length; i += chunkSize) {
        chunks.push(buffer.slice(i, i + chunkSize));
    }
    return chunks;
}

/**
 * Mix two audio buffers (for testing/debugging)
 */
export function mixAudioBuffers(buffer1, buffer2, ratio = 0.5) {
    const length = Math.min(buffer1.length, buffer2.length);
    const mixed = new Int16Array(length);

    for (let i = 0; i < length; i++) {
        mixed[i] = Math.round(buffer1[i] * ratio + buffer2[i] * (1 - ratio));
    }

    return mixed;
}

/**
 * Generate silence buffer
 */
export function generateSilence(durationMs, sampleRate = 16000) {
    const samples = Math.floor((durationMs / 1000) * sampleRate);
    return new Int16Array(samples);
}

/**
 * Calculate audio RMS (volume level)
 */
export function calculateRMS(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
        const normalized = samples[i] / 32768; // Normalize to -1 to 1
        sum += normalized * normalized;
    }
    return Math.sqrt(sum / samples.length);
}

/**
 * Check if audio is silence
 */
export function isSilence(samples, threshold = 0.01) {
    const rms = calculateRMS(samples);
    return rms < threshold;
}

export default {
    resampleAudio,
    int16ArrayToBase64,
    base64ToInt16Array,
    asteriskToOpenAI,
    openAIToAsterisk,
    getAudioDuration,
    chunkAudioBuffer,
    mixAudioBuffers,
    generateSilence,
    calculateRMS,
    isSilence
};
