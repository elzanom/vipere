/**
 * Strategy Library — persistent store of LP strategies.
 *
 * Users paste a tweet or description via Telegram.
 * The agent extracts structured criteria and saves it here.
 * During screening, the active strategy's criteria guide token selection and position config.
 */

import fs from "fs";
import { log } from "./logger.js";
import { repoPath } from "./repo-root.js";

const STRATEGY_FILE = repoPath("strategy-library.json");

function load() {
  if (!fs.existsSync(STRATEGY_FILE)) return { active: null, strategies: {} };
  try {
    return JSON.parse(fs.readFileSync(STRATEGY_FILE, "utf8"));
  } catch {
    return { active: null, strategies: {} };
  }
}

function save(data) {
  fs.writeFileSync(STRATEGY_FILE, JSON.stringify(data, null, 2));
}

// ─── Default Strategies ─────────────────────────────────────────
const DEFAULT_STRATEGIES = {
  custom_ratio_spot: {
    id: "custom_ratio_spot",
    name: "Custom Ratio Spot",
    author: "gods-grace",
    lp_strategy: "spot",
    token_criteria: { notes: "Any token. Ratio expresses directional bias." },
    entry: { condition: "Directional view on token", single_side: null, notes: "75% token = bullish (sell on pump out of range). 75% SOL = bearish/DCA-in (buy on dip). Set bins_below:bins_above proportional to ratio." },
    range: { type: "custom", notes: "bins_below:bins_above ratio matches token:SOL ratio. E.g., 75% token → ~52 bins below, ~17 bins above." },
    exit: { take_profit_pct: 10, notes: "Close when OOR or TP hit. Re-deploy with updated ratio based on new momentum signals." },
    best_for: "Expressing directional bias while earning fees both ways",
  },
  single_sided_reseed: {
    id: "single_sided_reseed",
    name: "Single-Sided Bid-Ask + Re-seed",
    author: "gods-grace",
    lp_strategy: "bid_ask",
    token_criteria: { notes: "Volatile tokens with strong narrative. Must have active volume." },
    entry: { condition: "Deploy token-only (amount_x only, amount_y=0) bid-ask, bins below active bin only", single_side: "token", notes: "As price drops through bins, token sold for SOL. Bid-ask concentrates at bottom edge." },
    range: { type: "default", bins_below_pct: 100, notes: "All bins below active bin. bins_above=0." },
    exit: { notes: "When OOR downside: close_position(skip_swap=true) → redeploy token-only bid-ask at new lower price. Do NOT swap to SOL. Full close only when token dead or after N re-seeds with declining performance." },
    best_for: "Riding volatile tokens down without cutting losses. DCA out via LP.",
  },
  single_sided_sol_bidask: {
    id: "single_sided_sol_bidask",
    name: "Single-Sided SOL Bid-Ask",
    author: "gods-grace",
    lp_strategy: "bid_ask",
    token_criteria: { notes: "Volatile SOL pairs with strong organic quality, active volume, and acceptable holder concentration." },
    entry: {
      condition: "Deploy SOL-only bid-ask below the active bin",
      single_side: "sol",
      notes: "Use amount_y only, keep amount_x=0, and set bins_above=0. This matches the current executor safety rules.",
    },
    range: {
      type: "downside_only",
      bins_below_pct: 100,
      bins_above: 0,
      notes: "All liquidity below active bin. Wider bins_below for higher volatility; upper bin remains at active bin.",
    },
    exit: {
      notes: "Close on stop-loss, trailing TP, low yield after minimum age, sustained OOR, or pump far above range. Close handles fee claiming internally.",
    },
    best_for: "Current bot implementation: SOL-only entries on volatile pools while collecting fees through downside movement.",
  },
  sol_spot_balanced_entry: {
    id: "sol_spot_balanced_entry",
    name: "SOL Spot Balanced Entry",
    author: "gods-grace",
    lp_strategy: "spot",
    token_criteria: { notes: "Choppy or sideways SOL pairs with active volume and clean holder quality." },
    entry: {
      condition: "Deploy from SOL with a balanced spot range around the active bin",
      single_side: "sol",
      notes: "Use amount_y only when executor requires SOL-only. This strategy is intended to keep liquidity active sooner than downside-only bid-ask.",
    },
    range: {
      type: "balanced",
      bins_below_pct: 70,
      bins_above_pct: 30,
      notes: "Place most liquidity below active bin, but keep some upside coverage to reduce pumped-far-above-range exits.",
    },
    exit: {
      notes: "Close on stop-loss, trailing TP, low yield after minimum age, or sustained OOR. Prefer this when downside-only ranges miss too many upward moves.",
    },
    best_for: "Sideways/choppy pools where price can move both ways and downside-only ranges exit too early.",
  },
  conservative_wide_bidask: {
    id: "conservative_wide_bidask",
    name: "Conservative Wide Bid-Ask",
    author: "gods-grace",
    lp_strategy: "bid_ask",
    token_criteria: { notes: "Higher quality pools only: stronger TVL, volume, organic score, and lower bot/top-holder concentration." },
    entry: {
      condition: "Deploy SOL-only bid-ask with wider downside coverage",
      single_side: "sol",
      notes: "Use amount_y only, amount_x=0, bins_above=0. Keep deploy size small and require better pool quality.",
    },
    range: {
      type: "wide_downside",
      bins_below_pct: 100,
      bins_above: 0,
      notes: "Use the upper side of configured bins_below for wider coverage. Better for live or lower-frequency runs.",
    },
    exit: {
      notes: "Close on stop-loss, trailing TP, sustained OOR, low yield after minimum age, or repeated weak fee generation.",
    },
    best_for: "Live-conservative SOL-only entries where fewer but higher-quality positions are preferred.",
  },
  fee_compounding: {
    id: "fee_compounding",
    name: "Fee Compounding",
    author: "gods-grace",
    lp_strategy: "any",
    token_criteria: { notes: "Stable volume pools with consistent fee generation." },
    entry: { condition: "Deploy normally with any shape", notes: "Strategy is about management, not entry shape." },
    range: { type: "default", notes: "Standard range for the pair." },
    exit: { notes: "When unclaimed fees > $5 AND in range: claim_fees → add_liquidity back into same position. Normal close rules otherwise." },
    best_for: "Maximizing yield on stable, range-bound pools via compounding",
  },
  multi_layer: {
    id: "multi_layer",
    name: "Multi-Layer",
    author: "gods-grace",
    lp_strategy: "mixed",
    token_criteria: { notes: "High volume pools. Layer multiple shapes into ONE position via addLiquidityByStrategy to sculpt a composite distribution." },
    entry: {
      condition: "Create ONE position, then layer additional shapes onto it with add-liquidity. Each layer adds a different strategy/shape to the same position, compositing them.",
      notes: "Step 1: deploy (creates position with first shape). Step 2+: add-liquidity to same position with different shapes. All layers share the same bin range but different distribution curves stack on top of each other.",
      example_patterns: {
        smooth_edge: "Deploy Bid-Ask (edges) → add-liquidity Spot (fills the middle gap). 2 layers, 1 position.",
        full_composite: "Deploy Bid-Ask (edges) → add-liquidity Spot (middle) → add-liquidity Curve (center boost). 3 layers, 1 position.",
        edge_heavy: "Deploy Bid-Ask → add-liquidity Bid-Ask again (double edge weight). 2 layers, 1 position.",
      },
    },
    range: { type: "custom", notes: "All layers share the position's bin range (set at deploy). Choose range wide enough for the widest layer needed." },
    exit: { notes: "Single position — one close, one claim. The composite shape means fees earned reflect ALL layers combined." },
    best_for: "Creating custom liquidity distributions by stacking shapes in one position. Single position to manage.",
  },
  partial_harvest: {
    id: "partial_harvest",
    name: "Partial Harvest",
    author: "gods-grace",
    lp_strategy: "any",
    token_criteria: { notes: "High fee pools where taking profit incrementally is preferred." },
    entry: { condition: "Deploy normally", notes: "Strategy is about progressive profit-taking, not entry." },
    range: { type: "default", notes: "Standard range." },
    exit: { take_profit_pct: 10, notes: "When total return >= 10% of deployed capital: withdraw_liquidity(bps=5000) to take 50% off. Remaining 50% keeps running. Repeat at next threshold." },
    best_for: "Locking in profits without fully exiting winning positions",
  },
  lparmy_dca_bid_ask: {
    id: "lparmy_dca_bid_ask",
    name: "LPArmy DCA Bid-Ask",
    author: "lparmy",
    lp_strategy: "bid_ask",
    token_criteria: { notes: "High-volatility memecoins with strong narrative and active community. Volatility > 3, organic > 70, fee_tvl_ratio > 0.3. Must have real community (not just bots)." },
    entry: {
      condition: "Deploy SOL-only bid-ask below active bin to DCA into the token on dips",
      single_side: "sol",
      notes: "Use amount_y only, amount_x=0, bins_above=0. Wide range covering -70% pullback. As price drops through bins, SOL converts to token (DCA in). If price bounces, you keep SOL + earned fees.",
    },
    range: {
      type: "wide_downside",
      bins_below_pct: 100,
      bins_above: 0,
      notes: "Cover maximum downside. Use 50-75 bins below for volatile tokens. Wider = safer but lower capital efficiency per bin.",
    },
    exit: {
      take_profit_pct: 8,
      notes: "Close on trailing TP, stop-loss, or sustained OOR. If price pumps far above range, consider closing in profit. If OOR downside and token still has volume, consider re-deploying at new lower level.",
    },
    best_for: "Most popular LPArmy strategy: DCA into volatile tokens via single-sided SOL bid-ask while earning fees on every price movement through your range.",
  },
  lparmy_spot_range: {
    id: "lparmy_spot_range",
    name: "LPArmy Spot Range",
    author: "lparmy",
    lp_strategy: "spot",
    token_criteria: { notes: "Choppy or sideways tokens with consistent volume. Lower volatility (1-4). Good organic score. Established tokens preferred over new launches." },
    entry: {
      condition: "Deploy SOL with balanced spot range around the active bin for uniform fee capture",
      single_side: "sol",
      notes: "Spot distributes liquidity uniformly. Best when you're unsure of direction. Covers both upside and downside movement equally.",
    },
    range: {
      type: "balanced",
      bins_below_pct: 60,
      bins_above_pct: 40,
      notes: "60/40 split favoring downside. Keeps you in range longer during both pumps and dumps. Reduces OOR exits vs downside-only strategies.",
    },
    exit: {
      take_profit_pct: 10,
      notes: "Close on trailing TP, stop-loss, or sustained OOR. Spot positions tend to stay in range longer, so be more patient with yield checks.",
    },
    best_for: "LPArmy default for uncertain markets: uniform distribution captures fees regardless of price direction. Lower risk, steady yield.",
  },
  lparmy_curve_stable: {
    id: "lparmy_curve_stable",
    name: "LPArmy Curve Stable",
    author: "lparmy",
    lp_strategy: "curve",
    token_criteria: { notes: "Low-volatility pairs, stablecoin pairs, or established tokens in tight ranges. Volatility < 2. High volume relative to TVL." },
    entry: {
      condition: "Deploy with curve distribution concentrated around active bin for maximum capital efficiency",
      single_side: null,
      notes: "Curve puts most liquidity near the center, maximizing fees when price stays near current level. Best for range-bound tokens.",
    },
    range: {
      type: "tight",
      bins_below_pct: 50,
      bins_above_pct: 50,
      notes: "Tight symmetric range. Use fewer total bins (20-35) for maximum concentration. Higher fees per trade but higher OOR risk.",
    },
    exit: {
      take_profit_pct: 5,
      notes: "Lower TP target but higher hit rate. Close quickly on OOR since curve positions lose efficiency fast when price moves away from center.",
    },
    best_for: "LPArmy capital efficiency play: concentrated curve for stable/low-vol pairs maximizes fee capture per unit of capital deployed.",
  },
  lparmy_sawtooth_bidask: {
    id: "lparmy_sawtooth_bidask",
    name: "LPArmy Sawtooth Bid-Ask",
    author: "lparmy",
    lp_strategy: "bid_ask",
    token_criteria: { notes: "Trending-down tokens with active volume where you want to accumulate. Must still have real community and narrative. Avoid dead tokens." },
    entry: {
      condition: "Deploy SOL-only bid-ask below active bin. On OOR downside, re-deploy at new lower level instead of closing",
      single_side: "sol",
      notes: "Progressive DCA strategy. Each re-deploy creates a new 'tooth' at a lower price level. You accumulate more token at better prices while earning fees at each level.",
    },
    range: {
      type: "moderate_downside",
      bins_below_pct: 100,
      bins_above: 0,
      notes: "Moderate range (35-50 bins below). Not too wide so you get meaningful fee density. Re-deploy handles the wider coverage through progression.",
    },
    exit: {
      notes: "On OOR downside: close_position(skip_swap=true) then redeploy at new lower level. Full exit only after 3+ re-seeds with declining fees, or when token volume dies. This is a multi-cycle strategy.",
    },
    best_for: "LPArmy advanced: progressive DCA through multiple bid-ask levels. Each level earns fees while building a position at progressively lower prices.",
  },
  lparmy_volatility_hunter: {
    id: "lparmy_volatility_hunter",
    name: "LPArmy Volatility Hunter",
    author: "lparmy",
    lp_strategy: "bid_ask",
    token_criteria: { notes: "Explosive pools with volatility > 4, fee_tvl_ratio > 0.5, organic > 75. Must have strong volume and real narrative. Launch/hype phase tokens with genuine community." },
    entry: {
      condition: "Deploy SOL-only bid-ask on high-volatility pools with proven fee generation",
      single_side: "sol",
      notes: "Only enter when dynamic fees are elevated (volatility > 4 triggers higher Meteora dynamic fees). Use amount_y only, bins_above=0. Wider bin steps (100-125) preferred for fee capture.",
    },
    range: {
      type: "downside_only",
      bins_below_pct: 100,
      bins_above: 0,
      notes: "All liquidity below active bin. Use 45-65 bins below. Higher volatility = more bins for coverage. Wider range compensates for violent swings.",
    },
    exit: {
      take_profit_pct: 6,
      notes: "Trailing TP with tight trailing drop (1.5%). These positions generate fees fast but can reverse quickly. Take profits early and re-deploy. Close immediately if volatility drops below 2 (fees dry up).",
    },
    best_for: "LPArmy fee farming: hunt high-volatility pools where dynamic fees spike. Fast in, fast out.",
  },
};

