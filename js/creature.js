/*
 * creature.js — Le dessin de Lumi (SVG) et ses animations.
 *
 * Formes : 0 œuf, 1 bébé, 2 enfant, 3 ado, 4 adulte.
 * - Gestes ponctuels : classe « g-<geste> » (cligner, éternuer, bouder, bâiller…).
 * - États de santé : classes « c-<état> » (faim, repas, stress, sommeil, solitude…).
 * - Caractère : classes « v-radieux », « v-serein », « v-grognon ».
 * Toutes les animations sont en CSS (voir la constante CSS en bas du fichier).
 */
(function (root) {
  'use strict';

  var INK = '#10172A';
  var AMBER = '#FFB547';
  var BELLY = '#FFD891';
  var GLOW = '#FFE2A3';
  var FOOT = '#E89A2C';
  var WING = '#7EA2FF';
  var WING2 = '#A9C0FF';
  var CHEEK = '#FF8A5B';
  var FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

  /* ---------- Petit arbre SVG (rendu en texte ou en éléments DOM) ---------- */

  function push(arr, x) {
    if (x == null || x === false) return;
    if (Array.isArray(x)) x.forEach(function (y) { push(arr, y); });
    else arr.push(x);
  }
  function h(tag, attrs) {
    var kids = [];
    for (var i = 2; i < arguments.length; i++) push(kids, arguments[i]);
    return { tag: tag, attrs: attrs || {}, kids: kids };
  }
  function r1(n) { return Math.round(n * 10) / 10; }
  function tr(x, y) { return 'translate(' + r1(x) + ' ' + r1(y) + ')'; }

  function sparkle(x, y, s, fill, cls) {
    var a = s;
    var b = r1(s * 0.26);
    return h('path', {
      'class': cls || null,
      transform: tr(x, y),
      d: 'M0 ' + (-a) + ' L' + b + ' ' + (-b) + ' L' + a + ' 0 L' + b + ' ' + b + ' L0 ' + a + ' L' + (-b) + ' ' + b + ' L' + (-a) + ' 0 L' + (-b) + ' ' + (-b) + ' Z',
      fill: fill
    });
  }

  var STROKE = { stroke: INK, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' };
  function withStroke(extra) { return Object.assign({}, STROKE, extra); }

  function face(f) {
    function eye(s) {
      return h('g', { transform: tr(s * f.dx, 0) },
        h('g', { 'class': 'lid' },
          h('circle', { r: f.r, fill: INK }),
          h('circle', { cx: f.hl, cy: -f.hl, r: f.hl, fill: '#FFFFFF' })));
    }
    function brow(s) {
      return h('path', { d: 'M' + (s * (f.dx + 6)) + ' ' + (-f.r - 8) + ' L' + (s * (f.dx - 5)) + ' ' + (-f.r - 3) });
    }
    return h('g', { transform: tr(f.x, f.y) },
      h('g', { 'class': 'eyes' }, eye(-1), eye(1)),
      h('g', withStroke({ 'class': 'brows' }), brow(-1), brow(1)),
      h('circle', { 'class': 'cheek', cx: -f.cdx, cy: f.cdy, r: 5, fill: CHEEK }),
      h('circle', { 'class': 'cheek', cx: f.cdx, cy: f.cdy, r: 5, fill: CHEEK }),
      h('path', withStroke({ 'class': 'm m-smile', d: f.smile })),
      h('path', withStroke({ 'class': 'm m-pout', d: 'M-6 ' + (f.my + 5) + ' Q0 ' + (f.my - 1) + ' 6 ' + (f.my + 5) })),
      h('ellipse', { 'class': 'm m-o', cx: 0, cy: f.my + 3, rx: 4, ry: 5, fill: INK })
    );
  }

  function feet(y, ry) {
    return [
      h('ellipse', { cx: 62, cy: y, rx: 13, ry: ry, fill: FOOT }),
      h('ellipse', { cx: 98, cy: y, rx: 13, ry: ry, fill: FOOT })
    ];
  }
  function antenna(d, tx, ty, tr2) {
    return [
      h('path', { d: d, stroke: AMBER, 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }),
      h('circle', { 'class': 'tip', cx: tx, cy: ty, r: tr2, fill: GLOW })
    ];
  }

  /* Les 5 formes. `head` : centre et haut de la tête, pour placer bonnet et effets. */
  var PARTS = [
    { // 0 — Œuf
      head: { x: 80, top: 20, r: 46 },
      shadow: { cy: 148, rx: 36 },
      back: [],
      body: [
        h('path', { d: 'M80 20 C110 20 126 68 126 100 C126 128 106 146 80 146 C54 146 34 128 34 100 C34 68 50 20 80 20 Z', fill: '#F4EFE2' }),
        h('circle', { cx: 62, cy: 70, r: 8, fill: AMBER }),
        h('circle', { cx: 99, cy: 98, r: 11, fill: AMBER }),
        h('circle', { cx: 64, cy: 120, r: 6, fill: AMBER }),
        h('circle', { cx: 96, cy: 56, r: 5, fill: WING }),
        h('path', { d: 'M46 92 L56 85 L64 93 L73 85 L81 92', stroke: '#C9BFA6', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
      ],
      face: null,
      fx: { angry: null, puff: null, textY: 0, twinkle: false }
    },
    { // 1 — Bébé
      head: { x: 80, top: 58, r: 44 },
      shadow: { cy: 148, rx: 34 },
      back: antenna('M80 58 Q80 40 92 30', 93, 28, 8),
      body: [
        h('circle', { cx: 80, cy: 102, r: 44, fill: AMBER }),
        h('ellipse', { cx: 80, cy: 116, rx: 26, ry: 20, fill: BELLY })
      ],
      face: { x: 80, y: 96, dx: 15, r: 7, hl: 2.5, cdx: 25, cdy: 12, my: 12, smile: 'M-6 12 Q0 18 6 12' },
      fx: { angry: [118, 60], puff: [114, 110], textY: 8, twinkle: false }
    },
    { // 2 — Enfant
      head: { x: 80, top: 50, r: 48 },
      shadow: { cy: 150, rx: 40 },
      back: [
        h('path', { d: 'M46 66 Q34 44 48 37 Q61 34 64 56 Z', fill: AMBER }),
        h('path', { d: 'M114 66 Q126 44 112 37 Q99 34 96 56 Z', fill: AMBER }),
        antenna('M80 50 Q80 32 90 22', 91, 20, 8),
        h('ellipse', { cx: 60, cy: 144, rx: 13, ry: 7, fill: FOOT }),
        h('ellipse', { cx: 100, cy: 144, rx: 13, ry: 7, fill: FOOT })
      ],
      body: [
        h('circle', { cx: 80, cy: 98, r: 48, fill: AMBER }),
        h('ellipse', { cx: 80, cy: 114, rx: 30, ry: 24, fill: BELLY })
      ],
      face: { x: 80, y: 90, dx: 17, r: 8, hl: 3, cdx: 28, cdy: 13, my: 14, smile: 'M-8 14 Q0 22 8 14' },
      fx: { angry: [140, 60], puff: [122, 106], textY: 0, twinkle: false }
    },
    { // 3 — Ado
      head: { x: 80, top: 42, r: 44 },
      shadow: { cy: 152, rx: 40 },
      back: [
        h('path', { 'class': 'wing-l', d: 'M44 94 Q10 76 14 46 Q38 52 54 80 Z', fill: WING }),
        h('path', { 'class': 'wing-r', d: 'M116 94 Q150 76 146 46 Q122 52 106 80 Z', fill: WING }),
        antenna('M68 46 Q62 28 52 20', 51, 18, 7),
        antenna('M92 46 Q98 28 108 20', 109, 18, 7),
        feet(146, 6)
      ],
      body: [
        h('ellipse', { cx: 80, cy: 96, rx: 44, ry: 54, fill: AMBER }),
        h('ellipse', { cx: 80, cy: 116, rx: 28, ry: 27, fill: BELLY }),
        h('path', { d: 'M80 106 L83 113 L90 116 L83 119 L80 126 L77 119 L70 116 L77 113 Z', fill: '#FFFFFF' })
      ],
      face: { x: 80, y: 80, dx: 16, r: 8, hl: 3, cdx: 26, cdy: 12, my: 14, smile: 'M-7 14 Q0 20 7 14' },
      fx: { angry: [130, 26], puff: [122, 102], textY: -6, twinkle: false }
    },
    { // 4 — Adulte
      head: { x: 80, top: 42, r: 44 },
      shadow: { cy: 152, rx: 42 },
      back: [
        h('path', { 'class': 'wing-l', d: 'M44 100 Q4 86 6 42 Q36 46 54 80 Z', fill: WING }),
        h('path', { 'class': 'wing-r', d: 'M116 100 Q156 86 154 42 Q124 46 106 80 Z', fill: WING }),
        h('path', { 'class': 'wing-l', d: 'M44 112 Q16 116 8 94 Q30 88 48 100 Z', fill: WING2 }),
        h('path', { 'class': 'wing-r', d: 'M116 112 Q144 116 152 94 Q130 88 112 100 Z', fill: WING2 }),
        h('ellipse', { 'class': 'halo', cx: 80, cy: 24, rx: 26, ry: 7, fill: 'none', stroke: GLOW, 'stroke-width': 4 }),
        feet(146, 6)
      ],
      body: [
        h('ellipse', { cx: 80, cy: 96, rx: 44, ry: 54, fill: AMBER }),
        h('ellipse', { cx: 80, cy: 116, rx: 28, ry: 27, fill: BELLY }),
        h('path', { d: 'M80 102 L84 112 L94 116 L84 120 L80 130 L76 120 L66 116 L76 112 Z', fill: '#FFFFFF' })
      ],
      face: { x: 80, y: 80, dx: 16, r: 8, hl: 3, cdx: 26, cdy: 12, my: 14, smile: 'M-9 14 Q0 23 9 14' },
      fx: { angry: [126, 2], puff: [122, 102], textY: -10, twinkle: true }
    }
  ];

  /* Le bonnet de nuit, posé sur la tête (il suit les mouvements du corps). */
  function nightcap(P) {
    var hx = P.head.x;
    var top = P.head.top;
    var r = P.head.r;
    var x1 = hx - r * 0.62;
    var x2 = hx + r * 0.6;
    var by = top + r * 0.24;
    var tipX = hx + r * 0.98;
    var tipY = top - r * 0.5;
    return h('g', { 'class': 'fx-cond fx-cap' },
      h('path', {
        d: 'M' + r1(x1) + ' ' + r1(by) + ' Q' + r1(hx - r * 0.15) + ' ' + r1(top - r * 0.55) + ' ' + r1(tipX) + ' ' + r1(tipY) +
          ' Q' + r1(hx + r * 0.5) + ' ' + r1(top - r * 0.02) + ' ' + r1(x2) + ' ' + r1(by) + ' Z',
        fill: '#5B7BE0'
      }),
      h('path', { d: 'M' + r1(x1) + ' ' + r1(by) + ' Q' + r1(hx) + ' ' + r1(by - 7) + ' ' + r1(x2) + ' ' + r1(by), stroke: '#FFFFFF', 'stroke-width': 7, fill: 'none', 'stroke-linecap': 'round' }),
      h('circle', { cx: r1(tipX), cy: r1(tipY), r: 6, fill: '#FFFFFF' }));
  }

  /* Les effets des états de santé (cachés tant que l'état n'est pas actif). */
  function conditionEffects(P) {
    var hx = P.head.x;
    var top = P.head.top;
    var r = P.head.r;
    var drop = 'M0 -7 C3 -2 5 1 5 4 A5 5 0 0 1 -5 4 C-5 1 -3 -2 0 -7 Z';
    var dropStyle = { d: drop, fill: '#8CD3FF', stroke: '#FFFFFF', 'stroke-width': 1.5 };
    return [
      // Gouttes de sueur : processeur surchargé.
      h('g', { transform: tr(hx + r * 0.82, top + r * 0.5) }, h('path', Object.assign({ 'class': 'fx-cond fx-sweat' }, dropStyle))),
      h('g', { transform: tr(hx - r * 0.92, top + r * 0.8) }, h('path', Object.assign({ 'class': 'fx-cond fx-sweat s2' }, dropStyle))),
      // Zzz : sommeil.
      h('g', { transform: tr(hx + r * 0.55, top - 8) }, h('g', { 'class': 'fx-cond fx-zzz' },
        h('text', { x: 0, y: 0, 'font-size': 14, 'font-weight': 800, fill: '#DCE3FF', stroke: INK, 'stroke-width': 2, 'paint-order': 'stroke', 'font-family': FONT }, 'z'),
        h('text', { x: 11, y: -13, 'font-size': 19, 'font-weight': 800, fill: '#DCE3FF', stroke: INK, 'stroke-width': 2, 'paint-order': 'stroke', 'font-family': FONT }, 'Z'))),
      // Éclair : l'appareil se recharge (Lumi mange).
      h('g', { transform: tr(hx - r - 12, top + r * 0.85) }, h('path', { 'class': 'fx-cond fx-bolt', d: 'M3 -13 L-7 2 L-1 2 L-3 13 L7 -2 L1 -2 Z', fill: '#FFD43B', stroke: INK, 'stroke-width': 1.5, 'stroke-linejoin': 'round' })),
      // Pile presque vide : Lumi a faim.
      h('g', { transform: tr(hx - 13, top - 30) }, h('g', { 'class': 'fx-cond fx-battery' },
        h('rect', { x: 0, y: 0, width: 24, height: 12, rx: 3, fill: '#FFFFFF', stroke: INK, 'stroke-width': 2 }),
        h('rect', { x: 24, y: 3.5, width: 3, height: 5, rx: 1, fill: INK }),
        h('rect', { x: 2.5, y: 2.5, width: 5, height: 7, rx: 1, fill: '#E5484D' }))),
      // Point d'interrogation : pas de connexion.
      h('g', { transform: tr(hx + r * 0.85, top - 2) }, h('text', { 'class': 'fx-cond fx-question', 'font-size': 26, 'font-weight': 800, fill: '#B7C0D4', stroke: INK, 'stroke-width': 2, 'paint-order': 'stroke', 'font-family': FONT }, '?')),
      // Thermomètre : Lumi est malade.
      h('g', { transform: tr(hx + r + 8, top + r * 0.35) }, h('g', { 'class': 'fx-cond fx-thermo' },
        h('rect', { x: -3.5, y: -14, width: 7, height: 22, rx: 3.5, fill: '#FFFFFF', stroke: INK, 'stroke-width': 1.5 }),
        h('rect', { x: -1.5, y: -6, width: 3, height: 12, fill: '#E5484D' }),
        h('circle', { cx: 0, cy: 10, r: 5.5, fill: '#E5484D', stroke: INK, 'stroke-width': 1.5 })))
    ];
  }

  function effects(P) {
    var out = [];
    if (P.fx.twinkle) {
      out.push(sparkle(22, 30, 7, GLOW, 'twinkle'));
      out.push(sparkle(140, 132, 6, GLOW, 'twinkle t2'));
      out.push(sparkle(146, 20, 5, WING2, 'twinkle t3'));
    }
    out.push(h('g', { 'class': 'fx-item fx-joy' },
      sparkle(4, 34, 8, GLOW), sparkle(158, 36, 7, WING2), sparkle(156, 124, 6, GLOW), sparkle(2, 118, 5, WING2)));
    if (P.fx.angry) {
      out.push(h('g', { transform: tr(P.fx.angry[0], P.fx.angry[1]) },
        h('g', { 'class': 'fx-item fx-angry', stroke: '#E5484D', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' },
          h('path', { d: 'M-8 -3 Q-3 -3 -3 -8' }),
          h('path', { d: 'M3 -8 Q3 -3 8 -3' }),
          h('path', { d: 'M8 3 Q3 3 3 8' }),
          h('path', { d: 'M-3 8 Q-3 3 -8 3' }))));
    }
    if (P.fx.puff) {
      var cloud = { fill: '#FFFFFF', stroke: '#B7C0D4', 'stroke-width': 1.5 };
      out.push(h('g', { transform: tr(P.fx.puff[0], P.fx.puff[1]) },
        h('g', { 'class': 'fx-item fx-sneeze' },
          h('circle', Object.assign({ cx: 0, cy: 0, r: 6 }, cloud)),
          h('circle', Object.assign({ cx: 11, cy: -5, r: 8 }, cloud)),
          h('circle', Object.assign({ cx: 13, cy: 8, r: 5 }, cloud)))));
      out.push(h('g', { transform: tr(80, P.fx.textY) },
        h('text', {
          'class': 'fx-item fx-text', 'text-anchor': 'middle', 'font-family': FONT,
          'font-weight': 700, 'font-size': 15, fill: AMBER, stroke: INK, 'stroke-width': 3, 'paint-order': 'stroke', 'stroke-linejoin': 'round'
        }, 'Atchoum !')));
    }
    return out.concat(conditionEffects(P));
  }

  /** L'arbre SVG d'une forme de Lumi. */
  function tree(stage) {
    var P = PARTS[Math.max(0, Math.min(PARTS.length - 1, stage))];
    return h('svg', { 'class': 'lumi-svg', viewBox: '-24 -40 208 206', 'aria-hidden': 'true', focusable: 'false' },
      h('ellipse', { 'class': 'shadow', cx: 80, cy: P.shadow.cy, rx: P.shadow.rx, ry: 5, fill: '#000000', opacity: 0.22 }),
      h('g', { 'class': 'bob' }, h('g', { 'class': 'body' }, P.back, P.body, P.face ? face(P.face) : null, nightcap(P))),
      h('g', { 'class': 'fx' }, effects(P)));
  }

  function escText(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function toString(n, extraAttrs) {
    if (typeof n === 'string') return escText(n);
    var attrs = Object.assign({}, n.attrs, extraAttrs || {});
    var a = '';
    Object.keys(attrs).forEach(function (k) {
      if (attrs[k] == null) return;
      a += ' ' + k + '="' + String(attrs[k]).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"';
    });
    return '<' + n.tag + a + '>' + n.kids.map(function (k) { return toString(k); }).join('') + '</' + n.tag + '>';
  }
  function toDOM(n, doc) {
    doc = doc || document;
    if (typeof n === 'string') return doc.createTextNode(n);
    var el = doc.createElementNS('http://www.w3.org/2000/svg', n.tag);
    Object.keys(n.attrs).forEach(function (k) { if (n.attrs[k] != null) el.setAttribute(k, String(n.attrs[k])); });
    n.kids.forEach(function (k) { el.appendChild(toDOM(k, doc)); });
    return el;
  }

  /* ---------- Gestes ---------- */

  var GESTURES = {
    face: [
      { name: 'sneeze', ms: 1600 },
      { name: 'grumpy', ms: 2400 },
      { name: 'yawn', ms: 2200 },
      { name: 'look', ms: 2600 },
      { name: 'joy', ms: 1400 }
    ],
    egg: [
      { name: 'wobble', ms: 1600 },
      { name: 'shiver', ms: 1000 },
      { name: 'joy', ms: 1400 }
    ]
  };
  var ALL = GESTURES.face.concat(GESTURES.egg);

  /* Gestes favorisés selon l'état principal de Lumi. */
  var FAVORITES = {
    happy: ['joy', 'look'],
    eating: ['joy'],
    hungry: ['yawn', 'grumpy'],
    stressed: ['shiver', 'grumpy'],
    sleepy: ['yawn'],
    needsBreak: ['yawn', 'look'],
    lonely: ['look'],
    cramped: ['grumpy', 'shiver'],
    sick: ['shiver', 'yawn']
  };
  /* Rythme des gestes : agité quand il est stressé, lent quand il somnole. */
  var TEMPO = { stressed: 0.5, eating: 0.8, happy: 0.8, sleepy: 1.8, sick: 1.5, hungry: 1.4 };

  function find(name) {
    for (var i = 0; i < ALL.length; i++) if (ALL[i].name === name) return ALL[i];
    return null;
  }

  /**
   * Anime un élément porteur de la classe .lumi : clignements + gestes au hasard.
   * opts.getMood() renvoie l'état principal (voir FAVORITES).
   */
  function Animator(el, getStage, opts) {
    opts = opts || {};
    var minGap = opts.minGap || 5000;
    var maxGap = opts.maxGap || 12000;
    var alive = true;
    var current = null;
    var last = null;
    var tb, tb2, tg, te;
    function hidden() { return typeof document !== 'undefined' && document.hidden; }
    function mood() { return opts.getMood ? opts.getMood() : 'ok'; }

    function play(name) {
      var g = find(name);
      if (!g || !alive) return;
      clearTimeout(te);
      if (current) el.classList.remove('g-' + current);
      void el.getBoundingClientRect();
      current = name;
      el.classList.add('g-' + name);
      te = setTimeout(function () { el.classList.remove('g-' + name); current = null; }, g.ms);
    }
    function blinkOnce(done) {
      el.classList.add('blink');
      tb2 = setTimeout(function () { el.classList.remove('blink'); if (done) done(); }, 140);
    }
    function blinkLoop() {
      tb = setTimeout(function () {
        if (!alive) return;
        if (!hidden() && getStage() > 0 && !current && mood() !== 'sleepy') {
          blinkOnce(function () {
            if (Math.random() < 0.25) tb2 = setTimeout(function () { blinkOnce(); }, 160);
          });
        }
        blinkLoop();
      }, 2200 + Math.random() * 3600);
    }
    function gestureLoop() {
      var tempo = TEMPO[mood()] || 1;
      tg = setTimeout(function () {
        if (!alive) return;
        if (!hidden() && !current) {
          var base = getStage() === 0 ? GESTURES.egg : GESTURES.face;
          var pool = base.filter(function (g) { return g.name !== last; });
          (FAVORITES[mood()] || []).forEach(function (name) {
            var g = find(name);
            if (g && name !== last) pool.push(g, g, g);
          });
          var g = pool[Math.floor(Math.random() * pool.length)];
          if (g) {
            last = g.name;
            play(g.name);
          }
        }
        gestureLoop();
      }, (minGap + Math.random() * (maxGap - minGap)) * tempo);
    }
    blinkLoop();
    gestureLoop();
    return {
      play: play,
      busy: function () { return !!current; },
      stop: function () { alive = false; clearTimeout(tb); clearTimeout(tb2); clearTimeout(tg); clearTimeout(te); }
    };
  }

  /* ---------- Styles (portée .lumi) ---------- */

  var CSS = [
    '.lumi{line-height:0}',
    '.lumi .lumi-svg{display:block;width:100%;height:auto;overflow:visible;transition:filter .6s ease}',
    '.lumi .bob{transform-box:view-box;transform-origin:80px 150px;animation:lumi-breathe 3.2s ease-in-out infinite}',
    '.lumi .body{transform-box:view-box;transform-origin:80px 150px;transition:transform .6s ease}',
    '.lumi .shadow,.lumi .lid,.lumi .cheek,.lumi .m,.lumi .fx-item,.lumi .fx-cond,.lumi .halo{transform-box:fill-box;transform-origin:center}',
    '.lumi .lid{transition:transform 120ms ease-in}',
    '.lumi.blink .lid{transform:scaleY(.1)}',
    '.lumi .cheek{opacity:.55}',
    '.lumi .brows,.lumi .m-pout,.lumi .m-o,.lumi .fx-item{opacity:0}',
    '.lumi .fx-cond{opacity:0;transition:opacity .5s ease}',
    '.lumi .tip{animation:lumi-glow 2.6s ease-in-out infinite}',
    '.lumi .halo{animation:lumi-float 3s ease-in-out infinite}',
    '.lumi .twinkle{animation:lumi-twinkle 2.2s ease-in-out infinite}',
    '.lumi .twinkle.t2{animation-delay:.7s}',
    '.lumi .twinkle.t3{animation-delay:1.4s}',
    '.lumi .wing-l{transform-box:view-box;transform-origin:54px 84px;animation:lumi-flap-l 2.8s ease-in-out infinite}',
    '.lumi .wing-r{transform-box:view-box;transform-origin:106px 84px;animation:lumi-flap-r 2.8s ease-in-out infinite}',
    '@keyframes lumi-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.025,.975)}}',
    '@keyframes lumi-glow{0%,100%{opacity:.7}50%{opacity:1}}',
    '@keyframes lumi-float{0%,100%{transform:translateY(-1.5px)}50%{transform:translateY(1.5px)}}',
    '@keyframes lumi-twinkle{0%,100%{opacity:.25}50%{opacity:1}}',
    '@keyframes lumi-flap-l{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-6deg)}}',
    '@keyframes lumi-flap-r{0%,100%{transform:rotate(0deg)}50%{transform:rotate(6deg)}}',
    /* éternuer */
    '.lumi.g-sneeze .body{animation:lumi-sneeze 1.6s ease-in-out}',
    '.lumi.g-sneeze .lid{animation:lumi-squint 1.6s ease-in-out}',
    '.lumi.g-sneeze .m-smile{animation:lumi-hide-short 1.6s linear}',
    '.lumi.g-sneeze .m-o{animation:lumi-sneeze-mouth 1.6s ease-in-out}',
    '.lumi.g-sneeze .fx-sneeze{animation:lumi-puff 1.6s ease-out}',
    '.lumi.g-sneeze .fx-text{animation:lumi-text 1.6s ease-out}',
    '@keyframes lumi-sneeze{0%{transform:none}30%{transform:rotate(-6deg) scale(1.03,1.05)}46%{transform:rotate(-8deg) scale(1.05,1.08)}54%{transform:rotate(8deg) translateY(4px) scale(1.06,.9)}64%{transform:rotate(-3deg)}74%{transform:rotate(2deg)}100%{transform:none}}',
    '@keyframes lumi-squint{0%,18%{transform:none}32%,62%{transform:scaleY(.15)}76%,100%{transform:none}}',
    '@keyframes lumi-hide-short{0%,14%{opacity:1}18%,82%{opacity:0}88%,100%{opacity:1}}',
    '@keyframes lumi-sneeze-mouth{0%,14%{opacity:0;transform:scale(.4)}24%{opacity:1;transform:scale(.8)}46%{opacity:1;transform:scale(1.25)}54%{opacity:1;transform:scale(.5)}80%{opacity:1;transform:scale(.4)}86%,100%{opacity:0;transform:scale(.4)}}',
    '@keyframes lumi-puff{0%,50%{opacity:0;transform:translate(0,0) scale(.3)}58%{opacity:1;transform:translate(6px,0) scale(1)}100%{opacity:0;transform:translate(26px,-8px) scale(1.5)}}',
    '@keyframes lumi-text{0%,50%{opacity:0;transform:translateY(6px) scale(.7)}58%{opacity:1;transform:translateY(0) scale(1.15)}66%{transform:scale(1)}88%{opacity:1}100%{opacity:0;transform:translateY(-4px)}}',
    /* bouder */
    '.lumi.g-grumpy .body{animation:lumi-stomp 2.4s ease-in-out}',
    '.lumi.g-grumpy .brows,.lumi.g-grumpy .m-pout{animation:lumi-show 2.4s linear}',
    '.lumi.g-grumpy .m-smile{animation:lumi-hide-long 2.4s linear}',
    '.lumi.g-grumpy .cheek{animation:lumi-puff-cheek 2.4s ease-in-out}',
    '.lumi.g-grumpy .fx-angry{animation:lumi-pop 2.4s ease-out}',
    '@keyframes lumi-stomp{0%{transform:none}10%{transform:translateY(-6px)}18%{transform:scale(1.05,.95)}26%{transform:translateY(-6px)}34%{transform:scale(1.05,.95)}42%{transform:none}48%{transform:translateX(-2.5px)}54%{transform:translateX(2.5px)}60%{transform:translateX(-2.5px)}66%{transform:translateX(2.5px)}72%,100%{transform:none}}',
    '@keyframes lumi-show{0%,8%{opacity:0}14%,86%{opacity:1}94%,100%{opacity:0}}',
    '@keyframes lumi-hide-long{0%,8%{opacity:1}12%,88%{opacity:0}94%,100%{opacity:1}}',
    '@keyframes lumi-puff-cheek{0%,8%{opacity:.55;transform:none}18%,84%{opacity:.95;transform:scale(1.6)}100%{opacity:.55;transform:none}}',
    '@keyframes lumi-pop{0%,12%{opacity:0;transform:scale(.2)}20%{opacity:1;transform:scale(1.3)}26%{transform:scale(.9)}32%{transform:scale(1.12)}38%,84%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.6)}}',
    /* bâiller */
    '.lumi.g-yawn .body{animation:lumi-stretch 2.2s ease-in-out}',
    '.lumi.g-yawn .lid{animation:lumi-closed 2.2s ease-in-out}',
    '.lumi.g-yawn .m-smile{animation:lumi-hide-long 2.2s linear}',
    '.lumi.g-yawn .m-o{animation:lumi-yawn-mouth 2.2s ease-in-out}',
    '@keyframes lumi-stretch{0%{transform:none}30%,60%{transform:scale(.97,1.07)}76%{transform:scale(1.03,.96)}100%{transform:none}}',
    '@keyframes lumi-closed{0%,14%{transform:none}24%,70%{transform:scaleY(.1)}80%,100%{transform:none}}',
    '@keyframes lumi-yawn-mouth{0%,10%{opacity:0;transform:scale(.4)}26%{opacity:1;transform:scale(1.4,1.6)}60%{opacity:1;transform:scale(1.6,1.9)}80%{opacity:1;transform:scale(.6)}88%,100%{opacity:0;transform:scale(.4)}}',
    /* regarder autour */
    '.lumi.g-look .eyes{animation:lumi-look 2.6s ease-in-out}',
    '.lumi.g-look .body{animation:lumi-tilt 2.6s ease-in-out}',
    '@keyframes lumi-look{0%,8%{transform:none}20%,40%{transform:translateX(-4px)}55%,80%{transform:translateX(4px)}92%,100%{transform:none}}',
    '@keyframes lumi-tilt{0%,8%{transform:none}20%,40%{transform:rotate(-4deg)}55%,80%{transform:rotate(4deg)}92%,100%{transform:none}}',
    /* sautiller de joie */
    '.lumi.g-joy .body{animation:lumi-hop 1.4s ease-in-out}',
    '.lumi.g-joy .shadow{animation:lumi-shadow 1.4s ease-in-out}',
    '.lumi.g-joy .fx-joy{animation:lumi-sparkle 1.4s ease-out}',
    '@keyframes lumi-hop{0%{transform:none}10%{transform:scale(1.08,.9)}25%{transform:translateY(-16px) scale(.96,1.05)}40%{transform:scale(1.08,.92)}55%{transform:translateY(-11px)}70%{transform:scale(1.05,.95)}85%,100%{transform:none}}',
    '@keyframes lumi-shadow{0%,40%,70%,100%{transform:none}25%{transform:scale(.7)}55%{transform:scale(.8)}}',
    '@keyframes lumi-sparkle{0%,8%{opacity:0;transform:scale(.3)}30%{opacity:1;transform:scale(1.1)}70%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.7)}}',
    /* œuf */
    '.lumi.g-wobble .body{animation:lumi-wobble 1.6s ease-in-out}',
    '.lumi.g-shiver .body{animation:lumi-shiver 1s linear}',
    '@keyframes lumi-wobble{0%{transform:none}15%{transform:rotate(-10deg)}30%{transform:rotate(8deg)}45%{transform:rotate(-6deg)}60%{transform:rotate(4deg)}75%{transform:rotate(-2deg)}100%{transform:none}}',
    '@keyframes lumi-shiver{0%,100%{transform:none}10%,30%,50%,70%,90%{transform:translateX(-2px)}20%,40%,60%,80%{transform:translateX(2px)}}',
    /* États de santé */
    '.lumi.c-stressed .fx-sweat{opacity:1;animation:lumi-drip 1.3s ease-in infinite}',
    '.lumi.c-stressed .fx-sweat.s2{animation-delay:.6s}',
    '.lumi.c-stressed .bob{animation-duration:1.1s}',
    '.lumi.c-sleepy .fx-zzz{opacity:1;animation:lumi-zzz 2.8s ease-in-out infinite}',
    '.lumi.c-sleepy .fx-cap{opacity:1}',
    '.lumi.c-sleepy .lid{transform:scaleY(.12)}',
    '.lumi.c-sleepy .bob{animation-duration:5.5s}',
    '.lumi.c-eating .fx-bolt{opacity:1;animation:lumi-pulse 1s ease-in-out infinite}',
    '.lumi.c-eating .m-o{animation:lumi-chomp .7s steps(1) infinite}',
    '.lumi.c-hungry .fx-battery{opacity:1;animation:lumi-flash 1.4s steps(1) infinite}',
    '.lumi.c-hungry .lid{transform:scaleY(.55)}',
    '.lumi.c-hungry .bob{animation-duration:4.6s}',
    '.lumi.c-hungry .body{transform:translateY(5px) scale(1.04,.94)}',
    '.lumi.c-lonely .fx-question{opacity:1;animation:lumi-float 2.4s ease-in-out infinite}',
    '.lumi.c-lonely .lumi-svg{filter:saturate(.55)}',
    '.lumi.c-cramped .body{transform:scale(1.1,.88)}',
    '.lumi.c-sick .lumi-svg{filter:hue-rotate(45deg) saturate(.7)}',
    '.lumi.c-sick .fx-thermo{opacity:1}',
    '.lumi.c-sick .bob{animation-duration:5s}',
    '.lumi.c-happy .fx-joy{animation:lumi-sparkle 2.6s ease-out infinite}',
    '@keyframes lumi-drip{0%{opacity:0;transform:translateY(-4px)}25%{opacity:1}100%{opacity:0;transform:translateY(12px)}}',
    '@keyframes lumi-zzz{0%{opacity:0;transform:translate(0,6px)}30%{opacity:1}100%{opacity:0;transform:translate(10px,-14px)}}',
    '@keyframes lumi-pulse{0%,100%{opacity:.55;transform:scale(.9)}50%{opacity:1;transform:scale(1.12)}}',
    '@keyframes lumi-chomp{0%{opacity:0}50%{opacity:1}}',
    '@keyframes lumi-flash{0%{opacity:1}50%{opacity:.25}}',
    /* Caractère */
    '.lumi.v-radieux .fx-joy{animation:lumi-sparkle 3.2s ease-out infinite}',
    '.lumi.v-grognon .brows{opacity:.85}',
    '.lumi.v-grognon .m-smile{opacity:0}',
    '.lumi.v-grognon .m-pout{opacity:1}',
    '.lumi.v-grognon .lumi-svg{filter:saturate(.75)}',
    '@media (prefers-reduced-motion:reduce){.lumi *{animation:none!important;transition:none!important}}'
  ].join('\n');

  var api = { tree: tree, toString: toString, toDOM: toDOM, Animator: Animator, CSS: CSS, PARTS_COUNT: PARTS.length };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LumiCreature = api;
})(typeof window !== 'undefined' ? window : globalThis);
