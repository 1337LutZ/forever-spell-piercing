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

test("the average follows R / (|R| + 9L) with piercing as negative resistance", () => {
  close(averageResist({ ...base, piercing: 50 }), -50 / 590);
  close(averageResist({ ...base, level: 25, piercing: 50 }), -50 / 275);
  close(averageResist({ ...base, targetResistance: 100 }), 100 / 640);
});

test("a debuff stops the target's resistance at 0, piercing does not", () => {
  assert.equal(resistanceAfterDebuffs(30, 75), 0);
  assert.equal(resistanceAfterDebuffs(100, 75), 25);
  close(averageResist({ ...base, targetResistance: 30, debuffReduction: 75 }), 0);
  close(averageResist({ ...base, targetResistance: 30, debuffReduction: 75, piercing: 10 }), -10 / 550);
});

test("holy takes no resistance and no piercing", () => {
  assert.equal(averageResist({ ...base, school: "holy", targetResistance: 100, piercing: 50 }), 0);
});

test("a DoT tick rolls against a tenth of the average", () => {
  close(averageResist({ ...base, piercing: 50, periodic: true }), -5 / 590);
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
  close(bonus.expected, 1000 * (1 + 50 / 590));

  const resisted = analyse({ ...base, targetResistance: 100 });
  assert.deepEqual(
    resisted.steps.map((s) => s.percent),
    [0, -10, -20, -30],
  );
  close(resisted.expected, 1000 * (1 - 100 / 640));
});

test("a binary spell is fully resisted at the average and rolls the rest", () => {
  const result = analyse({ ...base, hitType: "binary", targetResistance: 100 });
  close(result.fullResistChance, 100 / 640);
  assert.equal(result.steps[0].fullResist, true);
  close(
    result.steps.reduce((sum, s) => sum + s.chance, 0),
    1,
  );
  close(result.expected, 1000 * (1 - 100 / 640) ** 2);
});

test("Curse of the Elements lowers resistance and raises the damage", () => {
  const result = analyse({ ...base, targetResistance: 100, curseRank: 4 });
  assert.equal(result.resistanceAfterDebuffs, 25);
  close(result.average, 25 / 565);
  close(result.expected, 1100 * (1 - 25 / 565));

  const stacked = analyse({ ...base, targetResistance: 100, debuffReduction: 25, curseRank: 4 });
  assert.equal(stacked.resistanceAfterDebuffs, 0);
  close(stacked.expected, 1100);
});
