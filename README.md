# IT Support Bot (Multifactor LLP)

A Slack bot for internal IT support that connects users with on-shift engineers or provides AI assistance.

## Features
- **Slash Command**: `/it-help` opens a professional support modal.
- **Smart Scheduling**: Automatically detects the on-shift engineer based on IST time (Mon-Fri).
- **Timezone Aware**: Handles overnight shifts and timezone conversions using Luxon.
- **Pro UI**: Branded interface for Multifactor LLP.

## Prerequisites
1.  **GitHub Account**: To host this code.
2.  **Render.com Account**: To host the bot (Free tier works).
3.  **Slack Workspace**: Admin access to create apps.

## Step 1: Push Code to GitHub
1.  Create a new repository on GitHub (e.g., `it-support-bot`).
2.  Push the code from this folder to that repository.

## Step 2: Create Slack App
1.  Go to [api.slack.com/apps](https://api.slack.com/apps).
2.  Click **Create New App** -> **From scratch**.
3.  Name it **"IT Support Bot"** and select your workspace.
4.  **Bot User**:
    - Go to **App Home** (left sidebar).
    - Click **Review Scopes to Add**.
    - Scroll down to **Bot Token Scopes** and add:
        - `commands`
        - `chat:write`
5.  **Install App**:
    - Scroll up to **OAuth & Permissions**.
    - Click **Install to Workspace**.
    - **Copy the `Bot User OAuth Token`** (starts with `xoxb-`). Save this.
6.  **Signing Secret**:
    - Go to **Basic Information**.
    - Scroll to **App Credentials**.
    - **Copy the `Signing Secret`**. Save this.

## Step 3: Deploy to Render.com
1.  Log in to [Render.com](https://render.com).
2.  Click **New +** -> **Web Service**.
3.  Connect your GitHub repository.
4.  **Settings**:
    - **Name**: `it-support-bot`
    - **Runtime**: `Node`
    - **Build Command**: `npm install`
    - **Start Command**: `node app.js`
5.  **Environment Variables** (Scroll down):
    - Add `SLACK_BOT_TOKEN`: Paste the `xoxb-` token.
    - Add `SLACK_SIGNING_SECRET`: Paste the Signing Secret.
6.  Click **Create Web Service**.
7.  Wait for deployment to finish. **Copy the Service URL** (e.g., `https://it-bot.onrender.com`).

## Step 4: Configure Slack URLs
1.  Go back to your Slack App settings.
2.  **Slash Commands**:
    - Click **Slash Commands** -> **Create New Command**.
    - Command: `/it-help`
    - Request URL: `https://<YOUR-RENDER-URL>/slack/events`
    - Description: "Get IT Support"
    - Click **Save**.
3.  **Interactivity**:
    - Click **Interactivity & Shortcuts**.
    - Toggle **On**.
    - Request URL: `https://<YOUR-RENDER-URL>/slack/events`
    - Click **Save Changes**.

## Step 5: Test
1.  Go to Slack.
2.  Type `/it-help`.
3.  The bot should respond!
