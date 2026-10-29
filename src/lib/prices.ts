import type { CatalogItem, PriceQuote, QuoteSide } from "./types";

export type MarketItem = {
  id: string;
  name: string;
  price?: number | null;
  askMedian?: number | null;
  sold?: number;
  asks?: number;
  lowData?: boolean;
  npc?: { sell?: number | null } | null;
};

export type MarketFile = {
  kind?: string;
  market?: string;
  generated_at?: string;
  items: MarketItem[];
};

function padId(id: number) {
  return String(id).padStart(8, "0");
}

export function mesoWatchItemUrl(id: number) {
  return `https://meso.watch/?item=${padId(id)}`;
}

export function itemIconUrl(id: number) {
  return `https://osmsdataexplorer.com/data/current/images/items/${padId(id)}.png`;
}

export function basilId(id: number) {
  return `basil:${padId(id)}`;
}

export function numericId(raw: string | number) {
  const text = String(raw).replace(/^basil:/, "");
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function buildPriceIndex(market: MarketFile | null, catalogItems: CatalogItem[]) {
  const byId = new Map<number, MarketItem>();
  const byName = new Map<string, MarketItem>();
  for (const item of market?.items ?? []) {
    const id = numericId(item.id);
    if (id != null) byId.set(id, item);
    if (item.name) byName.set(item.name.toLowerCase(), item);
  }
  const npcById = new Map(catalogItems.map((item) => [item.id, item.npcPrice]));

  function quote(
    id: number | null,
    name: string | null,
    mode: QuoteSide,
    opts?: { fallbackNpc?: boolean }
  ): PriceQuote {
    const marketItem =
      (id != null ? byId.get(id) : undefined) ??
      (name ? byName.get(name.toLowerCase()) : undefined);
    const typical = marketItem?.price ?? null;
    const askMedian = marketItem?.askMedian ?? null;
    const npc = marketItem?.npc?.sell ?? (id != null ? npcById.get(id) ?? null : null);
    const sold = marketItem?.sold ?? 0;
    const asks = marketItem?.asks ?? 0;
    const fallbackNpc = opts?.fallbackNpc !== false;

    let value: number | null = null;
    let source: PriceQuote["source"] = "none";
    if (mode === "typical") {
      if (typical != null && sold > 0) {
        value = typical;
        source = "typical";
      } else if (askMedian != null && asks > 0) {
        value = askMedian;
        source = "ask";
      } else if (fallbackNpc && npc != null) {
        value = npc;
        source = "npc";
      }
    } else if (mode === "ask") {
      if (askMedian != null && asks > 0) {
        value = askMedian;
        source = "ask";
      } else if (typical != null && sold > 0) {
        value = typical;
        source = "typical";
      } else if (fallbackNpc && npc != null) {
        value = npc;
        source = "npc";
      }
    } else if (npc != null) {
      value = npc;
      source = "npc";
    }

    return {
      value,
      source,
      sold,
      asks,
      lowData: Boolean(marketItem?.lowData) || (sold > 0 && sold < 5),
      askMedian,
      typical,
      npc,
    };
  }

  return { quote, byId, generatedAt: market?.generated_at ?? null, marketName: market?.market ?? null };
}

export type MarketLoad = {
  file: MarketFile;
  source: "live" | "snapshot";
};

async function loadMarketFile(url: string): Promise<MarketFile> {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`MesoWatch list.json failed (${response.status})`);
  }
  return parseMesoWatchFile(await response.json());
}

export function snapshotPriceUrl() {
  return `${import.meta.env.BASE_URL}mesowatch-list.json`;
}

export async function fetchMesoWatchList(): Promise<MarketLoad> {
  const live = "/api/mesowatch/data/list.json";
  const snapshot = snapshotPriceUrl();
  const order: Array<["live" | "snapshot", string]> = import.meta.env.DEV
    ? [
        ["live", live],
        ["snapshot", snapshot],
      ]
    : [
        ["snapshot", snapshot],
        ["live", live],
      ];
  let lastError: Error | null = null;
  for (const [source, url] of order) {
    try {
      const file = await loadMarketFile(url);
      return { file, source };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error("Could not load MesoWatch prices");
}

export function parseMesoWatchFile(raw: unknown): MarketFile {
  const data = raw as MarketFile;
  if (!data || !Array.isArray(data.items)) {
    throw new Error("That file is not a MesoWatch list/market JSON.");
  }
  return data;
}
