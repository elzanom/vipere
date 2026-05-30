import { config } from "../config.js";

const s = config.screening;
const filters = [
  "base_token_has_critical_warnings=false",
  "quote_token_has_critical_warnings=false",
  s.excludeHighSupplyConcentration ? "base_token_has_high_supply_concentration=false" : null,
  "base_token_has_high_single_ownership=false",
  "pool_type=dlmm",
  `base_token_market_cap>=${s.minMcap}`,
  `base_token_market_cap<=${s.maxMcap}`,
  `base_token_holders>=${s.minHolders}`,
  `volume>=${s.minVolume}`,
  `tvl>=${s.minTvl}`,
  s.maxTvl != null ? `tvl<=${s.maxTvl}` : null,
  `dlmm_bin_step>=${s.minBinStep}`,
  `dlmm_bin_step<=${s.maxBinStep}`,
  `fee_active_tvl_ratio>=${s.minFeeActiveTvlRatio}`,
  `base_token_organic_score>=${s.minOrganic}`,
  `quote_token_organic_score>=${s.minQuoteOrganic}`,
  s.minTokenAgeHours != null ? `base_token_created_at<=${Date.now() - s.minTokenAgeHours * 3_600_000}` : null,
  s.maxTokenAgeHours != null ? `base_token_created_at>=${Date.now() - s.maxTokenAgeHours * 3_600_000}` : null,
  Array.isArray(s.allowedLaunchpads) && s.allowedLaunchpads.length > 0
    ? `base_token_launchpad=[${s.allowedLaunchpads.join(",")}]`
    : null,
].filter(Boolean).join("&&");

console.log("=== Constructed Filters ===");
console.log(filters);

const POOL_DISCOVERY_BASE = "https://pool-discovery-api.datapi.meteora.ag";
const url = `${POOL_DISCOVERY_BASE}/pools?` +
  `page_size=50` +
  `&filter_by=${encodeURIComponent(filters)}` +
  `&timeframe=${s.timeframe}` +
  `&category=${s.category}`;

console.log("\n=== Target URL ===");
console.log(url);

const res = await fetch(url);
console.log("\n=== Response Status ===");
console.log(res.status, res.statusText);
if (!res.ok) {
  const text = await res.text();
  console.log("Error details:", text);
} else {
  const data = await res.json();
  console.log("Success! Found", data.data?.length, "pools.");
}
