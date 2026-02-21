import TelegramBot from 'node-telegram-bot-api';
import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, '.env');
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    process.env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
}

loadEnv();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const CLAUDE_PATH = process.env.CLAUDE_PATH || '/opt/homebrew/bin/claude';
let projectDir = (process.env.PROJECT_DIR || process.cwd()).replace(/^~\//, `${homedir()}/`);
let currentModel = 'sonnet';

if (!BOT_TOKEN || !ALLOWED_CHAT_ID) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
let busy = false;
const queue = [];

const home = homedir();
const PROJECTS = Object.fromEntries(
  (process.env.PROJECTS || 'idea01:~/mybackyard/idea01')
    .split(',')
    .map((entry) => {
      const [name, rawPath] = entry.trim().split(':');
      const fullPath = rawPath.startsWith('~/')
        ? resolve(home, rawPath.slice(2))
        : rawPath;
      return [name, fullPath];
    })
);

const MODELS = ['sonnet', 'opus', 'haiku'];

const MAX_MSG_LEN = 4096;

function sendLong(chatId, text) {
  if (!text || text.trim() === '') {
    return bot.sendMessage(chatId, '(empty response)');
  }
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, MAX_MSG_LEN));
    remaining = remaining.slice(MAX_MSG_LEN);
  }
  return chunks.reduce(
    (p, chunk) => p.then(() => bot.sendMessage(chatId, chunk)),
    Promise.resolve()
  );
}

function formatCost(parsed) {
  const cost = parsed.total_cost_usd;
  const input = parsed.usage?.input_tokens || 0;
  const output = parsed.usage?.output_tokens || 0;
  const duration = parsed.duration_ms ? (parsed.duration_ms / 1000).toFixed(1) : '?';
  const models = parsed.modelUsage
    ? Object.keys(parsed.modelUsage).map((m) => m.split('@')[0]).join(', ')
    : 'unknown';

  return `\n\n---\n$${cost.toFixed(4)} | ${input}+${output} tokens | ${duration}s | ${models}`;
}

function runClaude(prompt) {
  return new Promise((res, rej) => {
    const args = [
      '-p', prompt,
      '--max-turns', '5',
      '--dangerously-skip-permissions',
      '--output-format', 'json',
      '--model', currentModel,
    ];

    console.log(`[claude] Prompt: ${prompt.slice(0, 80)}...`);
    console.log(`[claude] CWD: ${projectDir} | Model: ${currentModel}`);

    const proc = spawn(CLAUDE_PATH, args, {
      cwd: projectDir,
      env: { ...process.env, FORCE_COLOR: '0', TERM: 'dumb' },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300_000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (stderr) console.log(`[claude] stderr: ${stderr.slice(0, 300)}`);
      if (code !== 0 && !stdout) {
        return rej(new Error(`claude exited with code ${code}: ${stderr.slice(0, 200)}`));
      }

      try {
        const parsed = JSON.parse(stdout);
        const responseText = parsed.result || '(no result)';
        const costInfo = formatCost(parsed);
        console.log(`[claude] Done. Cost: $${parsed.total_cost_usd?.toFixed(4)}`);
        res(responseText + costInfo);
      } catch {
        console.log(`[claude] Non-JSON response, length: ${stdout.length}`);
        res(stdout || '(no output)');
      }
    });

    proc.on('error', (err) => rej(err));
  });
}

async function processQueue() {
  if (busy || queue.length === 0) return;
  busy = true;

  const { chatId, text } = queue.shift();

  try {
    const typingInterval = setInterval(() => {
      bot.sendChatAction(chatId, 'typing').catch(() => {});
    }, 5000);
    await bot.sendChatAction(chatId, 'typing');

    const response = await runClaude(text);

    clearInterval(typingInterval);
    await sendLong(chatId, response);
  } catch (err) {
    console.error('[bot] Error:', err.message);
    await bot.sendMessage(chatId, `Error: ${err.message}`);
  }

  busy = false;
  processQueue();
}

// --- Button click handlers ---

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id.toString();
  if (chatId !== ALLOWED_CHAT_ID) return;

  const data = query.data;

  if (data.startsWith('project:')) {
    const name = data.slice(8);
    const path = PROJECTS[name];
    if (path && existsSync(path)) {
      projectDir = path;
      await bot.answerCallbackQuery(query.id, { text: `Switched to ${name}` });
      await bot.sendMessage(chatId, `Switched to: ${name}\n${path}`);
    } else {
      await bot.answerCallbackQuery(query.id, { text: 'Directory not found' });
    }
  } else if (data.startsWith('model:')) {
    currentModel = data.slice(6);
    await bot.answerCallbackQuery(query.id, { text: `Model: ${currentModel}` });
    await bot.sendMessage(chatId, `Model set to: ${currentModel}`);
  }
});

// --- Message handler ---

bot.on('message', async (msg) => {
  const chatId = msg.chat.id.toString();
  if (chatId !== ALLOWED_CHAT_ID) return;

  const text = (msg.text || '').trim();
  if (!text) return;

  // /help or /start
  if (text === '/help' || text === '/start') {
    const currentProject = Object.entries(PROJECTS).find(([, p]) => p === projectDir)?.[0] || 'custom';
    return bot.sendMessage(chatId, [
      'Commands:',
      '',
      'Just type a question — new conversation',
      '/project — switch project',
      '/model — switch AI model',
      '/help — show this',
      '',
      `Project: ${currentProject} | Model: ${currentModel}`,
    ].join('\n'));
  }

  // /project — show inline buttons
  if (text === '/project' || text === '/projects') {
    const currentName = Object.entries(PROJECTS).find(([, p]) => p === projectDir)?.[0] || '';
    const buttons = Object.keys(PROJECTS).map((name) => ([{
      text: `${name === currentName ? '> ' : ''}${name}`,
      callback_data: `project:${name}`,
    }]));
    return bot.sendMessage(chatId, 'Pick a project:', {
      reply_markup: { inline_keyboard: buttons },
    });
  }

  // /project <name> — direct switch
  if (text.startsWith('/project ')) {
    let newDir = text.slice(9).trim();
    if (PROJECTS[newDir]) {
      newDir = PROJECTS[newDir];
    } else if (newDir.startsWith('~/')) {
      newDir = resolve(homedir(), newDir.slice(2));
    }
    if (!existsSync(newDir)) {
      return bot.sendMessage(chatId, `Directory not found: ${newDir}`);
    }
    projectDir = newDir;
    return bot.sendMessage(chatId, `Switched to: ${newDir}`);
  }

  // /model — show inline buttons
  if (text === '/model') {
    const buttons = MODELS.map((m) => ([{
      text: `${m === currentModel ? '> ' : ''}${m}`,
      callback_data: `model:${m}`,
    }]));
    return bot.sendMessage(chatId, `Pick a model (current: ${currentModel}):`, {
      reply_markup: { inline_keyboard: buttons },
    });
  }

  // Regular message — new conversation
  queue.push({ chatId, text });
  if (queue.length > 1) {
    await bot.sendMessage(chatId, `Queued (${queue.length - 1} ahead)...`);
  }
  processQueue();
});

bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message);
});

console.log(`Bot started. Chat: ${ALLOWED_CHAT_ID}`);
console.log(`Project: ${projectDir}`);
console.log(`Model: ${currentModel}`);
console.log(`Claude: ${CLAUDE_PATH}`);
