import "../envcrypt.js";
import fs from "fs";
import { notifyClose, isEnabled } from "../telegram.js";
import { repoPath } from "../repo-root.js";

const STATE_PATH = repoPath("state.json");
const DECISION_LOG_PATH = repoPath("decision-log.json");

async function main() {
  console.log("Checking if Telegram is enabled...");
  if (!isEnabled()) {
    console.error("Telegram is not enabled (missing token or chat ID)!");
    process.exit(1);
  }

  if (!fs.existsSync(STATE_PATH)) {
    console.error(`State file not found at ${STATE_PATH}`);
    process.exit(1);
  }

  const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  if (!state.positions || Object.keys(state.positions).length === 0) {
    console.error("No positions found in state.json");
    process.exit(1);
  }

  // Find all closed positions, sort by closed_at descending
  const closedPositions = Object.entries(state.positions)
    .map(([id, p]) => ({ id, ...p }))
    .filter(p => p.closed && p.closed_at)
    .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at));

  if (closedPositions.length === 0) {
    console.error("No closed positions found in state.json");
    process.exit(1);
  }

  const lastClosed = closedPositions[0];
  console.log(`Found last closed position: ${lastClosed.pool_name} (ID: ${lastClosed.id})`);

  // Try to find matching close decision in decision-log.json
  let pnlUsd = lastClosed.last_known_pnl_usd;
  let pnlPct = lastClosed.last_known_pnl_pct ?? lastClosed.peak_pnl_pct;
  let feesUsd = lastClosed.total_fees_claimed_usd;
  let minutesHeld = null;
  if (lastClosed.closed_at && lastClosed.deployed_at) {
    minutesHeld = Math.round((new Date(lastClosed.closed_at) - new Date(lastClosed.deployed_at)) / 60000);
  }
  let reason = lastClosed.notes?.join("\n") || "MANUAL_EXIT";

  if (fs.existsSync(DECISION_LOG_PATH)) {
    try {
      const decLog = JSON.parse(fs.readFileSync(DECISION_LOG_PATH, "utf8"));
      if (decLog.decisions && Array.isArray(decLog.decisions)) {
        const closeDec = decLog.decisions.find(
          dec => dec.type === "close" && dec.position === lastClosed.id
        );
        if (closeDec) {
          console.log(`Found matching close decision in decision-log.json!`);
          if (closeDec.metrics) {
            if (closeDec.metrics.pnl_usd != null) pnlUsd = closeDec.metrics.pnl_usd;
            if (closeDec.metrics.pnl_pct != null) pnlPct = closeDec.metrics.pnl_pct;
            if (closeDec.metrics.fees_usd != null) feesUsd = closeDec.metrics.fees_usd;
            if (closeDec.metrics.minutes_held != null) minutesHeld = closeDec.metrics.minutes_held;
          }
          if (closeDec.reason) {
            reason = closeDec.reason;
          }
        }
      }
    } catch (e) {
      console.warn("Failed to parse decision-log.json, falling back to state.json values:", e.message);
    }
  }

  console.log("Preparing to send PnL card...");
  const params = {
    pair: lastClosed.pool_name,
    pnlUsd,
    pnlPct,
    feesUsd,
    minutesHeld,
    reason,
    strategy: lastClosed.strategy,
    binStep: lastClosed.binStep ?? lastClosed.bin_step ?? null,
    poolAddress: lastClosed.pool,
    position: lastClosed.id
  };
  console.log(params);

  try {
    await notifyClose(params);
    console.log("PnL card dispatched to Telegram successfully!");
  } catch (err) {
    console.error("Error dispatching PnL card:", err);
    process.exit(1);
  }
}

main();
