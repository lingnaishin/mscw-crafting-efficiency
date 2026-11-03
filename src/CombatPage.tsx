import { useEffect, useMemo, useState, type ReactNode } from "react";
import monsterData from "./data/monsters.json";
import {
  MAGE_SKILLS,
  damageAfterMods,
  elementLabel,
  elementMult,
  elementRelation,
  expToNextLevel,
  formatPct,
  getMageSkill,
  hitChance,
  killChanceWithin,
  mageAccuracy,
  mageElementTags,
  relationLabel,
  spellDamageRange,
  type Element,
  type MageSkillId,
} from "./lib/combat";
import { formatMesos } from "./lib/calc";

const COMBAT_KEY = "mscw-combat-mage";
const MONSTERS = monsterData.monsters;

type Priority = "oneshot" | "hit" | "exp";

type CombatState = {
  priority: Priority;
  level: number;
  int: number;
  luk: number;
  magicTotal: number;
  /** Blank / 0 = use class ACC from INT/LUK/level. */
  totalAcc: number;
  skillId: MageSkillId;
  skillRank: number;
  monsterId: number;
  query: string;
  elementFilter: Element | "any";
  levelBand: "any" | "1-20" | "21-40" | "41-60" | "61+";
};

const DEFAULTS: CombatState = {
  priority: "oneshot",
  level: 50,
  int: 250,
  luk: 40,
  magicTotal: 200,
  totalAcc: 0,
  skillId: "cold",
  skillRank: 30,
  monsterId: 30,
  query: "",
  elementFilter: "any",
  levelBand: "any",
};

