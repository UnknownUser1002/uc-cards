(function () {
  'use strict';

  var PAGE_SIZE = 48;

  // ---- Card art config ----------------------------------------------
  // Images are looked up as: IMAGE_BASE + card.image + '.' + <one of IMAGE_EXTS>
  // Drop files into the images/ folder named after each card's "image" slug
  // (see data/cards.json) and they'll show up automatically — no code change
  // needed. Cards with no matching file just show a placeholder initial.
  var IMAGE_BASE = 'images/';
  var IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp'];

  // Optional decorative card-frame image (a shared border/layout graphic, not
  // per-card art). Same "bring your own file" pattern as card art: place a
  // file at the path below yourself and the Cards view will use it. Regions
  // (name/cost/art/desc/atk/rarity/hp) are positioned in CSS (.frame-*
  // classes) to match that specific frame's proportions — if you swap in a
  // differently-proportioned frame later, those percentages are the thing to
  // adjust.
  var FRAME_IMAGES = { Monster: 'images/frame-monster.png' };
  var frameAvailable = {};
  // ---------------------------------------------------------------------

  var CARDS = [];
  var GLOSSARY = {};
  var TRIBE_LABELS = {};
  var SOUL_LABELS = {};
  var RARITY_LABELS = {};
  var LABEL_TO_CODE = {};

  var SET_ORDER = ['Undertale', 'Deltarune', 'Undertale Yellow'];
  var RARITY_ORDER = ['BASE', 'COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'DETERMINATION', 'TOKEN'];

  var RARITY_COLOR_VAR = {
    BASE: '--rarity-base', COMMON: '--rarity-common', RARE: '--rarity-rare',
    EPIC: '--rarity-epic', LEGENDARY: '--rarity-legendary', TOKEN: '--rarity-token',
    DETERMINATION: '--rarity-determination'
  };
  var SOUL_COLOR_VAR = {
    BRAVERY: '--soul-bravery', KINDNESS: '--soul-kindness', PATIENCE: '--soul-patience',
    INTEGRITY: '--soul-integrity', JUSTICE: '--soul-justice', PERSEVERANCE: '--soul-perseverance',
    DETERMINATION: '--soul-determination'
  };

  var state = {
    search: '',
    sets: new Set(),
    rarities: new Set(),
    types: new Set(),
    souls: new Set(),
    tribes: new Set(),
    keywords: new Set(),
    costMin: null, costMax: null,
    atkMin: null, atkMax: null,
    hpMin: null, hpMax: null,
    sort: 'id-asc',
    view: 'list'
  };

  var visibleCount = PAGE_SIZE;
  var currentResults = [];

  // ---------------- helpers ----------------
  function $(sel) { return document.querySelector(sel); }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function cardMatchesGeneric(setState, cardValue) {
    if (setState.size === 0) return true;
    if (Array.isArray(cardValue)) return cardValue.some(function (v) { return setState.has(v); });
    return setState.has(cardValue);
  }

  // ---------------- data load ----------------
  function loadData() {
    return fetch('data/cards.json')
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load card data (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        CARDS = data.cards;
        GLOSSARY = data.glossary;
        TRIBE_LABELS = data.tribeLabels;
        SOUL_LABELS = data.soulLabels;
        RARITY_LABELS = data.rarityLabels;
        Object.keys(GLOSSARY).forEach(function (code) {
          LABEL_TO_CODE[GLOSSARY[code].label] = code;
        });
      });
  }

  // ---------------- filter UI ----------------
  function makeChip(container, opts, onToggle) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.setAttribute('aria-pressed', 'false');
    if (opts.colorVar) {
      var sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = 'var(' + opts.colorVar + ')';
      btn.appendChild(sw);
    }
    btn.appendChild(document.createTextNode(opts.label));
    btn.dataset.value = opts.value;
    btn.addEventListener('click', function () {
      var pressed = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', (!pressed).toString());
      onToggle(opts.value, !pressed);
    });
    container.appendChild(btn);
    return btn;
  }

  function buildGenericGroup(containerId, countId, items, targetSet) {
    var container = $(containerId);
    container.innerHTML = '';
    items.forEach(function (item) {
      makeChip(container, item, function (value, on) {
        if (on) targetSet.add(value); else targetSet.delete(value);
        updateGroupCount(countId, targetSet);
        updateActiveFilterCount();
        visibleCount = PAGE_SIZE;
        render();
      });
    });
    updateGroupCount(countId, targetSet);
  }

  function updateGroupCount(countId, targetSet) {
    var el = $(countId);
    if (!el) return;
    el.textContent = targetSet.size ? String(targetSet.size) : '';
  }

  function totalActiveFilters() {
    var n = 0;
    ['sets', 'rarities', 'types', 'souls', 'tribes', 'keywords'].forEach(function (k) {
      n += state[k].size;
    });
    ['costMin', 'costMax', 'atkMin', 'atkMax', 'hpMin', 'hpMax'].forEach(function (k) {
      if (state[k] !== null) n += 1;
    });
    if (state.search.trim()) n += 1;
    return n;
  }

  function updateActiveFilterCount() {
    var n = totalActiveFilters();
    var badge = $('#activeFilterCount');
    if (n > 0) {
      badge.hidden = false;
      badge.textContent = String(n);
    } else {
      badge.hidden = true;
    }
  }

  function buildFilterUI() {
    var sets = SET_ORDER.filter(function (s) { return CARDS.some(function (c) { return c.set === s; }); });
    buildGenericGroup('#group-set', '#count-set',
      sets.map(function (s) { return { value: s, label: s }; }), state.sets);

    var rarities = RARITY_ORDER.filter(function (r) { return CARDS.some(function (c) { return c.rarity === r; }); });
    buildGenericGroup('#group-rarity', '#count-rarity',
      rarities.map(function (r) { return { value: r, label: RARITY_LABELS[r] || r, colorVar: RARITY_COLOR_VAR[r] }; }), state.rarities);

    buildGenericGroup('#group-type', '#count-type',
      [{ value: 'Monster', label: 'Monster' }, { value: 'Spell', label: 'Spell' }], state.types);

    var souls = Object.keys(SOUL_LABELS).sort(function (a, b) { return SOUL_LABELS[a].localeCompare(SOUL_LABELS[b]); });
    buildGenericGroup('#group-soul', '#count-soul',
      souls.map(function (s) { return { value: s, label: SOUL_LABELS[s], colorVar: SOUL_COLOR_VAR[s] }; }), state.souls);

    var tribes = Object.keys(TRIBE_LABELS).sort(function (a, b) { return TRIBE_LABELS[a].localeCompare(TRIBE_LABELS[b]); });
    buildGenericGroup('#group-tribe', '#count-tribe',
      tribes.map(function (t) { return { value: t, label: TRIBE_LABELS[t] }; }), state.tribes);

    var keywordLabels = Object.keys(LABEL_TO_CODE).sort();
    buildGenericGroup('#group-keyword', '#count-keyword',
      keywordLabels.map(function (l) { return { value: l, label: l }; }), state.keywords);
  }

  function filterChipsBySearch(groupId, searchId) {
    var input = $(searchId);
    var container = $(groupId);
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      Array.from(container.children).forEach(function (chip) {
        var text = chip.textContent.toLowerCase();
        chip.style.display = text.indexOf(q) === -1 ? 'none' : '';
      });
    });
  }

  function setupRangeInputs() {
    function bind(id, key) {
      $(id).addEventListener('input', function (e) {
        var v = e.target.value;
        state[key] = v === '' ? null : Number(v);
        visibleCount = PAGE_SIZE;
        updateActiveFilterCount();
        render();
      });
    }
    bind('#costMin', 'costMin'); bind('#costMax', 'costMax');
    bind('#atkMin', 'atkMin'); bind('#atkMax', 'atkMax');
    bind('#hpMin', 'hpMin'); bind('#hpMax', 'hpMax');
  }

  function applyBoundsAsPlaceholders() {
    var costs = CARDS.map(function (c) { return c.cost; });
    var atks = CARDS.filter(function (c) { return c.atk != null; }).map(function (c) { return c.atk; });
    var hps = CARDS.filter(function (c) { return c.hp != null; }).map(function (c) { return c.hp; });
    $('#costMin').placeholder = Math.min.apply(null, costs);
    $('#costMax').placeholder = Math.max.apply(null, costs);
    $('#atkMin').placeholder = Math.min.apply(null, atks);
    $('#atkMax').placeholder = Math.max.apply(null, atks);
    $('#hpMin').placeholder = Math.min.apply(null, hps);
    $('#hpMax').placeholder = Math.max.apply(null, hps);
  }

  function resetFilters() {
    state.search = '';
    $('#search').value = '';
    ['sets', 'rarities', 'types', 'souls', 'tribes', 'keywords'].forEach(function (k) { state[k].clear(); });
    ['costMin', 'costMax', 'atkMin', 'atkMax', 'hpMin', 'hpMax'].forEach(function (k) {
      state[k] = null;
    });
    ['#costMin', '#costMax', '#atkMin', '#atkMax', '#hpMin', '#hpMax'].forEach(function (id) { $(id).value = ''; });
    Array.from(document.querySelectorAll('.chip')).forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
    ['#count-set', '#count-rarity', '#count-type', '#count-soul', '#count-tribe', '#count-keyword']
      .forEach(function (id) { $(id).textContent = ''; });
    $('#tribeSearch').value = '';
    $('#keywordSearch').value = '';
    Array.from(document.querySelectorAll('.chip')).forEach(function (c) { c.style.display = ''; });
    visibleCount = PAGE_SIZE;
    updateActiveFilterCount();
    render();
  }

  // ---------------- filtering + sorting ----------------
  function applyFilters() {
    var q = state.search.trim().toLowerCase();
    return CARDS.filter(function (c) {
      if (!cardMatchesGeneric(state.sets, c.set)) return false;
      if (!cardMatchesGeneric(state.rarities, c.rarity)) return false;
      if (!cardMatchesGeneric(state.types, c.type)) return false;
      if (!cardMatchesGeneric(state.souls, c.soul)) return false;
      if (!cardMatchesGeneric(state.tribes, c.tribes)) return false;
      if (!cardMatchesGeneric(state.keywords, c.keywords)) return false;

      if (state.costMin != null && c.cost < state.costMin) return false;
      if (state.costMax != null && c.cost > state.costMax) return false;
      if (state.atkMin != null && (c.atk == null || c.atk < state.atkMin)) return false;
      if (state.atkMax != null && (c.atk == null || c.atk > state.atkMax)) return false;
      if (state.hpMin != null && (c.hp == null || c.hp < state.hpMin)) return false;
      if (state.hpMax != null && (c.hp == null || c.hp > state.hpMax)) return false;

      if (q) {
        var hay = (c.name + ' ' + c.description).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function compareCards(a, b) {
    switch (state.sort) {
      case 'name-asc': return a.name.localeCompare(b.name);
      case 'name-desc': return b.name.localeCompare(a.name);
      case 'cost-asc': return (a.cost - b.cost) || a.name.localeCompare(b.name);
      case 'cost-desc': return (b.cost - a.cost) || a.name.localeCompare(b.name);
      case 'atk-desc': return ((b.atk == null ? -1 : b.atk) - (a.atk == null ? -1 : a.atk)) || a.name.localeCompare(b.name);
      case 'hp-desc': return ((b.hp == null ? -1 : b.hp) - (a.hp == null ? -1 : a.hp)) || a.name.localeCompare(b.name);
      default: return a.id - b.id;
    }
  }

  // ---------------- rendering ----------------
  function renderDescription(card) {
    var html = escapeHtml(card.description || '');
    var labels = card.keywords.slice().sort(function (a, b) { return b.length - a.length; });
    labels.forEach(function (label) {
      var re = new RegExp('\\b' + escapeRegex(escapeHtml(label)) + '\\b', 'g');
      html = html.replace(re, function (m) {
        return '<span class="kw" tabindex="0" data-kw="' + escapeHtml(label) + '">' + m + '</span>';
      });
    });
    return html;
  }

  function tileArtHtml(c) {
    var initial = (c.name || '?').trim().charAt(0).toUpperCase() || '?';
    if (!c.image) {
      return '<div class="tile-art-wrap no-art" data-initial="' + escapeHtml(initial) + '"></div>';
    }
    var src = IMAGE_BASE + c.image + '.' + IMAGE_EXTS[0];
    return '<div class="tile-art-wrap" data-initial="' + escapeHtml(initial) + '">' +
      '<img class="tile-art" src="' + escapeHtml(src) + '" data-slug="' + escapeHtml(c.image) + '" data-ext-index="0" alt="" loading="lazy">' +
      '</div>';
  }

  function setupImageFallback() {
    document.addEventListener('error', function (e) {
      var img = e.target;
      if (!img.classList || !img.classList.contains('tile-art')) return;
      var idx = parseInt(img.dataset.extIndex, 10) + 1;
      if (idx < IMAGE_EXTS.length) {
        img.dataset.extIndex = String(idx);
        img.src = IMAGE_BASE + img.dataset.slug + '.' + IMAGE_EXTS[idx];
      } else {
        var wrap = img.closest('.tile-art-wrap');
        if (wrap) wrap.classList.add('no-art');
        img.remove();
      }
    }, true);
  }

  function preloadFrameImages() {
    var promises = Object.keys(FRAME_IMAGES).map(function (key) {
      return new Promise(function (resolve) {
        var settled = false;
        function done(ok) {
          if (settled) return;
          settled = true;
          frameAvailable[key] = ok;
          resolve();
        }
        var img = new Image();
        img.onload = function () { done(true); };
        img.onerror = function () { done(false); };
        img.src = FRAME_IMAGES[key];
        // Safety net: never let a slow/non-firing image load hold up the
        // first render. If it resolves later, the next view switch or
        // re-render will pick up the (by-then-known) frameAvailable value.
        setTimeout(function () { done(false); }, 1500);
      });
    });
    return Promise.all(promises);
  }

  function frameCardHTML(c) {
    var frameKey = FRAME_IMAGES[c.type] ? c.type : null;
    var available = frameKey && frameAvailable[frameKey];
    var rarityVar = RARITY_COLOR_VAR[c.rarity] || '--border';
    var rarityLabel = RARITY_LABELS[c.rarity] || c.rarity;

    var styleParts = ['--tile-rarity:var(' + rarityVar + ')'];
    if (available) styleParts.push('--frame-img:url(' + FRAME_IMAGES[frameKey] + ')');

    var artInner = c.image
      ? '<img data-slug="' + escapeHtml(c.image) + '" data-ext-index="0" alt="" loading="lazy" src="' + escapeHtml(IMAGE_BASE + c.image + '.' + IMAGE_EXTS[0]) + '" class="tile-art">'
      : '<span class="frame-art-fallback">' + escapeHtml((c.name || '?').charAt(0).toUpperCase()) + '</span>';

    var atkHtml = c.type === 'Monster' ? escapeHtml(String(c.atk)) : '';
    var hpHtml = c.type === 'Monster' ? escapeHtml(String(c.hp)) : '';

    return '' +
      '<article class="frame-card' + (available ? '' : ' no-frame') + '" style="' + styleParts.join(';') + '" title="' + escapeHtml(c.name) + '">' +
      '<div class="frame-region frame-name">' + escapeHtml(c.name) + '</div>' +
      '<div class="frame-region frame-cost">' + c.cost + '</div>' +
      '<div class="frame-region frame-art">' + artInner + '</div>' +
      '<div class="frame-region frame-desc">' + (c.description ? renderDescription(c) : '<em>No effect text.</em>') + '</div>' +
      '<div class="frame-region frame-atk">' + atkHtml + '</div>' +
      '<div class="frame-region frame-rarity" style="--pill-color:var(' + rarityVar + ')">' + escapeHtml(rarityLabel) + '</div>' +
      '<div class="frame-region frame-hp">' + hpHtml + '</div>' +
      '</article>';
  }

  function cardTileHTML(c) {
    var rarityVar = RARITY_COLOR_VAR[c.rarity] || '--border';
    var stats = '<span class="stat-badge cost"><span class="stat-key">C</span>' + c.cost + '</span>';
    if (c.type === 'Monster') {
      stats += '<span class="stat-badge atk"><span class="stat-key">ATK</span>' + c.atk + '</span>';
      stats += '<span class="stat-badge hp"><span class="stat-key">HP</span>' + c.hp + '</span>';
    }

    var rarityLabel = RARITY_LABELS[c.rarity] || c.rarity;
    var meta = '<span class="meta-pill">' + escapeHtml(c.set) + '</span>';
    meta += '<span class="meta-pill rarity" style="--pill-color:var(' + rarityVar + ')">' + escapeHtml(rarityLabel) + '</span>';
    meta += '<span class="meta-pill">' + escapeHtml(c.type) + '</span>';
    if (c.soul) {
      var soulVar = SOUL_COLOR_VAR[c.soul] || '--border';
      meta += '<span class="meta-pill soul" style="--pill-color:var(' + soulVar + ')">' + escapeHtml(SOUL_LABELS[c.soul] || c.soul) + ' SOUL</span>';
    }
    var tribesHtml = '';
    if (c.tribes.length) {
      tribesHtml = '<div class="tile-tribes">' + c.tribes.map(function (t) {
        return '<span class="tribe-tag">' + escapeHtml(TRIBE_LABELS[t] || t) + '</span>';
      }).join('') + '</div>';
    }

    var descHtml = c.description
      ? '<p class="tile-desc">' + renderDescription(c) + '</p>'
      : '<p class="tile-desc empty">No effect text.</p>';

    return '' +
      '<article class="card-tile" style="--tile-rarity:var(' + rarityVar + ')">' +
      '<div class="tile-top-row">' +
      tileArtHtml(c) +
      '<div class="tile-content">' +
      '<div class="tile-top">' +
      '<div class="tile-name">' + escapeHtml(c.name) + '</div>' +
      '<div class="tile-stats">' + stats + '</div>' +
      '</div>' +
      '<div class="tile-meta">' + meta + '</div>' +
      tribesHtml +
      descHtml +
      '</div>' +
      '</div>' +
      '</article>';
  }

  function render() {
    var results = applyFilters();
    results.sort(compareCards);
    currentResults = results;

    var summary = $('#resultSummary');
    summary.innerHTML = 'Showing <strong>' + Math.min(visibleCount, results.length) + '</strong> of <strong>' + results.length + '</strong> cards' +
      (results.length !== CARDS.length ? ' (out of ' + CARDS.length + ' total)' : '');

    var grid = $('#cardGrid');
    var empty = $('#emptyState');
    var loadMore = $('#loadMore');

    if (results.length === 0) {
      grid.innerHTML = '';
      empty.hidden = false;
      loadMore.hidden = true;
      return;
    }
    empty.hidden = true;

    var slice = results.slice(0, visibleCount);
    grid.className = 'card-grid' + (state.view === 'cards' ? ' view-cards' : '');
    grid.innerHTML = slice.map(state.view === 'cards' ? frameCardHTML : cardTileHTML).join('');
    loadMore.hidden = visibleCount >= results.length;
  }

  // ---------------- tooltip ----------------
  function setupTooltip() {
    var tooltip = $('#tooltip');
    var current = null;

    function show(target) {
      var label = target.dataset.kw;
      var code = LABEL_TO_CODE[label];
      var info = code ? GLOSSARY[code] : null;
      var desc = info ? info.description : '';
      tooltip.innerHTML = '<strong>' + escapeHtml(label) + '</strong>' + escapeHtml(desc || 'No glossary entry found.');
      var rect = target.getBoundingClientRect();
      tooltip.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 296)) + 'px';
      var top = rect.bottom + 8;
      if (top + 120 > window.innerHeight) top = rect.top - 8;
      tooltip.style.top = (rect.bottom + 8 > window.innerHeight - 120 ? rect.top - 90 : rect.bottom + 8) + 'px';
      tooltip.hidden = false;
      current = target;
    }
    function hide() {
      tooltip.hidden = true;
      current = null;
    }

    document.addEventListener('mouseover', function (e) {
      var t = e.target.closest ? e.target.closest('.kw') : null;
      if (t) show(t);
    });
    document.addEventListener('mouseout', function (e) {
      var t = e.target.closest ? e.target.closest('.kw') : null;
      if (t && t === current) hide();
    });
    document.addEventListener('focusin', function (e) {
      var t = e.target.closest ? e.target.closest('.kw') : null;
      if (t) show(t);
    });
    document.addEventListener('focusout', function (e) {
      var t = e.target.closest ? e.target.closest('.kw') : null;
      if (t) hide();
    });
    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('.kw') : null;
      if (t) { e.preventDefault(); show(t); }
      else if (!e.target.closest('.kw-tooltip')) hide();
    });
    window.addEventListener('scroll', hide, true);
  }

  // ---------------- wiring ----------------
  function setupSearch() {
    $('#search').addEventListener('input', function (e) {
      state.search = e.target.value;
      visibleCount = PAGE_SIZE;
      updateActiveFilterCount();
      render();
    });
  }

  function setupSort() {
    $('#sortSelect').addEventListener('change', function (e) {
      state.sort = e.target.value;
      render();
    });
  }

  function setupLoadMore() {
    $('#loadMore').addEventListener('click', function () {
      visibleCount += PAGE_SIZE;
      render();
    });
  }

  function setupMobileFilterToggle() {
    var toggle = $('#filterToggle');
    var filters = $('#filters');
    toggle.addEventListener('click', function () {
      var open = filters.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open.toString());
    });
  }

  function setupViewToggle() {
    var listBtn = $('#viewList');
    var cardsBtn = $('#viewCards');
    function setView(v) {
      state.view = v;
      listBtn.setAttribute('aria-pressed', (v === 'list').toString());
      cardsBtn.setAttribute('aria-pressed', (v === 'cards').toString());
      render();
    }
    listBtn.addEventListener('click', function () { setView('list'); });
    cardsBtn.addEventListener('click', function () { setView('cards'); });
  }

  function init() {
    loadData().then(function () {
      buildFilterUI();
      applyBoundsAsPlaceholders();
      setupRangeInputs();
      setupSearch();
      setupSort();
      setupLoadMore();
      setupMobileFilterToggle();
      setupViewToggle();
      setupTooltip();
      setupImageFallback();
      filterChipsBySearch('#group-tribe', '#tribeSearch');
      filterChipsBySearch('#group-keyword', '#keywordSearch');
      $('#resetFilters').addEventListener('click', resetFilters);
      return preloadFrameImages();
    }).then(function () {
      render();
    }).catch(function (err) {
      $('#resultSummary').textContent = '';
      $('#cardGrid').innerHTML = '';
      var empty = $('#emptyState');
      empty.hidden = false;
      empty.textContent = 'Could not load card data: ' + err.message + '. Make sure data/cards.json is served alongside this page.';
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
