import { generateBriefing } from "../briefing.js";
import fs from "fs";

async function debug() {
  const STATE_FILE = "./state.json";
  const LESSONS_FILE = "./lessons.json";
  
  const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  const lessonsData = JSON.parse(fs.readFileSync(LESSONS_FILE, "utf8"));
  
  const now = new Date();
  const last24h = new Date(now.getTime() - 28 * 60 * 60 * 1000);
  
  console.log("Current time (UTC):", now.toISOString());
  console.log("28h threshold (UTC):", last24h.toISOString());
  
  console.log("\n=== Open/Closed in state.json ===");
  const allPositions = Object.values(state.positions || {});
  for (const p of allPositions) {
    const depTime = new Date(p.deployed_at);
    const clsTime = p.closed_at ? new Date(p.closed_at) : null;
    console.log(`- Pool: ${p.pool_name || p.pool.slice(0,8)} | Deployed: ${p.deployed_at} (>thresh: ${depTime > last24h}) | Closed: ${p.closed_at} (>thresh: ${clsTime ? clsTime > last24h : false}) | closed: ${p.closed}`);
  }
  
  console.log("\n=== Performance in lessons.json ===");
  for (const p of lessonsData.performance || []) {
    const recTime = new Date(p.recorded_at);
    console.log(`- Pool: ${p.pool_name} | Recorded: ${p.recorded_at} (>thresh: ${recTime > last24h}) | PnL: ${p.pnl_usd}`);
  }
  
  console.log("\n=== Generating Briefing output ===");
  const text = await generateBriefing();
  console.log(text);
}

debug();
