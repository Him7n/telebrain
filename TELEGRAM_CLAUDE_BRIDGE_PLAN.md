# Telegram + Claude Code Bridge — Detailed Plan

## What Are We Building?

A small Node.js script that runs on your Mac and acts as a bridge between
Telegram (on your phone) and Claude Code (on your Mac). You chat in Telegram,
Claude Code reads your actual project files and answers.

```
┌──────────────┐        ┌─────────────────────────────────┐
│  Your Phone  │        │          Your Mac                │
│              │        │                                 │
│  Telegram    │◄──────►│  Telegram Bot (Node.js script)  │
│  App         │  HTTPS │       │                         │
│              │        │       ▼                         │
└──────────────┘        │  Claude Code CLI                │
                        │       │                         │
                        │       ▼                         │
                        │  Your Project Files             │
                        │  ~/mybackyard/idea01/           │
                        └─────────────────────────────────┘
```

No servers to deploy. No tunnels. No SSH. No API keys to manage.
The Telegram Bot API handles all the networking — your Mac just polls for
new messages over HTTPS (outbound only, no ports to open).


## How It Works Step by Step

### 1. You send a message on Telegram
Example: "What does the auth module do?"

### 2. Telegram delivers it to your Mac
The Node.js script on your Mac is polling Telegram's servers for new messages.
This is an OUTBOUND HTTPS connection from your Mac — no firewall issues,
no ports to open, no tunnels needed.

### 3. The script calls Claude Code
It runs:
```
claude -p "What does the auth module do?" --output-format text --max-turns 3
```
This runs in your project directory, so Claude Code has full access to your
codebase. It reads files, searches code, and generates an answer.

### 4. The script sends the response back to Telegram
You see Claude's answer in Telegram on your phone.

### 5. You can continue the conversation
By passing `--continue` or `--resume` flags, Claude Code remembers the
previous context and you can have a multi-turn conversation.


## Your Current Setup (What We're Working With)

| Component                | Status              | Details                              |
|--------------------------|---------------------|--------------------------------------|
| Claude Code CLI          | Installed (v2.0.58) | `/opt/homebrew/bin/claude`           |
| Auth Method              | Google Vertex AI    | Via your Harness GCP account         |
| GCP Project              | int-code-assist-setup | Vertex AI project                  |
| GCP Account              | himanshu.sharma@harness.io | Already authenticated via gcloud |
| GCP Region               | us-east5            | Vertex AI region                     |
| Env vars (in ~/.zshrc)   | Set                 | CLAUDE_CODE_USE_VERTEX=1, ANTHROPIC_VERTEX_PROJECT_ID |
| Node.js                  | Needs checking      | Required for the bot script          |
| Telegram                 | On your phone       | You'll create a bot via @BotFather   |


## Authentication Flow (No Extra API Key Needed)

You're using Claude Code through **Google Vertex AI** with your Harness
work account. This means:

```
Telegram Bot (Node.js)
    │
    ▼
claude -p "question" (CLI)
    │
    ▼
Vertex AI (GCP) ◄── authenticated via gcloud
    │                  (himanshu.sharma@harness.io)
    ▼
Claude AI Model
```

- No Anthropic API key needed
- No Claude subscription needed
- Uses your existing GCP/Vertex credentials
- The `gcloud` auth token refreshes automatically
- Cost: billed to your GCP project (int-code-assist-setup)

**Important:** The Node.js script must inherit your shell environment
(specifically `CLAUDE_CODE_USE_VERTEX`, `ANTHROPIC_VERTEX_PROJECT_ID`,
and gcloud credentials). We'll handle this by sourcing your `.zshrc`
or passing env vars explicitly.


## Prerequisites (What You Need to Do)

### 1. Create a Telegram Bot (2 minutes)

1. Open Telegram on your phone
2. Search for `@BotFather`
3. Send `/newbot`
4. Choose a name (e.g., "My Code Assistant")
5. Choose a username (e.g., "my_code_assistant_bot")
6. BotFather gives you a **bot token** like: `7123456789:AAF1234...`
7. Save this token — we'll use it in the script

### 2. Get Your Telegram Chat ID

1. Open your new bot in Telegram and send it any message (e.g., "hello")
2. In your browser, go to: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
3. Find `"chat":{"id":123456789}` — that number is your chat ID
4. We'll use this to ensure ONLY you can talk to the bot (security)

### 3. Verify Node.js is installed on your Mac

