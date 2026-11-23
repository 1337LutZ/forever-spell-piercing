import { test } from "node:test";
import assert from "node:assert/strict";
import { analyse, averageResist, resistanceAfterDebuffs, rollTenths } from "../piercing.js";
const base = {
  level: 60,
  school: "frost",
  damage: 1000,
  hitType: "direct",
  targetResistance: 0,
  debuffReduction: 0,
  piercing: 0,
  curseRank: 0,
};

const close = (actual, expected, digits = 6) =>
  assert.ok(Math.abs(actual - expected) < 10 ** -digits, `${actual} is not ${expected}`);

test("the average follows R / (|R| + 8L + 19) with piercing as negative resistance", () => {
  close(averageResist({ ...base, piercing: 50 }), -50 / 549);
  close(averageResist({ ...base, level: 25, piercing: 50 }), -50 / 269);
  close(averageResist({ ...base, targetResistance: 100 }), 100 / 599);
});

test("a debuff stops the target's resistance at 0, piercing does not", () => {
  assert.equal(resistanceAfterDebuffs(30, 75), 0);
  assert.equal(resistanceAfterDebuffs(100, 75), 25);
  close(averageResist({ ...base, targetResistance: 30, debuffReduction: 75 }), 0);
  close(averageResist({ ...base, targetResistance: 30, debuffReduction: 75, piercing: 10 }), -10 / 509);
});

test("holy takes no resistance and no piercing", () => {
  assert.equal(averageResist({ ...base, school: "holy", targetResistance: 100, piercing: 50 }), 0);
});

test("a tick at a tenth rolls against a tenth of the positive share", () => {
  close(averageResist({ ...base, targetResistance: 100, tenth: true }), 10 / 599);
  close(averageResist({ ...base, targetResistance: 100, piercing: 50, tenth: true }), 5 / 549);
  assert.equal(averageResist({ ...base, piercing: 50, tenth: true }), 0);
});

test("up to 10% the roll is 1 - 7.5a, 5a and 2.5a", () => {
  const steps = rollTenths(50 / 590);
  assert.deepEqual(
    steps.map(([t]) => t),
    [0, 1, 2],
  );
  close(steps[0][1], 0.364407, 5);
  close(steps[1][1], 0.423729, 5);
  close(steps[2][1], 0.211864, 5);
});

test("above 10% the roll spreads over every 10% step within 20% of the average", () => {
  const steps = rollTenths(50 / 275);
  assert.deepEqual(
    steps.map(([t]) => t),
    [0, 1, 2, 3],
  );
  close(steps[0][1], 0.045455, 5);
  close(steps[3][1], 0.204545, 5);
});

test("every roll sums to 1 and its mean is the average", () => {
  for (const a of [0.01, 0.05, 0.1, 0.13, 0.25, 0.5, 0.77, 0.9, 0.95]) {
    const steps = rollTenths(a);
    close(
      steps.reduce((sum, [, c]) => sum + c, 0),
      1,
    );
    close(
      steps.reduce((sum, [t, c]) => sum + (t / 10) * c, 0),
      a,
    );
  }
});

test("piercing pays out as bonus steps, a resisted hit as resisted steps", () => {
  const bonus = analyse({ ...base, piercing: 50 });
  assert.deepEqual(
    bonus.steps.map((s) => s.percent),
    [0, 10, 20],
  );
  close(bonus.steps[2].damage, 1200);
  close(bonus.expected, 1000 * (1 + 50 / 549));

  const resisted = analyse({ ...base, targetResistance: 100 });
  assert.deepEqual(
    resisted.steps.map((s) => s.percent),
    [0, -10, -20, -30],
  );
  close(resisted.expected, 1000 * (1 - 100 / 599));
});

