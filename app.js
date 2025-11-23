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
                text: 'IT Support'
            },
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: 'IT Support Bot by Multifactor LLP',
                        emoji: true
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: "Hello! I am your automated IT assistant. How can I assist you today?"
                    }
                },
                {
                    type: 'divider'
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: "*Choose an option below:*"
                    }
                },
                {
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: '🤖 Get AI Assistance',
                                emoji: true
                            },
                            action_id: 'bot_help',
                            style: 'primary'
                        },
                        {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: '👨‍💻 Contact On-Shift Engineer',
                                emoji: true
                            },
                            action_id: 'on_shift_engineer'
                        }
                    ]
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: "Powered by Multifactor LLP AI Services"
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
    const currentEngineer = schedule.find(eng => isEngineerOnShift(eng, nowIST));

    let textBlock;
    if (currentEngineer) {
        textBlock = `*Current Shift (${nowIST.toFormat('cccc, hh:mm a')} IST)*\n\n*Name:* ${currentEngineer.name}\n*Email:* ${currentEngineer.email}\n*Shift:* ${currentEngineer.start} - ${currentEngineer.end}`;
    } else {
        // Fallback to Sinbad if no specific engineer is on shift
        textBlock = `*Current Shift (${nowIST.toFormat('cccc, hh:mm a')} IST)*\n\n*Name:* Sinbad\n*Email:* sgellizeau@greatlakes.services\n*Shift:* On-Call (Fallback)`;
    }

    const viewPayload = {
        trigger_id: body.trigger_id,
        view: {
            type: 'modal',
            title: {
                type: 'plain_text',
                text: 'On-Shift Engineer'
            },
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: textBlock
                    }
                }
            ]
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

// Action Handler: Get Help From Bot
app.action('bot_help', async ({ ack, body, client }) => {
    await ack();

    const viewPayload = {
        trigger_id: body.trigger_id,
        view: {
            type: 'modal',
            title: {
                type: 'plain_text',
                text: 'AI Assistance'
            },
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: "I am happy to help you! Please elaborate on the issue you are facing, and I will do my best to resolve it."
                    }
                }
            ]
        }
    };

    if (process.env.TEST_MODE === 'true') {
        console.log('--- TEST MODE: Pushing View (Bot Help) ---');
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
