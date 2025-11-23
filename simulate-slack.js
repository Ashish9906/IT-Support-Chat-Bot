const http = require('http');
const crypto = require('crypto');

// Configuration
const PORT = 3004;
const SIGNING_SECRET = 'test-secret'; // Must match what you run the app with
const TIMESTAMP = Math.floor(Date.now() / 1000);

function sendSlackRequest(payload) {
    const body = new URLSearchParams(payload).toString();

    // Generate Signature
    const sigBasestring = `v0:${TIMESTAMP}:${body}`;
    const signature = 'v0=' + crypto.createHmac('sha256', SIGNING_SECRET)
        .update(sigBasestring)
        .digest('hex');

    const options = {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/slack/events',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'x-slack-request-timestamp': TIMESTAMP,
            'x-slack-signature': signature
        }
    };

    const req = http.request(options, (res) => {
        console.log(`STATUS: ${res.statusCode}`);
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
            console.log(`BODY: ${chunk}`);
        });
    });

    req.on('error', (e) => {
        console.error(`problem with request: ${e.message}`);
    });

    req.write(body);
    req.end();
}

// 1. Simulate Slash Command
console.log('--- Sending Slash Command /it-help ---');
sendSlackRequest({
    token: 'test-token',
    team_id: 'T0001',
    team_domain: 'example',
    channel_id: 'C0001',
    channel_name: 'test',
    user_id: 'U0001',
    user_name: 'Steve',
    command: '/it-help',
    text: '',
    response_url: 'https://hooks.slack.com/commands/1234/5678',
    trigger_id: 'trigger_1'
});

// 2. Simulate Button Click (On-Shift Engineer) - Wait a bit
setTimeout(() => {
    console.log('\n--- Sending Button Click (On-Shift Engineer) ---');
    // Interactive payload is sent as a JSON string in the 'payload' form field
    const interactivePayload = {
        type: 'block_actions',
        user: { id: 'U0001', username: 'Steve' },
        api_app_id: 'A0001',
        token: 'test-token',
        container: { type: 'view', view_id: 'V0001' },
        trigger_id: 'trigger_2',
        team: { id: 'T0001', domain: 'example' },
        enterprise: null,
        is_enterprise_install: false,
        view: {
            type: 'modal',
            callback_id: 'it_support_modal'
        },
        actions: [
            {
                action_id: 'on_shift_engineer',
                block_id: 'block_1',
                text: { type: 'plain_text', text: 'On-Shift Engineer', emoji: true },
                value: 'click_me_123',
                type: 'button',
                action_ts: '1579031234.123456'
            }
        ]
    };

    sendSlackRequest({
        payload: JSON.stringify(interactivePayload)
    });
}, 2000);

// 3. Simulate Button Click (Bot Help) - Wait a bit more
setTimeout(() => {
    console.log('\n--- Sending Button Click (Bot Help) ---');
    const interactivePayload = {
        type: 'block_actions',
        user: { id: 'U0001', username: 'Steve' },
        api_app_id: 'A0001',
        token: 'test-token',
        container: { type: 'view', view_id: 'V0001' },
        trigger_id: 'trigger_3',
        team: { id: 'T0001', domain: 'example' },
        view: { type: 'modal', callback_id: 'it_support_modal' },
        actions: [
            {
                action_id: 'bot_help',
                type: 'button'
            }
        ]
    };

    sendSlackRequest({
        payload: JSON.stringify(interactivePayload)
    });
}, 4000);
