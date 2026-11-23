// The live-realm resist and Spell Piercing rules WoWSims Forever uses (sim/core/spell_resistances.go),
// fitted to combat logs.

export const SCHOOLS = ["arcane", "fire", "frost", "nature", "shadow", "holy"];

// Curse of the Elements ranks 1-4 (440892, 1311676, 1311677, 1311680): magic resistances lowered by
// 30/45/60/75 and magic damage taken raised by 4/6/8/10%.
export const CURSE_OF_THE_ELEMENTS = [
  { rank: 0, resistance: 0, damageTaken: 0 },
  { rank: 1, resistance: 30, damageTaken: 0.04 },
  { rank: 2, resistance: 45, damageTaken: 0.06 },
  { rank: 3, resistance: 60, damageTaken: 0.08 },
  { rank: 4, resistance: 75, damageTaken: 0.1 },
];

// The resistance a target keeps after debuffs. Its own resistance stops at 0, so a debuff that would
// take it lower adds nothing.
export function resistanceAfterDebuffs(targetResistance, debuffReduction) {
  return Math.max(0, Math.max(0, targetResistance) - debuffReduction);
}

// The average share of the damage resisted, R / (|R| + 8L + 19), with the caster's Spell Piercing taken off
// R. Piercing past 0 makes the share negative: the roll pays it out as bonus damage. Holy has no
// resistance and takes no piercing. Most DoT ticks roll against a tenth of the share, and only its
// positive part, so they take no bonus.
export function averageResist({ level, school, targetResistance, debuffReduction, piercing, tenth }) {
  if (school === "holy") {
    return 0;
  }
  const resistance = resistanceAfterDebuffs(targetResistance, debuffReduction) - piercing;
  const average = resistance / (Math.abs(resistance) + 8 * level + 19);
  return tenth ? Math.max(0, average) / 10 : average;
}

// A partial resist never takes more than 75% of a hit: the roll's 80, 90 and 100% steps land on 75%.
// The bonus side is capped the same way.
export function resistedPercent(tenths) {
  return Math.min(tenths * 10, 75);
}

// The roll in tenths of the damage around the average share a (0 to 1). Up to a = 10% it gives 0, 1 or
// 2 tenths at 1 - 7.5a, 5a and 2.5a; from 90% the same mirrored from 10 tenths; in between each 10%
// step x within 20% of a at 0.5 - 2.5|x - a|. Returns [tenths, chance] pairs with a chance above 0.
export function rollTenths(a) {
  if (a <= 0) {
    return [[0, 1]];
  }
  if (a <= 0.1) {
    return [
      [0, 1 - 7.5 * a],
      [1, 5 * a],
      [2, 2.5 * a],
    ];
  }
  if (a >= 0.9) {
    const b = 1 - a;
    return [
      [8, 2.5 * b],
      [9, 5 * b],
      [10, 1 - 7.5 * b],
    ];
  }
  const steps = [];
  for (let tenths = 0; tenths <= 10; tenths++) {
    const chance = 0.5 - 2.5 * Math.abs(tenths / 10 - a);
    if (chance > 1e-12) {
      steps.push([tenths, chance]);
    }
  }
  return steps;
}

// Everything the page shows for one hit. hitType is "direct" for a direct hit, a channel tick that is
// not binary or a tick at the full share, "dot" for a tick at a tenth of the share, and "binary" for a
// binary spell. A binary spell resists in full on its hit roll with the average share as the chance,
// and one that lands takes no partial resist. Once piercing passes the target's resistance it rolls the
// bonus like any other hit.
export function analyse(options) {
  const curse = CURSE_OF_THE_ELEMENTS[options.curseRank] ?? CURSE_OF_THE_ELEMENTS[0];
  const input = { ...options, debuffReduction: options.debuffReduction + curse.resistance };
  const { damage, hitType } = input;
  const damageTaken = 1 + curse.damageTaken;
  const average = averageResist({ ...input, tenth: hitType === "dot" });
  const full = damage * damageTaken;

  let fullResistChance = 0;
  let steps;
  let share;
  if (hitType === "binary" && average > 0) {
    fullResistChance = Math.max(0, average);
    steps = [{ percent: 0, chance: 1 - fullResistChance, damage: full }];
    share = fullResistChance;
  } else {
    const sign = average < 0 ? 1 : -1;
    const byPercent = new Map();
    for (const [tenths, chance] of rollTenths(Math.abs(average))) {
      const percent = resistedPercent(tenths);
      byPercent.set(percent, (byPercent.get(percent) ?? 0) + chance);
    }
    steps = [...byPercent].map(([percent, chance]) => ({
      percent: percent === 0 ? 0 : sign * percent,
      chance,
      damage: full * (1 + (sign * percent) / 100),
    }));
    share = -sign * steps.reduce((sum, step) => sum + (step.chance * Math.abs(step.percent)) / 100, 0);
  }
  if (fullResistChance > 0) {
    steps.unshift({ percent: -100, chance: fullResistChance, damage: 0, fullResist: true });
  }

  const afterDebuffs =
    input.school === "holy" ? 0 : resistanceAfterDebuffs(input.targetResistance, input.debuffReduction);
  return {
    resistanceAfterDebuffs: afterDebuffs,
    effectiveResistance: input.school === "holy" ? 0 : afterDebuffs - input.piercing,
    average,
    share,
    fullResistChance,
    damageTaken,
    steps,
    expected: full * (1 - share),
  };
}

export function expectedWithoutPiercing(input) {
  return analyse({ ...input, piercing: 0 }).expected;
}
