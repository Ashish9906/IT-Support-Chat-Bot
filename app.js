const { App } = require('@slack/bolt');
const { DateTime } = require('luxon');
require('dotenv').config();
const schedule = require('./schedule.json');

// Initialize the App
const appConfig = {
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET
};

// Bypass auth.test in TEST_MODE
if (process.env.TEST_MODE === 'true') {
    delete appConfig.token;
    appConfig.authorize = async () => {
        return {
            botId: 'B0001',
            botUserId: 'U0001',
            teamId: 'T0001'
        };
    };
}

const app = new App(appConfig);

console.log(`TEST_MODE is: '${process.env.TEST_MODE}'`);

// Helper: Check if current time is within a shift range
function isEngineerOnShift(engineer, nowIST) {
    const nowTime = nowIST.toFormat('HH:mm');
    const currentDay = nowIST.toFormat('cccc'); // Monday, Tuesday...
    const yesterdayDay = nowIST.minus({ days: 1 }).toFormat('cccc');

    // Check 1: Is he working a shift that started TODAY?
    if (engineer.days.includes(currentDay)) {
        // Standard Shift: 09:00 to 18:00
        if (engineer.end > engineer.start) {
            if (nowTime >= engineer.start && nowTime < engineer.end) return true;
        }
        // Overnight Shift (Start part): 22:00 to 07:00 (covers 22:00 to 23:59 today)
        else {
            if (nowTime >= engineer.start) return true;
        }
    }

    // Check 2: Is he working a shift that started YESTERDAY? (Overnight only)
    if (engineer.days.includes(yesterdayDay)) {
        // Overnight Shift (End part): 22:00 to 07:00 (covers 00:00 to 07:00 today)
        if (engineer.end < engineer.start) {
            if (nowTime < engineer.end) return true;
        }
    }

    return false;
}

// Slash Command Handler to open the modal
app.command('/it-help', async ({ ack, body, client }) => {
    await ack();

    const viewPayload = {
        trigger_id: body.trigger_id,
        view: {
            type: 'modal',
            callback_id: 'it_support_modal',
            title: {
                type: 'plain_text',
                text: 'IT Support Hub'
            },
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: '🏢 IT Support Hub',
                        emoji: true
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: "*Welcome to the Multifactor LLP IT Support Portal.*\nWe are here to help you with your technical issues."
                    }
                },
                {
                    type: 'divider'
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: "👇 *Click below to find the currently available engineer:*"
                    }
                },
                {
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: '👨‍💻 Find On-Shift Engineer',
                                emoji: true
                            },
                            action_id: 'on_shift_engineer',
                            style: 'primary'
                        }
                    ]
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: "⚡ Powered by Multifactor LLP"
                        }
                    ]
                }
            ]
        }
    };

    if (process.env.TEST_MODE === 'true') {
        console.log('--- TEST MODE: Opening Modal ---');
        console.log(JSON.stringify(viewPayload.view, null, 2));
        return;
    }

    try {
        await client.views.open(viewPayload);
    } catch (error) {
        console.error(error);
    }
});

// Action Handler: On-Shift Engineer
app.action('on_shift_engineer', async ({ ack, body, client }) => {
    await ack();

    const nowIST = DateTime.now().setZone('Asia/Kolkata');

    // FILTER: Get ALL matching engineers instead of just one
    const activeEngineers = schedule.filter(eng => isEngineerOnShift(eng, nowIST));

    let blocks = [];

    // Header Block
    blocks.push({
        type: 'header',
        text: {
            type: 'plain_text',
            text: '👨‍💻 Available Engineers',
            emoji: true
        }
    });
    blocks.push({ type: 'divider' });

    if (activeEngineers.length > 0) {
        // Loop through each active engineer and create a card
        activeEngineers.forEach(eng => {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${eng.name}*`
                }
            });
            blocks.push({
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `📧 *Email:*\n${eng.email}`
                    },
                    {
                        type: 'mrkdwn',
                        text: `⏰ *Shift:*\n${eng.start} - ${eng.end} IST`
                    }
                ]
            });
            blocks.push({
                type: 'context',
                elements: [
                    {
                        type: 'plain_text',
                        text: '🟢 On-Shift',
                        emoji: true
                    }
                ]
            });
            blocks.push({ type: 'divider' });
        });
    } else {
        // Fallback to Sinbad if NO engineers are found
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*Sinbad*`
            }
        });
        blocks.push({
            type: 'section',
            fields: [
                {
                    type: 'mrkdwn',
                    text: `📧 *Email:*\nsgellizeau@greatlakes.services`
                },
                {
                    type: 'mrkdwn',
                    text: `⏰ *Shift:*\nOn-Call (Fallback)`
                }
            ]
        });
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'plain_text',
                    text: '🟡 Fallback Support',
                    emoji: true
                }
            ]
        });
        blocks.push({ type: 'divider' });
    }

    // Footer with Time
    blocks.push({
        type: 'context',
        elements: [
            {
                type: 'mrkdwn',
                text: `🕒 *Current Time:* ${nowIST.toFormat('cccc, hh:mm a')} IST`
            }
        ]
    });

    const viewPayload = {
        trigger_id: body.trigger_id,
        view: {
            type: 'modal',
            title: {
                type: 'plain_text',
                text: 'Engineer Details'
            },
            blocks: blocks
        }
    };

    if (process.env.TEST_MODE === 'true') {
        console.log('--- TEST MODE: Pushing View (On-Shift) ---');
        console.log(JSON.stringify(viewPayload.view, null, 2));
        return;
    }

    try {
        await client.views.push(viewPayload);
    } catch (error) {
        console.error(error);
    }
});

(async () => {
    const port = process.env.PORT || 3000;
    await app.start(port);
    console.log(`⚡️ Bolt app is running on port ${port}!`);
})();
