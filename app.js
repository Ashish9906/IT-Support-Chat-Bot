const { App, ExpressReceiver } = require('@slack/bolt');
const { DateTime } = require('luxon');
const mongoose = require('mongoose');
const AdminConfig = require('./models/AdminConfig');
require('dotenv').config();
const schedule = require('./schedule.json');

// --- CONFIGURATION ---
const ADMIN_USERS = ['U09V5BGMEEM']; // Add more IDs here if needed
// Use the provided Mongo URI
// Use the provided Mongo URI (Preferably from Env, fallback to hardcoded if necessary for legacy)
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://shshmattoo_db_user:bAqtM9PM4HDeOdYN@multifactorllpchatbot.afbprn2.mongodb.net/?appName=MULTIFACTORLLPCHATBOT";

// --- DATABASE CONNECTION ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- INITIALIZE APP WITH EXPRESS RECEIVER ---
// We use ExpressReceiver to add custom routes (like /ping)
const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    processBeforeResponse: true
});

const appConfig = {
    token: process.env.SLACK_BOT_TOKEN,
    receiver: receiver
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

// --- KEEP-ALIVE SYSTEM (24/7 Uptime) ---
// 1. Add a simple route
receiver.router.get('/ping', (req, res) => {
    res.send('Pong! 🏓 Bot is active.');
});

// 2. Self-Ping Loop (Every 10 minutes)
const APP_URL = "https://it-support-chat-bot.onrender.com"; // Replace with your actual Render URL if different
setInterval(() => {
    fetch(`${APP_URL}/ping`)
        .then(res => console.log(`🔄 Self-Ping: ${res.status} ${res.statusText}`))
        .catch(err => console.error(`⚠️ Self-Ping Failed: ${err.message}`));
}, 10 * 60 * 1000); // 10 minutes


// --- HELPER FUNCTIONS ---

// Helper: Get Admin Config from DB (or create default)
async function getAdminConfig() {
    try {
        let config = await AdminConfig.findOne();
        if (!config) {
            config = await AdminConfig.create({
                holiday: { active: false, reason: "Public Holiday" },
                leaves: []
            });
        }
        return config;
    } catch (error) {
        console.error("DB Error:", error);
        // Fallback to default if DB fails
        return { holiday: { active: false, reason: "Error" }, leaves: [] };
    }
}

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

// --- JIRA CONFIGURATION ---
const JIRA_DOMAIN = process.env.JIRA_DOMAIN;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY;

// Helper: Create Jira Ticket
async function createJiraTicket(summary, description, userEmail) {
    const url = `https://${JIRA_DOMAIN}/rest/api/3/issue`;
    const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');

    const bodyData = {
        fields: {
            project: {
                key: JIRA_PROJECT_KEY
            },
            summary: summary,
            description: {
                type: "doc",
                version: 1,
                content: [
                    {
                        type: "paragraph",
                        content: [
                            {
                                type: "text",
                                text: description + `\n\nRaised by: ${userEmail}`
                            }
                        ]
                    }
                ]
            },
            issuetype: {
                name: "Task"
            }
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bodyData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Status: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        return { success: true, key: data.key };
    } catch (error) {
        console.error("Jira Creation Failed:", error);
        return { success: false, error: error.message };
    }
}

// ... (Rest of code) ...

// --- COMMANDS ---

// 1. Main Help Command (The Dashboard)
app.command('/it-help', async ({ ack, body, client }) => {
    await ack();

    const viewPayload = {
        trigger_id: body.trigger_id,
        view: {
            type: 'modal',
            callback_id: 'it_dashboard',
            private_metadata: body.channel_id, // Store source channel ID
            title: {
                type: 'plain_text',
                text: 'IT Support Hub'
            },
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: 'How can we help you today?',
                        emoji: true
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: "Choose an option below to get started:"
                    }
                },
                { type: 'divider' },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: "*Find On-Shift Engineer*\nSee who is available right now for urgent help."
                    },
                    accessory: {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'Check Availability',
                            emoji: true
                        },
                        action_id: 'on_shift_engineer',
                        style: 'primary'
                    }
                },
                { type: 'divider' },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: "*Raise a Jira Ticket*\nSubmit a formal request for hardware, software, or access issues."
                    },
                    accessory: {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'Raise Ticket',
                            emoji: true
                        },
                        action_id: 'open_ticket_modal',
                    }
                },
                { type: 'divider' },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: "Powered by Multifactor LLP IT Team"
                        }
                    ]
                }
            ]
        }
    };

    try {
        await client.views.open(viewPayload);
    } catch (error) {
        console.error(error);
    }
});

