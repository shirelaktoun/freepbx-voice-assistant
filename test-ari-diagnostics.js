#!/usr/bin/env node
/**
 * ARI Diagnostics Tool
 * Tests connection and queries available endpoints on remote Asterisk server
 */

import ariClient from 'ari-client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: '/opt/freepbx-voice-assistant/.env' });

const {
    ARI_HOST,
    ARI_PORT = 8088,
    ARI_USERNAME,
    ARI_PASSWORD,
    ARI_APP_NAME = 'voiceassistant'
} = process.env;

console.log('==========================================');
console.log('ARI Diagnostics Tool');
console.log('==========================================');
console.log(`ARI Host: ${ARI_HOST}:${ARI_PORT}`);
console.log(`ARI Username: ${ARI_USERNAME}`);
console.log(`ARI App: ${ARI_APP_NAME}`);
console.log('');

async function runDiagnostics() {
    try {
        // Connect to ARI
        console.log('🔌 Connecting to ARI...');
        const ari = await ariClient.connect(
            `http://${ARI_HOST}:${ARI_PORT}`,
            ARI_USERNAME,
            ARI_PASSWORD
        );
        console.log('✅ Connected to ARI successfully!');
        console.log('');

        // Get list of endpoints
        console.log('📋 Querying available endpoints...');
        try {
            const endpoints = await ari.endpoints.list();
            console.log(`✅ Found ${endpoints.length} endpoints:`);
            console.log('');
            
            endpoints.forEach((endpoint, index) => {
                console.log(`${index + 1}. Technology: ${endpoint.technology}`);
                console.log(`   Resource: ${endpoint.resource}`);
                console.log(`   State: ${endpoint.state}`);
                console.log(`   Channel IDs: ${endpoint.channel_ids?.join(', ') || 'none'}`);
                console.log('');
            });

            // Show examples of how to dial
            if (endpoints.length > 0) {
                console.log('==========================================');
                console.log('📞 How to dial these endpoints:');
                console.log('==========================================');
                endpoints.slice(0, 5).forEach(ep => {
                    console.log(`${ep.technology}/${ep.resource}`);
                });
                console.log('');
            }
        } catch (error) {
            console.log('⚠️ Could not list endpoints:', error.message);
            console.log('   This might mean the endpoint listing API is not available');
            console.log('');
        }

        // Get list of channels
        console.log('📞 Checking active channels...');
        try {
            const channels = await ari.channels.list();
            console.log(`✅ Active channels: ${channels.length}`);
            if (channels.length > 0) {
                channels.forEach(ch => {
                    console.log(`   - ${ch.name} (${ch.state})`);
                });
            } else {
                console.log('   No active channels');
            }
            console.log('');
        } catch (error) {
            console.log('⚠️ Could not list channels:', error.message);
        }

        ari.stop();
        console.log('==========================================');
        console.log('✅ Diagnostics complete!');
        console.log('==========================================');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('');
        console.error('Troubleshooting:');
        console.error('1. Check that Asterisk is running on the remote server');
        console.error('2. Verify ARI is enabled (http.conf)');
        console.error('3. Check firewall allows port 8088 from this server');
        console.error('4. Verify ARI credentials are correct');
        process.exit(1);
    }
}

runDiagnostics();