```bash
node --version   # Need v18+
npm --version
```

### 4. Verify Claude Code works

```bash
cd ~/mybackyard/idea01
claude -p "say hello" --output-format text --max-turns 1
```

If this hangs or errors, we need to fix the Vertex auth first.


## The Script (What We'll Build)

One file: `~/mybackyard/idea01/telegram-bridge/bot.js`

```
telegram-bridge/
├── bot.js          # The entire bot (< 100 lines)
├── package.json    # Dependencies (just node-telegram-bot-api)
└── .env            # Bot token and chat ID (gitignored)
```

### What bot.js does:

1. Starts a Telegram bot using long-polling (no webhook, no server)
2. Listens for messages from YOUR chat ID only (security)
3. When a message arrives:
   a. Shows "typing..." indicator in Telegram
   b. Spawns `claude -p "<your message>"` as a child process
   c. Sets the working directory to your project root
   d. Passes your shell environment (for Vertex auth)
   e. Waits for Claude to finish
   f. Sends the output back to Telegram
4. Supports special commands:
   - `/continue` — continue the last conversation
   - `/project <path>` — switch to a different project directory
   - `/help` — show available commands

### Dependencies:

- `node-telegram-bot-api` — the only dependency (well-maintained, 55k+ weekly downloads)
- That's it. Everything else is Node.js built-ins.


## Security

| Concern                | How We Handle It                              |
|------------------------|-----------------------------------------------|
| Who can talk to the bot? | Only YOUR chat ID is allowed (hardcoded)     |
| Bot token exposure     | Stored in .env file, gitignored               |
| File system access     | Claude Code runs in the project dir only      |
| Network exposure       | No open ports — bot polls Telegram (outbound) |
| GCP credentials        | Stay on your Mac, never sent to Telegram      |


## Limitations (Being Honest)

| Limitation                        | Why                                           | Workaround                      |
|-----------------------------------|-----------------------------------------------|---------------------------------|
| Telegram message limit: 4096 chars | Telegram API limit                            | Long responses split into parts |
| Claude Code may be slow            | Vertex AI latency + Claude thinking time      | Use --max-turns to limit scope  |
| No streaming                      | CLI -p mode waits for full response           | Just wait (show typing indicator)|
| Can't send images/diffs           | Text only through Telegram                    | Could add markdown formatting   |
| No inline code editing            | This is for Q&A only                          | Use Cursor IDE for editing      |
| Session context                   | Each message is independent by default        | Use --continue for follow-ups   |


## How to Run It

### Start the bot:
```bash
cd ~/mybackyard/idea01/telegram-bridge
node bot.js
```

### Keep it running in the background:
```bash
nohup node bot.js > bot.log 2>&1 &
```

### Or use pm2 for auto-restart:
```bash
npm install -g pm2
pm2 start bot.js --name "telegram-claude"
pm2 startup   # auto-start on Mac boot
pm2 save
```


## What the Experience Looks Like

```
You (Telegram):  What does the checkout function do in payment.ts?

Bot (thinking...): ⏳

Bot:  The checkout function in payment.ts handles the payment flow:
      1. Validates the cart items against inventory
      2. Calculates tax based on user's region
      3. Creates a Stripe PaymentIntent
      4. Records the transaction in the database
      
      Key files involved:
      - src/payment.ts (main logic, lines 45-120)
      - src/utils/tax.ts (tax calculation)
      - src/db/transactions.ts (database recording)

You:  /continue What about error handling?

Bot:  Building on the previous context, the checkout function
      handles errors at three levels:
      ...
```


## Cost

- **Telegram Bot**: Free (Telegram Bot API is free forever)
- **Claude Code via Vertex**: Billed to your GCP project
  - Claude Sonnet via Vertex: ~$3 per million input tokens, ~$15 per million output tokens
  - A typical Q&A exchange: ~2000 input tokens + ~500 output tokens ≈ $0.01
  - Heavy daily use (50 questions): ~$0.50/day
  - This is billed to the `int-code-assist-setup` GCP project


## Build Steps (What I'll Do When You Say Go)

1. Create `telegram-bridge/` directory
2. Initialize `package.json` with `node-telegram-bot-api` dependency
3. Create `bot.js` with the full bot logic
4. Create `.env.example` with placeholder values
5. Add `.env` to `.gitignore`
6. Test it end-to-end

Total build time: ~15 minutes.
