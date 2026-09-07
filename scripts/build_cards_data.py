#!/usr/bin/env python3
"""
Rebuild data/cards.json from a fresh Undercards HAR export.

WHY YOU'D RUN THIS
    The deployed site is a static snapshot: data/cards.json was generated
    once from a HAR file (a saved copy of your browser's network traffic)
    captured while browsing undercards.net. If the game adds/changes cards
    later, re-run this script against a new HAR capture to refresh it.

HOW TO CAPTURE A HAR FILE
    1. Open undercards.net and log in, in Firefox or Chrome.
    2. Open DevTools (F12) -> Network tab.
    3. Visit the "Crafting" page (Cards -> Crafting in the site's menu).
       This is the page that loads the full card list (CraftConfig) and
       the text translations (translation/en.json) that this script needs.
    4. Right-click anywhere in the Network tab's request list -> "Save All
       As HAR" (Firefox) or "Save all as HAR with content" (Chrome).
    5. Save it somewhere, then run this script against it.

USAGE
    python3 build_cards_data.py path/to/your.har [-o ../data/cards.json]

    Requires only the Python standard library — no pip install needed.
"""
import argparse
import json
import re
import sys
from pathlib import Path


# ----------------------------------------------------------------------
# HAR loading
# ----------------------------------------------------------------------
def load_har_sources(har_path):
    with open(har_path, encoding='utf-8') as f:
        har = json.load(f)
    entries = har['log']['entries']

    collection = None
    translation = None
    for e in entries:
        url = e['request']['url']
        if 'CraftConfig' in url and collection is None:
            text = e['response']['content'].get('text', '')
            if text:
                collection = json.loads(json.loads(text)['collection'])
        elif 'translation/en.json' in url and translation is None:
            text = e['response']['content'].get('text', '')
            if text:
                translation = json.loads(text)

    if collection is None:
        sys.exit(
            "Couldn't find a 'CraftConfig' response in that HAR file.\n"
            "Make sure you captured the HAR while visiting the Crafting page\n"
            "(Cards -> Crafting) so the full card list request is included."
        )
    if translation is None:
        sys.exit(
            "Couldn't find a 'translation/en.json' response in that HAR file.\n"
            "Make sure you captured the HAR while visiting the Crafting page."
        )
    return collection, translation


# ----------------------------------------------------------------------
# Template resolution (mirrors the game's own {{TAG:...}} text macros)
# ----------------------------------------------------------------------
PLURAL_RE = re.compile(r'^\{\{PLURAL:\$1\|(.*)\|(.*)\}\}$', re.DOTALL)

RARITY_LABELS = {
    'BASE': 'Base', 'COMMON': 'Common', 'RARE': 'Rare', 'EPIC': 'Epic',
    'LEGENDARY': 'Legendary', 'DETERMINATION': 'Determination', 'TOKEN': 'Token',
}

KR_DEFINITION = (
    "A death-linked debuff. When the affected monster dies, its killer gains "
    "+1/+1; if there's no killer, or the killer is gone by the end of the turn, "
    "a random enemy monster gets +1/+1 instead."
)

TAG_RE = re.compile(r'\{\{([^{}]*)\}\}')


