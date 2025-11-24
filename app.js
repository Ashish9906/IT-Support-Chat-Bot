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
