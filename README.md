# MSCW Crafting Efficiency

A MapleStory Classic World crafting-efficiency page in the same spirit as [MeowDB](https://meowdb.com/msclassic/crafting/efficiency): all six disciplines, ranked by EXP per meso.

The difference is the price source. Net cost uses live [MesoWatch](https://meso.watch/) typical sale / ask median prices (with NPC sell-back as a fallback), not vendor floors alone.

```text
Typical → NPC:  net = NPC sell-back − craft fee − typical mat value
Typical / ask:  net = output market value − craft fee − ingredient market value
EXP / meso = craft EXP / |net|
```

## Run it

```bash
npm install
npm run dev
```

Then open the local URL Vite prints (usually `http://localhost:5173`).

### Import latest prices

```bash
npm run prices
```

That writes `public/mesowatch-list.json` for GitHub Pages and local fallback. It tries the Vite proxy first, then MesoWatch. If Cloudflare blocks the download, save `list.json` from [meso.watch/data/list.json](https://meso.watch/data/list.json) and run:

```bash
npm run prices -- path\to\list.json
```

In the app, **Import latest** uses the live proxy in dev and the snapshot on GitHub Pages. **Import JSON** is the manual fallback.

To refresh the live site, run `npm run prices` (or pass a saved `list.json`), commit any app changes, and push `main` — or re-run the **Deploy GitHub Pages** workflow.

## GitHub Pages

Pushes to `main` build and deploy the static app. The Pages build runs `npm run prices` so the hosted snapshot is as fresh as MesoWatch allows from GitHub’s network.

## Data

- Recipes: `data/crafting.json` from [OSMS Data Explorer](https://osmsdataexplorer.com/)
- Item names / NPC prices: `data/items.json` from the same dump
- Market prices: `https://meso.watch/data/list.json` at runtime (dev proxy) or the imported snapshot on Pages
