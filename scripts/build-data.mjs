import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const crafting = JSON.parse(readFileSync(join(root, "data/crafting.json"), "utf8"));
const itemsDoc = JSON.parse(readFileSync(join(root, "data/items.json"), "utf8"));

const allItems = [...(itemsDoc.items || []), ...(itemsDoc.scrolls || [])];
const byName = new Map();
const byId = new Map();
for (const item of allItems) {
  if (item?.id == null || !item.name) continue;
  byId.set(Number(item.id), item);
  if (!byName.has(item.name)) byName.set(item.name, item);
}

const missing = new Set();
function resolveIngredient(name) {
  const item = byName.get(name);
  if (!item) {
    missing.add(name);
    return { name, id: null, npcPrice: null };
  }
  return {
    name,
    id: Number(item.id),
    npcPrice: item.price ?? null,
  };
}

const recipes = [];
for (const discipline of crafting.disciplines) {
  for (const outputType of discipline.output_types) {
    for (const level of outputType.levels) {
      for (const recipe of level.recipes) {
        recipes.push({
          id: recipe.id,
          discipline: discipline.discipline,
          outputType: outputType.output_type,
          level: level.level,
          outputId: recipe.output_id,
          name: recipe.result_item_name,
          resultCount: recipe.result_count,
          exp: recipe.craft_exp,
          mesoCost: recipe.meso_cost,
          ingredients: recipe.ingredients.map((ing) => ({
            ...resolveIngredient(ing.item_name),
            count: ing.count,
          })),
        });
      }
    }
  }
}

const usedIds = new Set();
for (const recipe of recipes) {
  if (recipe.outputId != null) usedIds.add(recipe.outputId);
  for (const ing of recipe.ingredients) {
    if (ing.id != null) usedIds.add(ing.id);
  }
}

const items = [...usedIds]
  .sort((a, b) => a - b)
  .map((id) => {
    const item = byId.get(id);
    return {
      id,
      name: item?.name ?? `#${id}`,
      category: item?.category ?? null,
      subCategory: item?.sub_category ?? null,
      npcPrice: item?.price ?? null,
    };
  });

const outDir = join(root, "src/data");
mkdirSync(outDir, { recursive: true });
const catalog = {
  source: "OSMS Data Explorer (Public Release client dump)",
  generatedAt: new Date().toISOString(),
  launchCap: 8,
  recipes,
  items,
};
writeFileSync(join(outDir, "catalog.json"), JSON.stringify(catalog));

const unmatched = [...missing];
console.log(
  `Wrote ${recipes.length} recipes and ${items.length} items.` +
    (unmatched.length ? ` Unmatched ingredients: ${unmatched.join(", ")}` : " All ingredients resolved.")
);
