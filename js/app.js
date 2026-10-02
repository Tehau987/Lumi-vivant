/*
 * app.js — L'interface de Lumi Vivant.
 *
 * Toutes les 5 secondes : le temps passe (vie.js), les capteurs sont lus
 * (capteurs.js), la santé est recalculée et Lumi est redessiné (creature.js).
 * La vie de Lumi est enregistrée dans le navigateur (localStorage).
 */
(function () {
  'use strict';

  const Vie = window.LumiVie;
  const C = window.LumiCreature;
  const Capteurs = window.LumiCapteurs;
  const STORAGE_KEY = 'lumi-vivant-v1';
  const TICK_MS = 5000;
  const BREAK_MS = 5 * 60 * 1000;

  let life = null;
  let vitals = null;
  let readings = null;
  let anim = null;
  let drawnShape = null;
  let condClasses = [];
  let lastSave = 0;
  let chartKey = '';
  let pauseEnd = null;
  let pauseTimer = null;
  let renderQueued = false;

  /* ---------- Petits outils ---------- */

  const $ = id => document.getElementById(id);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else node.setAttribute(key, value === true ? '' : value);
    });
    [].concat(children || []).forEach(child => {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function svgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function minutes(m) {
    return Vie.formatDuration(Math.max(0, m) * 60 * 1000);
  }

  function clock(ms) {
    return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function periodOf(hour) {
    if (hour >= 6 && hour < 10) return 'matin';
    if (hour >= 10 && hour < 18) return 'jour';
    if (hour >= 18 && hour < 21) return 'soir';
    return 'nuit';
  }

  /* ---------- Sauvegarde ---------- */

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { /* stockage indisponible */ }
    if (raw) {
      try { return Vie.importJson(raw, Date.now()); } catch (e) { /* sauvegarde illisible */ }
    }
    return Vie.newLife(Date.now());
  }

  function save() {
    if (!life) return;
    try { localStorage.setItem(STORAGE_KEY, Vie.exportJson(life)); } catch (e) { /* stockage indisponible */ }
    lastSave = Date.now();
  }

  /* ---------- Messages ---------- */

  let toastTimer = null;
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3400);
  }

  let bubbleTimer = null;
  function say(text) {
    const b = $('bubble');
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => b.classList.remove('show'), 3000);
  }

  const CHATTER = {
    happy: ['Je me sens super bien !', 'Quelle belle journée !'],
    eating: ['Miam, de l\'énergie !', 'Ça recharge !'],
    hungry: ['J\'ai faim… du courant ?', 'Mon ventre gargouille…'],
    stressed: ['Ouf, c\'est intense !', 'Je transpire…'],
    sleepy: ['Zzz…', 'Encore cinq minutes…'],
    needsBreak: ['On fait une pause ?', 'Mes yeux piquent un peu…'],
    lonely: ['Il y a quelqu\'un ?', 'Je ne capte plus rien…'],
    cramped: ['Je suis tout serré…', 'Un peu de place ?'],
    sick: ['Je ne me sens pas bien…', 'Prends soin de nous…'],
    ok: ['Coucou !', 'Je suis là.', 'On est bien, non ?']
  };

  /* ---------- Le cœur : le temps et la santé ---------- */

  function currentUsage(now, r) {
    return r && r.agentUsage ? Vie.usageFromAgent(r.agentUsage) : Vie.usageSummary(life.usage, now);
  }

  function computeVitals(now) {
    readings = Capteurs.read();
    const usage = currentUsage(now, readings);
    vitals = Vie.computeVitals({
      battery: readings.battery,
      stress: readings.stress,
      memory: readings.memory,
      disk: readings.disk,
      temperature: readings.temperature,
      online: readings.online,
      connection: readings.connection,
      usage: usage,
      hour: new Date(now).getHours(),
      care: life.care,
      name: life.name
    });
    vitals.usage = usage;
    return vitals;
  }

  function tick() {
    const now = Date.now();
    const step = Vie.advance(life, now);
    life = step.life;
    const r = Capteurs.read();
    life.usage = Vie.tickUsage(life.usage, now, r.active, new Date(now).getHours());
    computeVitals(now);
    life = Vie.updateCare(life, vitals.health, step.livedDelta);
    life = Vie.addSample(life, now, vitals.health, vitals.main);
    const growth = Vie.checkGrowth(life);
    life = growth.life;
    if (growth.grew) showEvolution(growth);
    render();
    if (now - lastSave > 30000) save();
  }

  function scheduleRender() {
    if (renderQueued || !life) return;
    renderQueued = true;
    setTimeout(() => {
      renderQueued = false;
      computeVitals(Date.now());
      render();
    }, 500);
  }

  /* ---------- Affichage ---------- */

  function render() {
    const now = Date.now();
    const info = Vie.stageInfo(life.lived);
    const st = info.stage;
    const pet = $('pet');

    if (drawnShape !== st.shape) {
      clear(pet);
      pet.appendChild(C.toDOM(C.tree(st.shape)));
      drawnShape = st.shape;
    }
    pet.style.width = Math.round(st.width * (0.85 + 0.15 * info.progress)) + 'px';

    // États de santé et caractère : on ajoute et retire seulement ce qui change
    // (l'animateur gère ses propres classes de gestes).
    const variant = Vie.currentVariant(life);
    const wanted = vitals.conditions.map(c => 'c-' + c);
    if (variant) wanted.push('v-' + variant);
    condClasses.filter(c => wanted.indexOf(c) === -1).forEach(c => pet.classList.remove(c));
    wanted.filter(c => condClasses.indexOf(c) === -1).forEach(c => pet.classList.add(c));
    condClasses = wanted;

    $('habitat').dataset.period = periodOf(new Date(now).getHours());
    $('petName').textContent = life.name;
    document.title = life.name + ' — Lumi Vivant';
    $('stageName').textContent = st.name + (variant ? ' ' + Vie.VARIANTS[variant].label.toLowerCase() : '');
    $('ageText').textContent = Vie.formatDuration(life.lived);
    $('growBar').style.width = Math.round(info.progress * 100) + '%';
    $('growBarWrap').setAttribute('aria-valuenow', String(Math.round(info.progress * 100)));
    $('growText').textContent = info.next
      ? 'Devient ' + info.next.name.toLowerCase() + ' dans ' + Vie.formatDuration(info.remaining / life.speed)
      : 'Adulte : il profite de la vie avec toi.';
    const vt = $('variantText');
    if (variant) {
      vt.hidden = false;
      vt.textContent = 'Caractère : ' + Vie.VARIANTS[variant].label + ' — ' + Vie.VARIANTS[variant].text + '.';
    } else {
      vt.hidden = true;
    }
    $('feeling').textContent = vitals.message;
    $('healthValue').textContent = String(vitals.health);

    renderVitals();
    renderUsage(now);
    renderSensor();
    renderChart(now);
  }

  const VITALS = [
    ['energie', 'Énergie', 'batterie'],
    ['calme', 'Calme', 'processeur'],
    ['espace', 'Espace', 'mémoire, disque'],
    ['lien', 'Lien', 'connexion'],
    ['repos', 'Repos', 'tes pauses']
  ];
  const SOURCE_TAG = { navigateur: 'mesuré', capteur: 'capteur PC', pression: 'mesuré', fluidite: 'estimé' };

  function renderVitals() {
    const box = $('vitals');
    clear(box);
    VITALS.forEach(([key, label, sub]) => {
      const g = vitals.gauges[key];
      const off = g.value === null;
      const fill = el('div', { class: 'fill' });
      fill.style.width = (off ? 0 : g.value) + '%';
      const cls = off ? 'off' : g.value >= 60 ? 'good' : g.value < 30 ? 'low' : '';
      box.appendChild(el('div', { class: 'vital ' + cls }, [
        el('div', { class: 'name' }, [label, el('span', { text: sub })]),
        el('div', { class: 'bar', role: 'progressbar', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': off ? null : String(g.value) }, [fill]),
        el('div', { class: 'value', text: off ? '–' : String(g.value) }),
        el('div', { class: 'detail' }, [g.detail, el('span', { class: 'tag', text: off ? 'indisponible' : SOURCE_TAG[g.source] || 'mesuré' })])
      ]));
    });
  }

  function renderUsage(now) {
    const u = vitals.usage;
    const grid = $('usageGrid');
    clear(grid);
    [
      [minutes(u.activeTodayMin), 'Aujourd\'hui'],
      [u.onBreak ? 'En pause' : minutes(u.sessionMin), 'Session en cours'],
      [u.lastBreak ? 'il y a ' + Vie.formatDuration(now - u.lastBreak) : 'Aucune', 'Dernière pause'],
      [minutes(u.nightTodayMin), 'Après 23 h']
    ].forEach(([value, label]) => {
      grid.appendChild(el('div', { class: 'stat' }, [el('strong', { text: value }), el('span', { text: label })]));
    });
    let note;
    if (u.source === 'capteur') note = 'Mesuré par le capteur PC : tout le temps où l\'ordinateur est utilisé, même appli fermée.';
    else if (readings.idle.granted) note = 'Mesuré pendant que Lumi est ouvert ; les pauses sont détectées sur tout l\'appareil.';
    else note = 'Mesuré pendant que Lumi est ouvert dans ce navigateur. Une veille de plus de 5 min compte comme une pause.';
    $('usageNote').textContent = note;
    $('idleBtn').hidden = !(readings.idle.supported && !readings.idle.granted && !readings.agentConnected);
  }

  function renderSensor() {
    const chip = $('sourceChip');
    const box = $('sensorInfo');
    clear(box);
    if (readings.agentConnected) {
      chip.textContent = 'Capteur PC connecté';
      chip.classList.add('on');
      const info = readings.agentInfo || {};
      box.appendChild(el('span', { text: 'Capteur PC connecté' + (info.systeme ? ' : ' + info.systeme : '') + (info.machine ? ' · ' + info.machine : '') + '. Les mesures sont complètes.' }));
    } else {
      chip.textContent = 'Navigateur seul';
      chip.classList.remove('on');
      box.appendChild(el('span', { text: 'Capteur PC non connecté : seules les mesures du navigateur sont utilisées. Sur ordinateur, lance « Lancer Lumi (Windows).bat », ou dans un terminal : ' }));
      box.appendChild(el('code', { text: 'python3 capteur/lumi_capteur.py' }));
    }
  }

  /* ---------- Carnet de santé ---------- */

  function chartSeries(now) {
    const local = { source: 'navigateur', points: life.samples.filter(s => now - s.t <= Vie.DAY).map(s => ({ t: s.t, h: s.h })) };
    const hist = readings && readings.agentHistory;
    if (!hist || !hist.length) return local;
    const step = 5 * Vie.MIN;
    const buckets = new Map();
    hist.forEach(s => {
      const t = s.t * 1000;
      if (now - t > Vie.DAY) return;
      const key = Math.floor(t / step);
      const b = buckets.get(key) || { t: key * step + step / 2, sum: 0, n: 0 };
      b.sum += Vie.healthFromAgentSample(s);
      b.n += 1;
      buckets.set(key, b);
    });
    const agent = { source: 'capteur', points: Array.from(buckets.values()).sort((a, b) => a.t - b.t).map(b => ({ t: b.t, h: Math.round(b.sum / b.n) })) };
    // Le capteur vient peut-être de démarrer : on garde le carnet le plus fourni.
    return agent.points.length >= local.points.length ? agent : local;
  }

  function renderChart(now) {
    const series = chartSeries(now);
    const pts = series.points;
    const key = series.source + ':' + pts.length + ':' + (pts.length ? pts[pts.length - 1].t + ':' + pts[pts.length - 1].h : '');
    if (key === chartKey) return;
    chartKey = key;

    const box = $('chart');
    clear(box);
    const table = $('chartTable');
    clear(table);
    if (pts.length < 2) {
      box.appendChild(el('div', { class: 'empty', text: 'Le carnet se remplit : un point toutes les 5 minutes.' }));
      $('chartSummary').textContent = series.source === 'capteur' ? '' : 'Le carnet note la santé de Lumi pendant qu\'il est ouvert.';
      return;
    }

    const W = 600;
    const H = 170;
    const L = 34;
    const R = 12;
    const T = 10;
    const B = 26;
    const x0 = now - Vie.DAY;
    const xs = t => L + ((t - x0) / Vie.DAY) * (W - L - R);
    const ys = v => T + (1 - v / 100) * (H - T - B);

    const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Santé de Lumi sur les dernières 24 heures' });
    const grid = svgEl('g', { class: 'grid' });
    const axis = svgEl('g', { class: 'axis' });
    [0, 50, 100].forEach(v => {
      grid.appendChild(svgEl('line', { x1: L, x2: W - R, y1: ys(v), y2: ys(v) }));
      const label = svgEl('text', { x: L - 8, y: ys(v) + 4, 'text-anchor': 'end' });
      label.textContent = String(v);
      axis.appendChild(label);
    });
    const firstTick = new Date(x0);
    firstTick.setMinutes(0, 0, 0);
    for (let t = firstTick.getTime() + Vie.HOUR; t <= now; t += Vie.HOUR) {
      const hour = new Date(t).getHours();
      if (hour % 6 !== 0) continue;
      const label = svgEl('text', { x: xs(t), y: H - 6, 'text-anchor': 'middle' });
      label.textContent = hour + ' h';
      axis.appendChild(label);
    }
    svg.appendChild(grid);
    svg.appendChild(axis);

    // Courbe coupée là où il n'y a pas eu de mesure (appli fermée, appareil éteint).
    const segments = [];
    let current = [];
    pts.forEach((p, i) => {
      if (i > 0 && p.t - pts[i - 1].t > 15 * Vie.MIN) {
        segments.push(current);
        current = [];
      }
      current.push(p);
    });
    segments.push(current);
    segments.forEach(seg => {
      if (seg.length === 1) {
        svg.appendChild(svgEl('circle', { class: 'dot', cx: xs(seg[0].t), cy: ys(seg[0].h), r: 3 }));
        return;
      }
      const line = seg.map((p, i) => (i ? 'L' : 'M') + xs(p.t).toFixed(1) + ' ' + ys(p.h).toFixed(1)).join(' ');
      const area = line + ' L' + xs(seg[seg.length - 1].t).toFixed(1) + ' ' + ys(0) + ' L' + xs(seg[0].t).toFixed(1) + ' ' + ys(0) + ' Z';
      svg.appendChild(svgEl('path', { class: 'area', d: area }));
      svg.appendChild(svgEl('path', { class: 'line', d: line }));
    });

    // Survol : trait vertical, point et bulle sur la mesure la plus proche.
    const cursor = svgEl('line', { class: 'cursor', y1: T, y2: H - B, visibility: 'hidden' });
    const dot = svgEl('circle', { class: 'dot', r: 5, visibility: 'hidden' });
    const hit = svgEl('rect', { x: L, y: 0, width: W - L - R, height: H, fill: 'transparent' });
    svg.appendChild(cursor);
    svg.appendChild(dot);
    svg.appendChild(hit);
    const tip = el('div', { class: 'tip' });
    tip.hidden = true;
    hit.addEventListener('pointermove', event => {
      const rect = svg.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * W;
      let best = pts[0];
      pts.forEach(p => { if (Math.abs(xs(p.t) - x) < Math.abs(xs(best.t) - x)) best = p; });
      cursor.setAttribute('x1', xs(best.t));
      cursor.setAttribute('x2', xs(best.t));
      dot.setAttribute('cx', xs(best.t));
      dot.setAttribute('cy', ys(best.h));
      cursor.setAttribute('visibility', 'visible');
      dot.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.textContent = clock(best.t) + ' · santé ' + best.h + '/100';
      tip.style.left = Math.min(85, Math.max(15, (xs(best.t) / W) * 100)) + '%';
    });
    hit.addEventListener('pointerleave', () => {
      cursor.setAttribute('visibility', 'hidden');
      dot.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    });
    box.appendChild(svg);
    box.appendChild(tip);

    // Résumé et tableau (lisibles sans voir le graphique).
    const values = pts.map(p => p.h);
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    const minP = pts.reduce((a, b) => (b.h < a.h ? b : a));
    const maxP = pts.reduce((a, b) => (b.h > a.h ? b : a));
    $('chartSummary').textContent = 'Moyenne ' + avg + '/100 · plus bas ' + minP.h + ' à ' + clock(minP.t) + ' · plus haut ' + maxP.h + ' à ' + clock(maxP.t) +
      (series.source === 'capteur' ? ' · d\'après le capteur PC.' : ' · pendant que Lumi était ouvert.');
    const byHour = new Map();
    pts.forEach(p => {
      const d = new Date(p.t);
      d.setMinutes(0, 0, 0);
      const k = d.getTime();
      const b = byHour.get(k) || { sum: 0, n: 0 };
      b.sum += p.h;
      b.n += 1;
      byHour.set(k, b);
    });
    table.appendChild(el('tr', {}, [el('th', { text: 'Heure' }), el('th', { text: 'Santé moyenne' })]));
    Array.from(byHour.entries()).sort((a, b) => b[0] - a[0]).forEach(([k, b]) => {
      table.appendChild(el('tr', {}, [el('td', { text: new Date(k).getHours() + ' h' }), el('td', { text: String(Math.round(b.sum / b.n)) })]));
    });
  }

  /* ---------- Il grandit ---------- */

  function showEvolution(growth) {
    const before = Vie.STAGES[growth.from];
    const after = Vie.STAGES[growth.to];
    $('evoTitle').textContent = growth.from === 0
      ? 'L\'œuf éclot : voici bébé ' + life.name + ' !'
      : life.name + ' devient ' + after.name.toLowerCase() + ' !';
    $('evoText').textContent = growth.variant
      ? 'Caractère : ' + Vie.VARIANTS[growth.variant].label + ' — ' + Vie.VARIANTS[growth.variant].text + '.'
      : 'Il grandit avec toi et avec ton appareil.';
    clear($('evoBefore'));
    clear($('evoAfter'));
    $('evoBefore').appendChild(C.toDOM(C.tree(before.shape)));
    $('evoAfter').appendChild(C.toDOM(C.tree(after.shape)));
    $('evoAfter').className = 'lumi evo-after g-joy' + (growth.variant ? ' v-' + growth.variant : '');
    $('evoOverlay').hidden = false;
    $('evoClose').focus();
    save();
  }

  function closeEvolution() {
    $('evoOverlay').hidden = true;
    $('pet').focus();
    anim.play('joy');
  }

  /* ---------- Pause ---------- */

  function startBreak() {
    pauseEnd = Date.now() + BREAK_MS;
    const box = $('breakPet');
    clear(box);
    box.appendChild(C.toDOM(C.tree(drawnShape || 0)));
    $('breakOverlay').hidden = false;
    $('breakStop').focus();
    updateBreak();
    pauseTimer = setInterval(updateBreak, 1000);
  }

  function updateBreak() {
    const left = Math.max(0, pauseEnd - Date.now());
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    $('breakCountdown').textContent = m + ':' + (s < 10 ? '0' : '') + s;
    if (left === 0) endBreak(true);
  }

  function endBreak(completed) {
    clearInterval(pauseTimer);
    pauseTimer = null;
    pauseEnd = null;
    $('breakOverlay').hidden = true;
    if (completed) {
      life.usage = Vie.takeBreak(life.usage, Date.now());
      save();
      computeVitals(Date.now());
      render();
      toast('Pause terminée : ' + life.name + ' est tout reposé !');
      anim.play('joy');
    } else {
      toast('Pause interrompue. Lumi t\'attendra pour la prochaine !');
    }
  }

  /* ---------- Réglages ---------- */

  function exportLife() {
    const blob = new Blob([Vie.exportJson(life)], { type: 'application/json' });
    const link = el('a', { href: URL.createObjectURL(blob), download: 'lumi-vivant-' + Vie.dayKey(Date.now()) + '.json' });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function bindSettings() {
    const name = $('nameInput');
    name.value = life.name;
    name.addEventListener('change', () => {
      life.name = name.value.trim().slice(0, 24) || 'Lumi';
      name.value = life.name;
      save();
      render();
    });

    const speed = $('speedSelect');
    Vie.SPEEDS.forEach(s => speed.appendChild(el('option', { value: String(s.value), text: s.label, selected: s.value === life.speed })));
    speed.addEventListener('change', () => {
      life = Vie.advance(life, Date.now()).life;
      life.speed = Number(speed.value);
      save();
      render();
      toast(life.speed === 1 ? 'Retour au temps réel.' : 'Le temps de Lumi s\'accélère !');
    });

    $('exportBtn').addEventListener('click', exportLife);
    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', event => {
      const file = event.target.files[0];
      if (!file) return;
      file.text().then(text => {
        try {
          life = Vie.importJson(text, Date.now());
          drawnShape = null;
          chartKey = '';
          name.value = life.name;
          speed.value = String(life.speed);
          save();
          tick();
          toast('Sauvegarde importée.');
        } catch (e) {
          toast(e.message);
        }
      });
    });
    $('resetBtn').addEventListener('click', () => {
      if (!window.confirm('Recommencer avec un nouvel œuf ? La vie actuelle de ' + life.name + ' sera effacée.')) return;
      life = Vie.newLife(Date.now(), life.name);
      drawnShape = null;
      chartKey = '';
      speed.value = '1';
      save();
      tick();
      toast('Un nouvel œuf ! Prends-en soin.');
    });
  }

  /* ---------- Démarrage ---------- */

  function start() {
    const style = document.createElement('style');
    style.textContent = C.CSS;
    document.head.appendChild(style);

    life = load();
    // Le temps a passé pendant que l'appli était fermée : Lumi a vieilli.
    life = Vie.advance(life, Date.now()).life;

    Capteurs.start(scheduleRender);
    anim = C.Animator($('pet'), () => drawnShape || 0, {
      minGap: 4500,
      maxGap: 10000,
      getMood: () => (vitals ? vitals.main : 'ok')
    });

    $('pet').addEventListener('click', () => {
      const lines = CHATTER[vitals ? vitals.main : 'ok'] || CHATTER.ok;
      if (!anim.busy()) anim.play(drawnShape === 0 ? 'wobble' : 'joy');
      say(drawnShape === 0 ? '… crac ?' : lines[Math.floor(Math.random() * lines.length)]);
    });
    $('breakBtn').addEventListener('click', startBreak);
    $('breakStop').addEventListener('click', () => endBreak(false));
    $('idleBtn').addEventListener('click', async () => {
      const ok = await Capteurs.requestIdleDetection();
      toast(ok ? 'Lumi détecte maintenant tes pauses sur tout l\'appareil.' : 'Autorisation refusée ou indisponible.');
      render();
    });
    $('evoClose').addEventListener('click', closeEvolution);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (!$('evoOverlay').hidden) closeEvolution();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save();
      else tick();
    });
    window.addEventListener('pagehide', save);

    bindSettings();
    tick();
    setInterval(tick, TICK_MS);
    if (life.lived < 10 * Vie.MIN) setTimeout(() => say('Je vais bientôt éclore… reste avec moi !'), 700);

    // Installation comme appli (téléphone, ordinateur) quand Lumi est servi en http(s).
    const served = location.protocol === 'https:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    if ('serviceWorker' in navigator && served) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  start();
})();
