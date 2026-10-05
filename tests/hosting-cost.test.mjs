import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCost, managedDefaults } from "../src/lib/hosting-cost.ts";
import { MANAGED, VPS_PLANS, COOLIFY } from "../src/data/hosting-prices.ts";

const w = {
  apps: 2,
  appRamGb: 1,
  workers: 2,
  workerRamGb: 0.5,
  databases: 1,
  dbRamGb: 2,
  dbStorageGb: 20,
  redis: 1,
  redisRamGb: 0.25,
  egressGb: 200,
  cpuPerService: 0.5,
};
const plan = VPS_PLANS.find((p) => p.id === "hetzner-cx33");
const self = {
  serverPrice: plan.price,
  serverRamGb: plan.ramGb,
  serversOverride: 0,
  ipv4: plan.ipv4,
  backupPct: plan.backupPct,
  includedGbPerServer: plan.includedGb,
  overagePerGb: plan.overagePerGb,
  coolify: "self",
  coolifyRamGb: COOLIFY.selfHostedRamGb,
  cloudBase: COOLIFY.cloudBase,
  cloudIncludedServers: COOLIFY.cloudIncludedServers,
  cloudPerExtraServer: COOLIFY.cloudPerExtraServer,
  extras: 0,
  usablePct: 80,
};
const ops = { selfHours: 4, managedHours: 1, rate: 50 };

test("render tiers are picked by RAM", () => {
  const m = managedDefaults(
    MANAGED.find((p) => p.id === "render"),
    w,
  );
  assert.equal(m.appPrice, 25);
  assert.equal(m.workerPrice, 7);
  assert.equal(m.dbPrice, 40);
  assert.equal(m.redisPrice, 10);
});

test("railway is linear in RAM and CPU", () => {
  const m = managedDefaults(
    MANAGED.find((p) => p.id === "railway"),
    w,
  );
  assert.equal(m.appPrice, 1 * 10 + 0.5 * 20);
  assert.equal(m.dbPrice, 2 * 10 + 0.5 * 20);
});

test("self-hosted total on one CX33", () => {
  // RAM: 2 + 1 + 2 + 0.25 + 2 (Coolify) = 7.25 GB, 8 GB × 80% = 6.4 → 2 servers.
  const m = managedDefaults(MANAGED[0], w);
  const r = computeCost(w, self, m, ops);
  assert.equal(r.ramNeeded, 7.25);
  assert.equal(r.servers, 2);
  const infra = 2 * 9.99 + 2 * 0.6 + 2 * 9.99 * 0.2;
  assert.ok(Math.abs(r.self.infra - infra) < 1e-9);
  assert.equal(r.self.ops, 200);
  // Render: 25 fee + 2×25 + 2×7 + 40 + 10 + 20 GB × 0.30 + (200-25) × 0.15
  const managed = 25 + 50 + 14 + 40 + 10 + 6 + 175 * 0.15;
  assert.ok(Math.abs(r.managed.infra - managed) < 1e-9);
  assert.ok(Math.abs(r.diff - (managed + 50 - infra - 200)) < 1e-9);
});

test("coolify cloud charges for extra servers and frees RAM", () => {
  const r = computeCost(
    w,
    { ...self, coolify: "cloud", serversOverride: 3 },
    managedDefaults(MANAGED[0], w),
    ops,
  );
  const line = r.self.lines.find((l) => l.label === "Coolify Cloud");
  assert.equal(line.amount, 5 + 3);
  assert.equal(r.ramNeeded, 5.25);
});

test("railway credit is capped at usage", () => {
  const tiny = {
    ...w,
    apps: 0,
    workers: 0,
    databases: 0,
    redis: 0,
    egressGb: 0,
  };
  const r = computeCost(
    tiny,
    self,
    managedDefaults(
      MANAGED.find((p) => p.id === "railway"),
      tiny,
    ),
    ops,
  );
  assert.equal(r.managed.infra, 20);
});
