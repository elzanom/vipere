import { config } from "../config.js";
import { executeTool } from "../tools/executor.js";
import { getPoolDetail, getTopCandidates, getVolatilityTimeframe } from "../tools/screening.js";

function computeBinsBelow(volatility) {
  const parsedVolatility = Number(volatility);
  if (!Number.isFinite(parsedVolatility) || parsedVolatility <= 0) {
    throw new Error(`Invalid volatility ${volatility ?? "unknown"} — refusing volatility-scaled deploy.`);
  }
  const lo = config.strategy.minBinsBelow;
  const hi = config.strategy.maxBinsBelow;
  return Math.max(lo, Math.min(hi, Math.round(lo + (parsedVolatility / 5) * (hi - lo))));
}

function fmt(value, digits = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "n/a");
  return String(Number(n.toFixed(digits)));
}

async function buildLatestSnapshot(poolAddress) {
  const timeframe = config.screening.timeframe;
  const detail = await getPoolDetail({ pool_address: poolAddress, timeframe });
  const volatilityTimeframe = getVolatilityTimeframe(timeframe);
  const volDetail = volatilityTimeframe === timeframe
    ? detail
    : await getPoolDetail({ pool_address: poolAddress, timeframe: volatilityTimeframe });

  return {
    name: detail.name,
    pool: detail.pool_address,
    timeframe,
    volatility_timeframe: volatilityTimeframe,
    volume: detail.volume ?? null,
    fee_active_tvl_ratio: detail.fee_active_tvl_ratio ?? null,
    tvl: detail.tvl ?? detail.active_tvl ?? null,
    active_tvl: detail.active_tvl ?? null,
    volatility: volDetail?.volatility ?? detail.volatility ?? null,
    bin_step: detail.dlmm_params?.bin_step ?? null,
    quote_symbol: detail.token_y?.symbol ?? null,
    quote_mint: detail.token_y?.address ?? null,
    organic_score: detail.token_x?.organic_score ?? null,
    holders: detail.base_token_holders ?? null,
  };
}

function printSnapshot(label, snapshot) {
  console.log(label);
  console.log(`  pool=${snapshot.pool}`);
  console.log(`  name=${snapshot.name}`);
  console.log(`  volume=${fmt(snapshot.volume)}`);
  console.log(`  fee_active_tvl_ratio=${fmt(snapshot.fee_active_tvl_ratio)}`);
  console.log(`  tvl=${fmt(snapshot.tvl)}`);
  console.log(`  active_tvl=${fmt(snapshot.active_tvl)}`);
  console.log(`  volatility=${fmt(snapshot.volatility)} (${snapshot.volatility_timeframe || snapshot.timeframe || "unknown"})`);
  console.log(`  bin_step=${fmt(snapshot.bin_step, 0)}`);
  console.log(`  holders=${fmt(snapshot.holders, 0)}`);
  console.log(`  organic_score=${fmt(snapshot.organic_score)}`);
  console.log(`  quote=${snapshot.quote_symbol || "?"} ${snapshot.quote_mint || ""}`.trim());
}

function printDelta(before, after) {
  const fields = [
    "volume",
    "fee_active_tvl_ratio",
    "tvl",
    "active_tvl",
    "volatility",
    "bin_step",
    "holders",
    "organic_score",
  ];
  const changed = fields.filter((field) => {
    const a = Number(before?.[field]);
    const b = Number(after?.[field]);
    if (Number.isFinite(a) && Number.isFinite(b)) return a !== b;
    return String(before?.[field] ?? "") !== String(after?.[field] ?? "");
  });

  if (!changed.length) {
    console.log("delta: no material field changes");
    return;
  }

  console.log("delta:");
  for (const field of changed) {
    console.log(`  ${field}: ${fmt(before?.[field])} -> ${fmt(after?.[field])}`);
  }
}

