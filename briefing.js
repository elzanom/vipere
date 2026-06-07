import fs from "fs";
import { log } from "./logger.js";
import { getPerformanceSummary, getBestEntryHours } from "./lessons.js";
import { config } from "./config.js";
import { repoPath } from "./repo-root.js";

const STATE_FILE = repoPath("state.json");
const LESSONS_FILE = repoPath("lessons.json");

export async function generateBriefing() {
  const state = loadJson(STATE_FILE) || { positions: {}, recentEvents: [] };
  const lessonsData = loadJson(LESSONS_FILE) || { lessons: [], performance: [] };
  const wallet = await loadWalletSnapshot();
  const livePositions = await loadPositionsSnapshot();

  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 1. Positions Activity
  const allPositions = Object.values(state.positions || {});
  const openedLast24h = allPositions.filter(p => new Date(p.deployed_at) > last24h);
  const closedLast24h = allPositions.filter(p => p.closed && new Date(p.closed_at) > last24h);

  // 2. Performance Activity (from performance log)
  const perfLast24h = (lessonsData.performance || [])
    .filter(p => new Date(p.recorded_at) > last24h)
    .filter(isValidPerformanceRecord);
  const totalPnLUsd = perfLast24h.reduce((sum, p) => sum + (p.pnl_usd || 0), 0);
  const totalFeesUsd = perfLast24h.reduce((sum, p) => sum + (p.fees_earned_usd || 0), 0);

  // 3. Lessons Learned
  const lessonsLast24h = (lessonsData.lessons || [])
    .filter(l => new Date(l.created_at) > last24h)
    .filter(isUsefulLesson);

  // 4. Current State
  const openPositions = livePositions.length > 0
    ? livePositions
    : allPositions.filter(p => !p.closed);
  const closedPositions = allPositions
    .filter(p => p.closed)
    .sort((a, b) => new Date(b.closed_at || 0) - new Date(a.closed_at || 0));
  const perfSummary = getPerformanceSummary();
  const totalOpenSol = openPositions.reduce((sum, p) => sum + Number(p.amount_sol || 0), 0);
  const winRate24h = perfLast24h.length > 0
    ? Math.round((perfLast24h.filter(p => p.pnl_usd > 0).length / perfLast24h.length) * 100)
    : null;
  const bestClose = perfLast24h
    .filter((p) => Number.isFinite(Number(p.pnl_usd)))
    .sort((a, b) => Number(b.pnl_usd || 0) - Number(a.pnl_usd || 0))[0] || null;
  const worstClose = perfLast24h
    .filter((p) => Number.isFinite(Number(p.pnl_usd)))
    .sort((a, b) => Number(a.pnl_usd || 0) - Number(b.pnl_usd || 0))[0] || null;
  const recentEvents = (state.recentEvents || []).slice(-5).reverse();
  const dryRun = process.env.DRY_RUN === "true";
  const modeLabel = dryRun ? "DRY RUN" : "LIVE";

  const winRateStr = winRate24h == null ? "N/A" : `${winRate24h}%`;

  // 6. Best entry hours (from historical data)
  const entryHours = getBestEntryHours(10);
  const bestHoursStr = entryHours?.best?.length
    ? entryHours.best.map(h => `${String(h).padStart(2,'0')}:00`).join(", ") + " UTC"
    : null;
  const worstHoursStr = entryHours?.worst?.length
    ? entryHours.worst.map(h => `${String(h).padStart(2,'0')}:00`).join(", ") + " UTC"
    : null;

  // 7. Top performing & frequently blacklisted pools from pool-memory
  let topPools = [];
  let blacklistedPools = [];
  try {
    const poolMemory = loadJson(repoPath("pool-memory.json")) || {};
    const poolEntries = Object.values(poolMemory);
    // Top pools: at least 2 trades, positive avg PnL
    topPools = poolEntries
      .filter(p => Array.isArray(p.deploys) && p.deploys.length >= 2)
      .map(p => ({
        name: p.name || p.pool_name || p.deploys[0]?.pool_name || "?",
        count: p.deploys.length,
        avg_pnl: p.deploys.reduce((s, d) => s + (d.pnl_pct || 0), 0) / p.deploys.length,
      }))
      .filter(p => p.avg_pnl > 0)
      .sort((a, b) => b.avg_pnl - a.avg_pnl)
      .slice(0, 3);
    // Blacklisted: pools closed repeatedly for OOR/low-yield
    blacklistedPools = poolEntries
      .filter(p => Array.isArray(p.deploys) && p.deploys.length >= 2)
      .map(p => ({
        name: p.name || p.pool_name || p.deploys[0]?.pool_name || "?",
        count: p.deploys.length,
        bad_reasons: p.deploys.filter(d => /oor|out of range|low yield/i.test(d.close_reason || "")).length,
        avg_pnl: p.deploys.reduce((s, d) => s + (d.pnl_pct || 0), 0) / p.deploys.length,
      }))
      .filter(p => p.bad_reasons >= 2 || p.avg_pnl < -3)
      .sort((a, b) => b.bad_reasons - a.bad_reasons)
      .slice(0, 3);
  } catch (e) {
    log("briefing_warn", `Failed to load pool memory for briefing: ${e.message}`);
  }

  // 5. Format Message
  const lines = [
    "☀️ Morning Briefing (Last 24h)",
    "────────────────",
    "",
    "⚙️ <b>System Status</b>",
    `• Mode: ${modeLabel}`,
    `• Strategy: ${config.strategy.strategy}`,
    `• Wallet: ${wallet.sol == null ? "N/A" : `${wallet.sol.toFixed(3)} SOL (Free: ${wallet.freeSol?.toFixed(3)} SOL)`}`,
    `• Value USD: ${wallet.totalUsd == null ? "N/A" : usd(wallet.totalUsd)}`,
    "",
    "📥 <b>Activity</b>",
    `• Positions Opened: ${openedLast24h.length}`,
    `• Positions Closed: ${closedLast24h.length}`,
    "",
    "💰 <b>Performance</b>",
    `• Net PnL: <b>${signedUsd(totalPnLUsd)}</b>`,
    `• Fees Earned: <b>${usd(totalFeesUsd)}</b>`,
    `• Win Rate (24h): ${winRateStr}`,
    `• All-Time PnL: ${perfSummary ? `${signedUsd(perfSummary.total_pnl_usd)} (${perfSummary.win_rate_pct}% win)` : "N/A"}`,
    bestClose ? `• Best Close: 🟢 ${formatPerfRow(bestClose)}` : null,
    worstClose && worstClose !== bestClose ? `• Worst Close: 🔴 ${formatPerfRow(worstClose)}` : null,
    "",
    "📈 <b>Current Portfolio</b>",
    openPositions.length > 0
      ? [
          `• Open Positions: ${openPositions.length}`,
          ...openPositions.map((p) => {
            const pair = escapeHtml(p.pair || p.pool_name || p.pool || "position");
            const value = p.total_value_usd != null ? `$${Number(p.total_value_usd).toFixed(2)}` : "N/A";
            const pnl = p.pnl_usd != null ? signedUsd(p.pnl_usd) : "N/A";
            return `  - <b>${pair}</b> (Val: ${value} | PnL: ${pnl})`;
          })
        ].join("\n")
      : "• Open Positions: 0",
    "",
    "🗂️ <b>Position History</b>",
    closedPositions.length > 0
      ? closedPositions.slice(0, 5).map((p) => {
          const pair = escapeHtml(p.pool_name || p.pair || p.pool || "position");
          const closedAt = p.closed_at ? new Date(p.closed_at).toISOString().slice(0, 16).replace("T", " ") : "N/A";
          const perfRec = (lessonsData.performance || []).find(perf => perf.position === p.position && isValidPerformanceRecord(perf));
          const pnlVal = perfRec ? perfRec.pnl_usd : (p.last_known_pnl_usd ?? null);
          const pnlStr = pnlVal != null ? signedUsd(pnlVal) : "N/A";
          return `• <b>${pair}</b> (<b>${pnlStr}</b>) - ${closedAt}`;
        }).join("\n")
      : "• No closed positions yet.",
    "",
    "🧠 <b>Lessons Learned</b>",
    lessonsLast24h.length > 0
      ? lessonsLast24h.slice(0, 5).map(l => `• <i>${escapeHtml(l.rule)}</i>`).join("\n")
      : "• No new lessons recorded overnight.",
    "",
    entryHours ? [
      "🕐 <b>Best Entry Hours (UTC)</b>",
      bestHoursStr ? `• ✅ Best: ${bestHoursStr}` : null,
      worstHoursStr ? `• ⚠️ Avoid: ${worstHoursStr}` : null,
      "",
    ].filter(Boolean).join("\n") : null,
    topPools.length > 0 ? [
      "🏆 <b>Top Pools (All-Time)</b>",
      ...topPools.map(p => `• <b>${escapeHtml(p.name)}</b> — avg PnL: <b>${p.avg_pnl >= 0 ? '+' : ''}${p.avg_pnl.toFixed(1)}%</b> (${p.count} trades)`),
      "",
    ].join("\n") : null,
    blacklistedPools.length > 0 ? [
      "⛔ <b>Problem Pools (Frequent OOR/Low Yield)</b>",
      ...blacklistedPools.map(p => `• <b>${escapeHtml(p.name)}</b> — ${p.bad_reasons} bad exits, avg PnL ${p.avg_pnl.toFixed(1)}%`),
      "",
    ].join("\n") : null,
    "🎯 <b>Today's Outlook</b>",
    openPositions.length > 0
      ? "Manage open risk first."
      : "Screen for a fresh setup.",
    "",
    "────────────────",
  ].filter(line => line !== null && line !== undefined);

  const text = lines.join("\n");
  
  const stats = {
    isWin: totalPnLUsd > 0,
    isLoss: totalPnLUsd < 0,
    totalPnlDisplay: config.management.solMode ? signedSol(totalPnLUsd) : signedUsd(totalPnLUsd),
    winRateDisplay: `WIN RATE: ${winRateStr}`,
    tradesDisplay: `${closedLast24h.length} CLOSED`,
    customLabel1: 'FEES EARNED',
    customValue1: config.management.solMode ? `${Number(totalFeesUsd).toFixed(4)} ◎` : usd(totalFeesUsd),
    customLabel2: 'OPEN POSITIONS',
    customValue2: `${openPositions.length}`,
    dateStr: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase(),
    agentName: "VIPERA"
  };

  return { text, stats };
}

