import assert from "node:assert/strict";
import { __pnlAccounting } from "../tools/dlmm.js";

const {
  deriveOpenPnlPct,
  deriveOpenPnlValue,
  getClosedPnlEntries,
  resolvePnlSnapshot,
  shouldRejectClosedPnl,
} = __pnlAccounting;

const openPosition = {
  allTimeDeposits: { total: { usd: "100" } },
  allTimeWithdrawals: { total: { usd: "12" } },
  allTimeFees: { total: { usd: "3" } },
  unrealizedPnl: {
    balances: "95",
    unclaimedFeeTokenX: { usd: "1.5" },
    unclaimedFeeTokenY: { usd: "0.5" },
  },
};

assert.equal(deriveOpenPnlValue(openPosition), 12);
assert.equal(deriveOpenPnlPct(openPosition), 12);

assert.deepEqual(
  resolvePnlSnapshot({
    reportedPct: null,
    derivedPct: 12,
    reportedValue: null,
    derivedValue: 12,
  }),
  { pct: 12, value: 12, diff: null, suspicious: false },
);

assert.deepEqual(
  resolvePnlSnapshot({
    reportedPct: -35,
    derivedPct: 12,
    reportedValue: -35,
    derivedValue: 12,
    maxDiffPct: 5,
  }),
  { pct: 12, value: 12, diff: 47, suspicious: true },
);

assert.deepEqual(
  resolvePnlSnapshot({
    reportedPct: 11.5,
    derivedPct: 12,
    reportedValue: 11.5,
    derivedValue: 12,
    maxDiffPct: 5,
  }),
  { pct: 11.5, value: 11.5, diff: 0.5, suspicious: false },
);

assert.equal(shouldRejectClosedPnl(-100, "low yield"), true);
assert.equal(shouldRejectClosedPnl(-100, "stop loss"), false);
assert.equal(getClosedPnlEntries({ data: [{ positionAddress: "abc" }] }).length, 1);

console.log("PnL accounting tests passed");
process.exit(0);
