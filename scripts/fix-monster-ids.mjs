import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dest = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "data",
  "monsters.json"
);
const data = JSON.parse(fs.readFileSync(dest, "utf8"));
data.monsters = data.monsters.map((m) => {
  const match = String(m.url || "").match(/monsters\/(\d+)/);
  return { ...m, id: match ? Number(match[1]) : m.id };
});
fs.writeFileSync(dest, JSON.stringify(data, null, 2));
console.log(data.monsters.slice(0, 3));