// Action: Open Ticket Modal
app.action('open_ticket_modal', async ({ ack, body, client }) => {
    await ack();

    const channelId = body.view.private_metadata;

    await client.views.push({
        trigger_id: body.trigger_id,
        view: {
            type: 'modal',
            callback_id: 'submit_ticket',
            private_metadata: channelId, // Pass channel ID to next view
            title: {
                type: 'plain_text',
                text: 'New Support Ticket'
            },
            blocks: [
                {
                    type: 'input',
                    block_id: 'summary_block',
                    element: {
                        type: 'plain_text_input',
                        action_id: 'summary_input',
                        placeholder: {
                            type: 'plain_text',
                            text: 'Short summary of the issue (e.g. Laptop Screen Flickering)'
                        }
                    },
                    label: {
                        type: 'plain_text',
                        text: 'Issue Summary'
                    }
                },
                {
                    type: 'input',
                    block_id: 'desc_block',
                    element: {
                        type: 'plain_text_input',
                        action_id: 'desc_input',
                        multiline: true,
                        placeholder: {
                            type: 'plain_text',
                            text: 'Describe the problem in detail...'
                        }
                    },
                    label: {
                        type: 'plain_text',
                        text: 'Description'
                    }
                }
            ],
            submit: {
                type: 'plain_text',
                text: 'Submit Ticket'
            }
        }
    });
});

// View Submission: Handle Ticket Creation
app.view('submit_ticket', async ({ ack, body, view, client }) => {
    await ack();

    const summary = view.state.values.summary_block.summary_input.value;
    const description = view.state.values.desc_block.desc_input.value;
    const user = body.user.id;
    const channelId = view.private_metadata || user; // Fallback to user (DM) if metadata missing

    // Get user info for email
    let userEmail = "Unknown User";
    try {
        const userInfo = await client.users.info({ user: user });
        userEmail = userInfo.user.profile.email || userInfo.user.name;
    } catch (e) {
        console.error("Could not fetch user info", e);
    }

    // Note: Replaced "Processing" message with direct creation to minimize UI noise as requested.

    const ticketResult = await createJiraTicket(summary, description, userEmail);

    if (ticketResult.success) {
        const ticketKey = ticketResult.key;
        try {
            // Success: Send small Ephemeral Message (Visible only to user, no DM created)
            await client.chat.postEphemeral({
                channel: channelId,
                user: user,
                text: `✅ Ticket Submitted: ${ticketKey}`,
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `✅ *Ticket Submitted*\nKey: <https://${JIRA_DOMAIN}/browse/${ticketKey}|${ticketKey}>`
                        }
                    }
                ]
            });
        } catch (error) {
            console.error("Failed to send ephemeral success:", error);
        }

    } else {
        const errorMessage = ticketResult.error || "Unknown Error";
        try {
            // Error: Send small Ephemeral Message
            await client.chat.postEphemeral({
                channel: channelId,
                user: user,
                text: `❌ Failed to create ticket. Error: ${errorMessage}`
            });
        } catch (error) {
            console.error("Failed to send ephemeral error:", error);
        }
    }
});