function usd(value) {
  const n = Number(value || 0);
  return `$${n.toFixed(2)}`;
}

function signedSol(value) {
  const n = Number(value || 0);
  return `${n >= 0 ? "+" : "-"}${Math.abs(n).toFixed(4)} ◎`;
}

function signedUsd(value) {
  const n = Number(value || 0);
  return `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
}

function formatPerfRow(perf) {
  const name = perf.pool_name || perf.pool || perf.position || "position";
  return `<b>${escapeHtml(name)}</b> (<b>${signedUsd(perf.pnl_usd || 0)}</b>)`;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function isValidPerformanceRecord(perf) {
  if (!perf) return false;
  return isFiniteNumber(perf.pnl_usd) && isFiniteNumber(perf.pnl_pct);
}

function isUsefulLesson(lesson) {
  const text = String(lesson?.rule || "");
  if (!text.trim()) return false;
  return !/\bNaN\b|undefined/i.test(text);
}

function formatEvent(event) {
  const kind = event?.action || "event";
  const target = event?.pool_name || event?.position || event?.pool || "item";
  const icon = kind === "deploy" ? "🚀" : kind === "close" ? "🔒" : kind === "claim" ? "💎" : "🔔";
  if (kind === "deploy") return `${icon} <code>deploy</code> <b>${escapeHtml(target)}</b>`;
  if (kind === "close") return `${icon} <code>close</code> <b>${escapeHtml(target)}</b>${event?.reason ? ` (${escapeHtml(String(event.reason))})` : ""}`;
  if (kind === "claim") return `${icon} <code>claim</code> <b>${escapeHtml(target)}</b>`;
  return `${icon} <code>${escapeHtml(kind)}</code> <b>${escapeHtml(target)}</b>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function loadJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    log("briefing_error", `Failed to read ${file}: ${err.message}`);
    return null;
  }
}

async function loadWalletSnapshot() {
  try {
    const mod = await import("./tools/wallet.js");
    const balances = await mod.getWalletBalances().catch(() => null);
    if (!balances) return { sol: null, freeSol: null, totalUsd: null };
    const freeSol = Number(balances.sol ?? 0) - Number(config.management.gasReserve ?? 0);
    return {
      sol: Number.isFinite(Number(balances.sol)) ? Number(balances.sol) : null,
      freeSol: Number.isFinite(freeSol) ? Math.max(0, freeSol) : null,
      totalUsd: Number.isFinite(Number(balances.total_usd)) ? Number(balances.total_usd) : null,
    };
  } catch (err) {
    log("briefing_warn", `Failed to load wallet snapshot: ${err.message}`);
    return { sol: null, freeSol: null, totalUsd: null };
  }
}

async function loadPositionsSnapshot() {
  try {
    const mod = await import("./tools/dlmm.js");
    const snapshot = await mod.getMyPositions({ force: true, silent: true }).catch(() => null);
    return Array.isArray(snapshot?.positions) ? snapshot.positions : [];
  } catch (err) {
    log("briefing_warn", `Failed to load positions snapshot: ${err.message}`);
    return [];
  }
}
