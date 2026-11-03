/** Combat formulas from https://meowdb.com/msclassic/formulas — mage-focused. */

export type Element = "none" | "fire" | "ice" | "lightning" | "poison";
export type ElementRelation = "immune" | "strong" | "weak" | "neutral";

export type MageSkillId =
  | "claw"
  | "bolt"
  | "fire"
  | "poison"
  | "cold"
  | "thunder";

export type MageSkill = {
  id: MageSkillId;
  name: string;
  element: Element;
  max: number;
  hits: number;
  jobLevel: number;
  /** Skill power % at a given rank (MeowDB Basic Attack). */
  powerAt: (rank: number) => number;
  /** Spell mastery level at a given rank. */
  masteryAt: (rank: number) => number;
};

/** Magician attack skills used for one-shot odds. Powers from NiaDB skill pages. */
export const MAGE_SKILLS: MageSkill[] = [
  {
    id: "claw",
    name: "Magic Claw",
    element: "none",
    max: 20,
    hits: 2,
    jobLevel: 8,
    powerAt: (r) => (r >= 20 ? 65 : 44 + r),
    masteryAt: (r) => (r >= 20 ? 10 : Math.max(1, Math.floor(r / 2))),
  },
  {
    id: "bolt",
    name: "Energy Bolt",
    element: "none",
    max: 20,
    hits: 1,
    jobLevel: 8,
    powerAt: (r) => (r >= 20 ? 130 : 88 + 2 * r),
    masteryAt: (r) => (r >= 20 ? 10 : Math.max(1, Math.floor(r / 2))),
  },
  {
    id: "fire",
    name: "Fire Arrow",
    element: "fire",
    max: 30,
    hits: 1,
    jobLevel: 30,
    powerAt: (r) => (r >= 30 ? 180 : 118 + 2 * r),
    masteryAt: (r) => (r >= 30 ? 10 : Math.max(1, Math.floor(r / 3))),
  },
  {
    id: "poison",
    name: "Poison Breath",
    element: "poison",
    max: 30,
    hits: 1,
    jobLevel: 30,
    powerAt: (r) => (r >= 30 ? 90 : 59 + r),
    masteryAt: (r) => (r >= 30 ? 10 : Math.max(1, Math.floor(r / 3))),
  },
  {
    id: "cold",
    name: "Cold Beam",
    element: "ice",
    max: 30,
    hits: 1,
    jobLevel: 30,
    powerAt: (r) => (r >= 30 ? 170 : 108 + 2 * r),
    masteryAt: (r) => (r >= 30 ? 10 : Math.max(1, Math.floor(r / 3))),
  },
  {
    id: "thunder",
    name: "Thunder Bolt",
    element: "lightning",
    max: 30,
    hits: 1,
    jobLevel: 30,
    powerAt: (r) => (r >= 30 ? 70 : 39 + r),
    masteryAt: (r) => (r >= 30 ? 10 : Math.max(1, Math.floor(r / 3))),
  },
];

export function getMageSkill(id: MageSkillId) {
  return MAGE_SKILLS.find((s) => s.id === id) ?? MAGE_SKILLS[0];
}

export function masteryFactor(masteryLevel: number) {
  return (masteryLevel / 10 + 0.1) * 0.7;
}

/** Magician ACC from MeowDB. */
export function mageAccuracy(level: number, intStat: number, luk: number) {
  return Math.floor((1.2 * intStat + 2 * level + 0.6 * luk) / 5.1 + 20);
}

/** Chance to hit from MeowDB Stats & Accuracy. */
export function hitChance(
  totalAcc: number,
  playerLevel: number,
  mobLevel: number,
  mobEva: number
) {
  const L = Math.max(0, mobLevel - playerLevel);
  const A = (totalAcc * 100) / (10 * L + 255);
  if (A <= 0) return 0;
  const D = A - mobEva;
  if (D >= 25 + L * (0.5 * playerLevel + 15)) return 1;
  const f = 0.15 + 0.2 / (1 + Math.exp(D / 12));
  const q = mobEva / A;
  if (q <= 1 - f) return 1;
  if (q >= 1 + f) return 0;
  return (1 + f - q) / (2 * f);
}

export function levelScale(mobLevel: number, playerLevel: number) {
  const gap = mobLevel - playerLevel;
  if (gap <= 0) return 1;
  if (gap <= 9) return 1 / (1 + gap * gap * 0.005);
  return 1 / (1 + gap * 0.05);
}

export function applyDefense(raw: number, effectiveDef: number) {
  return (raw * 100) / (Math.max(0, effectiveDef) + 100);
}

export function finalizeDamage(value: number) {
  return Math.trunc(Math.min(99999, Math.max(1, value)));
}

export function spellDamageRange(opts: {
  skillPowerPct: number;
  masteryLevel: number;
  totalInt: number;
  magicTotal: number;
}) {
  const S = opts.skillPowerPct / 100;
  const M = masteryFactor(opts.masteryLevel);
  const magic = opts.magicTotal;
  const min = S * magic * (1 + (opts.totalInt * M) / 125);
  const max = S * magic * (1 + opts.totalInt / 125);
  return { min, max, avg: (min + max) / 2 };
}

