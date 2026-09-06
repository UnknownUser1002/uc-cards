HOW CARD ART WORKS
==================

This folder is where you drop card art. The app looks for a file named
after each card's "image" slug (see the "image" field for each card in
../data/cards.json), tried in this order of file extension:

    images/<slug>.png
    images/<slug>.jpg
    images/<slug>.jpeg
    images/<slug>.webp

Example: the card "Bulldogzer" has "image": "Bulldogzer" in cards.json,
so dropping a file at images/Bulldogzer.png (or .jpg/.jpeg/.webp) is all
it takes — no code or JSON changes needed. The page checks each
extension in order and just uses whichever one exists.

Cards with no matching file show a small placeholder (a colored square
with the card's first letter) instead of a broken image, so the site
looks intentional with zero images, a partial set, or the full set.

To change the lookup folder, filename pattern, or extension order,
edit the IMAGE_BASE / IMAGE_EXTS constants near the top of ../app.js —
they're the single source of truth for this.

This file itself isn't read by the app; it's just here so the empty
folder gets tracked by git before you add real images.
