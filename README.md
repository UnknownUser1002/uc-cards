# Undercards Card Database

A static, searchable, filterable reference for every card in Undercards — name, cost, ATK/HP, rarity, set, soul, tribe, keywords, and effect text. No backend, no build step: it's plain HTML/CSS/JS that reads a JSON file.

This is a personal fan-made cataloging tool, not affiliated with the Undercards team. Card data was pulled from the game's own client (its `CraftConfig` and `translation/en.json` endpoints) at a point in time — see **Keeping it up to date** below for how to refresh it later.

## Deploying to GitHub Pages

1. Create a new repository on GitHub (public or private — Pages works for both, though private repos need a paid plan for Pages on some account types).
2. Upload all the files in this folder, keeping the folder structure (`index.html` and `style.css` and `app.js` at the repo root, `data/cards.json`, `images/`, `scripts/` as subfolders).
   - Easiest way: on the repo page, **Add file → Upload files**, then drag the whole contents of this folder in.
3. Go to **Settings → Pages**.
4. Under "Build and deployment", set **Source** to "Deploy from a branch".
5. Set **Branch** to `main` (or whichever branch you uploaded to) and folder to `/ (root)`. Save.
6. GitHub gives you a URL like `https://<your-username>.github.io/<repo-name>/` — it can take a minute or two to go live the first time.

That's it — no npm install, no build command, nothing to compile.

## Adding card art

The `images/` folder is empty on purpose — card art belongs to the Undercards team, so nothing is bundled here. The app is wired up so you can drop your own images in at any time:

- Name each file after that card's `image` value in `data/cards.json` (e.g. the card "Bulldogzer" has `"image": "Bulldogzer"`, so add `images/Bulldogzer.png`).
- `.png`, `.jpg`, `.jpeg`, and `.webp` are all tried automatically, in that order — no JSON edits needed either way.
- A card with no matching file just shows a small placeholder (its first letter), so the site looks fine with zero, some, or all images in place.
- To change the folder name, or the extension order, edit the `IMAGE_BASE` and `IMAGE_EXTS` constants right at the top of `app.js` — that's the only place either is defined.

See `images/README.txt` for the same notes in place.

## Keeping it up to date

`data/cards.json` is a snapshot, not a live feed — the page never calls undercards.net directly. When the game adds or changes cards, refresh it like this:

1. Log into undercards.net and open **Cards → Crafting** (this is the page that loads the full card list, not just what you own).
2. Open your browser's DevTools → **Network** tab, then reload the page.
3. Right-click the request list → **Save all as HAR** (Firefox) or **Save all as HAR with content** (Chrome).
4. Run:
   ```
   python3 scripts/build_cards_data.py path/to/your.har
   ```
   This regenerates `data/cards.json` in place. No dependencies to install — it only uses the Python standard library.
5. Commit and push the updated `data/cards.json`.

## What's included / left out

- All 926 collectible cards across Undertale, Deltarune, and Undertale Yellow, at the time this was generated — Base/Common/Rare/Epic/Legendary/Determination/Token rarities.
- Story-exclusive, encounter-only cards (the ones that only show up in scripted boss fights and aren't part of the normal card pool) aren't included, since they don't come through the Crafting page's card list.
- Effect text is reconstructed from the game's own text templates (the same ones the site itself uses to render card text), so wording should closely match what you see in-game. A couple of obscure edge cases in stat-modifier formatting are a best-effort interpretation — cross-check anything that looks off against the card in-game.
- If you captured your own "owned cards" HAR earlier, note the "Owned ×N" tag on each card reflects *your* collection at the time this file was generated, not a live count.

## File structure

```
index.html              — page structure
style.css               — all styling
app.js                  — data loading, filters, search, rendering
data/cards.json         — the card data (see above)
images/                 — drop your own card art here (see above)
scripts/build_cards_data.py — regenerates data/cards.json from a fresh HAR
```
THIS IS A FAN-MADE THING PLS DONT SUE ME CONTACT ME AT laikbeaz@gmail.com IF YOU WANT ME TO TAKE IT DOWN
