import { getTopCandidates } from "../tools/screening.js";
import { checkDeployPreflight } from "../tools/executor.js";

async function main() {
  const limit = 3;
  const result = await getTopCandidates({ limit });
  const candidates = result?.candidates || [];

  console.log("=== Live Preflight Smoke Test ===");
  console.log(`screened=${result?.total_screened ?? 0} candidates=${candidates.length}`);

  if (!candidates.length) {
    const examples = result?.filtered_examples || [];
    console.log("No candidates available.");
    if (examples.length) {
      console.log("Filtered examples:");
      for (const entry of examples) {
        console.log(`- ${entry.name}: ${entry.reason}`);
      }
    }
    process.exit(0);
  }

  for (const [index, pool] of candidates.entries()) {
    const preflight = await checkDeployPreflight({ pool_address: pool.pool });
    console.log("");
    console.log(`#${index + 1} ${pool.name}`);
    console.log(`pool=${pool.pool}`);
    console.log(`fee_active_tvl_ratio=${pool.fee_active_tvl_ratio}`);
    console.log(`volatility=${pool.volatility} (${pool.volatility_timeframe || "unknown"})`);
    console.log(`preflight_pass=${preflight.pass}`);
    if (preflight.reason) console.log(`reason=${preflight.reason}`);
  }
}

main().catch((error) => {
  console.error("Smoke preflight failed:", error?.stack || error?.message || String(error));
  process.exit(1);
});