async function main() {
  process.env.DRY_RUN = "true";
  const args = process.argv.slice(2);
  const forcedPoolAddress = args.find((arg) => !arg.startsWith("--")) || null;

  console.log("=== Dry Deploy Smoke Test ===");
  let candidate;

  if (forcedPoolAddress) {
    const detail = await getPoolDetail({ pool_address: forcedPoolAddress, timeframe: config.screening.timeframe });
    candidate = {
      pool: detail.pool_address,
      name: detail.name,
      base: {
        mint: detail.token_x?.address || null,
      },
      bin_step: detail.dlmm_params?.bin_step ?? null,
      base_fee: detail.fee_pct ?? null,
      volatility: detail.volatility,
      volatility_timeframe: config.screening.timeframe,
      fee_active_tvl_ratio: detail.fee_active_tvl_ratio,
      organic_score: detail.token_x?.organic_score != null ? Math.round(detail.token_x.organic_score) : null,
      tvl: detail.tvl ?? null,
      active_tvl: detail.active_tvl ?? null,
    };
    console.log(`forced_pool=${forcedPoolAddress}`);
  } else {
    const screening = await getTopCandidates({ limit: 3 });
    const candidates = screening?.candidates || [];
    console.log(`screened=${screening?.total_screened ?? 0} candidates=${candidates.length}`);

    if (!candidates.length) {
      console.log("No candidates available.");
      for (const entry of screening?.filtered_examples || []) {
        console.log(`- ${entry.name}: ${entry.reason}`);
      }
      process.exit(0);
    }
    candidate = candidates[0];
  }
  const candidateSnapshot = {
    name: candidate.name,
    pool: candidate.pool,
    timeframe: config.screening.timeframe,
    volatility_timeframe: candidate.volatility_timeframe || config.screening.timeframe,
    volume: candidate.volume_window ?? candidate.volume ?? null,
    fee_active_tvl_ratio: candidate.fee_active_tvl_ratio ?? null,
    tvl: candidate.tvl ?? null,
    active_tvl: candidate.active_tvl ?? null,
    volatility: candidate.volatility ?? null,
    bin_step: candidate.bin_step ?? null,
    quote_symbol: candidate.quote?.symbol ?? null,
    quote_mint: candidate.quote?.mint ?? null,
    organic_score: candidate.organic_score ?? null,
    holders: candidate.holders ?? null,
  };
  const amountY = Number(config.management.deployAmountSol);
  const binsBelow = computeBinsBelow(candidate.volatility);
  const screeningSnapshot = await getTopCandidates({ limit: 50 }).catch(() => null);
  const dynamicFloor = screeningSnapshot?.dynamic_min_fee_active_tvl_ratio
    ?? screeningSnapshot?.dynamicMinFeeActiveTvlRatio
    ?? null;

  console.log(`candidate=${candidate.name}`);
  console.log(`pool=${candidate.pool}`);
  console.log(`amount_y=${amountY}`);
  console.log(`bins_below=${binsBelow}`);
  console.log(`volatility=${candidate.volatility}`);
  console.log(`fee_active_tvl_ratio=${candidate.fee_active_tvl_ratio}`);
  console.log("");
  console.log("active_thresholds:");
  console.log(`  timeframe=${config.screening.timeframe}`);
  console.log(`  volatility_timeframe=${getVolatilityTimeframe(config.screening.timeframe)}`);
  console.log(`  minVolume=${config.screening.minVolume}`);
  console.log(`  minTvl=${config.screening.minTvl}`);
  console.log(`  maxTvl=${config.screening.maxTvl}`);
  console.log(`  minFeeActiveTvlRatio=${config.screening.minFeeActiveTvlRatio}`);
  console.log(`  dynamicMinFeeActiveTvlRatio=${fmt(dynamicFloor)}`);
  console.log(`  maxVolatility=${config.screening.maxVolatility}`);
  console.log(`  minBinStep=${config.screening.minBinStep}`);
  console.log(`  maxBinStep=${config.screening.maxBinStep}`);
  console.log(`  minOrganic=${config.screening.minOrganic}`);
  console.log(`  minQuoteOrganic=${config.screening.minQuoteOrganic}`);
  console.log(`  minHolders=${config.screening.minHolders}`);

  console.log("");
  printSnapshot("candidate_snapshot:", candidateSnapshot);

  const latestSnapshot = await buildLatestSnapshot(candidate.pool);
  console.log("");
  printSnapshot("preflight_snapshot:", latestSnapshot);
  printDelta(candidateSnapshot, latestSnapshot);

  const result = await executeTool("deploy_position", {
    pool_address: candidate.pool,
    amount_y: amountY,
    amount_x: 0,
    strategy: config.strategy.strategy,
    bins_below: binsBelow,
    bins_above: 0,
    pool_name: candidate.name,
    base_mint: candidate.base?.mint || null,
    bin_step: candidate.bin_step,
    base_fee: candidate.base_fee ?? null,
    volatility: candidate.volatility,
    fee_tvl_ratio: candidate.fee_active_tvl_ratio ?? null,
    organic_score: candidate.organic_score ?? null,
    initial_value_usd: candidate.tvl ?? candidate.active_tvl ?? null,
  });

  console.log("");
  console.log("deploy_result=");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("Dry deploy smoke test failed:", error?.stack || error?.message || String(error));
  process.exit(1);
});