function loadState(): CombatState {
  try {
    const raw = localStorage.getItem(COMBAT_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function Num({
  value,
  onChange,
  min = 0,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (!Number.isFinite(n)) return;
        let next = n;
        if (min != null) next = Math.max(min, next);
        if (max != null) next = Math.min(max, next);
        onChange(next);
      }}
    />
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      {label}
      {children}
    </label>
  );
}

function inBand(level: number, band: CombatState["levelBand"]) {
  if (band === "any") return true;
  if (band === "1-20") return level <= 20;
  if (band === "21-40") return level >= 21 && level <= 40;
  if (band === "41-60") return level >= 41 && level <= 60;
  return level >= 61;
}

export function CombatPage() {
  const [state, setState] = useState<CombatState>(loadState);

  useEffect(() => {
    localStorage.setItem(COMBAT_KEY, JSON.stringify(state));
  }, [state]);

  const patch = (partial: Partial<CombatState>) => setState((s) => ({ ...s, ...partial }));

  const skill = getMageSkill(state.skillId);
  const skillRank = Math.min(skill.max, Math.max(1, Math.round(state.skillRank)));
  const skillPower = skill.powerAt(skillRank);
  const mastery = skill.masteryAt(skillRank);

  const baseAcc = mageAccuracy(state.level, state.int, state.luk);
  const totalAcc = state.totalAcc > 0 ? Math.round(state.totalAcc) : baseAcc;

  const filtered = useMemo(() => {
    const q = state.query.trim().toLowerCase();
    return MONSTERS.filter((m) => {
      if (!inBand(m.level, state.levelBand)) return false;
      if (state.elementFilter !== "any") {
        const rel = elementRelation(m.traits, state.elementFilter);
        if (rel !== "weak" && rel !== "strong" && rel !== "immune") return false;
        // Prefer showing anything with a non-neutral relation for that element
      }
      if (q && !m.name.toLowerCase().includes(q) && !m.traits.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [state.query, state.elementFilter, state.levelBand]);

  const ranked = useMemo(() => {
    const skillEl = skill.element;
    return [...filtered]
      .map((m) => {
        const hit = hitChance(totalAcc, state.level, m.level, m.avoid);
        const mult = elementMult(m.traits, skillEl);
        const raw = spellDamageRange({
          skillPowerPct: skillPower,
          masteryLevel: mastery,
          totalInt: state.int,
          magicTotal: state.magicTotal,
        });
        const ranged = damageAfterMods(raw.min, raw.max, m.mdef, m.level, state.level, mult);
        const p1 = killChanceWithin(1, hit, ranged.min, ranged.max, m.hp, skill.hits);
        const p2 = killChanceWithin(2, hit, ranged.min, ranged.max, m.hp, skill.hits);
        const p3 = killChanceWithin(3, hit, ranged.min, ranged.max, m.hp, skill.hits);
        const expPct = expToNextLevel(state.level) > 0 ? m.exp / expToNextLevel(state.level) : 0;
        return { m, hit, mult, ranged, p1, p2, p3, expPct };
      })
      .sort((a, b) => {
        if (state.priority === "hit") return b.hit - a.hit || b.p1 - a.p1;
        if (state.priority === "exp") return b.expPct - a.expPct || b.p1 - a.p1;
        return b.p1 - a.p1 || b.p2 - a.p2 || b.hit - a.hit;
      });
  }, [
    filtered,
    skill.element,
    skill.hits,
    skillPower,
    mastery,
    totalAcc,
    state.level,
    state.int,
    state.magicTotal,
    state.priority,
  ]);

  const stillSelected = ranked.find((r) => r.m.id === state.monsterId);
  const row = stillSelected ?? ranked[0] ?? null;

  useEffect(() => {
    if (!ranked.length) return;
    if (!ranked.some((r) => r.m.id === state.monsterId)) {
      patch({ monsterId: ranked[0].m.id });
    }
  }, [ranked, state.monsterId]);
  const mob = row?.m;
  const hit = row?.hit ?? 0;
  const shots = { p1: row?.p1 ?? 0, p2: row?.p2 ?? 0, p3: row?.p3 ?? 0 };
  const ranged = row?.ranged ?? { min: 0, max: 0 };
  const mult = row?.mult ?? 1;
  const rel = mob ? elementRelation(mob.traits, skill.element) : "neutral";
  const tags = mob ? mageElementTags(mob.traits) : [];
  const castMin = ranged.min * skill.hits;
  const castMax = ranged.max * skill.hits;
  const needToNext = expToNextLevel(state.level);
  const expPct = mob && needToNext > 0 ? mob.exp / needToNext : 0;
  const levelGap = mob ? mob.level - state.level : 0;

  const verdict =
    !mob
      ? "Pick a monster from the MeowDB list."
      : mult === 0
        ? `${mob.name} is immune to ${elementLabel(skill.element).toLowerCase()} — this spell deals no damage.`
        : shots.p1 >= 0.95
          ? `Reliable one-shot on ${mob.name} with ${skill.name}.`
          : shots.p2 >= 0.95
            ? `Usually dies in two casts of ${skill.name}.`
            : shots.p3 >= 0.8
              ? `Often needs up to three casts. Check hit chance, MDEF, or element.`
              : `Not a fast kill yet — raise MATK / INT, skill level, or pick a weaker / elemental-weak mob.`;

  const onSkillChange = (id: MageSkillId) => {
    const next = getMageSkill(id);
    patch({ skillId: id, skillRank: next.max });
  };

  return (
    <div className="lab">
      <div className="lab-intro">
        <div>
          <p className="lab-eyebrow">MAGE ONE-SHOT WORKSPACE</p>
          <h2 className="lab-title">Fewer casts. Cleaner kills.</h2>
          <p className="lab-lede">
            Magician-only odds using{" "}
            <a href="https://meowdb.com/msclassic/formulas" target="_blank" rel="noreferrer">
              MeowDB formulas
            </a>{" "}
            and the{" "}
            <a href={monsterData.source} target="_blank" rel="noreferrer">
              NiaDB monster list
            </a>
            . Element weak / resist / immune is applied from each mob&apos;s attributes.
          </p>
        </div>
        <div className="lab-snapshot">
          <b>{MONSTERS.length} monsters</b>
          <span>Source: {monsterData.credit}</span>
          <span>Saved in this browser</span>
        </div>
      </div>

      <label className="lab-goal">
        My priority
        <select value={state.priority} onChange={(e) => patch({ priority: e.target.value as Priority })}>
          <option value="oneshot">One-shot chance</option>
          <option value="hit">Hit chance first</option>
          <option value="exp">EXP per kill</option>
        </select>
      </label>

      <section className="lab-recommendations" aria-live="polite">
        <h3>
          {state.priority === "hit"
            ? "Hit chance for this build"
            : state.priority === "exp"
              ? "EXP payoff for this kill"
              : "Kill odds for this build"}
        </h3>
        <p>{verdict}</p>
        <p className="lab-panel-note">
          Kill % includes misses and uses the non-crit damage range. DoT from Fire Arrow / Poison Breath is not
          counted toward the cast kill window.
        </p>
      </section>

      <section className="lab-stats">
        <article>
          <small>HIT CHANCE</small>
          <b className={hit >= 0.99 ? "lab-good" : hit < 0.5 ? "lab-bad" : undefined}>{formatPct(hit)}</b>
          <span>
            ACC {totalAcc} vs EVA {mob?.avoid ?? "—"}
            {levelGap > 0 ? ` · mob +${levelGap}` : levelGap < 0 ? ` · mob ${levelGap}` : ""}
          </span>
        </article>
        <article>
          <small>1-SHOT</small>
          <b className={shots.p1 >= 0.95 ? "lab-good" : shots.p1 < 0.2 ? "lab-bad" : undefined}>
            {formatPct(shots.p1)}
          </b>
          <span>
            {skill.name} {castMin.toLocaleString()}–{castMax.toLocaleString()}
            {mob ? ` vs ${mob.hp.toLocaleString()} HP` : ""}
            {mult !== 1 ? ` · ×${mult}` : ""}
          </span>
        </article>
        <article>
          <small>WITHIN 3 CASTS</small>
          <b className={shots.p3 >= 0.95 ? "lab-good" : shots.p3 < 0.2 ? "lab-bad" : undefined}>
            {formatPct(shots.p3)}
          </b>
          <span>
            2-shot {formatPct(shots.p2)}
            {mob ? ` · EXP ${formatMesos(mob.exp)} (${formatPct(expPct, 2)} of next)` : ""}
          </span>
        </article>
      </section>

      <section className="lab-calculator">
        <div className="lab-section-title">
          <div>
            <h3>Your magician</h3>
            <p>Level, INT, LUK, total Magic Attack, and total Accuracy. Class ACC fills in when ACC is left at 0.</p>
          </div>
        </div>
        <div className="lab-calc-grid lab-mage-grid">
          <Field label="Level">
            <Num value={state.level} min={1} max={200} onChange={(n) => patch({ level: n })} />
          </Field>
          <Field label="INT">
            <Num value={state.int} min={4} onChange={(n) => patch({ int: n })} />
          </Field>
          <Field label="LUK">
            <Num value={state.luk} min={4} onChange={(n) => patch({ luk: n })} />
          </Field>
          <Field label="MATK (Magic total)">
            <Num value={state.magicTotal} min={1} onChange={(n) => patch({ magicTotal: n })} />
          </Field>
          <Field label="Total accuracy">
            <Num value={state.totalAcc} min={0} onChange={(n) => patch({ totalAcc: n })} />
          </Field>
          <Field label="Spell">
            <select value={state.skillId} onChange={(e) => onSkillChange(e.target.value as MageSkillId)}>
              {MAGE_SKILLS.map((s) => (
                <option key={s.id} value={s.id} disabled={state.level < s.jobLevel}>
                  {s.name} ({elementLabel(s.element)})
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Skill level (max ${skill.max})`}>
            <Num
              value={skillRank}
              min={1}
              max={skill.max}
              onChange={(n) => patch({ skillRank: n })}
            />
          </Field>
        </div>
        <div className="lab-build-summary">
          Class ACC <b>{baseAcc}</b> · used <b>{totalAcc}</b> · {skill.name}{" "}
          <b>
            {skillPower}% · mastery {mastery} · {skill.hits} hit{skill.hits === 1 ? "" : "s"}
          </b>{" "}
          · element <b>{elementLabel(skill.element)}</b>
          {mob ? (
            <>
              {" "}
              · vs {mob.name} <b>{relationLabel(rel)}</b> (×{mult})
            </>
          ) : null}
        </div>
        <p className="lab-help">
          Leave Total accuracy at 0 to use Magician ACC from level + INT + LUK. Enter your displayed ACC when gear or
          buffs add more.
        </p>
      </section>

      <section className="lab-controls" aria-label="Monster filters">
        <Field label="Search monsters" className="lab-search">
          <input
            type="search"
            placeholder="e.g. Fire Boar, Ligator, Drake"
            value={state.query}
            onChange={(e) => patch({ query: e.target.value })}
          />
        </Field>
        <Field label="Element">
          <select
            value={state.elementFilter}
            onChange={(e) => patch({ elementFilter: e.target.value as CombatState["elementFilter"] })}
          >
            <option value="any">Any</option>
            <option value="fire">Fire tagged</option>
            <option value="ice">Ice tagged</option>
            <option value="lightning">Lightning tagged</option>
            <option value="poison">Poison tagged</option>
          </select>
        </Field>
        <Field label="Level band">
          <select
            value={state.levelBand}
            onChange={(e) => patch({ levelBand: e.target.value as CombatState["levelBand"] })}
          >
            <option value="any">Any</option>
            <option value="1-20">1–20</option>
            <option value="21-40">21–40</option>
            <option value="41-60">41–60</option>
            <option value="61+">61+</option>
          </select>
        </Field>
        <button
          type="button"
          className="lab-ghost lab-reset"
          onClick={() => patch({ query: "", elementFilter: "any", levelBand: "any" })}
        >
          Clear filters
        </button>
      </section>

      <div className="lab-workspace">
        <section className="lab-panel">
          <div className="lab-section-title">
            <div>
              <h2>MeowDB monsters</h2>
              <p>
                {ranked.length} match · ranked by{" "}
                {state.priority === "hit" ? "hit chance" : state.priority === "exp" ? "EXP share" : "1-shot odds"} with{" "}
                {skill.name}.
              </p>
            </div>
            <span className="lab-pill">{elementLabel(skill.element)} spell</span>
          </div>
          <div className="lab-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Monster</th>
                  <th>Element</th>
                  <th>Hit</th>
                  <th>1-shot</th>
                  <th>EXP</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ m, hit: h, p1, mult: mu }) => {
                  const tagsRow = mageElementTags(m.traits);
                  const relRow = elementRelation(m.traits, skill.element);
                  return (
                    <tr
                      key={m.id}
                      className={mob?.id === m.id ? "selected" : undefined}
                      onClick={() => patch({ monsterId: m.id })}
                    >
                      <td>
                        <button type="button" className="lab-monster-btn">
                          {m.name}
                        </button>
                        <small>
                          Lv {m.level} · {m.hp.toLocaleString()} HP · MDEF {m.mdef}
                          {m.boss ? " · Boss" : ""}
                        </small>
                      </td>
                      <td>
                        {tagsRow.length === 0 ? (
                          <span className="lab-muted-inline">—</span>
                        ) : (
                          tagsRow.map((t) => (
                            <span
                              key={t.element}
                              className={`lab-elem lab-elem-${t.relation}${
                                t.element === skill.element ? " lab-elem-active" : ""
                              }`}
                            >
                              {elementLabel(t.element)} {relationLabel(t.relation)}
                            </span>
                          ))
                        )}
                        {mu !== 1 && relRow !== "neutral" ? (
                          <small>×{mu} vs {skill.name}</small>
                        ) : null}
                      </td>
                      <td>{formatPct(h)}</td>
                      <td className="efficiency">{formatPct(p1)}</td>
                      <td>{formatMesos(m.exp)}</td>
                    </tr>
                  );
                })}
                {ranked.length === 0 && (
                  <tr>
                    <td colSpan={5}>No monsters match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="lab-method">
            <b>Method.</b>
            <p>
              Hit chance from MeowDB accuracy vs EVA. Spell damage after MDEF, level gap, and elemental multiplier
              (weak 1.25× / resist 0.75× / immune 0×). Kill chance = binomial hits × discrete damage rolls (
              {skill.hits} line{skill.hits === 1 ? "" : "s"} per cast). Monster facts:{" "}
              <a href={monsterData.source} target="_blank" rel="noreferrer">
                {monsterData.credit}
              </a>
              .
            </p>
          </div>
        </section>

        <aside className="lab-aside">
          {mob ? (
            <>
              <p className="lab-eyebrow">SELECTED TARGET</p>
              <h3 className="lab-monster-title">{mob.name}</h3>
              <div className="lab-detail-sub">
                <span className="lab-pill">Lv {mob.level}</span>
                <span className="lab-pill">{mob.hp.toLocaleString()} HP</span>
                <span className="lab-pill">{formatMesos(mob.exp)} EXP</span>
                {mob.boss ? <span className="lab-pill">Boss</span> : null}
              </div>
              {tags.length > 0 ? (
                <p className="lab-trait">
                  {tags.map((t) => `${elementLabel(t.element)} ${relationLabel(t.relation).toLowerCase()}`).join(" · ")}
                </p>
              ) : (
                <p className="lab-trait">No fire / ice / lightning / poison tag — neutral to mage elements.</p>
              )}
              {skill.element !== "none" && (
                <div className="lab-notice">
                  <strong>{skill.name}.</strong>{" "}
                  {rel === "weak"
                    ? `Weak to ${elementLabel(skill.element).toLowerCase()} — ×1.25 damage.`
                    : rel === "strong"
                      ? `Resists ${elementLabel(skill.element).toLowerCase()} — ×0.75 damage.`
                      : rel === "immune"
                        ? `Immune to ${elementLabel(skill.element).toLowerCase()} — no damage.`
                        : `Neutral to ${elementLabel(skill.element).toLowerCase()}.`}
                </div>
              )}
              <div className="lab-detail-metrics">
                <div>
                  <small>Hit chance</small>
                  <b>{formatPct(hit)}</b>
                </div>
                <div>
                  <small>1-shot</small>
                  <b>{formatPct(shots.p1)}</b>
                </div>
                <div>
                  <small>Within 2</small>
                  <b>{formatPct(shots.p2)}</b>
                </div>
                <div>
                  <small>Within 3</small>
                  <b>{formatPct(shots.p3)}</b>
                </div>
                <div>
                  <small>EVA / MDEF</small>
                  <b>
                    {mob.avoid} / {mob.mdef}
                  </b>
                </div>
                <div>
                  <small>EXP / next</small>
                  <b>{formatPct(expPct, 2)}</b>
                </div>
              </div>
              <a className="lab-source" href={mob.url} target="_blank" rel="noreferrer">
                Open on MeowDB ↗
              </a>
            </>
          ) : (
            <p className="lab-trait">No monster selected.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