class Resolver:
    def __init__(self, by_id, translation):
        self.by_id = by_id
        self.translation = translation

    def plural_pick(self, template, count, fallback_base):
        if template:
            m = PLURAL_RE.match(template.strip())
            if m:
                return m.group(1) if count == 1 else m.group(2)
            return template
        return fallback_base if count == 1 else fallback_base + 's'

    def card_name(self, fid, count):
        fid = int(fid)
        tmpl = self.translation.get('card-name-%d' % fid)
        fallback = self.by_id.get(fid, {}).get('name', 'Card #%d' % fid)
        return self.plural_pick(tmpl, count, fallback)

    def tribe_name(self, name, count):
        key = 'tribe-' + name.lower().replace('_', '-')
        tmpl = self.translation.get(key)
        fallback = name.replace('_', ' ').title()
        return self.plural_pick(tmpl, count, fallback)

    def enchant_name(self, name, count):
        key = 'enchant-' + name.lower().replace('_', '-')
        tmpl = self.translation.get(key)
        fallback = name.replace('_', ' ').title()
        return self.plural_pick(tmpl, count, fallback)

    def artifact_name(self, fid):
        return self.translation.get('artifact-name-%s' % fid, 'Artifact #%s' % fid)

    def kw_label(self, name):
        return self.translation.get('kw-%s' % name.lower(), name.replace('_', ' ').title())

    def kw_desc(self, name):
        return self.translation.get('kw-%s-desc' % name.lower())

    @staticmethod
    def rarity_label(r):
        return RARITY_LABELS.get(r, r.replace('_', ' ').title())

    @staticmethod
    def soul_label(s):
        return s.replace('_', ' ').title()

    def make_tag_resolver(self, used_keywords):
        def resolve_tag(m):
            content = m.group(1)
            if ':' in content:
                head, rest = content.split(':', 1)
            else:
                head, rest = content, None
            head_u = head.strip().upper()
            args = rest.split('|') if rest is not None else []

            override = None
            clean_args = []
            for a in args:
                if a.startswith('override='):
                    override = a[len('override='):]
                else:
                    clean_args.append(a)
            args = clean_args

            def arg(i, default=''):
                return args[i] if i < len(args) else default

            if head_u == 'KW':
                name = arg(0)
                used_keywords.add(name.upper())
                return override if override is not None else self.kw_label(name)
            if head_u == 'KR':
                used_keywords.add('KR')
                return 'KR'
            if head_u == 'ATK':
                return 'ATK'
            if head_u == 'HP':
                return 'HP'
            if head_u == 'DMG':
                return 'damage'
            if head_u == 'GOLD':
                return 'Gold'
            if head_u == 'COST':
                return 'Cost'
            if head_u == 'RARITY':
                return self.rarity_label(arg(0))
            if head_u == 'SOUL':
                return self.soul_label(arg(0))
            if head_u == 'CARD':
                fid = arg(0)
                count = int(arg(1, '1')) if arg(1, '1').lstrip('-').isdigit() else 1
                return override if override is not None else self.card_name(fid, count)
            if head_u == 'QUEST':
                fid = arg(0)
                return override if override is not None else self.card_name(fid, 1)
            if head_u == 'TRIBE':
                name = arg(0)
                count = int(arg(1, '1')) if arg(1, '1').lstrip('-').isdigit() else 1
                return self.tribe_name(name, count)
            if head_u == 'ARTIFACT':
                return override if override is not None else self.artifact_name(arg(0))
            if head_u == 'ENCHANT':
                name = arg(0)
                count = int(arg(1, '1')) if arg(1, '1').lstrip('-').isdigit() else 1
                return override if override is not None else self.enchant_name(name, count)
            if head_u == 'STATS':
                if len(args) == 2:
                    return '%s ATK / %s HP' % (args[0], args[1])
                if len(args) == 3:
                    return '%s ATK / %s HP / %s Cost' % (args[0], args[1], args[2])
                return '/'.join(args)
            if head_u == 'SWITCH_LEFT':
                txt = arg(1) if len(args) > 1 else arg(0)
                return '%s (if on the left)' % txt
            if head_u == 'SWITCH_RIGHT':
                txt = arg(1) if len(args) > 1 else arg(0)
                return '%s (if on the right)' % txt
            if head_u == 'STYLE':
                return arg(1) if len(args) > 1 else arg(0)
            if head_u == 'IMAGE':
                return arg(1) if len(args) > 1 else arg(0)
            if head_u == 'PLURAL':
                return arg(1) if len(args) > 1 else arg(0)
            if override is not None:
                return override
            return (args[-1] if args else head).replace('_', ' ').title()
        return resolve_tag

    def resolve(self, text, used_keywords):
        resolver = self.make_tag_resolver(used_keywords)
        for _ in range(25):
            new_text, n = TAG_RE.subn(resolver, text)
            if n == 0:
                return self.cleanup(new_text)
            text = new_text
        return self.cleanup(text)

    @staticmethod
    def cleanup(text):
        text = text.replace('\r\n', ' ').replace('\n', ' ')
        text = re.sub(r'\s+([.,;:!?])', r'\1', text)
        text = re.sub(r'[ \t]{2,}', ' ', text)
        return text.strip()


