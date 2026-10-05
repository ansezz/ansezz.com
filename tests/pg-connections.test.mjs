import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planConnections,
  PG_DEFAULTS,
  bouncerIni,
} from "../src/lib/pg-connections.ts";

test("defaults: 2 × 20 FPM + 10 workers + 2 scheduler + 5 other", () => {
  const r = planConnections(PG_DEFAULTS);
  assert.equal(r.totalClients, 40 + 10 + 2 + 5);
  assert.equal(r.usable, 97);
  assert.equal(r.direct, "ok");
  assert.equal(r.poolSize, 8);
  assert.equal(r.reservePool, 2);
  assert.equal(r.maxClientConn, 100);
  assert.ok(r.bouncerFits);
});

test("octane on 5 servers with a read/write split goes over", () => {
  const r = planConnections({
    ...PG_DEFAULTS,
    webServers: 5,
    webMode: "octane",
    webProcesses: 8,
    connsPerProcess: 2,
  });
  assert.equal(r.lines[0].connections, 80);
  assert.equal(r.totalClients, 80 + 20 + 4 + 5);
  assert.equal(r.direct, "over");
  assert.equal(r.maxClientConn, 140);
  assert.match(r.warnings.join(" "), /too many clients/);
  assert.match(bouncerIni(r), /pool_mode = transaction/);
});

test("bad input is clamped", () => {
  const r = planConnections({
    ...PG_DEFAULTS,
    webServers: -3,
    dbCores: 0,
    maxConnections: NaN,
  });
  assert.equal(r.lines[0].connections, 0);
  assert.equal(r.poolSize, 2);
  assert.equal(r.usable, 0);
  assert.equal(r.direct, "over");
});
