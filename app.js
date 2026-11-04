import { analyse, expectedWithoutPiercing } from "./piercing.js";

const RESIST_SCHOOLS = ["arcane", "fire", "frost", "nature", "shadow"];

const DEFAULTS = {
  level: 60,
  school: "frost",
  damage: 882,
  hitType: "direct",
  piercing: 15,
  curseRank: 0,
  debuffReduction: 0,
  ...Object.fromEntries(RESIST_SCHOOLS.map((s) => [`res-${s}`, 0])),
};

const HIT_TYPE_HELP = {
  direct: "Rolls the full share. Channel ticks such as Mind Flay count here.",
  dot: "The sim rolls a tenth of the share on each tick. Logs haven't shown piercing bonus on ticks yet.",
  binary: "The average share is also the chance to resist the whole spell. One that lands rolls like a direct hit.",
};

const form = document.getElementById("inputs");
const $ = (id) => document.getElementById(id);

function readState() {
  const state = {};
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    const element = form.elements[key];
    if (typeof fallback === "number") {
      const value = Number(element.value);
      state[key] = Number.isFinite(value) ? value : fallback;
    } else {
      state[key] = element.value;
    }
  }
  state.level = Math.min(60, Math.max(1, Math.round(state.level || 1)));
  return state;
}

function writeState(state) {
  for (const [key, value] of Object.entries(state)) {
    const element = form.elements[key];
    if (element) element.value = value;
  }
  $("level-range").value = state.level;
}

function stateFromHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const state = { ...DEFAULTS };
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    if (!params.has(key)) continue;
    const raw = params.get(key);
    if (typeof fallback === "number") {
      const value = Number(raw);
      if (Number.isFinite(value)) state[key] = value;
    } else {
      state[key] = raw;
    }
  }
  return state;
}

function hashFromState(state) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    if (value === DEFAULTS[key]) continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `#${text}` : "";
}

function simInput(state, piercing) {
  return {
    level: state.level,
    school: state.school,
    damage: state.damage,
    hitType: state.hitType,
    targetResistance: state.school === "holy" ? 0 : state[`res-${state.school}`],
    debuffReduction: state.debuffReduction,
    curseRank: state.curseRank,
    piercing,
  };
}

const formatNumber = (value, digits = 0) =>
  value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const formatPercent = (value, digits = 1) => `${formatNumber(value * 100, digits)}%`;

const signed = (value, text) => (value > 0 ? `+${text}` : value < 0 ? `−${text.replace("-", "")}` : text);

function renderSummary(state, piercing, result) {
  $("out-after-debuffs").textContent = state.school === "holy" ? "None" : formatNumber(result.resistanceAfterDebuffs);
  const effective = $("out-effective");
  effective.textContent = state.school === "holy" ? "None" : formatNumber(result.effectiveResistance);
  effective.className = `stat-value ${result.effectiveResistance < 0 ? "positive" : result.effectiveResistance > 0 ? "negative" : ""}`;

  const average = $("out-average");
  $("out-average-label").textContent = result.average > 0 ? "Average resisted" : "Average bonus";
  average.textContent = formatPercent(Math.abs(result.average), 2);
  average.className = `stat-value ${result.average < 0 ? "positive" : result.average > 0 ? "negative" : ""}`;

  $("out-expected").textContent = formatNumber(result.expected, 1);
  const without = expectedWithoutPiercing(simInput(state, piercing));
  const gain = result.expected - without;
  const gainElement = $("out-gain");
  if (piercing === 0 || state.school === "holy") {
    gainElement.textContent = "No Spell Piercing on this school";
    gainElement.className = "stat-sub";
  } else {
    const share = without > 0 ? gain / without : 0;
    gainElement.textContent = `${signed(gain, formatNumber(gain, 1))} (${signed(share, formatPercent(share, 2))}) from piercing`;
    gainElement.className = `stat-sub ${gain > 0 ? "positive" : ""}`;
  }

  const notes = [];
  if (state.school === "holy") {
    notes.push("Holy has no resistance in Forever, so piercing and resistance do nothing here.");
  }
  const curseReduction = [0, 30, 45, 60, 75][state.curseRank] ?? 0;
  const targetResistance = state.school === "holy" ? 0 : state[`res-${state.school}`];
  const wasted = curseReduction + state.debuffReduction - targetResistance;
  if (state.school !== "holy" && wasted > 0 && curseReduction + state.debuffReduction > 0) {
    notes.push(
      `Your debuffs take off ${wasted} more resistance than the target has. Debuffs stop at 0, so that part adds nothing. Only Spell Piercing goes past 0.`,
    );
  }
  if (state.curseRank > 0) {
    notes.push(`Curse of the Elements also adds ${state.curseRank * 2 + 2}% damage taken, which is in every number above.`);
  }
  $("out-note").textContent = notes.join(" ");
}

