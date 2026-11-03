import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  JOB_OPTIONS,
  WEAPON_OPTIONS,
  classAccuracy,
  damageAfterMods,
  expToNextLevel,
  formatPct,
  hitChance,
  killChanceWithin,
  spellDamageRange,
  weaponDamageRange,
  type DamageMode,
  type JobClass,
  type WeaponKind,
} from "./lib/combat";
import { formatMesos } from "./lib/calc";

const COMBAT_KEY = "mscw-combat";

type CombatState = {
  level: number;
  job: JobClass;
  str: number;
  dex: number;
  int: number;
  luk: number;
  accOverride: number | null;
  mode: DamageMode;
  weapon: WeaponKind;
  watk: number;
  magicTotal: number;
  skillPct: number;
  mastery: number;
  attackPower: number;
  skillBonus: number;
  critRate: number;
  critDmg: number;
  lines: number;
  elementMult: number;
  mobLevel: number;
  mobHp: number;
  mobEva: number;
  mobDef: number;
  mobExp: number;
};

const DEFAULTS: CombatState = {
  level: 50,
  job: "warrior",
  str: 250,
  dex: 50,
  int: 20,
  luk: 20,
  accOverride: null,
  mode: "weapon",
  weapon: "2h_sword",
  watk: 80,
  magicTotal: 200,
  skillPct: 100,
  mastery: 10,
  attackPower: 0,
  skillBonus: 100,
  critRate: 5,
  critDmg: 20,
  lines: 1,
  elementMult: 100,
  mobLevel: 50,
  mobHp: 2000,
  mobEva: 20,
  mobDef: 40,
  mobExp: 200,
};

function loadCombat(): CombatState {
  try {
    const raw = JSON.parse(localStorage.getItem(COMBAT_KEY) || "");
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="combat-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Num({
  value,
  onChange,
  min = 0,
  max = 999999,
  step = 1,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (!Number.isFinite(n)) return;
        onChange(Math.min(max, Math.max(min, n)));
      }}
    />
  );
}

