import { useEffect, useMemo, useRef, useState } from "react";
import catalog from "./data/catalog.json";
import {
  CRAFT_LEVELS,
  DISCIPLINES,
  KIT_EXP_BONUS,
  RATE_WINDOW_MIN,
  craftExp,
  craftsNeeded,
  expToReach,
  formatMesos,
  formatMinutes,
  formatRate,
  formatSigned,
  formatXpMin,
  levelInfo,
  minutesToExp,
  priceKey,
  recipeLabel,
  scoreRecipe,
  xpPerMinute,
} from "./lib/calc";
import {
  buildPriceIndex,
  fetchMesoWatchList,
  itemIconUrl,
  mesoWatchItemUrl,
  parseMesoWatchFile,
  type MarketFile,
} from "./lib/prices";
import type { Catalog, PriceOverrides, Recipe, ScoredRecipe } from "./lib/types";

const DATA = catalog as Catalog;

function readHash() {
  const slug = window.location.hash.replace(/^#\/?/, "");
  return DISCIPLINES.some((d) => d.slug === slug) ? slug : "";
}

function ItemLink({
  id,
  name,
  count,
}: {
  id: number | null;
  name: string;
  count?: number;
}) {
  const label = count != null ? `${count}× ${name}` : name;
  if (id == null) return <span className="item">{label}</span>;
  return (
    <a className="item" href={mesoWatchItemUrl(id)} target="_blank" rel="noreferrer">
      <img src={itemIconUrl(id)} alt="" onError={(e) => ((e.currentTarget.style.display = "none"))} />
      <span>{label}</span>
    </a>
  );
}

function PriceInput({
  value,
  custom,
  onChange,
  ariaLabel,
}: {
  value: number | null;
  custom?: boolean;
  onChange: (value: number | null) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => (value == null ? "" : String(value)));
  useEffect(() => {
    if (ref.current === document.activeElement) return;
    setText(value == null ? "" : String(value));
  }, [value]);

  return (
    <input
      ref={ref}
      className={`price-edit ${custom ? "custom" : ""}`}
      type="number"
      min={0}
      step={1}
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder="—"
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          setText("");
          onChange(null);
          return;
        }
        if (!/^\d{0,9}(\.\d{0,2})?$/.test(raw)) return;
        setText(raw);
        if (raw.endsWith(".")) return;
        const next = Number(raw);
        if (Number.isFinite(next)) onChange(next);
      }}
      onBlur={() => {
        if (text === "") {
          onChange(null);
          setText(value == null ? "" : String(value));
          return;
        }
        const next = Number(text);
        if (!Number.isFinite(next)) {
          setText(value == null ? "" : String(value));
          return;
        }
        onChange(next);
        setText(String(next));
      }}
    />
  );
}

function RecipeRow({ scored, rank }: { scored: ScoredRecipe; rank?: number }) {
  const { recipe } = scored;
  return (
    <tr>
      {rank != null && <td className="num">{rank}</td>}
      <td>
        <ItemLink id={recipe.outputId} name={recipeLabel(recipe)} />
        <div className="muted">
          {recipe.discipline} · {recipe.outputType} · Lv. {recipe.level}
        </div>
      </td>
      <td className="num">{recipe.exp}</td>
      <td className={`num ${scored.net != null && scored.net > 0 ? "profit" : scored.net != null && scored.net < 0 ? "loss" : ""}`}>
        {formatSigned(scored.net)}
      </td>
      <td className="num">{formatRate(scored.expPerMeso)}</td>
      <td>
        <div className="ing-list">
          {scored.ingredients.map((ing) => (
            <ItemLink key={`${ing.name}-${ing.count}`} id={ing.id} name={ing.name} count={ing.count} />
          ))}
        </div>
      </td>
    </tr>
  );
}

const PLANNER_KEY = "mscw-planner";
const OVERRIDES_KEY = "mscw-price-overrides";
const PINS_KEY = "mscw-pinned";

function loadOverrides(): PriceOverrides {
  try {
    const raw = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || "");
    if (!raw || typeof raw !== "object") return {};
    const next: PriceOverrides = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) next[key] = value;
    }
    return next;
  } catch {
    return {};
  }
}

type SortDir = "asc" | "desc";
type PlannerSortKey = "name" | "exp" | "crafts" | "cost" | "typical" | "npc" | "netNpc" | "netTypical" | "xppm";
type DetailSortKey = "name" | "exp" | "fee" | "mats" | "output" | "net" | "rate";

