/** Combat formulas from https://meowdb.com/msclassic/formulas */

export type JobClass = "beginner" | "warrior" | "bowman" | "thief" | "magician";
export type DamageMode = "weapon" | "spell";

export type WeaponKind =
  | "1h_sword"
  | "2h_sword"
  | "1h_axe_blunt"
  | "2h_axe_blunt"
  | "spear"
  | "polearm"
  | "dagger"
  | "bow_xbow_claw"
  | "wand_staff"
  | "lucky_seven"
  | "drain"
  | "projectile";

export const JOB_OPTIONS: { id: JobClass; label: string }[] = [
  { id: "beginner", label: "Beginner" },
  { id: "warrior", label: "Warrior" },
  { id: "bowman", label: "Bowman" },
  { id: "thief", label: "Thief" },
  { id: "magician", label: "Magician" },
];

export const WEAPON_OPTIONS: { id: WeaponKind; label: string; mult: number }[] = [
  { id: "1h_sword", label: "1H Sword (×1.8)", mult: 1.8 },
  { id: "2h_sword", label: "2H Sword (×2.5)", mult: 2.5 },
  { id: "1h_axe_blunt", label: "1H Axe / Blunt avg (×1.92)", mult: 1.92 },
  { id: "2h_axe_blunt", label: "2H Axe / Blunt avg (×2.6)", mult: 2.6 },
  { id: "spear", label: "Spear avg (×2.3)", mult: 2.3 },
  { id: "polearm", label: "Polearm avg (×2.7)", mult: 2.7 },
  { id: "dagger", label: "Dagger avg (×1.4)", mult: 1.4 },
  { id: "bow_xbow_claw", label: "Bow / Xbow / Claw shoot (×2.5)", mult: 2.5 },
  { id: "wand_staff", label: "Wand / Staff physical (×1.8)", mult: 1.8 },
  { id: "lucky_seven", label: "Lucky Seven (×3.0)", mult: 3.0 },
  { id: "drain", label: "Drain (×2.5)", mult: 2.5 },
  { id: "projectile", label: "Projectile shoot (×2.5)", mult: 2.5 },
];

export function masteryFactor(masteryLevel: number, fixed?: number) {
  if (fixed != null) return fixed;
  return (masteryLevel / 10 + 0.1) * 0.7;
}

export function classAccuracy(
  job: JobClass,
  level: number,
  dex: number,
  luk: number,
  intStat: number
) {
  if (job === "magician") {
    return Math.floor((1.2 * intStat + 2 * level + 0.6 * luk) / 5.1 + 20);
  }
  const common = 1.2 * dex + 2 * level + 0.6 * luk;
  if (job === "beginner") return Math.floor(common / 2.5 + 5);
  if (job === "warrior") return Math.floor(common / 2.5 + 10);
  if (job === "bowman") return Math.floor(common / 4.8 + 20);
  return Math.floor(common / 4 + 15);
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

export function weaponDamageRange(opts: {
  skillDamagePct: number;
  masteryLevel: number;
  totalWatk: number;
  primary: number;
  secondary: number;
  weaponMult: number;
  attackPower?: number;
  luckySeven?: boolean;
}) {
  const S = opts.skillDamagePct / 100;
  const M = opts.luckySeven ? 0.5 : masteryFactor(opts.masteryLevel);
  const watk = opts.totalWatk;
  const wm = opts.weaponMult;
  const ap = opts.attackPower ?? 0;
  const statDiv = 100;
  const apDiv = 50;
  const min =
    S * watk * (0.8 + (opts.primary * M * wm + opts.secondary) / statDiv + ap / apDiv);
  const max =
    S * watk * (1.0 + (opts.primary * wm + opts.secondary) / statDiv + ap / apDiv);
  return { min, max, avg: (min + max) / 2 };
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
  elementMult = 1,
  skillBonus = 1
) {
  const scale = levelScale(mobLevel, playerLevel);
  const toFinal = (raw: number) =>
    finalizeDamage(applyDefense(raw * skillBonus * elementMult, def) * scale);
  const a = toFinal(rawMin);
  const b = toFinal(rawMax);
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

/** Discrete uniform P(damage >= hp) for one hit in [min, max]. */
export function pOneHitKill(min: number, max: number, hp: number) {
  if (hp <= 0) return 1;
  if (max < hp) return 0;
  if (min >= hp) return 1;
  return (max - hp + 1) / (max - min + 1);
}

/** Distribution of one hit: map damage -> probability mass. */
function oneHitDist(min: number, max: number) {
  const span = max - min + 1;
  const p = 1 / span;
  const dist = new Map<number, number>();
  for (let d = min; d <= max; d++) dist.set(d, p);
  return dist;
}

/** Convolve two damage distributions. */
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

/** P(sum of k i.i.d. discrete uniforms in [min,max] >= hp). */
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