// 2. Admin Dashboard Command
app.command('/it-admin', async ({ ack, body, client }) => {
    await ack();

    // Access Control
    if (!ADMIN_USERS.includes(body.user_id)) {
        await client.chat.postEphemeral({
            channel: body.channel_id,
            user: body.user_id,
            text: "🚫 *Access Denied:* You are not authorized to use the Admin Dashboard."
        });
        return;
    }

    // Fetch Current Config from DB
    const config = await getAdminConfig();

    // Prepare Options for Engineer Select
    const engineerOptions = schedule.map(eng => ({
        text: { type: 'plain_text', text: eng.name },
        value: eng.name
    }));

    const viewPayload = {
        trigger_id: body.trigger_id,
        view: {
            type: 'modal',
            callback_id: 'admin_dashboard_submit',
            title: {
                type: 'plain_text',
                text: 'Admin Dashboard'
            },
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: '⚙️ Manage IT Support',
                        emoji: true
                    }
                },
                { type: 'divider' },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: "*📅 Public Holiday Mode*"
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: "Enable this to show a 'Holiday' message to all users."
                    },
                    accessory: {
                        type: 'static_select',
                        action_id: 'admin_holiday_toggle',
                        placeholder: {
                            type: 'plain_text',
                            text: 'Select Status'
                        },
                        options: [
                            {
                                text: { type: 'plain_text', text: '🟢 Active (Normal)' },
                                value: 'active'
                            },
                            {
                                text: { type: 'plain_text', text: '🔴 Holiday Mode' },
                                value: 'holiday'
                            }
                        ],
                        initial_option: config.holiday.active
                            ? { text: { type: 'plain_text', text: '🔴 Holiday Mode' }, value: 'holiday' }
                            : { text: { type: 'plain_text', text: '🟢 Active (Normal)' }, value: 'active' }
                    }
                },
                {
                    type: 'input',
                    block_id: 'holiday_reason_block',
                    element: {
                        type: 'plain_text_input',
                        action_id: 'holiday_reason',
                        initial_value: config.holiday.reason,
                        placeholder: {
                            type: 'plain_text',
                            text: 'e.g., Christmas, New Year'
                        }
                    },
                    label: {
                        type: 'plain_text',
                        text: 'Holiday Reason'
                    },
                    optional: true
                },
                { type: 'divider' },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: "*👤 Leave & Substitution Management*"
                    }
                },
                {
                    type: 'input',
                    block_id: 'leave_engineer_block',
                    element: {
                        type: 'static_select',
                        action_id: 'leave_engineer_select',
                        placeholder: {
                            type: 'plain_text',
                            text: 'Select Engineer on Leave'
                        },
                        options: engineerOptions
                    },
                    label: {
                        type: 'plain_text',
                        text: 'Engineer on Leave'
                    },
                    optional: true
                },
                {
                    type: 'input',
                    block_id: 'substitute_engineer_block',
                    element: {
                        type: 'static_select',
                        action_id: 'substitute_engineer_select',
                        placeholder: {
                            type: 'plain_text',
                            text: 'Select Substitute (Optional)'
                        },
                        options: engineerOptions
                    },
                    label: {
                        type: 'plain_text',
                        text: 'Substitute Engineer'
                    },
                    optional: true
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: "_Note: Selecting an engineer above will update their status. To clear a leave, select the engineer and leave substitute empty, or use the 'Reset All' button below._"
                    }
                },
                { type: 'divider' },
                {
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: 'Reset All Leaves',
                                emoji: true
                            },
                            style: 'danger',
                            action_id: 'admin_reset_leaves',
                            confirm: {
                                title: { type: 'plain_text', text: 'Are you sure?' },
                                text: { type: 'plain_text', text: 'This will clear all active leave and substitution records.' },
                                confirm: { type: 'plain_text', text: 'Yes, Reset' },
                                deny: { type: 'plain_text', text: 'Cancel' }
                            }
                        }
                    ]
                }
            ],
            submit: {
                type: 'plain_text',
                text: 'Save Changes'
            }
        }
    };

    try {
        await client.views.open(viewPayload);
    } catch (error) {
        console.error(error);
    }
});


// --- ACTIONS ---

// Action: Handle Admin Dashboard Submission
app.view('admin_dashboard_submit', async ({ ack, body, view, client }) => {
    await ack();

    // 1. Update Holiday Config
    const reason = view.state.values.holiday_reason_block.holiday_reason.value;

    // 2. Update Leave Registry
    const leaveEng = view.state.values.leave_engineer_block.leave_engineer_select.selected_option?.value;
    const subEng = view.state.values.substitute_engineer_block.substitute_engineer_select.selected_option?.value;

    // DB Update
    try {
        const config = await getAdminConfig();

        if (reason) config.holiday.reason = reason;

        if (leaveEng) {
            // Remove existing leave for this engineer if any
            config.leaves = config.leaves.filter(l => l.engineer !== leaveEng);
            // Add new leave
            config.leaves.push({
                engineer: leaveEng,
                substitute: subEng || null,
                isLeave: true
            });

            // Notify Admin
            const subText = subEng ? `with substitute *${subEng}*` : `(No substitute)`;
            await client.chat.postEphemeral({
                channel: body.user.id,
                user: body.user.id,
                text: `✅ Updated: *${leaveEng}* is on leave ${subText}.`
            });
        }

        await config.save();

    } catch (error) {
        console.error("DB Update Error:", error);
    }
});

