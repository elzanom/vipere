import fs from "fs";
import { log } from "./logger.js";
import { repoPath } from "./repo-root.js";
import { generatePnLImage } from "./pnl-card.js";
import { getStrategy, getActiveStrategy } from "./strategy-library.js";

const USER_CONFIG_PATH = repoPath("user-config.json");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || null;
const BASE  = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;
const ALLOWED_USER_IDS = new Set(
  String(process.env.TELEGRAM_ALLOWED_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

let chatId = null;
let threadId = process.env.TELEGRAM_THREAD_ID || null;
let _offset  = 0;
let _polling = false;
let _liveMessageDepth = 0;
let _warnedMissingChatId = false;
let _warnedMissingAllowedUsers = false;

let telegramLogBehavior = "default";

// ─── config and chatId persistence ──────────────────────────────────────────
function nonEmptyChatId(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function resolveChatId() {
  const fromEnv = nonEmptyChatId(process.env.TELEGRAM_CHAT_ID);
  let fromConfig = null;
  try {
    if (fs.existsSync(USER_CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(USER_CONFIG_PATH, "utf8"));
      fromConfig = nonEmptyChatId(cfg.telegramChatId);
    }
  } catch { /* ignore */ }
  // user-config wins when set; otherwise fall back to .env
  const resolved = fromConfig || fromEnv || null;
  return resolved != null ? String(resolved) : null;
}

function loadChatId() {
  chatId = resolveChatId();
}

// ─── config and chatId persistence ──────────────────────────────────────────
function loadConfig() {
  try {
    if (fs.existsSync(USER_CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(USER_CONFIG_PATH, "utf8"));
      chatId = nonEmptyChatId(cfg.telegramChatId) || chatId;
      if (cfg.telegramThreadId !== undefined) threadId = cfg.telegramThreadId;
      if (cfg.telegramLogBehavior) telegramLogBehavior = cfg.telegramLogBehavior;
    }
  } catch (error) {
    log("telegram_warn", `Invalid user-config.json; config not loaded: ${error.message}`);
  }
}

function saveChatId(id) {
  try {
    let cfg = fs.existsSync(USER_CONFIG_PATH)
      ? JSON.parse(fs.readFileSync(USER_CONFIG_PATH, "utf8"))
      : {};
    cfg.telegramChatId = id;
    fs.writeFileSync(USER_CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch (e) {
    log("telegram_error", `Failed to persist chatId: ${e.message}`);
  }
}

loadConfig();

// ─── lastMessageId persistence ──────────────────────────────────
function loadLastMessageId(slot = "default") {
  try {
    const statePath = repoPath("state.json");
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
      if (slot !== "default") {
        return state.lastTelegramMessageIds?.[slot] || null;
      }
      return state.lastTelegramMessageId || null;
    }
  } catch (e) {
    // Ignore read errors
  }
  return null;
}

function saveLastMessageId(id, slot = "default") {
  try {
    const statePath = repoPath("state.json");
    let state = {};
    if (fs.existsSync(statePath)) {
      state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    }
    if (slot === "default") {
      state.lastTelegramMessageId = id;
    } else {
      state.lastTelegramMessageIds = state.lastTelegramMessageIds || {};
      state.lastTelegramMessageIds[slot] = id;
    }
    state.lastUpdated = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch (e) {
    log("telegram_error", `Failed to save lastTelegramMessageId: ${e.message}`);
  }
}

function isAuthorizedIncomingMessage(msg) {
  const incomingChatId = String(msg.chat?.id || "");
  const senderUserId = msg.from?.id != null ? String(msg.from.id) : null;
  const chatType = msg.chat?.type || "unknown";

  if (!chatId) {
    if (!_warnedMissingChatId) {
      log("telegram_warn", "Ignoring inbound Telegram messages because TELEGRAM_CHAT_ID / user-config.telegramChatId is not configured. Auto-registration is disabled for safety.");
      _warnedMissingChatId = true;
    }
    return false;
  }

  if (incomingChatId !== String(chatId)) return false;

  if (threadId && String(msg.message_thread_id || "") !== String(threadId)) return false;

  if (chatType !== "private" && ALLOWED_USER_IDS.size === 0) {
    if (!_warnedMissingAllowedUsers) {
      log("telegram_warn", "Ignoring group Telegram messages because TELEGRAM_ALLOWED_USER_IDS is not configured. Set explicit allowed user IDs for command/control.");
      _warnedMissingAllowedUsers = true;
    }
    return false;
  }

  if (ALLOWED_USER_IDS.size > 0) {
    if (!senderUserId || !ALLOWED_USER_IDS.has(senderUserId)) return false;
  }

  return true;
}

// ─── Core send ───────────────────────────────────────────────────
export function isEnabled() {
  return !!TOKEN;
}

async function postTelegram(method, body) {
  if (!TOKEN || !chatId) return null;
  try {
    const payload = { chat_id: chatId, ...body };
    if (threadId && (method === "sendMessage" || method === "sendChatAction")) {
      payload.message_thread_id = Number(threadId);
    }
    const res = await fetch(`${BASE}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      if (res.status === 401) {
        log("telegram_error", `${method} 401 Unauthorized — check TELEGRAM_BOT_TOKEN in .env (invalid, revoked, or encrypted without .envrypt key)`);
      } else {
        log("telegram_error", `${method} ${res.status}: ${err.slice(0, 200)}`);
      }
      if (err.includes("message is not modified")) {
        return { ok: true, notModified: true };
      }
      return null;
    }
    return await res.json();
  } catch (e) {
    log("telegram_error", `${method} failed: ${e.message}`);
    return null;
  }
}

async function postTelegramRaw(method, body) {
  if (!TOKEN) return null;
  try {
    const res = await fetch(`${BASE}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      if (res.status === 401) {
        log("telegram_error", `${method} 401 Unauthorized — check TELEGRAM_BOT_TOKEN in .env (invalid, revoked, or encrypted without .envrypt key)`);
      } else {
        log("telegram_error", `${method} ${res.status}: ${err.slice(0, 200)}`);
      }
      return null;
    }
    return await res.json();
  } catch (e) {
    log("telegram_error", `${method} failed: ${e.message}`);
    return null;
  }
}

export async function sendMessage(text) {
  if (!TOKEN || !chatId) return;
  return postTelegram("sendMessage", { text: String(text).slice(0, 4096), parse_mode: "HTML" });
}

export async function sendMessageWithButtons(text, inlineKeyboard) {
  if (!TOKEN || !chatId) return;
  return postTelegram("sendMessage", {
    text: String(text).slice(0, 4096),
    reply_markup: { inline_keyboard: inlineKeyboard },
    parse_mode: "HTML",
  });
}

function defaultActionKeyboard() {
  return [
    [
      { text: "\u{1F4CA} Status", callback_data: "/status" },
      { text: "\u{1F4CB} Positions", callback_data: "/positions" },
    ],
    [
      { text: "\u{1F50D} Candidates", callback_data: "/candidates" },
      { text: "\u2699\uFE0F Settings", callback_data: "/settings" },
    ],
    [
      { text: "\u{1F504} Manage", callback_data: "/manage" },
      { text: "\u{1F4C8} Briefing", callback_data: "/briefing" },
      { text: "\u23F8\uFE0F Pause", callback_data: "/pause" },
    ],
  ];
}

export async function sendActionMessage(text, inlineKeyboard = defaultActionKeyboard()) {
  return sendMessageWithButtons(text, inlineKeyboard);
}

export async function sendManagedActionMessage(text, inlineKeyboard = defaultActionKeyboard(), slot = "default") {
  loadConfig();

  const hasButtons = Array.isArray(inlineKeyboard) && inlineKeyboard.length > 0;

  if (telegramLogBehavior === "delete") {
    const prevId = loadLastMessageId(slot);
    if (prevId) {
      await deleteMessage(prevId).catch(() => {});
    }
  }

  if (telegramLogBehavior === "overwrite") {
    const prevId = loadLastMessageId(slot);
    if (prevId) {
      const edited = hasButtons
        ? await editMessageWithButtons(text, prevId, inlineKeyboard)
        : await editMessage(text, prevId);
      if (edited) return edited;
    }
  }

  const sent = hasButtons
    ? await sendMessageWithButtons(text, inlineKeyboard)
    : await sendMessage(text);
  const messageId = sent?.result?.message_id ?? null;
  if (messageId && (telegramLogBehavior === "overwrite" || telegramLogBehavior === "delete")) {
    saveLastMessageId(messageId, slot);
  }
  return sent;
}

export async function sendHTML(html) {
  if (!TOKEN || !chatId) return;
  return postTelegram("sendMessage", { text: html.slice(0, 4096), parse_mode: "HTML" });
}

export async function sendPhoto(buffer, caption = "") {
  if (!TOKEN || !chatId) return;
  try {
    const formData = new FormData();
    formData.append("chat_id", chatId);
    if (threadId) {
      formData.append("message_thread_id", String(threadId));
    }
    if (caption) {
      formData.append("caption", caption.slice(0, 1024));
      formData.append("parse_mode", "HTML");
    }
    formData.append("photo", new Blob([buffer], { type: "image/png" }), "pnl.png");

    const res = await fetch(`${BASE}/sendPhoto`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.text();
      log("telegram_error", `sendPhoto ${res.status}: ${err.slice(0, 200)}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    log("telegram_error", `sendPhoto failed: ${e.message}`);
    return null;
  }
}

export async function editMessage(text, messageId) {
  if (!TOKEN || !chatId || !messageId) return null;
  return postTelegram("editMessageText", {
    message_id: messageId,
    text: String(text).slice(0, 4096),
    parse_mode: "HTML",
  });
}

export async function editMessageWithButtons(text, messageId, inlineKeyboard) {
  if (!TOKEN || !chatId || !messageId) return null;
  return postTelegram("editMessageText", {
    message_id: messageId,
    text: String(text).slice(0, 4096),
    reply_markup: { inline_keyboard: inlineKeyboard },
    parse_mode: "HTML",
  });
}

export async function deleteMessage(messageId) {
  if (!TOKEN || !chatId || !messageId) return null;
  return postTelegram("deleteMessage", { message_id: messageId });
}

export async function answerCallbackQuery(callbackQueryId, text = "") {
  if (!TOKEN || !callbackQueryId) return null;
  return postTelegramRaw("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text: String(text).slice(0, 200) } : {}),
  });
}

export async function setupBotCommands() {
  if (!TOKEN) return null;
  return postTelegramRaw("setMyCommands", {
    commands: [
      { command: "start", description: "Open main menu" },
      { command: "help", description: "Show command list" },
      { command: "status", description: "Wallet and position snapshot" },
      { command: "wallet", description: "Wallet balance and deploy amount" },
      { command: "positions", description: "List open positions" },
      { command: "config", description: "Show runtime config" },
      { command: "strategy", description: "Show LP strategies" },
      { command: "settings", description: "Open settings menu" },
      { command: "manage", description: "Run management cycle now" },
      { command: "screen", description: "Refresh pool candidates" },
      { command: "candidates", description: "Show cached candidates" },
      { command: "briefing", description: "Show 24h briefing" },
      { command: "pause", description: "Pause autonomous cycles" },
      { command: "resume", description: "Resume autonomous cycles" },
      { command: "restart", description: "Restart the agent process" },
      { command: "hive", description: "HiveMind status" },
    ],
  });
}

export function hasActiveLiveMessage() {
  return _liveMessageDepth > 0;
}

function createTypingIndicator() {
  if (!TOKEN || !chatId) {
    return { stop() {} };
  }

  let stopped = false;
  let timer = null;

  async function tick() {
    if (stopped) return;
    await postTelegram("sendChatAction", { action: "typing" });
    timer = setTimeout(() => {
      tick().catch(() => null);
    }, 4000);
  }

  tick().catch(() => null);

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

function toolLabel(name) {
  const labels = {
    get_token_info: "get token info",
    get_token_narrative: "get token narrative",
    get_token_holders: "get token holders",
    get_top_candidates: "get top candidates",
    get_pool_detail: "get pool detail",
    get_active_bin: "get active bin",
    deploy_position: "deploy position",
    close_position: "close position",
    claim_fees: "claim fees",
    swap_token: "swap token",
    update_config: "update config",
    get_my_positions: "get positions",
    get_wallet_balance: "get wallet balance",
    check_smart_wallets_on_pool: "check smart wallets",
    study_top_lpers: "study top LPers",
    get_top_lpers: "get top LPers",
    search_pools: "search pools",
    discover_pools: "discover pools",
  };
  return labels[name] || name.replace(/_/g, " ");
}

function summarizeToolResult(name, result) {
  if (!result) return "";
  if (result.error) return result.error;
  if (result.reason && result.blocked) return result.reason;
  switch (name) {
    case "deploy_position":
      return result.position ? `position ${String(result.position).slice(0, 8)}...` : "submitted";
    case "close_position":
      return result.success ? "closed" : (result.reason || "failed");
    case "claim_fees":
      return result.claimed_amount != null ? `claimed ${result.claimed_amount}` : "done";
    case "update_config":
      return Object.keys(result.applied || {}).join(", ") || "updated";
    case "get_top_candidates":
      return `${result.candidates?.length ?? 0} candidates`;
    case "get_my_positions":
      return `${result.total_positions ?? result.positions?.length ?? 0} positions`;
    case "get_wallet_balance":
      return `${result.sol ?? "?"} SOL`;
    case "study_top_lpers":
    case "get_top_lpers":
      return `${result.lpers?.length ?? 0} LPers`;
    default:
      return result.success === false ? "failed" : "done";
  }
}

export async function createLiveMessage(title, intro = "Starting...") {
  if (!TOKEN || !chatId) return null;
  const typing = createTypingIndicator();

  // Reload config to pick up runtime behavior changes
  loadConfig();

  const state = {
    title,
    intro,
    toolLines: [],
    footer: "",
    messageId: null,
    lastText: "",
    flushTimer: null,
    flushPromise: null,
    flushRequested: false,
  };

  // Respect configured Telegram log behavior
  if (telegramLogBehavior === "overwrite") {
    state.messageId = loadLastMessageId();
  } else if (telegramLogBehavior === "delete") {
    const prevId = loadLastMessageId();
    if (prevId) {
      deleteMessage(prevId).catch(() => {});
    }
  }

  function render() {
    const sections = [`${state.title}`, "━━━━━━━━━━━━━━━━"];
    if (state.intro) sections.push(`Status\n${state.intro}`);
    if (state.toolLines.length > 0) sections.push(`Tools\n${state.toolLines.join("\n")}`);
    if (state.footer) sections.push(`Result\n${state.footer}`);
    return sections.join("\n\n").slice(0, 4096);
  }

  async function flushNow({ buttons = false } = {}) {
    state.flushTimer = null;
    state.flushRequested = false;
    const text = render();
    if (text === state.lastText) return;

    if (!state.messageId) {
      const sent = buttons
        ? await sendMessageWithButtons(text, defaultActionKeyboard())
        : await sendMessage(text);
      state.messageId = sent?.result?.message_id ?? null;
      if (state.messageId && (telegramLogBehavior === "overwrite" || telegramLogBehavior === "delete")) {
        saveLastMessageId(state.messageId);
      }
      state.lastText = text;
      return;
    }

    let success = false;
    if (buttons) {
      const res = await editMessageWithButtons(text, state.messageId, defaultActionKeyboard());
      success = !!res;
    } else {
      const res = await editMessage(text, state.messageId);
      success = !!res;
    }

    // If edit failed (message deleted, too old, or invalid), fallback to sending a new one
    if (!success) {
      const sent = buttons
        ? await sendMessageWithButtons(text, defaultActionKeyboard())
        : await sendMessage(text);
      state.messageId = sent?.result?.message_id ?? null;
      if (state.messageId && (telegramLogBehavior === "overwrite" || telegramLogBehavior === "delete")) {
        saveLastMessageId(state.messageId);
      }
    }
    state.lastText = text;
  }

  function scheduleFlush(delay = 300) {
    if (state.flushTimer) {
      state.flushRequested = true;
      return;
    }
    state.flushTimer = setTimeout(() => {
      state.flushPromise = flushNow().catch(() => null);
    }, delay);
  }

  async function upsertToolLine(name, icon, suffix = "") {
    const label = toolLabel(name);
    const line = `${icon} ${label}${suffix ? `\n   ${suffix}` : ""}`;
    const idx = state.toolLines.findIndex((entry) => entry.includes(` ${label}`));
    if (idx >= 0) state.toolLines[idx] = line;
    else state.toolLines.push(line);
    scheduleFlush();
  }

  _liveMessageDepth += 1;
  await flushNow();

  return {
    async toolStart(name) {
      await upsertToolLine(name, "ℹ️", "...");
    },
    async toolFinish(name, result, success) {
      const icon = success ? "✅" : "❌";
      const summary = summarizeToolResult(name, result);
      await upsertToolLine(name, icon, summary ? `— ${summary}` : "");
    },
    async note(text) {
      state.intro = text;
      scheduleFlush();
    },
    async finalize(finalText, { actions = false } = {}) {
      if (state.flushTimer) {
        clearTimeout(state.flushTimer);
        state.flushTimer = null;
      }
      if (state.flushPromise) await state.flushPromise;
      state.footer = formatAgentReport(finalText);
      await flushNow({ buttons: actions });
      _liveMessageDepth = Math.max(0, _liveMessageDepth - 1);
      typing.stop();
    },
    async fail(errorText) {
      if (state.flushTimer) {
        clearTimeout(state.flushTimer);
        state.flushTimer = null;
      }
      if (state.flushPromise) await state.flushPromise;
      state.footer = `❌ ${errorText}`;
      await flushNow();
      _liveMessageDepth = Math.max(0, _liveMessageDepth - 1);
      typing.stop();
    },
  };
}

export function formatAgentReport(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (/Summary:\s*💼/i.test(raw) || /\|\s*Age:\s*.*\|\s*Val:/i.test(raw)) return formatManagementReport(raw);
  if (/🚀\s*DEPLOYED|^DEPLOYED\b/i.test(raw)) return formatDeployReport(raw);
  if (/⛔\s*NO DEPLOY|NO DEPLOY/i.test(raw)) return formatNoDeployReport(raw);
  return escapeHtml(raw);
}

function extractLineAfter(raw, label) {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const idx = lines.findIndex((line) => line.toUpperCase() === label.toUpperCase());
  return idx >= 0 ? lines[idx + 1] || null : null;
}

function extractSection(raw, label, nextLabels = []) {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().toUpperCase() === label.toUpperCase());
  if (start < 0) return null;
  const next = lines.findIndex((line, i) =>
    i > start && nextLabels.includes(line.trim().toUpperCase())
  );
  return lines.slice(start + 1, next > start ? next : undefined).join("\n").trim() || null;
}

function firstMatch(raw, pattern) {
  const match = raw.match(pattern);
  return match?.[1]?.trim() || null;
}

function formatDeployReport(raw) {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const titleIdx = lines.findIndex((line) => /DEPLOYED/i.test(line));
  const pair = lines[titleIdx + 1] || firstMatch(raw, /POOL:\s*([^\n]+)/i) || "Unknown pool";
  const pool = lines[titleIdx + 2] || null;
  const amount = firstMatch(raw, /◎\s*([^|]+)\|/i) || firstMatch(raw, /^Amount:\s*([^\n]+)/im);
  const range = firstMatch(raw, /^Range:\s*([^\n]+)/im);
  const feeTvl = firstMatch(raw, /^Fee\/TVL:\s*([^\n]+)/im);
  const volume = firstMatch(raw, /^Volume:\s*([^\n]+)/im);
  const tvl = firstMatch(raw, /^TVL:\s*([^\n]+)/im);
  const organic = firstMatch(raw, /^Organic:\s*([^\n]+)/im);
  const risk = extractSection(raw, "RISK", ["WHY THIS WON"]) || "n/a";
  const why = extractSection(raw, "WHY THIS WON", []) || "";

  return [
    "🚀 DEPLOYED",
    "",
    pair,
    pool ? `Pool: ${pool}` : null,
    "",
    amount ? `Size: ${amount}` : null,
    range ? `Range: ${range}` : null,
    "",
    "Market",
    feeTvl ? `Fee/TVL: ${feeTvl}` : null,
    volume ? `Volume: ${volume}` : null,
    tvl ? `TVL: ${tvl}` : null,
    organic ? `Organic: ${organic}` : null,
    "",
    "Risk",
    risk,
    why ? "" : null,
    why ? "Why" : null,
    why ? compactText(why, 700) : null,
  ].filter(Boolean).join("\n").slice(0, 4096);
}

function formatNoDeployReport(raw) {
  const best = extractLineAfter(raw, "BEST LOOKING CANDIDATE");
  const why = extractSection(raw, "WHY SKIPPED", ["REJECTED"]) || firstMatch(raw, /Reason:\s*([\s\S]+)/i) || "";
  const rejected = extractSection(raw, "REJECTED", []) || "";
  return [
    "⛔ NO DEPLOY",
    "",
    best ? `Best: ${best}` : "Best: none",
    "",
    "Reason",
    compactText(why, 900) || "No qualifying entry.",
    rejected ? "" : null,
    rejected ? "Rejected" : null,
    rejected ? compactText(rejected, 900) : null,
  ].filter(Boolean).join("\n").slice(0, 4096);
}

function formatManagementReport(raw) {
  const summary = firstMatch(raw, /^Summary:\s*([^\n]+)/im);
  const body = summary ? raw.replace(/^Summary:\s*[^\n]+/im, "").trim() : raw;
  const blocks = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !/^Summary:/i.test(block));

  const positions = blocks
    .filter((block) => block.startsWith("🟢") || block.startsWith("🔴"))
    .map(formatManagementPositionBlock)
    .filter(Boolean);

  const extra = blocks
    .filter((block) => !(block.startsWith("🟢") || block.startsWith("🔴")))
    .join("\n\n")
    .trim();
  const extraMeaningful = extra && !/^No tool actions needed\.?$/i.test(extra);

  return [
    "🔄 <b>SYSTEM MONITORING CYCLE</b>",
    "━━━━━━━━━━━━━━━━━━━━━━",
    summary ? formatManagementSummary(summary) : null,
    positions.length ? "\n" + positions.join("\n\n") : null,
    extraMeaningful ? "\n🛠️ <b>Actions</b>\n" + compactText(extra, 900) : null,
  ].filter(Boolean).join("\n").slice(0, 4096);
}

function formatManagementSummary(summary) {
  const positions = firstMatch(summary, /💼\s*([0-9]+)\s+positions/i);
  const totalValue = firstMatch(summary, /positions\s*\|\s*([^|]+?)\s*\|\s*fees:/i);
  const fees = firstMatch(summary, /fees:\s*([^|]+?)\s*\|/i);
  const action = summary.split("|").pop()?.trim();
  
  const isPM2 = !!process.env.pm_id;
  const sysMode = isPM2 ? "Autonomous (PM2)" : "Autonomous (Node)";

  return [
    "💼 <b>PORTFOLIO STATUS</b>",
    positions ? `  ▸ Positions : <code>${positions} active</code>` : null,
    totalValue ? `  ▸ Valuation : <code>${totalValue}</code>` : null,
    fees ? `  ▸ Yielding  : <code>${fees}</code>` : null,
    `  ▸ System    : <code>${sysMode}</code>`,
    action ? `  ▸ Action    : <b>${action.toUpperCase()}</b>` : null,
  ].filter(Boolean).join("\n");
}

function formatManagementPositionBlock(block) {
  const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const first = lines[0] || "";
  
  // Example position line: 🟢 KINS-SOL           +0.2%  yield 12.44% ◎0.05 0h 27m  STAY
  const match = first.match(/^([🟢🔴])\s+([A-Za-z0-9_\-]+)\s+([\+\-0-9\.]+%?)\s+(?:yield\s+([0-9\.]+%?))?\s*([◎\$][0-9\.]+)\s+([0-9]+h\s+[0-9]+m|[0-9]+m|\?m)(?:\s+OOR([0-9]+m))?\s+(\w+)/iu);
  
  if (!match) {
    return `📍 <b>${first}</b>`;
  }

  const [_, icon, pair, pnl, yieldPct, val, age, oor, action] = match;
  
  const cleanRange = icon === "🟢" ? "🟢 In Range" : "🔴 Out of Range" + (oor ? ` (${oor})` : "");
  const notes = lines.slice(1).join("\n");

  return [
    `📍 <b>${pair}</b> | <code>${age} held</code>`,
    "━━━━━━━━━━━━━━━━━━━━━━",
    `  • 📏 <b>Status:</b> ${cleanRange}`,
    `  • 📈 <b>Current PnL:</b> <code>${pnl}</code>`,
    yieldPct ? `  • 🌾 <b>Estimated Yield:</b> <code>${yieldPct} / 24h</code>` : null,
    `  • 💰 <b>Valuation:</b> <code>${val}</code>`,
    `  • 🎯 <b>VERDICT:</b> <code>${action}</code>`,
    notes ? `  • 📝 <b>Notes:</b>\n<code>${notes}</code>` : null,
  ].filter(Boolean).join("\n");
}

function compactText(text, maxLen) {
  const clean = String(text || "").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(0, maxLen - 1)).trim()}…`;
}


// ─── Long polling ────────────────────────────────────────────────
async function poll(onMessage) {
  while (_polling) {
    try {
      const res = await fetch(
        `${BASE}/getUpdates?offset=${_offset}&timeout=30`,
        { signal: AbortSignal.timeout(35_000) }
      );
      if (!res.ok) { await sleep(5000); continue; }
      const data = await res.json();
      for (const update of data.result || []) {
        _offset = update.update_id + 1;
        const callback = update.callback_query;
        if (callback?.data && callback?.message) {
          const callbackMsg = {
            chat: callback.message.chat,
            from: callback.from,
            text: callback.data,
            message_thread_id: callback.message.message_thread_id,
          };
          if (!isAuthorizedIncomingMessage(callbackMsg)) continue;
          await onMessage({
            ...callbackMsg,
            isCallback: true,
            callbackQueryId: callback.id,
            callbackData: callback.data,
            messageId: callback.message.message_id,
          });
          continue;
        }
        const msg = update.message;
        if (!msg?.text) continue;
        if (!isAuthorizedIncomingMessage(msg)) continue;
        await onMessage(msg);
      }
    } catch (e) {
      if (!e.message?.includes("aborted")) {
        log("telegram_error", `Poll error: ${e.message}`);
      }
      await sleep(5000);
    }
  }
}

export function startPolling(onMessage) {
  if (!TOKEN) return;
  loadChatId();
  if (!chatId) {
    log("telegram_warn", "TELEGRAM_CHAT_ID not set in .env or user-config.telegramChatId — outbound notifications and inbound control disabled until configured.");
  }
  _polling = true;
  setupBotCommands().catch((error) => log("telegram_warn", `setMyCommands failed: ${error.message}`));
  poll(onMessage); // fire-and-forget
  log("telegram", "Bot polling started");
}

export function stopPolling() {
  _polling = false;
}

// ─── Notification helpers ────────────────────────────────────────
export async function notifyDeploy({ pair, amountSol, position, tx, priceRange, rangeCoverage, binStep, baseFee, indicatorReason }) {
  if (hasActiveLiveMessage()) return;
  const priceStr = priceRange
    ? `Price range: ${priceRange.min < 0.0001 ? priceRange.min.toExponential(3) : priceRange.min.toFixed(6)} – ${priceRange.max < 0.0001 ? priceRange.max.toExponential(3) : priceRange.max.toFixed(6)}\n`
    : "";
  const coverageStr = rangeCoverage
    ? `Range cover: ${fmtPct(rangeCoverage.downside_pct)} downside | ${fmtPct(rangeCoverage.upside_pct)} upside | ${fmtPct(rangeCoverage.width_pct)} total\n`
    : "";
  const poolStr = (binStep || baseFee)
    ? `Bin step: ${binStep ?? "?"}  |  Base fee: ${baseFee != null ? baseFee + "%" : "?"}\n`
    : "";
  const indStr = indicatorReason ? `Indicator: ${indicatorReason}\n` : "";
  await sendHTML(
    `✅ <b>Deployed</b> ${pair}\n` +
    `Amount: ${amountSol} SOL\n` +
    priceStr +
    coverageStr +
    poolStr +
    indStr +
    `Position: <code>${position?.slice(0, 8)}...</code>\n` +
    `Tx: <code>${tx?.slice(0, 16)}...</code>`
  );
}

export async function notifyClose({ pair, pnlUsd, pnlPct, feesUsd = null, minutesHeld = null, reason = null, pnlSol = null, feesSol = null, strategy = null, binStep = null, poolAddress = null, position = null, force = false }) {
  if (hasActiveLiveMessage() && !force) return;

  const pct = Number(pnlPct ?? 0);
  const val = Number(pnlSol ?? pnlUsd ?? 0);
  
  // Use the actual amount to determine win/loss if available, to catch very small negative amounts
  // that round to 0.00%
  const isWin = val > 0 || (val === 0 && pct > 0);
  const isLoss = val < 0 || (val === 0 && pct < 0);
  const isBE = !isWin && !isLoss;

  // ─── Determine display mode (SOL vs USD) ───
  let pnlDisplay, feesDisplay, unit;
  try {
    if (pnlSol != null) {
      const pnlSolVal = Number(pnlSol);
      pnlDisplay = `${pnlSolVal >= 0 ? "+" : "-"}${Math.abs(pnlSolVal).toFixed(4)} SOL`;
      unit = "SOL";
    } else {
      const pnlUsdVal = Number(pnlUsd ?? 0);
      pnlDisplay = `${pnlUsdVal >= 0 ? "+" : "-"}$${Math.abs(pnlUsdVal).toFixed(2)}`;
      unit = "USD";
    }
    
    if (feesSol != null) {
      feesDisplay = Number(feesSol) > 0 ? `${Number(feesSol).toFixed(4)} SOL` : null;
    } else if (feesUsd != null) {
      feesDisplay = Number(feesUsd) > 0 ? `$${Number(feesUsd).toFixed(2)}` : null;
    } else {
      feesDisplay = null;
    }
  } catch (e) {
    if (pnlSol != null) {
      const pnlSolVal = Number(pnlSol);
      pnlDisplay = `${pnlSolVal >= 0 ? "+" : "-"}${Math.abs(pnlSolVal).toFixed(4)} SOL`;
      unit = "SOL";
    } else {
      const pnlUsdVal = Number(pnlUsd ?? 0);
      pnlDisplay = `${pnlUsdVal >= 0 ? "+" : "-"}$${Math.abs(pnlUsdVal).toFixed(2)}`;
      unit = "USD";
    }
    feesDisplay = feesSol != null && Number(feesSol) > 0 ? `${Number(feesSol).toFixed(4)} SOL` : (feesUsd != null && Number(feesUsd) > 0 ? `$${Number(feesUsd).toFixed(2)}` : null);
  }

  // ─── Duration formatting ───
  let durationStr = null;
  if (minutesHeld != null) {
    const mins = Number(minutesHeld);
    if (mins >= 1440) durationStr = `${(mins / 1440).toFixed(1)}d`;
    else if (mins >= 60) durationStr = `${Math.floor(mins / 60)}h ${mins % 60}m`;
    else durationStr = `${mins}m`;
  }

  const pctSign = pct >= 0 ? "+" : "";
  const pctDisplay = `${pctSign}${pct.toFixed(2)}%`;
  const absPct = Math.abs(pct);

  let displayStrategy = strategy;
  try {
    const activeStrat = getActiveStrategy();
    if (activeStrat && activeStrat.name) {
      displayStrategy = activeStrat.name
        .replace("LPArmy ", "")
        .replace("Single-Sided ", "1-Side ")
        .replace("Conservative ", "Cons. ");
    } else if (strategy) {
      displayStrategy = strategy === "bid_ask" ? "Bid-Ask" : strategy.charAt(0).toUpperCase() + strategy.slice(1);
    }
  } catch (e) {
    if (strategy) displayStrategy = strategy === "bid_ask" ? "Bid-Ask" : strategy.charAt(0).toUpperCase() + strategy.slice(1);
  }

  try {
    const imageBuffer = await generatePnLImage({
      pair: pair || "UNKNOWN",
      pnlDisplay,
      pctDisplay,
      isWin,
      isLoss,
      absPct,
      feesDisplay,
      durationStr,
      strategy: displayStrategy,
      binStep,
      reason
    });

    const stratInfo = displayStrategy ? `\nStrategy: <b>${displayStrategy}</b>` : "";
    const caption = isWin
      ? `✨ <i>Position closed with profit. Fees captured successfully.</i>${stratInfo}`
      : isLoss
        ? `⚡ <i>Exit executed to limit risk per strategy rules.</i>${stratInfo}`
        : `💫 <i>Position closed at break-even.</i>${stratInfo}`;

    await sendPhoto(imageBuffer, caption);
  } catch (error) {
    log("telegram_error", `Failed to generate PnL image: ${error.message}`);
    // Fallback to text
    const headerIcon = isWin ? "🟢" : isLoss ? "🔴" : "⚪";
    await sendHTML(
      `${headerIcon} <b>POSITION CLOSED</b>\n` +
      `📍 <b>${escapeHtml(pair)}</b>\n` +
      `PnL: <b>${pnlDisplay} (${pctDisplay})</b>\n` +
      (displayStrategy ? `Strategy: <b>${displayStrategy}</b>\n` : '') +
      (feesDisplay ? `Fees: ${feesDisplay}\n` : '') +
      (durationStr ? `Held: ${durationStr}\n` : '') +
      (reason ? `Exit: ${escapeHtml(reason)}` : '')
    );
  }
}

export async function notifySwap({ inputSymbol, outputSymbol, amountIn, amountOut, tx }) {
  if (hasActiveLiveMessage()) return;
  await sendHTML(
    `🔄 <b>Swapped</b> ${inputSymbol} → ${outputSymbol}\n` +
    `In: ${amountIn ?? "?"} | Out: ${amountOut ?? "?"}\n` +
    `Tx: <code>${tx?.slice(0, 16)}...</code>`
  );
}

export async function notifyOutOfRange({ pair, minutesOOR }) {
  if (hasActiveLiveMessage()) return;
  await sendHTML(
    `⚠️ <b>Out of Range</b> ${pair}\n` +
    `Been OOR for ${minutesOOR} minutes`
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fmtPct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : "?";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