function renderSteps(result) {
  const container = $("steps");
  container.replaceChildren();
  const maxChance = Math.max(...result.steps.map((s) => s.chance));
  for (const step of result.steps) {
    const row = document.createElement("div");
    const kind = step.fullResist ? "full" : step.percent > 0 ? "bonus" : step.percent < 0 ? "resist" : "none";
    row.className = `step ${kind}`;
    const label = step.fullResist ? "Resisted" : step.percent === 0 ? "+0%" : signed(step.percent, `${Math.abs(step.percent)}%`);
    row.innerHTML = `
      <span class="step-label"></span>
      <span class="step-bar"><span class="step-fill"></span></span>
      <span class="step-chance"></span>
      <span class="step-damage"></span>`;
    row.querySelector(".step-label").textContent = label;
    row.querySelector(".step-fill").style.width = `${maxChance > 0 ? (step.chance / maxChance) * 100 : 0}%`;
    row.querySelector(".step-chance").textContent = formatPercent(step.chance, 1);
    row.querySelector(".step-damage").textContent = formatNumber(step.damage);
    row.title = step.fullResist
      ? `${formatPercent(step.chance, 2)} of casts are fully resisted`
      : `${formatPercent(step.chance, 2)} of hits deal ${formatNumber(step.damage, 1)}`;
    container.append(row);
  }
}

function renderChart(state, piercing) {
  const width = 640;
  const height = 236;
  const pad = { left: 44, right: 14, top: 12, bottom: 46 };
  const maxPiercing = Math.max(100, Math.ceil((piercing + 20) / 50) * 50);
  const base = expectedWithoutPiercing(simInput(state, piercing));
  const points = [];
  for (let p = 0; p <= maxPiercing; p += 1) {
    const expected = analyse(simInput(state, p)).expected;
    points.push([p, base > 0 ? (expected / base - 1) * 100 : 0]);
  }
  const maxY = Math.max(5, Math.ceil(Math.max(...points.map(([, y]) => y)) / 5) * 5);
  const x = (p) => pad.left + (p / maxPiercing) * (width - pad.left - pad.right);
  const y = (v) => pad.top + (1 - v / maxY) * (height - pad.top - pad.bottom);

  const grid = [];
  const yStep = maxY <= 10 ? 2 : maxY <= 25 ? 5 : 10;
  for (let v = 0; v <= maxY; v += yStep) {
    grid.push(`<line class="gridline" x1="${pad.left}" x2="${width - pad.right}" y1="${y(v)}" y2="${y(v)}" />`);
    grid.push(`<text x="${pad.left - 6}" y="${y(v) + 4}" text-anchor="end">+${v}%</text>`);
  }
  const xStep = maxPiercing <= 100 ? 10 : 25;
  for (let p = 0; p <= maxPiercing; p += xStep) {
    grid.push(`<text x="${x(p)}" y="${height - pad.bottom + 16}" text-anchor="middle">${p}</text>`);
  }
  const path = points.map(([p, v], i) => `${i ? "L" : "M"}${x(p).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const current = points[Math.min(piercing, points.length - 1)] ?? [0, 0];
  $("chart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Damage change against Spell Piercing from 0 to ${maxPiercing}">
      ${grid.join("")}
      <line class="axis" x1="${pad.left}" x2="${width - pad.right}" y1="${y(0)}" y2="${y(0)}" />
      <path class="line" d="${path}" />
      <circle class="marker" cx="${x(current[0])}" cy="${y(current[1])}" r="5">
        <title>${current[0]} piercing: +${formatNumber(current[1], 2)}%</title>
      </circle>
      <text x="${(pad.left + width - pad.right) / 2}" y="${height - 6}" text-anchor="middle">Spell Piercing</text>
    </svg>`;
}

function render() {
  const state = readState();
  const piercing = Math.max(0, Math.round(state.piercing));
  const result = analyse(simInput(state, piercing));

  $("level-range").value = state.level;
  $("hit-type-help").textContent = HIT_TYPE_HELP[state.hitType];
  for (const element of form.querySelectorAll(".resist")) {
    element.classList.toggle("active", element.dataset.school === state.school);
  }

  renderSummary(state, piercing, result);
  renderSteps(result);
  renderChart(state, piercing);
  history.replaceState(null, "", `${location.pathname}${location.search}${hashFromState(state)}`);
}

form.addEventListener("input", (event) => {
  if (event.target.id === "level-range") {
    form.elements.level.value = event.target.value;
  }
  render();
});

$("reset").addEventListener("click", () => {
  writeState(DEFAULTS);
  render();
});

$("share").addEventListener("click", async () => {
  const button = $("share");
  try {
    await navigator.clipboard.writeText(location.href);
    button.textContent = "Link copied";
  } catch {
    button.textContent = "Copy the address bar";
  }
  setTimeout(() => (button.textContent = "Copy link"), 1600);
});

writeState(stateFromHash());
render();
