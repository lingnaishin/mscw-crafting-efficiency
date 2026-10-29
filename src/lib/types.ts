export type QuoteSide = "typical" | "ask" | "npc";
export type CostMode = QuoteSide | "vendor";

export type Ingredient = {
  name: string;
  id: number | null;
  npcPrice: number | null;
  count: number;
};

export type Recipe = {
  id: number;
  discipline: string;
  outputType: string;
  level: number;
  outputId: number;
  name: string;
  resultCount: number;
  exp: number;
  mesoCost: number;
  ingredients: Ingredient[];
};

export type CatalogItem = {
  id: number;
  name: string;
  category: string | null;
  subCategory: string | null;
  npcPrice: number | null;
};

export type Catalog = {
  source: string;
  generatedAt: string;
  launchCap: number;
  recipes: Recipe[];
  items: CatalogItem[];
};

export type PriceQuote = {
  value: number | null;
  source: "typical" | "ask" | "npc" | "none";
  sold: number;
  asks: number;
  lowData: boolean;
  askMedian: number | null;
  typical: number | null;
  npc: number | null;
};

export type PriceOverrides = Record<string, number>;

export type ScoredIngredient = Ingredient & {
  unit: number | null;
  source: PriceQuote["source"];
  complete: boolean;
  overridden: boolean;
};

export type ScoredRecipe = {
  recipe: Recipe;
  ingredients: ScoredIngredient[];
  outputValue: number | null;
  outputSource: PriceQuote["source"];
  typicalSale: number | null;
  typicalOverridden: boolean;
  npcSell: number | null;
  matCost: number | null;
  fee: number;
  net: number | null;
  expPerMeso: number | null;
  complete: boolean;
};
