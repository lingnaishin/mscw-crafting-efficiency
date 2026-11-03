import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcPath = process.argv[2];
if (!srcPath) {
  console.error("Usage: node extract-monsters.mjs <data.js|raw.json>");
  process.exit(1);
}

const raw = fs.readFileSync(srcPath, "utf8");
let monsters;

if (srcPath.endsWith(".json")) {
  monsters = JSON.parse(raw);
} else {
  const sandbox = { window: {}, console };
  vm.runInNewContext(raw + "\nthis.MONSTERS = window.MONSTERS;", sandbox, {
    timeout: 5000,
  });
  monsters = sandbox.MONSTERS || sandbox.window.MONSTERS;
}

if (!Array.isArray(monsters)) {
  console.error("Could not parse monsters");
  process.exit(1);
}

const cleaned = monsters
  .map((m) => {
    const id =
      m.id ??
      m.link ??
      Number(String(m.url || "").match(/monsters\/(\d+)/)?.[1] || 0);
    const traits = String(m.traits || "")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      id,
      name: m.name,
      level: m.level,
      hp: m.hp,
      mdef: m.mdef ?? 0,
      avoid: m.avoid ?? 0,
      exp: m.exp ?? 0,
      traits,
      url: m.url || (id ? `https://meowdb.com/msclassic/monsters/${id}` : ""),
      boss: !!m.boss || /\bBOSS\b/i.test(traits),
    };
  })
  .filter(
    (m) =>
      m.name &&
      m.level < 200 &&
      !String(m.name).includes("Dummy") &&
      !/\bINV\b/i.test(m.traits)
  )
  .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

const out = {
  source: "https://meowdb.com/msclassic/monsters",
  credit: "NiaDB / MeowDB",
  note: "Monster facts from NiaDB (MeowDB). Used for mage one-shot odds.",
  monsters: cleaned,
};

const dest = path.join(__dirname, "..", "src", "data", "monsters.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(`Wrote ${cleaned.length} monsters → ${dest}`);
