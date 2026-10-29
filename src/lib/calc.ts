import type { CostMode, PriceOverrides, Recipe, ScoredRecipe } from "./types";
import type { buildPriceIndex } from "./prices";

export const DISCIPLINES = [
  {
    name: "Smithing",
    slug: "smithing",
    icon: "⚒️",
    blurb:
      "Refines ore into ingots, then ingots into helms and armor. Heavy catalyst bills once you count input value.",
  },
  {
    name: "Weaponcrafting",
    slug: "weaponcrafting",
    icon: "⚔️",
    blurb:
      "Swords, axes, blunt, daggers, spears, polearms, claws. The heaviest ingot demand of the six disciplines.",
  },
  {
    name: "Tailoring",
    slug: "tailoring",
    icon: "🧵",
    blurb:
      "Cloth, leather, dyes, mage robes. Cheapest catalysts and mostly mob-drop mats.",
  },
  {
    name: "Woodcrafting",
    slug: "woodcrafting",
    icon: "🏹",
    blurb:
      "Wands, staves, bows, crossbows, arrows. Wood and string farmed off forest mobs, plus a few genuine moneymakers.",
  },
  {
    name: "Leatherworking",
    slug: "leatherworking",
    icon: "🧤",
    blurb:
      "Leather and hide armor for warriors and bowmen. Mat overlap with Tailoring; the biggest recipe list.",
  },
  {
    name: "Arcforge",
    slug: "arcforge",
    icon: "✨",
    blurb:
      "Gems, scrolls, magical weapons. Few recipes, expensive catalysts, big EXP per craft.",
  },
] as const;

export const CRAFT_LEVELS = [
  { level: 1, expToNext: 50, charLevel: null },
  { level: 2, expToNext: 166, charLevel: 10 },
  { level: 3, expToNext: 319, charLevel: 15 },
  { level: 4, expToNext: 521, charLevel: 20 },
  { level: 5, expToNext: 787, charLevel: 25 },
  { level: 6, expToNext: 1138, charLevel: 30 },
  { level: 7, expToNext: 1602, charLevel: 35 },
  { level: 8, expToNext: 2214, charLevel: 40 },
  { level: 9, expToNext: 3022, charLevel: 45 },
  { level: 10, expToNext: 4089, charLevel: 50 },
] as const;

export const LAUNCH_CAP = 8;

export const COST_MODES = [
  ["typical", "Typical sale"],
  ["vendor", "Typical → NPC"],
  ["ask", "Ask median"],
  ["npc", "NPC sell-back"],
] as const;

export function costModeLabel(mode: CostMode) {
  if (mode === "vendor") return "Mats at typical sale, output sold to NPC";
  if (mode === "ask") return "Using ask median";
  if (mode === "npc") return "Using NPC floor";
  return "Using typical sale";
}

export function priceKey(id: number | null | undefined, name: string) {
  return id != null ? `id:${id}` : `name:${name.trim().toLowerCase()}`;
}

export function lookupOverride(overrides: PriceOverrides | undefined, id: number | null | undefined, name: string) {
  if (!overrides) return undefined;
  const value = overrides[priceKey(id, name)];
  return Number.isFinite(value) ? value : undefined;
}