# ----------------------------------------------------------------------
# Main build
# ----------------------------------------------------------------------
EXT_NAMES = {'BASE': 'Undertale', 'DELTARUNE': 'Deltarune', 'UTY': 'Undertale Yellow'}


def build(har_path, out_path):
    collection, translation = load_har_sources(har_path)

    by_id = {}
    for c in collection:
        if c['fixedId'] not in by_id:
            by_id[c['fixedId']] = c

    resolver = Resolver(by_id, translation)

    cards = []
    all_keywords = {}
    all_tribes = set()
    all_souls = set()

    for fid, c in sorted(by_id.items()):
        used_kw = set()
        raw_desc = translation.get('card-%d' % fid, '')
        desc = resolver.resolve(raw_desc, used_kw)

        tribes = c.get('tribes', []) or []
        soul = c.get('soul', {}).get('name') if c.get('soul') else None
        card_type = 'Monster' if c.get('typeCard') == 0 else 'Spell'

        kw_list = []
        for code in sorted(used_kw):
            label = resolver.kw_label(code) if code != 'KR' else 'KR'
            kw_list.append(label)
            if code not in all_keywords:
                all_keywords[code] = label

        all_tribes.update(tribes)
        if soul:
            all_souls.add(soul)

        cards.append({
            'id': fid,
            'name': c['name'],
            'image': c.get('image') or c.get('baseImage') or '',
            'type': card_type,
            'rarity': c['rarity'],
            'set': EXT_NAMES.get(c['extension'], c['extension']),
            'cost': c.get('cost', 0),
            'atk': c.get('attack') if card_type == 'Monster' else None,
            'hp': c.get('hp') if card_type == 'Monster' else None,
            'tribes': tribes,
            'soul': soul if soul else None,
            'keywords': kw_list,
            'description': desc,
        })

    glossary = {}
    for code, label in all_keywords.items():
        if code == 'KR':
            glossary[code] = {'label': 'KR', 'description': KR_DEFINITION}
        else:
            raw = resolver.kw_desc(code)
            glossary[code] = {'label': label, 'description': resolver.resolve(raw, set()) if raw else ''}

    data = {
        'generatedFrom': 'undercards.net CraftConfig + translation/en.json',
        'cardCount': len(cards),
        'cards': cards,
        'glossary': glossary,
        'tribeLabels': {t: resolver.tribe_name(t, 1) for t in sorted(all_tribes)},
        'soulLabels': {s: resolver.soul_label(s) for s in sorted(all_souls)},
        'rarityLabels': {r: RARITY_LABELS.get(r, r.title()) for r in sorted(set(c['rarity'] for c in cards))},
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

    print('Wrote %d cards to %s' % (len(cards), out_path))
    print('Tribes: %d, Keywords: %d, Souls: %d' % (len(all_tribes), len(all_keywords), len(all_souls)))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('har_file', help='Path to a HAR export captured on the Crafting page')
    parser.add_argument('-o', '--output', default=None,
                         help='Output path for cards.json (default: ../data/cards.json next to this script)')
    args = parser.parse_args()

    har_path = Path(args.har_file)
    if not har_path.exists():
        sys.exit('File not found: %s' % har_path)

    out_path = Path(args.output) if args.output else Path(__file__).resolve().parent.parent / 'data' / 'cards.json'
    build(har_path, out_path)


if __name__ == '__main__':
    main()
