import { studyTopLPers } from "../tools/study.js";
import { addSmartWallet, listSmartWallets } from "../smart-wallets.js";

async function main() {
  console.log("=== Bootstrapping Smart Wallets (Direct On-Chain Fetch) ===");
  try {
    // We fetch the top DLMM pools directly from Meteora without strict filters
    const POOL_DISCOVERY_BASE = "https://dlmm.datapi.meteora.ag";
    const url = `${POOL_DISCOVERY_BASE}/pools?page_size=15&timeframe=24h&category=trending`;
    
    console.log(`Fetching trending pools from: ${url}`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch pools from Meteora: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const pools = Array.isArray(data.data) ? data.data : [];
    console.log(`Found ${pools.length} active pools on Meteora.`);
    
    let addedCount = 0;
    const seenOwners = new Set();
    
    // Collect all candidate pools
    const poolsToCheck = pools.map((p) => p.pool_address || p.address).filter(Boolean);
    
    // Also include Ball-SOL (the historical successful pool with +1.84% yield)
    poolsToCheck.push("CBsWwE4F2h8awoALcdGVGbNPyGVDZrZ4WFvCvWr8PL66");
    
    // Deduplicate pool addresses
    const uniquePools = [...new Set(poolsToCheck)];
    console.log(`Will study LPers for ${uniquePools.length} unique pools...`);
    
    for (const poolAddress of uniquePools) {
      console.log(`\nStudying top LPers for pool: ${poolAddress}...`);
      try {
        const study = await studyTopLPers({ pool_address: poolAddress, limit: 5 });
        const lpers = study?.lpers || [];
        console.log(`  Found ${lpers.length} LPers in this pool.`);
        
        for (const lp of lpers) {
          const owner = lp.owner;
          if (seenOwners.has(owner)) continue;
          seenOwners.add(owner);
          
          const avgPnl = lp.summary?.avg_open_pnl_pct || 0;
          const totalPnlUsd = lp.summary?.total_pnl_usd || 0;
          
          // Filter for LPers who actually make a profit (Avg PnL > 0% or Total PnL > $0)
          if (avgPnl > 0 || totalPnlUsd > 0) {
            const name = `lp-${lp.owner_short}-${study.pool_name}`.replace(/\s+/g, "-");
            const result = addSmartWallet({
              name,
              address: owner,
              category: "alpha",
              type: "lp"
            });
            
            if (result.success) {
              console.log(`  [ADDED] ${name} (${owner}) - Avg PnL: ${avgPnl}%`);
              addedCount++;
            } else {
              console.log(`  [SKIPPED] ${owner} - ${result.error}`);
            }
          } else {
            console.log(`  [FILTERED OUT] ${owner} - PnL negative or zero (Avg PnL: ${avgPnl}%)`);
          }
        }
      } catch (err) {
        console.error(`  Error studying pool ${poolAddress}:`, err.message);
      }
      
      // Small pause to avoid hitting rate limits
      await new Promise(r => setTimeout(r, 250));
    }
    
    const list = listSmartWallets();
    console.log(`\n=== DONE! ===`);
    console.log(`Added ${addedCount} new smart wallets.`);
    console.log(`Total smart wallets now tracked: ${list.total}`);
  } catch (error) {
    console.error("Bootstrap error:", error);
  }
}

main();
