# Cursor IDE Chat Injection: Comprehensive Research Report

**Date**: 2026-02-21
**Cursor Version**: 2.5.17
**OS**: macOS (Darwin arm64 25.0.0)

---

## Executive Summary

After thorough investigation of Cursor IDE's internals, we identified **10 distinct approaches** to programmatically inject/send messages into Cursor's chat. The three most promising approaches are:

1. **`cursor://` Deep Link Protocol** (95% probability) — Official, supported, works today
2. **`cursor agent` CLI with `--print` mode** (90% probability) — Official headless agent
3. **Custom VS Code Extension** (85% probability) — Clean, extensible, full control

---

## Approach 1: Cursor Deep Link Protocol (`cursor://`)

### Rating: BEST APPROACH
- **Probability**: 95%
- **Reliability**: High
- **Cleanliness**: Clean (officially supported protocol)

### How It Works

Cursor registers a custom URL scheme `cursor://` handled by the bundled `cursor-deeplink` extension. The deeplink router supports these routes:

| Route | Handler | Purpose |
|-------|---------|---------|
| `/prompt` | `handlePromptDeeplink` | **Prefill chat with text** |
| `/command` | `handleCommandDeeplink` | Create a Cursor rule/command |
| `/createchat` | `handleBugBotFixInCursor` | Create chat from external tool |
| `/background-agent` | `handleBackgroundAgentOpen` | Open background agent |
| `/mcp/install` | `handleMCPInstall` | Install MCP server |
| `/settings` | `handleSettingsOpen` | Open settings page |
| `/rule` | `handleRuleDeeplink` | Install a Cursor rule |
| `/pr-review` | `handlePrReviewDeeplink` | Open PR review |

### The `/prompt` Route (Primary Target)

**URL Format**:
```
cursor://anysphere.cursor-deeplink/prompt?text=YOUR_MESSAGE&mode=MODE&workspace=WORKSPACE_NAME
```

**Parameters**:
- `text` (required): The prompt text (URL-encoded)
- `mode` (optional): One of `ask`, `agent`, `debug`, `plan` (defaults to `agent`)
- `workspace` (optional): Target workspace name

**Usage from Terminal**:
```bash
open "cursor://anysphere.cursor-deeplink/prompt?text=Hello%20from%20automation"
open "cursor://anysphere.cursor-deeplink/prompt?text=Refactor%20this%20code&mode=agent"
```

**Limitations**:
- Requires user confirmation dialog (security feature)
- Cursor must be running
- Opens in the focused Cursor window

---

## Approach 2: Cursor Agent CLI (`cursor agent`)

### Rating: EXCELLENT FOR HEADLESS/PROGRAMMATIC USE
- **Probability**: 90%
- **Reliability**: High
- **Cleanliness**: Very Clean (official CLI tool)

### Key Options

| Flag | Description |
|------|-------------|
| `--print` | Non-interactive mode, prints output to stdout |
| `--output-format <fmt>` | `text`, `json`, or `stream-json` |
| `--workspace <path>` | Target workspace directory |
| `--model <model>` | Model selection |
| `--force` / `--yolo` | Auto-approve all commands |
| `--trust` | Trust workspace without prompting |
| `--resume [chatId]` | Resume existing chat |

### Limitations
- Requires `CURSOR_API_KEY`
- Runs as a separate process, NOT inside the IDE's composer
- Known issues: hangs in headless mode, 100% CPU spikes (beta)

---

## Approach 3: Custom VS Code Extension

### Rating: MOST FLEXIBLE
- **Probability**: 85%
- **Reliability**: High
- **Cleanliness**: Clean

### Key Commands Discovered

```typescript
vscode.commands.executeCommand("composer.openComposer");
vscode.commands.executeCommand("deeplink.prompt.prefill", {
  text: "Your message here",
  mode: "agent"
});
vscode.commands.executeCommand("cursor.aichat");
```

---

## Approach 4: Internal HTTP Servers (Extension Host)

### Rating: PROMISING BUT NEEDS AUTH TOKEN
- **Probability**: 40%

Cursor runs 4 localhost HTTP servers (one per extension host process) with token-based authentication. Tokens are generated at runtime and not easily discoverable.