function ensureDefaultStrategies() {
  const db = load();
  let added = false;
  for (const [id, strategy] of Object.entries(DEFAULT_STRATEGIES)) {
    if (!db.strategies[id]) {
      db.strategies[id] = {
        ...strategy,
        added_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      added = true;
    }
  }
  if (added) {
    if (!db.active) db.active = "custom_ratio_spot";
    save(db);
    log("strategy", "Preloaded default strategies");
  }
}

ensureDefaultStrategies();

// ─── Tool Handlers ─────────────────────────────────────────────

/**
 * Add or update a strategy.
 * The agent parses the raw tweet/text and fills in the structured fields.
 */
export function addStrategy({
  id,
  name,
  author = "unknown",
  lp_strategy = "bid_ask",       // "bid_ask" | "spot" | "curve"
  token_criteria = {},           // { min_mcap, min_age_days, requires_kol, notes }
  entry = {},                    // { condition, price_change_threshold_pct, single_side }
  range = {},                    // { type, bins_below_pct, notes }
  exit = {},                     // { take_profit_pct, notes }
  best_for = "",                 // short description of ideal conditions
  raw = "",                      // original tweet/text
}) {
  if (!id || !name) return { error: "id and name are required" };

  const db = load();

  // Slugify id
  const slug = id.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

  db.strategies[slug] = {
    id: slug,
    name,
    author,
    lp_strategy,
    token_criteria,
    entry,
    range,
    exit,
    best_for,
    raw,
    added_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Auto-set as active if it's the first strategy
  if (!db.active) db.active = slug;

  save(db);
  log("strategy", `Strategy saved: ${name} (${slug})`);
  return { saved: true, id: slug, name, active: db.active === slug };
}

/**
 * List all strategies with a summary.
 */
export function listStrategies() {
  const db = load();
  const strategies = Object.values(db.strategies).map((s) => ({
    id: s.id,
    name: s.name,
    author: s.author,
    lp_strategy: s.lp_strategy,
    best_for: s.best_for,
    active: db.active === s.id,
    added_at: s.added_at?.slice(0, 10),
  }));
  return { active: db.active, count: strategies.length, strategies };
}

/**
 * Get full details of a strategy including raw text and all criteria.
 */
export function getStrategy({ id }) {
  if (!id) return { error: "id required" };
  const db = load();
  const strategy = db.strategies[id];
  if (!strategy) return { error: `Strategy "${id}" not found`, available: Object.keys(db.strategies) };
  return { ...strategy, is_active: db.active === id };
}

/**
 * Set the active strategy used during screening cycles.
 */
export function setActiveStrategy({ id }) {
  if (!id) return { error: "id required" };
  const db = load();
  if (!db.strategies[id]) return { error: `Strategy "${id}" not found`, available: Object.keys(db.strategies) };
  db.active = id;
  save(db);
  log("strategy", `Active strategy set to: ${db.strategies[id].name}`);
  return { active: id, name: db.strategies[id].name };
}

/**
 * Remove a strategy.
 */
export function removeStrategy({ id }) {
  if (!id) return { error: "id required" };
  const db = load();
  if (!db.strategies[id]) return { error: `Strategy "${id}" not found` };
  const name = db.strategies[id].name;
  delete db.strategies[id];
  if (db.active === id) db.active = Object.keys(db.strategies)[0] || null;
  save(db);
  log("strategy", `Strategy removed: ${name}`);
  return { removed: true, id, name, new_active: db.active };
}

/**
 * Get the currently active strategy — used by screening cycle.
 */
export function getActiveStrategy() {
  const db = load();
  if (!db.active || !db.strategies[db.active]) return null;
  return db.strategies[db.active];
}
