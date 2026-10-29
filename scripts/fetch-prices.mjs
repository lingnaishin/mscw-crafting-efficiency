import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public");
const outFile = join(outDir, "mesowatch-list.json");
const srcArg = process.argv[2];

function validate(data) {
  if (!data || !Array.isArray(data.items)) {
    throw new Error("Not a MesoWatch list/market JSON (missing items[]).");
  }
  return data;
}

async function fromFile(path) {
  return validate(JSON.parse(readFileSync(path, "utf8")));
}

async function fromUrl(url, headers = {}) {
  const response = await fetch(url, { headers, cache: "no-store" });
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok) throw new Error(`${url} → ${response.status}`);
  if (type.includes("text/html")) throw new Error(`${url} → Cloudflare challenge`);
  return validate(await response.json());
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  let data;
  let source;

  if (srcArg) {
    data = await fromFile(resolve(srcArg));
    source = srcArg;
  } else {
    const attempts = [
      ["local Vite proxy", () => fromUrl("http://127.0.0.1:5173/api/mesowatch/data/list.json")],
      [
        "meso.watch",
        () =>
          fromUrl("https://meso.watch/data/list.json", {
            Referer: "https://meso.watch/",
            Accept: "application/json,text/plain,*/*",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          }),
      ],
    ];
    const errors = [];
    for (const [label, attempt] of attempts) {
      try {
        data = await attempt();
        source = label;
        break;
      } catch (err) {
        errors.push(`${label}: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (!data) {
      console.error(`Could not download MesoWatch list.json.\n${errors.map((line) => `  - ${line}`).join("\n")}
Open https://meso.watch/data/list.json in your browser, save the file, then run:
  npm run prices -- path\\to\\list.json`);
      process.exit(1);
    }
  }

  writeFileSync(outFile, JSON.stringify(data));
  console.log(
    `Wrote ${outFile} (${data.items.length} items, generated_at=${data.generated_at ?? "unknown"}) from ${source}`
  );
}

await main();