export function damageAfterMods(
  rawMin: number,
  rawMax: number,
  def: number,
  mobLevel: number,
  playerLevel: number,
  elementMult = 1
) {
  const scale = levelScale(mobLevel, playerLevel);
  const toFinal = (raw: number) =>
    finalizeDamage(applyDefense(raw * elementMult, def) * scale);
  const a = toFinal(rawMin);
  const b = toFinal(rawMax);
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

/** Parse MeowDB trait text for a mage element. */
export function elementRelation(traits: string, element: Element): ElementRelation {
  if (element === "none") return "neutral";
  const t = traits.toLowerCase();
  const e = element.toLowerCase();
  if (t.includes(`${e} immune`)) return "immune";
  if (t.includes(`${e} strong`) || t.includes(`${e} resistant`)) return "strong";
  if (t.includes(`${e} weak`)) return "weak";
  return "neutral";
}

/** Weak 1.25× · resistant 0.75× · immune 0× (MeowDB / wiki). */
export function elementMult(traits: string, element: Element) {
  const rel = elementRelation(traits, element);
  if (rel === "immune") return 0;
  if (rel === "strong") return 0.75;
  if (rel === "weak") return 1.25;
  return 1;
}

export function elementLabel(element: Element) {
  if (element === "none") return "Neutral";
  return element.charAt(0).toUpperCase() + element.slice(1);
}

export function relationLabel(rel: ElementRelation) {
  if (rel === "immune") return "Immune";
  if (rel === "strong") return "Resist";
  if (rel === "weak") return "Weak";
  return "Neutral";
}

/** Mage elemental affinities listed on the monster (fire/ice/lightning/poison). */
export function mageElementTags(traits: string) {
  const elements: Element[] = ["fire", "ice", "lightning", "poison"];
  return elements
    .map((el) => ({ element: el, relation: elementRelation(traits, el) }))
    .filter((t) => t.relation !== "neutral");
}

function oneHitDist(min: number, max: number) {
  const span = max - min + 1;
  const p = 1 / span;
  const dist = new Map<number, number>();
  for (let d = min; d <= max; d++) dist.set(d, p);
  return dist;
}

function convolve(a: Map<number, number>, b: Map<number, number>) {
  const out = new Map<number, number>();
  for (const [da, pa] of a) {
    for (const [db, pb] of b) {
      const key = da + db;
      out.set(key, (out.get(key) ?? 0) + pa * pb);
    }
  }
  return out;
}

export function pKHitsKill(k: number, min: number, max: number, hp: number) {
  if (k <= 0) return hp <= 0 ? 1 : 0;
  if (k * max < hp) return 0;
  if (k * min >= hp) return 1;
  let dist = oneHitDist(min, max);
  for (let i = 1; i < k; i++) dist = convolve(dist, oneHitDist(min, max));
  let p = 0;
  for (const [dmg, mass] of dist) {
    if (dmg >= hp) p += mass;
  }
  return Math.min(1, Math.max(0, p));
}

/**
 * Chance to kill within n attack attempts.
 * Each attempt hits with probability hitP; on hit deals `lines` independent damage rolls.
 */
export function killChanceWithin(
  nAttempts: number,
  hitP: number,
  min: number,
  max: number,
  hp: number,
  linesPerHit = 1
) {
  const H = Math.min(1, Math.max(0, hitP));
  const lines = Math.max(1, Math.round(linesPerHit));
  let total = 0;
  for (let hits = 0; hits <= nAttempts; hits++) {
    const miss = nAttempts - hits;
    const binom = binomial(nAttempts, hits) * Math.pow(H, hits) * Math.pow(1 - H, miss);
    total += binom * pKHitsKill(hits * lines, min, max, hp);
  }
  return Math.min(1, Math.max(0, total));
}

function binomial(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let num = 1;
  let den = 1;
  for (let i = 1; i <= k; i++) {
    num *= n - (k - i);
    den *= i;
  }
  return num / den;
}

/** MeowDB EXP to next level (Classic). */
export function expToNextLevel(level: number) {
  const lv = Math.min(99, Math.max(1, Math.floor(level)));
  if (lv <= 5) return (Math.floor((lv * lv) / 2) + 15) * lv;
  if (lv <= 50) {
    const q = Math.floor((lv * lv) / 3);
    return (q + 19) * q;
  }
  let prev = expToNextLevel(50);
  for (let i = 51; i <= lv; i++) {
    prev = i <= 89 ? Math.trunc(prev * 1.0548) : Math.trunc(prev * 2.1);
  }
  return prev;
}

export function formatPct(p: number | null, digits = 1) {
  if (p == null || !Number.isFinite(p)) return "—";
  return `${(p * 100).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })}%`;
}
