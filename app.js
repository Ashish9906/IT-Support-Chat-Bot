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

// --- IN-MEMORY STORAGE ---
const stats = {
    total_hits: 0,
    engineer_counts: {}
};

const swapRegistry = {}; // Format: { "Original Name": "New Name" }

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

// --- COMMANDS ---

// 1. Main Help Command
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
                        text: 'IT Support Hub',
                        emoji: true
                    }
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'plain_text',
                            text: 'Multifactor LLP',
                            emoji: true
                        }
                    ]
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: "*Welcome to the Multifactor LLP IT Support Portal*\nWe are here to help you with your technical issues."
                    }
                },
                {
                    type: 'divider'
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: "Click below to find the currently available engineer:"
                    }
                },
                {
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: 'Find On-Shift Engineer',
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
                            text: "Powered by Multifactor LLP"
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

// 2. Analytics Command (Admin)
app.command('/it-stats', async ({ ack, body, client }) => {
    await ack();

    let statsText = `*📊 IT Support Bot Statistics*\n\n*Total Requests Today:* ${stats.total_hits}\n\n*Engineer Search Counts:*`;

    for (const [name, count] of Object.entries(stats.engineer_counts)) {
        statsText += `\n- ${name}: ${count}`;
    }

    if (Object.keys(stats.engineer_counts).length === 0) {
        statsText += "\n(No data yet)";
    }

    if (process.env.TEST_MODE === 'true') {
        console.log('--- TEST MODE: Stats Command ---');
        console.log(statsText);
        return;
    }

    // Ephemeral message (only visible to admin)
    try {
        await client.chat.postEphemeral({
            channel: body.channel_id,
            user: body.user_id,
            text: statsText
        });
    } catch (error) {
        console.error(error);
    }
});

// 3. Swap Command (Admin)
app.command('/it-swap', async ({ ack, body, client }) => {
    await ack();

    const args = body.text.trim().split(/\s+/); // Split by space
    // Expecting: /it-swap @Atul @Pavan OR /it-swap Atul Pavan (Simplified)

    // Clean up names (remove @ if present)
    const cleanName = (name) => name ? name.replace(/^@/, '') : '';

    if (args.length < 2) {
        const msg = "⚠️ Usage: `/it-swap [Original Name] [New Name]`\nExample: `/it-swap Atul Pavan`";
        if (process.env.TEST_MODE === 'true') console.log(msg);
        else await client.chat.postEphemeral({ channel: body.channel_id, user: body.user_id, text: msg });
        return;
    }

    // Simple fuzzy match logic could go here, but for now we assume partial first name match works if unique
    // For robustness in this MVP, let's try to find full names in schedule that START with the arg
    const findFullName = (partial) => {
        const match = schedule.find(e => e.name.toLowerCase().includes(partial.toLowerCase()));
        return match ? match.name : null;
    };

    const originalPartial = cleanName(args[0]);
    const newPartial = cleanName(args[1]);

    const originalFull = findFullName(originalPartial);
    const newFull = findFullName(newPartial);

    if (!originalFull || !newFull) {
        const msg = `⚠️ Could not find engineers matching "${originalPartial}" or "${newPartial}" in the schedule.`;
        if (process.env.TEST_MODE === 'true') console.log(msg);
        else await client.chat.postEphemeral({ channel: body.channel_id, user: body.user_id, text: msg });
        return;
    }

    // Register Swap
    swapRegistry[originalFull] = newFull;

    const successMsg = `✅ **Shift Swap Active!**\n\n**${originalFull}** is now replaced by **${newFull}** for today.`;

    if (process.env.TEST_MODE === 'true') {
        console.log('--- TEST MODE: Swap Command ---');
        console.log(successMsg);
        console.log('Registry:', swapRegistry);
    } else {
        await client.chat.postEphemeral({
            channel: body.channel_id,
            user: body.user_id,
            text: successMsg
        });
    }
});


// --- ACTIONS ---

// Action Handler: On-Shift Engineer
app.action('on_shift_engineer', async ({ ack, body, client }) => {
    await ack();

    // 1. Increment Stats
    stats.total_hits += 1;

    const nowIST = DateTime.now().setZone('Asia/Kolkata');

    // 2. Get Base Active Engineers
    let activeEngineers = schedule.filter(eng => isEngineerOnShift(eng, nowIST));

    // 3. Apply Swaps
    activeEngineers = activeEngineers.map(eng => {
        if (swapRegistry[eng.name]) {
            const newName = swapRegistry[eng.name];
            const newEngObj = schedule.find(e => e.name === newName);
            if (newEngObj) {
                // Return the new engineer object, but maybe keep the shift time of the original?
                // User said "Atul ki jagah Pavan", usually implies Pavan covers that slot.
                // Let's use Pavan's full details if available, but if Pavan has a different shift time in DB, it might be confusing.
                // For now, we replace the entire object with Pavan's object from DB.
                // If Pavan is NOT in DB (unlikely based on findFullName check), we'd fallback.
                return newEngObj;
            }
        }
        return eng;
    });

    // 4. Update Stats for specific engineers
    activeEngineers.forEach(eng => {
        stats.engineer_counts[eng.name] = (stats.engineer_counts[eng.name] || 0) + 1;
    });

    let blocks = [];

    // Header
    blocks.push({
        type: 'header',
        text: {
            type: 'plain_text',
            text: 'Engineer Details',
            emoji: true
        }
    });

    // Context
    blocks.push({
        type: 'context',
        elements: [
            {
                type: 'plain_text',
                text: 'Multifactor LLP',
                emoji: true
            }
        ]
    });

    // Section Title
    blocks.push({
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: "*Active Support Staff*"
        }
    });

    blocks.push({ type: 'divider' });

    if (activeEngineers.length > 0) {
        // --- SCENARIO 1: Engineers ARE Available ---
        activeEngineers.forEach(eng => {
            // Name and Status Pill
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${eng.name}*`
                },
                accessory: {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: '🟢 Available',
                        emoji: true
                    },
                    action_id: 'noop_status_' + eng.name.replace(/\s/g, ''), // Unique ID
                    value: 'status',
                    style: 'primary'
                }
            });

            // Details: Email (Code Block) and Shift (Plain Text)
            blocks.push({
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `\`${eng.email}\``
                    },
                    {
                        type: 'mrkdwn',
                        text: `Shift: ${eng.start} - ${eng.end} IST`
                    }
                ]
            });

            blocks.push({ type: 'divider' });
        });

    } else {
        // --- SCENARIO 2: NO Engineers (Offline Mode) ---
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: "*Support Status: Offline*"
            },
            accessory: {
                type: 'button',
                text: {
                    type: 'plain_text',
                    text: '🟡 Offline',
                    emoji: true
                },
                action_id: 'noop_status_offline',
                value: 'status'
            }
        });

        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: "Our support team is currently off-shift.\nStandard support hours are Monday to Friday."
            }
        });

        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: "For urgent technical issues, please raise a ticket on the Jira Service Desk."
            }
        });

        blocks.push({ type: 'divider' });
    }

    // Footer with Time
    blocks.push({
        type: 'context',
        elements: [
            {
                type: 'mrkdwn',
                text: `Current Time: ${nowIST.toFormat('cccc, hh:mm a')} IST`
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
