# telebrain

Chat with your codebase from your phone via Telegram. Ask questions about your code, switch between projects, and pick your AI model — all from a Telegram bot that runs Claude Code on your Mac.

## How it works

```
Phone (Telegram) --> Telegram API --> Your Mac (Node.js bot) --> Claude Code CLI --> Your project files
```

The bot runs on your Mac as a small Node.js script. When you send a message on Telegram, it calls Claude Code in print mode (`claude -p`), which reads your actual project files and responds. No servers to deploy, no tunnels, no ports to open — the bot polls Telegram over HTTPS (outbound only).

Each message is a fresh, stateless call. Claude reads your codebase every time, so it always sees the latest code — but it doesn't remember previous messages.

## Prerequisites

- **macOS** with [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) installed and authenticated
- **Node.js 18+**
- A **Telegram account**

## Setup

### 1. Create a Telegram bot

1. Open Telegram, search for `@BotFather`
2. Send `/newbot`, pick a name and username
3. Copy the bot token

### 2. Get your chat ID

1. Send any message to your new bot
2. Open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser
3. Find `"chat":{"id":123456789}` — that's your chat ID

### 3. Configure and run

```bash
cd telegram-bridge
cp .env.example .env
# Edit .env with your bot token, chat ID, and project paths
npm install
node bot.js
```

### 4. Keep it running (optional)

```bash
# Simple background
nohup node bot.js > bot.log 2>&1 &

# Or with auto-restart via pm2
npm install -g pm2
pm2 start bot.js --name telebrain
pm2 startup && pm2 save
```

## Usage

Open your bot in Telegram and start chatting:

- **Type any question** — asks Claude about the current project
- `/project` — tap to switch between configured projects
- `/model` — tap to switch AI model (sonnet, opus, haiku)
- `/help` — show commands

Every response includes cost, token count, duration, and which model was used.

## Configuration

All config lives in `.env`:

```
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id
PROJECT_DIR=~/default-project
PROJECTS=myapp:~/myapp,backend:~/work/backend,frontend:~/work/frontend
```

Only your Telegram chat ID can talk to the bot — all other messages are ignored.

## Cost

Each question costs roughly $0.03–0.15 depending on project size and response length (billed through your Claude Code / Vertex AI setup). The cost is shown after every response.