test("a binary spell is fully resisted at the average, and one that lands takes its full damage", () => {
  const result = analyse({ ...base, hitType: "binary", targetResistance: 100 });
  close(result.fullResistChance, 100 / 599);
  assert.deepEqual(
    result.steps.map((s) => [s.percent, s.fullResist === true]),
    [
      [-100, true],
      [0, false],
    ],
  );
  close(result.steps[1].chance, 1 - 100 / 599);
  close(result.steps[1].damage, 1000);
  close(result.expected, 1000 * (1 - 100 / 599));
});

test("piercing lowers a binary spell's full resist chance to 0, and past that it rolls the bonus", () => {
  const partly = analyse({ ...base, hitType: "binary", targetResistance: 100, piercing: 60 });
  close(partly.fullResistChance, 40 / 539);
  close(partly.expected, 1000 * (1 - 40 / 539));

  const past = analyse({ ...base, hitType: "binary", targetResistance: 100, piercing: 150 });
  const direct = analyse({ ...base, targetResistance: 100, piercing: 150 });
  assert.equal(past.fullResistChance, 0);
  assert.deepEqual(past.steps, direct.steps);
  close(past.expected, 1000 * (1 + 50 / 549));
});

test("a tick at a tenth takes a tenth of the resist and no bonus from piercing", () => {
  const resisted = analyse({ ...base, hitType: "dot", targetResistance: 100 });
  assert.deepEqual(
    resisted.steps.map((s) => s.percent),
    [0, -10, -20],
  );
  close(resisted.expected, 1000 * (1 - 10 / 599));

  const pierced = analyse({ ...base, hitType: "dot", piercing: 50 });
  assert.deepEqual(
    pierced.steps.map((s) => [s.percent, s.chance]),
    [[0, 1]],
  );
  close(pierced.expected, 1000);
});

test("a tick at the full share takes the piercing bonus a tick at a tenth does not", () => {
  const full = analyse({ ...base, hitType: "direct", piercing: 50 });
  assert.deepEqual(
    full.steps.map((s) => s.percent),
    [0, 10, 20],
  );
  close(full.expected, 1000 * (1 + 50 / 549));
  close(analyse({ ...base, hitType: "dot", piercing: 50 }).expected, 1000);
});

test("past the target's resistance, more piercing changes nothing on ticks at a tenth", () => {
  const atZero = analyse({ ...base, hitType: "dot", targetResistance: 100, piercing: 100 });
  const past = analyse({ ...base, hitType: "dot", targetResistance: 100, piercing: 150 });
  close(atZero.expected, 1000);
  close(past.expected, atZero.expected);
});
test("around an average of 74% the 80 and 90% steps land on 75%", () => {
  const result = analyse({ ...base, school: "shadow", targetResistance: (0.74 * 499) / 0.26 });
  close(result.average, 0.74);
  assert.deepEqual(
    result.steps.map((s) => s.percent),
    [-60, -70, -75],
  );
  close(result.steps[0].chance, 0.15);
  close(result.steps[1].chance, 0.4);
  close(result.steps[2].chance, 0.45);
  close(result.steps[2].damage, 250);
  close(result.share, 0.7075);
  close(result.expected, 292.5);
});

test("a direct hit is never fully resisted through the roll", () => {
  const result = analyse({ ...base, targetResistance: 10000 });
  assert.ok(result.average > 0.9);
  assert.deepEqual(
    result.steps.map((s) => [s.percent, s.fullResist === true]),
    [[-75, false]],
  );
  close(result.steps[0].chance, 1);
  close(result.expected, 250);
});

test("Curse of the Elements lowers resistance and raises the damage", () => {
  const result = analyse({ ...base, targetResistance: 100, curseRank: 4 });
  assert.equal(result.resistanceAfterDebuffs, 25);
  close(result.average, 25 / 524);
  close(result.expected, 1100 * (1 - 25 / 524));

  const stacked = analyse({ ...base, targetResistance: 100, debuffReduction: 25, curseRank: 4 });
  assert.equal(stacked.resistanceAfterDebuffs, 0);
  close(stacked.expected, 1100);
});