export function CombatPage() {
  const [state, setState] = useState(loadCombat);
  const patch = (next: Partial<CombatState>) => setState((prev) => ({ ...prev, ...next }));

  useEffect(() => {
    localStorage.setItem(COMBAT_KEY, JSON.stringify(state));
  }, [state]);

  const weapon = WEAPON_OPTIONS.find((w) => w.id === state.weapon) ?? WEAPON_OPTIONS[1];
  const primary =
    state.mode === "spell"
      ? state.int
      : state.weapon === "bow_xbow_claw"
        ? state.dex
        : state.weapon === "dagger" || state.weapon === "lucky_seven"
          ? state.luk
          : state.str;
  const secondary =
    state.mode === "spell"
      ? 0
      : state.weapon === "bow_xbow_claw"
        ? state.str
        : state.weapon === "dagger" || state.weapon === "lucky_seven"
          ? state.str + state.dex
          : state.dex;

  const baseAcc = classAccuracy(state.job, state.level, state.dex, state.luk, state.int);
  const totalAcc = state.accOverride != null && state.accOverride > 0 ? state.accOverride : baseAcc;
  const hit = hitChance(totalAcc, state.level, state.mobLevel, state.mobEva);

  const raw =
    state.mode === "spell"
      ? spellDamageRange({
          skillPowerPct: state.skillPct,
          masteryLevel: state.mastery,
          totalInt: state.int,
          magicTotal: state.magicTotal,
        })
      : weaponDamageRange({
          skillDamagePct: state.skillPct,
          masteryLevel: state.mastery,
          totalWatk: state.watk,
          primary,
          secondary,
          weaponMult: weapon.mult,
          attackPower: state.attackPower,
          luckySeven: state.weapon === "lucky_seven",
        });

  const ranged = damageAfterMods(
    raw.min,
    raw.max,
    state.mobDef,
    state.mobLevel,
    state.level,
    state.elementMult / 100,
    state.skillBonus / 100
  );

  // Expected damage with crit (MeowDB): Normal × (1 + c × d)
  const critFactor = 1 + (state.critRate / 100) * (state.critDmg / 100);
  const expectedLine = ((ranged.min + ranged.max) / 2) * critFactor;

  const shots = useMemo(() => {
    const lines = Math.max(1, Math.round(state.lines));
    // Crit: approximate kill chance using expected range midpoints with crit on/off mix is complex;
    // use non-crit range for kill odds (conservative for 1-shot), show expected separately.
    const p1 = killChanceWithin(1, hit, ranged.min, ranged.max, state.mobHp, lines);
    const p2 = killChanceWithin(2, hit, ranged.min, ranged.max, state.mobHp, lines);
    const p3 = killChanceWithin(3, hit, ranged.min, ranged.max, state.mobHp, lines);
    return { p1, p2, p3 };
  }, [hit, ranged.min, ranged.max, state.mobHp, state.lines]);

  const needToNext = expToNextLevel(state.level);
  const expPct = needToNext > 0 ? state.mobExp / needToNext : 0;

  return (
    <section className="table-card combat-page">
      <h2>One-shot calculator</h2>
      <p className="muted">
        Damage, defense, level gap, and accuracy use{" "}
        <a href="https://meowdb.com/msclassic/formulas" target="_blank" rel="noreferrer">
          MeowDB Classic formulas
        </a>
        . Enter your build and the mob; see hit chance and odds to kill in 1–3 attacks.
      </p>

      <div className="combat-panels">
        <div className="combat-panel">
          <h3>Character</h3>
          <div className="combat-form">
            <Field label="Level">
              <Num value={state.level} min={1} max={99} onChange={(n) => patch({ level: n })} />
            </Field>
            <Field label="Class">
              <select value={state.job} onChange={(e) => patch({ job: e.target.value as JobClass })}>
                {JOB_OPTIONS.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="STR">
              <Num value={state.str} onChange={(n) => patch({ str: n })} />
            </Field>
            <Field label="DEX">
              <Num value={state.dex} onChange={(n) => patch({ dex: n })} />
            </Field>
            <Field label="INT">
              <Num value={state.int} onChange={(n) => patch({ int: n })} />
            </Field>
            <Field label="LUK">
              <Num value={state.luk} onChange={(n) => patch({ luk: n })} />
            </Field>
            <Field label="Total ACC override">
              <Num
                value={state.accOverride ?? 0}
                onChange={(n) => patch({ accOverride: n > 0 ? n : null })}
              />
            </Field>
            <Field label="Damage type">
              <select value={state.mode} onChange={(e) => patch({ mode: e.target.value as DamageMode })}>
                <option value="weapon">Weapon / physical skill</option>
                <option value="spell">Spell</option>
              </select>
            </Field>
            {state.mode === "weapon" ? (
              <>
                <Field label="Weapon / action">
                  <select
                    value={state.weapon}
                    onChange={(e) => patch({ weapon: e.target.value as WeaponKind })}
                  >
                    {WEAPON_OPTIONS.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Total WATK">
                  <Num value={state.watk} onChange={(n) => patch({ watk: n })} />
                </Field>
                <Field label="Attack Power">
                  <Num value={state.attackPower} onChange={(n) => patch({ attackPower: n })} />
                </Field>
              </>
            ) : (
              <Field label="Magic total">
                <Num value={state.magicTotal} onChange={(n) => patch({ magicTotal: n })} />
              </Field>
            )}
            <Field label="Skill damage %">
              <Num value={state.skillPct} min={1} max={2000} onChange={(n) => patch({ skillPct: n })} />
            </Field>
            <Field label="Mastery level">
              <Num value={state.mastery} min={0} max={30} onChange={(n) => patch({ mastery: n })} />
            </Field>
            <Field label="Skill bonus %">
              <Num value={state.skillBonus} min={1} max={500} onChange={(n) => patch({ skillBonus: n })} />
            </Field>
            <Field label="Element mult %">
              <Num value={state.elementMult} min={0} max={200} onChange={(n) => patch({ elementMult: n })} />
            </Field>
            <Field label="Hits per cast">
              <Num value={state.lines} min={1} max={15} onChange={(n) => patch({ lines: n })} />
            </Field>
            <Field label="Crit rate %">
              <Num value={state.critRate} min={0} max={100} onChange={(n) => patch({ critRate: n })} />
            </Field>
            <Field label="Crit damage %">
              <Num value={state.critDmg} min={0} max={200} onChange={(n) => patch({ critDmg: n })} />
            </Field>
          </div>
        </div>

        <div className="combat-panel">
          <h3>Monster</h3>
          <div className="combat-form">
            <Field label="Mob level">
              <Num value={state.mobLevel} min={1} max={200} onChange={(n) => patch({ mobLevel: n })} />
            </Field>
            <Field label="Mob HP">
              <Num value={state.mobHp} min={1} onChange={(n) => patch({ mobHp: n })} />
            </Field>
            <Field label="Mob EVA">
              <Num value={state.mobEva} min={0} onChange={(n) => patch({ mobEva: n })} />
            </Field>
            <Field label={state.mode === "spell" ? "Mob MDEF" : "Mob WDEF"}>
              <Num value={state.mobDef} min={0} onChange={(n) => patch({ mobDef: n })} />
            </Field>
            <Field label="Mob EXP">
              <Num value={state.mobExp} min={0} onChange={(n) => patch({ mobExp: n })} />
            </Field>
          </div>

          <div className="stats" style={{ marginTop: 12 }}>
            <span className="badge">Mob Lv {state.mobLevel}</span>
            <span className="badge">EXP {formatMesos(state.mobExp)}</span>
            <span className="badge">
              {formatPct(expPct, 2)} of Lv {state.level}→{state.level + 1}
            </span>
            <span className={`badge ${hit >= 0.99 ? "profit" : hit < 0.5 ? "loss" : ""}`}>
              Hit {formatPct(hit)}
            </span>
          </div>

          <div className="combat-results">
            <div className="combat-result-row">
              <span>Class ACC</span>
              <strong>{baseAcc}</strong>
            </div>
            <div className="combat-result-row">
              <span>ACC used</span>
              <strong>{totalAcc}</strong>
            </div>
            <div className="combat-result-row">
              <span>Primary / secondary</span>
              <strong>
                {primary} / {secondary}
              </strong>
            </div>
            <div className="combat-result-row">
              <span>Damage / line (after DEF)</span>
              <strong>
                {ranged.min.toLocaleString()} – {ranged.max.toLocaleString()}
              </strong>
            </div>
            <div className="combat-result-row">
              <span>Expected / line (w/ crit)</span>
              <strong>{Math.round(expectedLine).toLocaleString()}</strong>
            </div>
            <div className="combat-result-row">
              <span>Per cast (×{Math.max(1, Math.round(state.lines))} lines)</span>
              <strong>
                {(ranged.min * Math.max(1, Math.round(state.lines))).toLocaleString()} –{" "}
                {(ranged.max * Math.max(1, Math.round(state.lines))).toLocaleString()}
              </strong>
            </div>
          </div>

          <table className="combat-shot-table">
            <thead>
              <tr>
                <th>Shots</th>
                <th className="num">Kill chance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1-shot</td>
                <td className={`num ${shots.p1 >= 0.95 ? "profit" : shots.p1 < 0.2 ? "loss" : ""}`}>
                  {formatPct(shots.p1)}
                </td>
              </tr>
              <tr>
                <td>Within 2</td>
                <td className={`num ${shots.p2 >= 0.95 ? "profit" : shots.p2 < 0.2 ? "loss" : ""}`}>
                  {formatPct(shots.p2)}
                </td>
              </tr>
              <tr>
                <td>Within 3</td>
                <td className={`num ${shots.p3 >= 0.95 ? "profit" : shots.p3 < 0.2 ? "loss" : ""}`}>
                  {formatPct(shots.p3)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            Kill odds include misses. Crit is shown in expected damage only; kill % uses the non-crit damage
            range. Skill bonus covers Combo / Charge / Element Amp style multipliers.
          </p>
        </div>
      </div>
    </section>
  );
}