// Action: Handle Holiday Toggle immediately
app.action('admin_holiday_toggle', async ({ ack, body, action }) => {
    await ack();
    const val = action.selected_option.value;

    try {
        const config = await getAdminConfig();
        config.holiday.active = (val === 'holiday');
        await config.save();
    } catch (error) {
        console.error("DB Toggle Error:", error);
    }
});

// Action: Reset Leaves
app.action('admin_reset_leaves', async ({ ack, body, client }) => {
    await ack();

    try {
        const config = await getAdminConfig();
        config.leaves = [];
        await config.save();

        await client.chat.postEphemeral({
            channel: body.user.id,
            user: body.user.id,
            text: "✅ All leave records have been reset."
        });
    } catch (error) {
        console.error("DB Reset Error:", error);
    }
});


// Action Handler: On-Shift Engineer
app.action('on_shift_engineer', async ({ ack, body, client }) => {
    await ack();

    // Fetch Config from DB
    const config = await getAdminConfig();

    // --- CHECK 1: HOLIDAY MODE ---
    if (config.holiday.active) {
        await client.views.push({
            trigger_id: body.trigger_id,
            view: {
                type: 'modal',
                title: { type: 'plain_text', text: 'Holiday Mode' },
                blocks: [
                    {
                        type: 'header',
                        text: { type: 'plain_text', text: '🌴 Office Closed', emoji: true }
                    },
                    {
                        type: 'section',
                        text: { type: 'mrkdwn', text: `We are currently observing a holiday: *${config.holiday.reason}*` }
                    },
                    {
                        type: 'section',
                        text: { type: 'mrkdwn', text: "For urgent issues, please raise a ticket on Jira." }
                    }
                ]
            }
        });
        return;
    }

    const nowIST = DateTime.now().setZone('Asia/Kolkata');

    // --- CHECK 2: GET ACTIVE ENGINEERS ---
    let activeEngineers = schedule.filter(eng => isEngineerOnShift(eng, nowIST));

    // --- CHECK 3: APPLY LEAVES & SUBSTITUTES ---
    let finalEngineers = [];

    activeEngineers.forEach(eng => {
        // Check if this engineer is in the leaves list
        const leaveRecord = config.leaves.find(l => l.engineer === eng.name);

        if (leaveRecord) {
            // Engineer is on leave
            if (leaveRecord.substitute) {
                // Has substitute -> Find substitute details
                const subDetails = schedule.find(e => e.name === leaveRecord.substitute);
                if (subDetails) {
                    let subClone = { ...subDetails };
                    subClone.isSubstitute = true;
                    subClone.coveringFor = eng.name;
                    finalEngineers.push(subClone);
                }
            }
            // If no substitute, they are removed
        } else {
            // Not on leave -> Add original engineer
            finalEngineers.push(eng);
        }
    });

    // Remove duplicates
    finalEngineers = finalEngineers.filter((eng, index, self) =>
        index === self.findIndex((t) => (t.name === eng.name))
    );

    // --- ENRICH WITH REAL-TIME SLACK STATUS ---
    // User Request: Simplify Status. Only show 'Available' for engineers on shift.
    const enrichedEngineers = finalEngineers.map(eng => {
        return { ...eng, realTimeStatus: "🟢 Available" };
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

    if (enrichedEngineers.length > 0) {
        // --- SCENARIO 1: Engineers ARE Available ---
        enrichedEngineers.forEach(eng => {
            // Name and Status Pill
            // User Request: Simplify UI. Substitutes should look just like normal available engineers.
            let statusText = '🟢 Available';

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
                        text: eng.realTimeStatus, // Dynamic Status
                        emoji: true
                    },
                    action_id: 'noop_status_' + eng.name.replace(/\s/g, ''), // Unique ID
                    value: 'status',
                    // style: 'primary' // Removed style to keep it neutral or use logic to color code if needed
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

            // Action: Chat Button
            if (eng.slack_id && eng.slack_id !== "YOUR_SLACK_ID_HERE") {
                blocks.push({
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: '💬 Chat Now',
                                emoji: true
                            },
                            url: `slack://user?team=${body.team.id}&id=${eng.slack_id}`,
                            action_id: 'open_chat_' + eng.name.replace(/\s/g, '')
                        }
                    ]
                });
            } else {
                blocks.push({
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: "⚠️ *Setup Required:* Add Slack User ID in `schedule.json`."
                        }
                    ]
                });
            }

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