---

## Approach 5: macOS Accessibility / AppleScript Automation

### Rating: WORKS BUT FRAGILE
- **Probability**: 75%

```applescript
tell application "Cursor" to activate
tell application "System Events"
  tell process "Cursor"
    keystroke "l" using command down
    delay 0.5
    keystroke "Hello from AppleScript automation"
    keystroke return
  end tell
end tell
```

Requires macOS Accessibility permissions. Fragile — depends on UI state and timing.

---

## Approach 6: Keyboard Simulation (Python/Node)

### Rating: WORKS BUT REQUIRES SETUP
- **Probability**: 70%

Uses `pyautogui` (Python) or `robotjs` (Node) to simulate keystrokes. Same limitations as AppleScript — requires Accessibility permissions and is fragile.

---

## Approach 7: Electron IPC / Unix Socket

### Rating: THEORETICALLY POSSIBLE
- **Probability**: 30%

Cursor has a Unix socket at `~/Library/Application Support/Cursor/2.5.-main.sock`. Protocol is internal and undocumented.

---

## Approach 8: MCP Server as Chat Trigger

### Rating: INDIRECT BUT USEFUL
- **Probability**: 60%

MCP servers can't directly inject messages but can provide tools and create side-channels for feeding instructions during active chats.

---

## Approach 9: JSONL Transcript / Database Manipulation

### Rating: READ-ONLY, NOT INJECTABLE
- **Probability**: 5%

Agent transcripts at `~/.cursor/projects/*/agent-transcripts/*.jsonl` are write-only logs. Cursor writes to them but never reads them back. Modifying them has no effect.

---

## Approach 10: NDJSON Ingest Server

### Rating: LOGGING ONLY, NOT CHAT
- **Probability**: 10%

Cursor includes a `cursor-ndjson-ingest` extension that accepts log data via HTTP. Designed for log ingestion, not chat injection.

---

## Approach Comparison Matrix

| # | Approach | Probability | Reliability | Cleanliness | Headless |
|---|----------|-------------|-------------|-------------|----------|
| 1 | **Deep Link `/prompt`** | 95% | High | Clean | No |
| 2 | **`cursor agent --print`** | 90% | High | Very Clean | Yes |
| 3 | **Custom Extension** | 85% | High | Clean | No |
| 4 | **Internal HTTP (w/ token)** | 40% | Medium | Hacky | No |
| 5 | **AppleScript/Accessibility** | 75% | Low-Med | Hacky | No |
| 6 | **Keyboard Simulation** | 70% | Low-Med | Hacky | No |
| 7 | **Electron IPC/Socket** | 30% | Low | Very Hacky | No |
| 8 | **MCP Side-Channel** | 60% | Medium | Clean | No |
| 9 | **JSONL/DB Manipulation** | 5% | Very Low | Very Hacky | Yes |
| 10 | **NDJSON Ingest** | 10% | N/A | Clean | No |

---

## Key Files & Locations Reference

| Path | Purpose |
|------|---------|
| `~/.cursor/mcp.json` | MCP server configuration |
| `~/.cursor/projects/*/agent-transcripts/` | Agent chat JSONL logs |
| `~/.cursor/cli-config.json` | CLI configuration and auth |
| `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` | Main state SQLite DB |
| `~/Library/Application Support/Cursor/2.5.-main.sock` | IPC Unix socket |

---

## Existing Open Source Solutions

### cursor_remote (github.com/terryso/cursor_remote)
- Uses Supabase + AppleScript to control Cursor from phone
- Sends messages TO Cursor via keyboard simulation
- 53 stars, active development

### cursor-autopilot (github.com/heyzgj/cursor-autopilot)
- VS Code extension that runs inside Cursor
- Sends chat summaries to Telegram/Email/Feishu
- Receives replies and injects them back into chat
- Uses internal commands: `composer.startComposerPrompt`, `aichat.newfollowupaction`, `composer.submitComposerPrompt`

### CRSR Mobile (crsrmobile.com)
- Commercial app ($9.99/mo) for controlling Cursor from phone
- iOS and Android
- End-to-end encrypted relay
