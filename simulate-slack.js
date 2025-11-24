const http = require('http');
const crypto = require('crypto');

// Configuration
const PORT = 3006;
const SIGNING_SECRET = 'test-secret'; // Must match what you run the app with
const TIMESTAMP = Math.floor(Date.now() / 1000);

// Helper to create signature
function createSignature(body, timestamp) {
    const sigBasestring = 'v0:' + timestamp + ':' + body;
    const hmac = crypto.createHmac('sha256', SIGNING_SECRET);
    hmac.update(sigBasestring);
    return 'v0=' + hmac.digest('hex');
}

// Helper to send request
function sendSlackRequest(path, payload, description) {
    const body = new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
    const signature = createSignature(body, TIMESTAMP);

    const options = {
        hostname: '127.0.0.1',
        port: PORT,
        path: path,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Slack-Request-Timestamp': TIMESTAMP,
            'X-Slack-Signature': signature
        }
    };

    const req = http.request(options, (res) => {
        console.log(`\n--- ${description} ---`);
        console.log(`STATUS: ${res.statusCode}`);
        res.on('data', (d) => {
            process.stdout.write(d);
        });
    });

    req.on('error', (error) => {
        console.error(`problem with request: ${error.message}`);
    });

    req.write(body);
    req.end();
}

// 1. Simulate Slash Command
const slashCommandPayload = {
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
};

setTimeout(() => {
    sendSlackRequest('/slack/events', slashCommandPayload, 'Sending Slash Command /it-help');
}, 1000);

// 2. Simulate Button Click (On-Shift Engineer)
const buttonClickPayload = {
    type: 'block_actions',
    user: {
        id: 'U0001',
        username: 'Steve',
        name: 'Steve'
    },
    api_app_id: 'A0001',
    token: 'test-token',
    container: {
        type: 'view',
        view_id: 'V0001'
    },
    trigger_id: 'trigger_2',
    team: {
        id: 'T0001',
        domain: 'example'
    },
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
            text: {
                type: 'plain_text',
                text: 'On-Shift Engineer',
                emoji: true
            },
            value: 'click_me_123',
            type: 'button',
            action_ts: '1600000000.000000'
        }
    ]
};

setTimeout(() => {
    sendSlackRequest('/slack/events', buttonClickPayload, 'Sending Button Click (On-Shift Engineer)');
}, 3000);