export function scoreRecipe(
  recipe: Recipe,
  quote: ReturnType<typeof buildPriceIndex>["quote"],
  mode: CostMode,
  overrides: PriceOverrides = {}
): ScoredRecipe {
  const matMode = mode === "vendor" ? "typical" : mode;
  const outMode = mode === "vendor" ? "npc" : mode;
  const ingredients = recipe.ingredients.map((ing) => {
    const priced = quote(ing.id, ing.name, matMode, { fallbackNpc: mode !== "vendor" });
    const unitOverride = lookupOverride(overrides, ing.id, ing.name);
    const unit = unitOverride ?? priced.value;
    return {
      ...ing,
      unit,
      source: unitOverride != null ? priced.source : priced.source,
      complete: unit != null,
      overridden: unitOverride != null,
    };
  });
  const output = quote(recipe.outputId, recipe.name, outMode);
  const npcQuote = outMode === "npc" ? output : quote(recipe.outputId, recipe.name, "npc");
  const typicalQuote = outMode === "typical" ? output : quote(recipe.outputId, recipe.name, "typical");
  const outOverride = lookupOverride(overrides, recipe.outputId, recipe.name);
  const outputUnit = outMode === "npc" ? output.value : outOverride ?? output.value;
  const typicalUnit = outOverride ?? typicalQuote.value;
  const matCost = ingredients.every((ing) => ing.unit != null)
    ? ingredients.reduce((sum, ing) => sum + (ing.unit as number) * ing.count, 0)
    : null;
  const outputValue = outputUnit != null ? outputUnit * recipe.resultCount : null;
  const typicalSale = typicalUnit != null ? typicalUnit * recipe.resultCount : null;
  const npcSell = npcQuote.value != null ? npcQuote.value * recipe.resultCount : null;
  const complete = outputValue != null && matCost != null;
  const net = complete ? outputValue - recipe.mesoCost - (matCost as number) : null;
  const expPerMeso =
    recipe.exp > 0 && net != null && net !== 0 ? recipe.exp / Math.abs(net) : recipe.exp > 0 && net === 0 ? Infinity : null;

  return {
    recipe,
    ingredients,
    outputValue,
    outputSource: outOverride != null && outMode !== "npc" ? "typical" : output.source,
    typicalSale,
    typicalOverridden: outOverride != null,
    npcSell,
    matCost,
    fee: recipe.mesoCost,
    net,
    expPerMeso,
    complete,
  };
}

export function formatMesos(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  const rounded = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return rounded.toLocaleString("en-US");
}

export function formatSigned(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = formatMesos(Math.abs(n));
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return "0";
}

export function formatRate(n: number | null | undefined) {
  if (n == null) return "—";
  if (!Number.isFinite(n)) return "∞";
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(3);
}

export function recipeLabel(recipe: Recipe) {
  return recipe.resultCount > 1 ? `${recipe.name} ×${recipe.resultCount}` : recipe.name;
}

export function levelInfo(level: number) {
  return CRAFT_LEVELS.find((row) => row.level === level) ?? null;
}

export function remainingExp(level: number, percent: number) {
  const info = levelInfo(level);
  if (!info) return 0;
  const pct = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0));
  const earned = Math.floor((info.expToNext * pct) / 100 + 1e-9);
  return Math.max(0, info.expToNext - earned);
}

/** EXP still needed to *become* `toLevel`, starting at `fromLevel` with `percent` of that bar filled. */
export function expToReach(fromLevel: number, percent: number, toLevel: number) {
  if (toLevel <= fromLevel) return 0;
  let total = remainingExp(fromLevel, percent);
  for (let lv = fromLevel + 1; lv < toLevel; lv++) {
    total += levelInfo(lv)?.expToNext ?? 0;
  }
  return total;
}

export const KIT_EXP_BONUS = 0.1;

export function craftExp(base: number, kit: boolean) {
  if (!kit || base <= 0) return base;
  return Math.round(base * (1 + KIT_EXP_BONUS) * 10) / 10;
}

export function craftsNeeded(exp: number, perCraft: number) {
  if (perCraft <= 0) return null;
  if (exp <= 0) return 0;
  return Math.ceil(exp / perCraft);
}

export const RATE_WINDOW_MIN = 5;

export function xpPerMinute(perCraft: number, craftsInWindow: number, windowMin = RATE_WINDOW_MIN) {
  if (perCraft <= 0 || craftsInWindow <= 0 || windowMin <= 0) return null;
  return (perCraft * craftsInWindow) / windowMin;
}

export function minutesToExp(exp: number, perMin: number | null) {
  if (perMin == null || perMin <= 0) return null;
  if (exp <= 0) return 0;
  return exp / perMin;
}

export function formatXpMin(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 100) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function formatMinutes(minutes: number | null) {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  if (minutes < 1) return "<1 min";
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rem = total % 60;
  if (hours <= 0) return `${rem} min`;
  if (rem === 0) return `${hours}h`;
  return `${hours}h ${rem}m`;
}
