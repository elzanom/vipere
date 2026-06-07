import fs from "fs";
import { log } from "./logger.js";
import { repoPath } from "./repo-root.js";

const WALLETS_PATH = repoPath("smart-wallets.json");

function loadWallets() {
  if (!fs.existsSync(WALLETS_PATH)) return { wallets: [] };
  try {
    return JSON.parse(fs.readFileSync(WALLETS_PATH, "utf8"));
  } catch {
    return { wallets: [] };
  }
}

function saveWallets(data) {
  fs.writeFileSync(WALLETS_PATH, JSON.stringify(data, null, 2));
}

const SOLANA_PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function addSmartWallet({ name, address, category = "alpha", type = "lp" }) {
  if (!SOLANA_PUBKEY_RE.test(address)) {
    return { success: false, error: "Invalid Solana address format" };
  }
  const data = loadWallets();
  const existing = data.wallets.find((w) => w.address === address);
  if (existing) {
    return { success: false, error: `Already tracked as "${existing.name}"` };
  }
  data.wallets.push({ name, address, category, type, addedAt: new Date().toISOString() });
  saveWallets(data);
  log("smart_wallets", `Added wallet: ${name} (${category}, type=${type})`);
  return { success: true, wallet: { name, address, category, type } };
}

export function removeSmartWallet({ address }) {
  const data = loadWallets();
  const wallet = data.wallets.find((w) => w.address === address);
  if (!wallet) return { success: false, error: "Wallet not found" };
  data.wallets = data.wallets.filter((w) => w.address !== address);
  saveWallets(data);
  log("smart_wallets", `Removed wallet: ${wallet.name}`);
  return { success: true, removed: wallet.name };
}

export function listSmartWallets() {
  const { wallets } = loadWallets();
  return { total: wallets.length, wallets };
}

// Cache wallet positions for 5 minutes to avoid hammering RPC
const _cache = new Map(); // address -> { positions, fetchedAt }
const _inflight = new Map(); // address -> Promise<positions>
const CACHE_TTL = 5 * 60 * 1000;
const MAX_CONCURRENT_WALLET_FETCHES = 2;

async function getCachedWalletPositions(wallet, getWalletPositions) {
  const cached = _cache.get(wallet.address);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.positions;
  }

  const existing = _inflight.get(wallet.address);
  if (existing) return existing;

  const pending = (async () => {
    try {
      const { positions } = await getWalletPositions({ wallet_address: wallet.address });
      const normalized = positions || [];
      _cache.set(wallet.address, { positions: normalized, fetchedAt: Date.now() });
      return normalized;
    } catch {
      return [];
    } finally {
      _inflight.delete(wallet.address);
    }
  })();

  _inflight.set(wallet.address, pending);
  return pending;
}

export async function checkSmartWalletsOnPool({ pool_address }) {
  const { wallets: allWallets } = loadWallets();
  // Only check LP-type wallets — holder wallets don't have positions
  const wallets = allWallets.filter((w) => !w.type || w.type === "lp");
  if (wallets.length === 0) {
    return {
      pool: pool_address,
      tracked_wallets: 0,
      in_pool: [],
      confidence_boost: false,
      signal: "No smart wallets tracked yet — neutral signal",
    };
  }

  const { getWalletPositions } = await import("./tools/dlmm.js");

  const results = [];
  for (let i = 0; i < wallets.length; i += MAX_CONCURRENT_WALLET_FETCHES) {
    const chunk = wallets.slice(i, i + MAX_CONCURRENT_WALLET_FETCHES);
    const chunkResults = await Promise.all(
      chunk.map(async (wallet) => ({
        wallet,
        positions: await getCachedWalletPositions(wallet, getWalletPositions),
      }))
    );
    results.push(...chunkResults);
  }

  const inPool = results
    .filter((r) => r.positions.some((p) => p.pool === pool_address))
    .map((r) => ({ name: r.wallet.name, category: r.wallet.category, address: r.wallet.address }));

  return {
    pool: pool_address,
    tracked_wallets: wallets.length,
    in_pool: inPool,
    confidence_boost: inPool.length > 0,
    signal: inPool.length > 0
      ? `${inPool.length}/${wallets.length} smart wallet(s) are in this pool: ${inPool.map((w) => w.name).join(", ")} — STRONG signal`
      : `0/${wallets.length} smart wallets in this pool — neutral, rely on fundamentals`,
  };
}