const PLANNER_SORT_DIR: Record<PlannerSortKey, SortDir> = {
  name: "asc",
  exp: "desc",
  crafts: "asc",
  cost: "asc",
  typical: "desc",
  npc: "desc",
  netNpc: "desc",
  netTypical: "desc",
  xppm: "desc",
};

const DETAIL_SORT_DIR: Record<DetailSortKey, SortDir> = {
  name: "asc",
  exp: "desc",
  fee: "asc",
  mats: "asc",
  output: "desc",
  net: "desc",
  rate: "desc",
};

function loadPins(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PINS_KEY) || "");
    if (!Array.isArray(raw)) return [];
    return raw.filter((id): id is number => typeof id === "number" && Number.isFinite(id));
  } catch {
    return [];
  }
}

function cmpNum(a: number | null | undefined, b: number | null | undefined, dir: SortDir) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "asc" ? a - b : b - a;
}

function cmpPinned(aId: number, bId: number, pins: number[]) {
  const ai = pins.indexOf(aId);
  const bi = pins.indexOf(bId);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  return 0;
}

function PinButton({
  pinned,
  label,
  onToggle,
}: {
  pinned: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`pin-btn ${pinned ? "pinned" : ""}`}
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${label}` : `Pin ${label} to top`}
      title={pinned ? "Unpin" : "Pin to top"}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
        <path
          fill="currentColor"
          d="M16 9V4h1V2H7v2h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"
        />
      </svg>
    </button>
  );
}

function SortTh({
  label,
  column,
  sortKey,
  dir,
  onSort,
  className,
}: {
  label: string;
  column: string;
  sortKey: string;
  dir: SortDir;
  onSort: (column: string) => void;
  className?: string;
}) {
  const active = sortKey === column;
  return (
    <th
      className={className}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" className={`sort-btn ${active ? "active" : ""}`} onClick={() => onSort(column)}>
        {label}
        <span className="sort-ind" aria-hidden>
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

type PlannerState = {
  discipline: string;
  level: number;
  percent: number;
  target: number;
  includeLower: boolean;
  kitBuff: boolean;
  crafts5min: number;
  sortKey: PlannerSortKey;
  sortDir: SortDir;
};

function loadPlanner(): PlannerState {
  try {
    const raw = JSON.parse(localStorage.getItem(PLANNER_KEY) || "");
    const sortKey: PlannerSortKey =
      raw.sortKey === "name" || raw.sortKey === "exp" || raw.sortKey === "crafts" || raw.sortKey === "cost" || raw.sortKey === "typical" || raw.sortKey === "npc" || raw.sortKey === "netNpc" || raw.sortKey === "netTypical" || raw.sortKey === "xppm"
        ? raw.sortKey
        : "crafts";
    const crafts5min = Number(raw.crafts5min);
    return {
      discipline: typeof raw.discipline === "string" ? raw.discipline : "Smithing",
      level: Number(raw.level) || 1,
      percent: Number(raw.percent) || 0,
      target: Number(raw.target) || 2,
      includeLower: Boolean(raw.includeLower),
      kitBuff: Boolean(raw.kitBuff),
      crafts5min: Number.isFinite(crafts5min) && crafts5min > 0 ? Math.min(9999, Math.round(crafts5min)) : 0,
      sortKey,
      sortDir: raw.sortDir === "desc" || raw.sortDir === "asc" ? raw.sortDir : PLANNER_SORT_DIR[sortKey],
    };
  } catch {
    return {
      discipline: "Smithing",
      level: 1,
      percent: 0,
      target: 2,
      includeLower: false,
      kitBuff: false,
      crafts5min: 0,
      sortKey: "crafts",
      sortDir: "asc",
    };
  }
}

function LevelPlanner({
  priced,
  forcedDiscipline,
  onPrice,
  pins,
  onTogglePin,
}: {
  priced: ScoredRecipe[];
  forcedDiscipline?: string;
  onPrice: (id: number | null, name: string, value: number | null) => void;
  pins: number[];
  onTogglePin: (id: number) => void;
}) {
  const cap = 10;
  const [state, setState] = useState(loadPlanner);
  const [percentText, setPercentText] = useState(() => String(Math.round(state.percent * 100) / 100));
  const [crafts5Text, setCrafts5Text] = useState(() => (state.crafts5min ? String(state.crafts5min) : ""));
  const discipline = forcedDiscipline ?? state.discipline;
  const level = Math.min(Math.max(1, state.level), cap);
  const target = level >= cap ? level : Math.min(Math.max(state.target, level + 1), cap);

  useEffect(() => {
    localStorage.setItem(PLANNER_KEY, JSON.stringify({ ...state, discipline, level, target }));
  }, [state, discipline, level, target]);

  const patch = (next: Partial<PlannerState>) => setState((prev) => ({ ...prev, ...next }));

  const need = expToReach(level, state.percent, target);
  const atCap = level >= cap;
  const gate = levelInfo(target)?.charLevel;
  const unlocked = priced.filter(
    (row) => row.recipe.discipline === discipline && row.recipe.exp > 0 && row.recipe.level <= level
  );
  const atCurrent = unlocked.filter((row) => row.recipe.level === level);
  const pool = state.includeLower || atCurrent.length === 0 ? unlocked : atCurrent;
  const planned = pool.map((row) => {
    const perCraft = craftExp(row.recipe.exp, state.kitBuff);
    const crafts = craftsNeeded(need, perCraft);
    const costPerCraft = row.matCost != null ? row.matCost + row.fee : null;
    const npcNetPer = row.npcSell != null && costPerCraft != null ? row.npcSell - costPerCraft : null;
    const typicalNetPer = row.typicalSale != null && costPerCraft != null ? row.typicalSale - costPerCraft : null;
    const npcNetTotal = crafts != null && npcNetPer != null ? crafts * npcNetPer : null;
    const typicalNetTotal = crafts != null && typicalNetPer != null ? crafts * typicalNetPer : null;
    const xppm = xpPerMinute(perCraft, state.crafts5min);
    const etaMin = minutesToExp(need, xppm);
    return {
      row,
      crafts,
      perCraft,
      costPerCraft,
      typicalSale: row.typicalSale,
      npcSell: row.npcSell,
      npcNetTotal,
      typicalNetTotal,
      xppm,
      etaMin,
    };
  });
  const best = [...planned].sort((a, b) => {
    const byCrafts = cmpNum(a.crafts, b.crafts, "asc");
    return byCrafts || cmpNum(a.npcNetTotal, b.npcNetTotal, "desc");
  })[0];
  const rows = [...planned].sort((a, b) => {
    const pinned = cmpPinned(a.row.recipe.id, b.row.recipe.id, pins);
    if (pinned) return pinned;
    const key = state.sortKey;
    if (key === "name") {
      const byName = a.row.recipe.name.localeCompare(b.row.recipe.name);
      return state.sortDir === "asc" ? byName : -byName;
    }
    if (key === "exp") return cmpNum(a.perCraft, b.perCraft, state.sortDir);
    if (key === "cost") return cmpNum(a.costPerCraft, b.costPerCraft, state.sortDir);
    if (key === "typical") return cmpNum(a.typicalSale, b.typicalSale, state.sortDir);
    if (key === "npc") return cmpNum(a.npcSell, b.npcSell, state.sortDir);
    if (key === "netTypical") return cmpNum(a.typicalNetTotal, b.typicalNetTotal, state.sortDir);
    if (key === "netNpc") return cmpNum(a.npcNetTotal, b.npcNetTotal, state.sortDir);
    if (key === "xppm") return cmpNum(a.xppm, b.xppm, state.sortDir);
    return cmpNum(a.crafts, b.crafts, state.sortDir) || cmpNum(a.npcNetTotal, b.npcNetTotal, "desc");
  });
  const cyclePlannerSort = (column: string) => {
    const key = column as PlannerSortKey;
    patch({
      sortKey: key,
      sortDir: state.sortKey === key ? (state.sortDir === "asc" ? "desc" : "asc") : PLANNER_SORT_DIR[key],
    });
  };

  return (
    <section className="table-card planner">
      <h2>Level-up planner</h2>
      <p className="muted">
        Enter your craft level and bar percent. Counts assume you keep making one unlocked recipe; leftover EXP carries to the next level. EXP parks at 100% until your character level is high enough. XP/min uses how many crafts you finished in the last {RATE_WINDOW_MIN} minutes.
      </p>
      <div className="planner-form">
        {!forcedDiscipline && (
          <label>
            Skill
            <select value={discipline} onChange={(e) => patch({ discipline: e.target.value })}>
              {DISCIPLINES.map((d) => (
                <option key={d.slug} value={d.name}>
                  {d.icon} {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Craft Lv
          <select
            value={level}
            onChange={(e) => {
              const next = Number(e.target.value);
              patch({ level: next, target: Math.max(next + (next < cap ? 1 : 0), state.target) });
            }}
          >
            {CRAFT_LEVELS.filter((row) => row.level <= cap).map((row) => (
              <option key={row.level} value={row.level}>
                {row.level}
              </option>
            ))}
          </select>
        </label>
        <label>
          Current %
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            inputMode="decimal"
            value={percentText}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                setPercentText("");
                patch({ percent: 0 });
                return;
              }
              if (!/^(100(\.0{0,2})?|[0-9]{1,2}(\.[0-9]{0,2})?)$/.test(raw)) return;
              setPercentText(raw);
              const next = Number(raw);
              if (Number.isFinite(next)) patch({ percent: Math.min(100, Math.max(0, next)) });
            }}
            onBlur={() => {
              const rounded = Math.round(Math.min(100, Math.max(0, Number(percentText) || 0)) * 100) / 100;
              patch({ percent: rounded });
              setPercentText(String(rounded));
            }}
          />
        </label>
        <label>
          Target Lv
          <select value={target} onChange={(e) => patch({ target: Number(e.target.value) })}>
            {CRAFT_LEVELS.filter((row) => row.level > level && row.level <= cap).map((row) => (
              <option key={row.level} value={row.level}>
                {row.level}
                {row.charLevel ? ` · char ${row.charLevel}+` : ""}
              </option>
            ))}
            {level >= cap && (
              <option value={level}>Max</option>
            )}
          </select>
        </label>
        <label className="planner-check">
          <input
            type="checkbox"
            checked={state.includeLower}
            onChange={(e) => patch({ includeLower: e.target.checked })}
          />
          Include lower-level recipes
        </label>
        <label
          className="planner-check"
          title="Smithing Kit, Tailoring Kit, and the other discipline kits. Client text: +10% crafting EXP for 15 minutes."
        >
          <input
            type="checkbox"
            checked={state.kitBuff}
            onChange={(e) => patch({ kitBuff: e.target.checked })}
          />
          Kit buff (+{Math.round(KIT_EXP_BONUS * 100)}% EXP)
        </label>
        <label title="How many crafts you finished in the last 5 minutes. XP/min uses that pace for each recipe.">
          Crafts / {RATE_WINDOW_MIN} min
          <input
            type="number"
            min={0}
            max={9999}
            step={1}
            inputMode="numeric"
            placeholder="0"
            value={crafts5Text}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                setCrafts5Text("");
                patch({ crafts5min: 0 });
                return;
              }
              if (!/^\d{0,4}$/.test(raw)) return;
              setCrafts5Text(raw);
              patch({ crafts5min: Number(raw) });
            }}
            onBlur={() => {
              const next = Math.min(9999, Math.max(0, Math.round(Number(crafts5Text) || 0)));
              patch({ crafts5min: next });
              setCrafts5Text(next ? String(next) : "");
            }}
          />
        </label>
      </div>

      {atCap ? (
        <p className="muted">You are at craft Lv {cap}.</p>
      ) : (
        <>
          <div className="stats">
            <span className="badge">
              {need.toLocaleString()} EXP remaining
            </span>
            {need === 0 && !atCap && (
              <span className="badge profit">Bar is full — rank up</span>
            )}
            {state.kitBuff && (
              <span className="badge">Kit +{Math.round(KIT_EXP_BONUS * 100)}% EXP</span>
            )}
            {best?.crafts != null && best.crafts > 0 && (
              <span className="badge profit">
                {best.crafts.toLocaleString()}× {recipeLabel(best.row.recipe)}
              </span>
            )}
            {gate != null && (
              <span className="badge">Needs char Lv {gate}+ to reach Lv {target}</span>
            )}
            {!state.includeLower && atCurrent.length === 0 && unlocked.length > 0 && (
              <span className="badge">No Lv {level} recipes — showing lower ranks</span>
            )}
            {state.crafts5min > 0 && best?.xppm != null && (
              <span className="badge profit">
                {formatXpMin(best.xppm)} XP/min
                {best.etaMin != null ? ` · ${formatMinutes(best.etaMin)} to Lv ${target}` : ""}
              </span>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <SortTh label="Recipe" column="name" sortKey={state.sortKey} dir={state.sortDir} onSort={cyclePlannerSort} />
                  <SortTh className="num" label="EXP" column="exp" sortKey={state.sortKey} dir={state.sortDir} onSort={cyclePlannerSort} />
                  <SortTh className="num" label="Crafts" column="crafts" sortKey={state.sortKey} dir={state.sortDir} onSort={cyclePlannerSort} />
                  <SortTh className="num" label="XP/min" column="xppm" sortKey={state.sortKey} dir={state.sortDir} onSort={cyclePlannerSort} />
                  <SortTh className="num" label="Cost / craft" column="cost" sortKey={state.sortKey} dir={state.sortDir} onSort={cyclePlannerSort} />
                  <SortTh className="num" label="Typical sale" column="typical" sortKey={state.sortKey} dir={state.sortDir} onSort={cyclePlannerSort} />
                  <SortTh className="num" label="NPC sell" column="npc" sortKey={state.sortKey} dir={state.sortDir} onSort={cyclePlannerSort} />
                  <SortTh className="num" label="Net · NPC" column="netNpc" sortKey={state.sortKey} dir={state.sortDir} onSort={cyclePlannerSort} />
                  <SortTh className="num" label="Net · typical" column="netTypical" sortKey={state.sortKey} dir={state.sortDir} onSort={cyclePlannerSort} />
                  <th>Mats × crafts</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="muted">
                      No EXP-giving recipes unlocked at this level.
                    </td>
                  </tr>
                )}
                {rows.map(({ row, crafts, perCraft, costPerCraft, typicalSale, npcSell, npcNetTotal, typicalNetTotal, xppm, etaMin }) => {
                  const pinned = pins.includes(row.recipe.id);
                  return (
                  <tr
                    key={row.recipe.id}
                    className={[
                      best && row.recipe.id === best.row.recipe.id ? "best-row" : "",
                      pinned ? "pinned-row" : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined}
                  >
                    <td>
                      <div className="recipe-cell">
                        <PinButton
                          pinned={pinned}
                          label={row.recipe.name}
                          onToggle={() => onTogglePin(row.recipe.id)}
                        />
                        <div>
                          <ItemLink id={row.recipe.outputId} name={recipeLabel(row.recipe)} />
                          <div className="muted">Lv. {row.recipe.level} · {row.recipe.outputType}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num">
                      {perCraft}
                      {state.kitBuff && perCraft !== row.recipe.exp && (
                        <div className="muted">{row.recipe.exp} base</div>
                      )}
                    </td>
                    <td className="num">{crafts ?? "—"}</td>
                    <td className="num">
                      {formatXpMin(xppm)}
                      {etaMin != null && (
                        <div className="muted">{formatMinutes(etaMin)}</div>
                      )}
                    </td>
                    <td className="num">{formatMesos(costPerCraft)}</td>
                    <td className="num price-cell">
                      <PriceInput
                        value={typicalSale}
                        custom={row.typicalOverridden}
                        ariaLabel={`${row.recipe.name} typical sale`}
                        onChange={(next) =>
                          onPrice(
                            row.recipe.outputId,
                            row.recipe.name,
                            next == null ? null : next / Math.max(1, row.recipe.resultCount)
                          )
                        }
                      />
                    </td>
                    <td className="num">{formatMesos(npcSell)}</td>
                    <td className={`num ${npcNetTotal != null && npcNetTotal > 0 ? "profit" : npcNetTotal != null && npcNetTotal < 0 ? "loss" : ""}`}>
                      {formatSigned(npcNetTotal)}
                    </td>
                    <td className={`num ${typicalNetTotal != null && typicalNetTotal > 0 ? "profit" : typicalNetTotal != null && typicalNetTotal < 0 ? "loss" : ""}`}>
                      {formatSigned(typicalNetTotal)}
                    </td>
                    <td className="mats-cell">
                      <div className="planner-mats">
                        {row.ingredients.map((ing) => {
                          const qty = crafts != null ? ing.count * crafts : ing.count;
                          const line = ing.unit != null ? ing.unit * qty : null;
                          return (
                            <div key={`${ing.name}-${ing.count}`} className="mat-row">
                              <ItemLink id={ing.id} name={ing.name} count={qty} />
                              <PriceInput
                                value={ing.unit}
                                custom={ing.overridden}
                                ariaLabel={`${ing.name} price`}
                                onChange={(next) => onPrice(ing.id, ing.name, next)}
                              />
                              <span className="ing-line">
                                ea{line != null ? ` · ${formatMesos(line)}` : ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function DetailRow({
  scored,
  onPrice,
  pinned,
  onTogglePin,
}: {
  scored: ScoredRecipe;
  onPrice: (id: number | null, name: string, value: number | null) => void;
  pinned: boolean;
  onTogglePin: (id: number) => void;
}) {
  const { recipe } = scored;
  return (
    <tr className={pinned ? "pinned-row" : undefined}>
      <td>
        <div className="recipe-cell">
          <PinButton pinned={pinned} label={recipe.name} onToggle={() => onTogglePin(recipe.id)} />
          <ItemLink id={recipe.outputId} name={recipeLabel(recipe)} />
        </div>
      </td>
      <td>
        <div className="ing-list">
          {scored.ingredients.map((ing) => (
            <span key={`${ing.name}-${ing.count}`} className="ing">
              <ItemLink id={ing.id} name={ing.name} count={ing.count} />
              <span className="ing-price">
                <PriceInput
                  value={ing.unit}
                  custom={ing.overridden}
                  ariaLabel={`${ing.name} price`}
                  onChange={(next) => onPrice(ing.id, ing.name, next)}
                />
                <span>ea</span>
              </span>
            </span>
          ))}
        </div>
      </td>
      <td className="num">{recipe.exp}</td>
      <td className="num">{formatMesos(recipe.mesoCost)}</td>
      <td className="num">{formatMesos(scored.matCost)}</td>
      <td className="num">{formatMesos(scored.outputValue)}</td>
      <td className={`num ${scored.net != null && scored.net > 0 ? "profit" : scored.net != null && scored.net < 0 ? "loss" : ""}`}>
        {formatSigned(scored.net)}
      </td>
      <td className="num">{formatRate(scored.expPerMeso)}</td>
    </tr>
  );
}

export function App() {
  const [view, setView] = useState(readHash);
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState<MarketFile | null>(null);
  const [status, setStatus] = useState("Loading MesoWatch prices…");
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<PriceOverrides>(loadOverrides);
  const [pins, setPins] = useState<number[]>(loadPins);

  useEffect(() => {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  }, [overrides]);

  useEffect(() => {
    localStorage.setItem(PINS_KEY, JSON.stringify(pins));
  }, [pins]);

  const onTogglePin = (id: number) => {
    setPins((prev) => (prev.includes(id) ? prev.filter((pin) => pin !== id) : [...prev, id]));
  };

  const onPrice = (id: number | null, name: string, value: number | null) => {
    const key = priceKey(id, name);
    setOverrides((prev) => {
      if (value == null) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (prev[key] === value) return prev;
      return { ...prev, [key]: value };
    });
  };
  const [detailSort, setDetailSort] = useState<{ key: DetailSortKey; dir: SortDir }>({
    key: "rate",
    dir: "desc",
  });
  const cycleDetailSort = (column: string) => {
    const key = column as DetailSortKey;
    setDetailSort((prev) => ({
      key,
      dir: prev.key === key ? (prev.dir === "asc" ? "desc" : "asc") : DETAIL_SORT_DIR[key],
    }));
  };

  const applyMarket = (file: MarketFile, source: "live" | "snapshot" | "file", label?: string) => {
    setMarket(file);
    setError(null);
    const when = file.generated_at ?? label ?? "unknown time";
    const marketName = file.market ?? "Classic World";
    if (source === "file") {
      setStatus(`Imported MesoWatch file · ${when}`);
      return;
    }
    if (source === "snapshot") {
      setStatus(`MesoWatch ${marketName} snapshot · ${when}`);
      return;
    }
    setStatus(`MesoWatch ${marketName} · ${when}`);
  };

  const importLatest = () => {
    setStatus("Importing latest MesoWatch prices…");
    fetchMesoWatchList()
      .then(({ file, source }) => applyMarket(file, source))
      .catch((err: Error) => {
        setError(err.message);
        setStatus("Could not reach MesoWatch. Import list.json or run npm run prices.");
      });
  };

  useEffect(() => {
    const onHash = () => setView(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMesoWatchList()
      .then(({ file, source }) => {
        if (cancelled) return;
        applyMarket(file, source);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setStatus("Could not reach MesoWatch. Import list.json or run npm run prices.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const prices = useMemo(() => buildPriceIndex(market, DATA.items), [market]);

  const priced = useMemo(
    () =>
      DATA.recipes
        .map((recipe) => scoreRecipe(recipe as Recipe, prices.quote, "vendor", overrides)),
    [prices, overrides]
  );

  const scored = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return priced;
    return priced.filter((row) => {
      const recipe = row.recipe;
      return (
        recipe.name.toLowerCase().includes(q) ||
        recipe.discipline.toLowerCase().includes(q) ||
        recipe.ingredients.some((ing) => ing.name.toLowerCase().includes(q))
      );
    });
  }, [priced, query]);

  const complete = scored.filter((row) => row.complete && row.net != null);
  const profitable = [...complete].filter((row) => (row.net as number) > 0).sort((a, b) => (b.net as number) - (a.net as number));
  const sinks = [...complete]
    .filter((row) => (row.net as number) < 0 && row.recipe.exp > 0)
    .sort((a, b) => (b.expPerMeso as number) - (a.expPerMeso as number));

  const openDiscipline = (slug: string) => {
    setQuery("");
    window.location.hash = `/${slug}`;
    setView(slug);
  };

  const onImport = async (file: File) => {
    try {
      const parsed = parseMesoWatchFile(JSON.parse(await file.text()));
      applyMarket(parsed, "file", file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
    }
  };

  const current = DISCIPLINES.find((d) => d.slug === view);
  const disciplineRows = current ? scored.filter((row) => row.recipe.discipline === current.name) : [];

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="kicker">MapleStory Classic World</p>
          <h1>Crafting Efficiency</h1>
          <p className="lede">
            Which recipes bleed the least mesos per EXP. Materials start at the{" "}
            <a href="https://meso.watch/" target="_blank" rel="noreferrer">MesoWatch</a> typical sale; you can override
            any price. The planner shows both NPC sell-back and typical-sale net.
          </p>
        </div>
        <aside className="price-box">
          <strong>Prices from MesoWatch</strong>
          <p className={error ? "status err" : "status ok"}>{status}</p>
          {error && <p className="status err">{error}</p>}
          <div className="toolbar" style={{ margin: "10px 0 0" }}>
            <button className="btn" onClick={importLatest}>
              Import latest
            </button>
            <label className="btn">
              Import JSON
              <input
                className="hidden-input"
                type="file"
                accept="application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onImport(file);
                }}
              />
            </label>
          </div>
        </aside>
      </header>

      <div className="disclaimer">
        Mat cost uses MesoWatch typical sale (ask if no sale), plus the craft fee. Override any price in the tables.{" "}
        <strong>Net · NPC</strong> is NPC sell-back − cost. <strong>Net · typical</strong> is typical sale − cost.
      </div>

      <div className="toolbar">
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recipes or materials"
        />
      </div>

      <div className="stats">
        <span className="badge">{scored.length} recipes</span>
        <span className="badge profit">{profitable.length} profit-positive</span>
        <span className="badge">{complete.length} fully priced</span>
      </div>

      {!current && (
        <LevelPlanner priced={priced} onPrice={onPrice} pins={pins} onTogglePin={onTogglePin} />
      )}

      {!current && (
        <>
          <section className="grid">
            {DISCIPLINES.map((d) => {
              const rows = scored.filter((row) => row.recipe.discipline === d.name);
              const wins = rows.filter((row) => row.complete && (row.net as number) > 0).length;
              return (
                <button key={d.slug} className="card" onClick={() => openDiscipline(d.slug)}>
                  <h3>
                    {d.icon} {d.name}
                  </h3>
                  <p>{d.blurb}</p>
                  <div className="card-meta">
                    <span>{rows.length} recipes</span>
                    <span className={wins ? "profit" : ""}>{wins} profit</span>
                  </div>
                </button>
              );
            })}
          </section>

          <div className="tops">
            <section className="table-card">
              <h2>Top 5 · profitable to grind</h2>
              <p className="muted">
                Net after paying typical mat prices and the craft fee, then vendoring the output to an NPC.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Recipe</th>
                      <th className="num">EXP</th>
                      <th className="num">Profit</th>
                      <th className="num">EXP / meso</th>
                      <th>Mats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitable.slice(0, 5).map((row, i) => (
                      <RecipeRow key={row.recipe.id} scored={row} rank={i + 1} />
                    ))}
                    {profitable.length === 0 && (
                      <tr>
                        <td colSpan={6} className="muted">
                          No fully priced profit crafts yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="table-card">
              <h2>Top 5 · best EXP / meso</h2>
              <p className="muted">
                Smallest typical-to-NPC loss per EXP. Most crafts lose mesos if you vendor the output.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Recipe</th>
                      <th className="num">EXP</th>
                      <th className="num">Loss</th>
                      <th className="num">EXP / meso</th>
                      <th>Mats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sinks.slice(0, 5).map((row, i) => (
                      <RecipeRow key={row.recipe.id} scored={row} rank={i + 1} />
                    ))}
                    {sinks.length === 0 && (
                      <tr>
                        <td colSpan={6} className="muted">
                          Waiting on market prices.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}

      {current && (
        <>
          <div className="crumbs">
            <button className="btn ghost" onClick={() => { window.location.hash = ""; setView(""); }}>
              ← All disciplines
            </button>
          </div>
          <h2>
            {current.icon} {current.name} efficiency
          </h2>
          <p className="lede">{current.blurb}</p>
          <div className="stats">
            <span className="badge">{disciplineRows.length} recipes</span>
            <span className="badge profit">
              {disciplineRows.filter((row) => row.complete && (row.net as number) > 0).length} profitable
            </span>
          </div>

          <LevelPlanner priced={priced} forcedDiscipline={current.name} onPrice={onPrice} pins={pins} onTogglePin={onTogglePin} />

          {CRAFT_LEVELS.map((level) => {
            const rows = disciplineRows
              .filter((row) => row.recipe.level === level.level)
              .sort((a, b) => {
                const pinned = cmpPinned(a.recipe.id, b.recipe.id, pins);
                if (pinned) return pinned;
                const key = detailSort.key;
                if (key === "name") {
                  const byName = a.recipe.name.localeCompare(b.recipe.name);
                  return detailSort.dir === "asc" ? byName : -byName;
                }
                if (key === "exp") return cmpNum(a.recipe.exp, b.recipe.exp, detailSort.dir);
                if (key === "fee") return cmpNum(a.fee, b.fee, detailSort.dir);
                if (key === "mats") return cmpNum(a.matCost, b.matCost, detailSort.dir);
                if (key === "output") return cmpNum(a.outputValue, b.outputValue, detailSort.dir);
                if (key === "net") return cmpNum(a.net, b.net, detailSort.dir);
                return cmpNum(a.expPerMeso, b.expPerMeso, detailSort.dir);
              });
            if (!rows.length) return null;
            return (
              <section key={level.level} className="level-block table-card">
                <h3>Lv. {level.level}</h3>
                <p className="muted">
                  {level.expToNext.toLocaleString()} EXP to next · {level.charLevel ? `char Lv. ${level.charLevel}+` : "unlocked by the starter quest"}
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <SortTh label="Recipe" column="name" sortKey={detailSort.key} dir={detailSort.dir} onSort={cycleDetailSort} />
                        <th>Ingredients</th>
                        <SortTh className="num" label="EXP" column="exp" sortKey={detailSort.key} dir={detailSort.dir} onSort={cycleDetailSort} />
                        <SortTh className="num" label="Fee" column="fee" sortKey={detailSort.key} dir={detailSort.dir} onSort={cycleDetailSort} />
                        <SortTh className="num" label="Mats (typical)" column="mats" sortKey={detailSort.key} dir={detailSort.dir} onSort={cycleDetailSort} />
                        <SortTh className="num" label="NPC sell" column="output" sortKey={detailSort.key} dir={detailSort.dir} onSort={cycleDetailSort} />
                        <SortTh className="num" label="Net" column="net" sortKey={detailSort.key} dir={detailSort.dir} onSort={cycleDetailSort} />
                        <SortTh className="num" label="EXP / meso" column="rate" sortKey={detailSort.key} dir={detailSort.dir} onSort={cycleDetailSort} />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <DetailRow
                          key={row.recipe.id}
                          scored={row}
                          onPrice={onPrice}
                          pinned={pins.includes(row.recipe.id)}
                          onTogglePin={onTogglePin}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </>
      )}

      <footer className="footer">
        Recipe data from the Public Release client dump via OSMS Data Explorer. Market prices belong to{" "}
        <a href="https://meso.watch/" target="_blank" rel="noreferrer">
          MesoWatch
        </a>{" "}
        and are loaded live for this calculator; they are not copied into the project. Item names and artwork belong to Nexon.
        Inspired by the MeowDB crafting efficiency layout, with market pricing instead of NPC-only math.
      </footer>
    </div>
  );
}
