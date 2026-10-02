/*
 * vie.js — Les règles de vie de Lumi, sans aucun affichage.
 *
 * - L'âge : Lumi vieillit avec le temps réel (même appli fermée), plus vite en mode démo.
 * - La santé : chaque jauge traduit une mesure de l'appareil ou de ton usage.
 * - Les soins : la santé moyenne façonne son caractère quand il devient ado puis adulte.
 *
 * Fonctions « pures » : elles reçoivent un état et renvoient un nouvel état.
 * Elles sont testées dans tests/vie.test.js.
 */
(function (root) {
  'use strict';

  var SEC = 1000;
  var MIN = 60 * SEC;
  var HOUR = 60 * MIN;
  var DAY = 24 * HOUR;

  /* Les âges de la vie (en temps vécu). */
  var STAGES = [
    { id: 'oeuf', name: 'Œuf', from: 0, shape: 0, width: 220 },
    { id: 'bebe', name: 'Bébé', from: 10 * MIN, shape: 1, width: 230 },
    { id: 'enfant', name: 'Enfant', from: 1 * DAY, shape: 2, width: 260 },
    { id: 'ado', name: 'Ado', from: 3 * DAY, shape: 3, width: 280 },
    { id: 'adulte', name: 'Adulte', from: 7 * DAY, shape: 4, width: 300 }
  ];

  /* Le caractère, fixé quand Lumi devient ado puis adulte, selon ses soins. */
  var VARIANTS = {
    radieux: { label: 'Radieux', text: 'bien soigné, il rayonne' },
    serein: { label: 'Serein', text: 'soigné correctement, il est paisible' },
    grognon: { label: 'Grognon', text: 'trop souvent négligé, il boude' }
  };

  /* Vitesses du temps proposées (le mode démo accélère seulement l'âge). */
  var SPEEDS = [
    { value: 1, label: 'Temps réel' },
    { value: 60, label: 'Rapide : 1 min = 1 h' },
    { value: 1440, label: 'Démo : 1 min = 1 jour' }
  ];

  var CARE_TAU = 6 * HOUR; // les soins se lissent sur environ 6 h de vie
  var SAMPLE_EVERY = 5 * MIN; // un point dans le carnet de santé toutes les 5 min
  var BREAK_AFTER = 5 * MIN; // 5 min sans activité = une pause
  var SESSION_LIMIT = 50; // au-delà (en minutes), Lumi propose une pause

  var WEIGHTS = { energie: 0.25, calme: 0.25, espace: 0.15, lien: 0.1, repos: 0.25 };
  var PRESSURE = { nominal: 15, fair: 45, serious: 75, critical: 95 };
  var LINK = { '4g': 100, '3g': 70, '2g': 40, 'slow-2g': 20 };
  var PRIORITY = ['sick', 'hungry', 'stressed', 'needsBreak', 'sleepy', 'lonely', 'cramped', 'eating', 'happy'];
  var NEGATIVE = ['sick', 'hungry', 'stressed', 'needsBreak', 'sleepy', 'lonely', 'cramped'];

  /* ---------- Outils ---------- */

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(n) {
    return Math.max(0, Math.min(100, n));
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function dayKey(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function isNight(hour) {
    return hour >= 23 || hour < 6;
  }

  function formatDuration(ms) {
    var m = Math.floor(ms / MIN);
    var d = Math.floor(m / 1440);
    var h = Math.floor((m % 1440) / 60);
    var min = m % 60;
    if (d > 0) return d + ' j ' + h + ' h';
    if (h > 0) return h + ' h ' + pad(min) + ' min';
    if (m > 0) return m + ' min';
    return Math.max(0, Math.floor(ms / SEC)) + ' s';
  }

  /* ---------- Naissance et temps qui passe ---------- */

  function newUsage(now) {
    return { day: dayKey(now), activeMs: 0, nightMs: 0, sessionStart: now, idleSince: null, lastBreak: null, lastTick: now };
  }

  function newLife(now, name) {
    return {
      version: 1,
      name: name || 'Lumi',
      bornAt: now,
      lived: 0, // temps vécu (ms), accéléré par `speed`
      lastSeen: now,
      speed: 1,
      care: 60, // soins lissés, de 0 à 100
      stage: 0,
      variants: {}, // caractère fixé à l'ado et à l'adulte
      samples: [], // carnet de santé : { t, h, c }
      lastSampleAt: 0,
      usage: newUsage(now)
    };
  }

  /** Le temps passe, même appli fermée : renvoie l'état vieilli et le temps vécu écoulé. */
  function advance(life, now) {
    var s = clone(life);
    var dt = Math.max(0, now - s.lastSeen);
    s.lived += dt * s.speed;
    s.lastSeen = now;
    return { life: s, livedDelta: dt * s.speed };
  }

  function stageIndex(lived) {
    var index = 0;
    for (var i = 0; i < STAGES.length; i++) {
      if (lived >= STAGES[i].from) index = i;
    }
    return index;
  }

  /** Où en est Lumi : forme, progression vers la suivante, temps restant (vécu). */
  function stageInfo(lived) {
    var index = stageIndex(lived);
    var st = STAGES[index];
    var next = STAGES[index + 1] || null;
    var progress = next ? (lived - st.from) / (next.from - st.from) : Math.min(1, (lived - st.from) / (7 * DAY));
    return { index: index, stage: st, next: next, progress: Math.max(0, Math.min(1, progress)), remaining: next ? next.from - lived : 0 };
  }

  function variantFor(care) {
    if (care >= 70) return 'radieux';
    if (care >= 40) return 'serein';
    return 'grognon';
  }

  /** Passage à une nouvelle forme ; le caractère se fixe à l'ado puis à l'adulte. */
  function checkGrowth(life) {
    var index = stageIndex(life.lived);
    var needAdo = index >= 3 && !life.variants.ado;
    var needAdulte = index >= 4 && !life.variants.adulte;
    if (index <= life.stage && !needAdo && !needAdulte) return { life: life, grew: false };
    var s = clone(life);
    if (needAdo) s.variants.ado = variantFor(s.care);
    if (needAdulte) s.variants.adulte = variantFor(s.care);
    var from = s.stage;
    if (index <= from) return { life: s, grew: false };
    s.stage = index;
    var id = STAGES[index].id;
    return { life: s, grew: true, from: from, to: index, variant: s.variants[id] || null };
  }

  function currentVariant(life) {
    return life.variants[STAGES[life.stage].id] || null;
  }

  /* ---------- Ton usage de l'écran ---------- */

  /**
   * Compte le temps d'écran. `active` : l'appareil est utilisé en ce moment.
   * Un trou de plus de 5 min entre deux mesures (appareil en veille, appli fermée)
   * compte comme une pause.
   */
  function tickUsage(usage, now, active, hour) {
    var u = clone(usage);
    if (u.day !== dayKey(now)) {
      u.day = dayKey(now);
      u.activeMs = 0;
      u.nightMs = 0;
    }
    var dt = Math.max(0, now - u.lastTick);
    u.lastTick = now;
    if (dt > BREAK_AFTER) {
      u.lastBreak = now;
      u.sessionStart = now;
      u.idleSince = active ? null : now;
      return u;
    }
    if (active) {
      u.activeMs += dt;
      if (isNight(hour)) u.nightMs += dt;
      if (u.idleSince !== null && now - u.idleSince >= BREAK_AFTER) {
        u.lastBreak = now;
        u.sessionStart = now;
      }
      u.idleSince = null;
    } else if (u.idleSince === null) {
      u.idleSince = now - dt;
    }
    return u;
  }

  /** Une pause volontaire (bouton « Je fais une pause »). */
  function takeBreak(usage, now) {
    var u = clone(usage);
    u.lastBreak = now;
    u.sessionStart = now;
    u.idleSince = null;
    u.lastTick = now;
    return u;
  }

  function usageSummary(usage, now) {
    var onBreak = usage.idleSince !== null && now - usage.idleSince >= BREAK_AFTER;
    return {
      activeTodayMin: usage.day === dayKey(now) ? usage.activeMs / MIN : 0,
      nightTodayMin: usage.day === dayKey(now) ? usage.nightMs / MIN : 0,
      sessionMin: onBreak ? 0 : Math.max(0, now - usage.sessionStart) / MIN,
      lastBreak: usage.lastBreak,
      onBreak: onBreak,
      source: 'navigateur'
    };
  }

  /** Le même résumé, à partir des chiffres du capteur PC. */
  function usageFromAgent(u) {
    return {
      activeTodayMin: (u.actif_aujourd_hui_s || 0) / 60,
      nightTodayMin: (u.nuit_aujourd_hui_s || 0) / 60,
      sessionMin: (u.session_s || 0) / 60,
      lastBreak: u.derniere_pause ? u.derniere_pause * 1000 : null,
      onBreak: !!u.en_pause,
      source: 'capteur'
    };
  }

  /* ---------- Santé ---------- */

  function stressFromPressure(state) {
    return PRESSURE[state] !== undefined ? PRESSURE[state] : null;
  }

  /**
   * Traduit les mesures en jauges, en santé globale et en états.
   * input = { battery, stress, memory, disk, temperature, online, connection, usage, hour, care, name }
   * Une mesure absente vaut null : sa jauge est ignorée dans la santé globale.
   */
  function computeVitals(input) {
    var g = {};
    var b = input.battery;

    // Énergie : la batterie (sur secteur sans batterie : pleine).
    if (b && b.mains) g.energie = { value: 100, detail: 'Sur secteur', source: b.source };
    else if (b) g.energie = { value: Math.round(b.level * 100), detail: Math.round(b.level * 100) + ' %' + (b.charging ? ' · en charge' : ''), source: b.source };
    else g.energie = { value: null, detail: 'Indisponible ici', source: null };

    // Calme : l'inverse du stress du processeur (ou de la fièvre).
    var st = input.stress;
    var calme = st ? clamp(100 - st.value) : null;
    var hot = typeof input.temperature === 'number' && input.temperature >= 85;
    if (hot) calme = Math.min(calme === null ? 100 : calme, 20);
    if (calme !== null) {
      var detail = st ? (st.source === 'capteur' ? 'Processeur à ' + Math.round(st.value) + ' %' : st.label || 'Estimation') : '';
      if (hot) detail = 'Fièvre : ' + Math.round(input.temperature) + ' °C';
      g.calme = { value: Math.round(calme), detail: detail, source: st ? st.source : 'capteur' };
    } else {
      g.calme = { value: null, detail: 'Indisponible ici', source: null };
    }

    // Espace : la mémoire vive et le disque.
    var mem = input.memory;
    var disk = input.disk;
    var memScore = mem ? clamp(100 - Math.max(0, mem.value - 50) * 2) : null;
    var diskScore = disk ? clamp(100 - Math.max(0, disk.value - 70) * 3.3) : null;
    var scores = [memScore, diskScore].filter(function (v) { return v !== null; });
    if (scores.length) {
      var parts = [];
      if (mem) parts.push('Mémoire ' + Math.round(mem.value) + ' %');
      if (disk) parts.push('Disque ' + Math.round(disk.value) + ' %');
      g.espace = { value: Math.round(Math.min.apply(null, scores)), detail: parts.join(' · '), source: (mem || disk).source };
    } else {
      g.espace = { value: null, detail: 'Avec le capteur PC', source: null };
    }

    // Lien : la connexion.
    if (input.online === false) g.lien = { value: 10, detail: 'Hors ligne', source: 'navigateur' };
    else {
      var type = input.connection && input.connection.type;
      g.lien = { value: LINK[type] !== undefined ? LINK[type] : 90, detail: type ? 'En ligne · ' + type.toUpperCase() : 'En ligne', source: 'navigateur' };
    }

    // Repos : ton usage (sessions sans pause, temps du jour, nuit).
    var u = input.usage;
    if (u) {
      var repos = clamp(100 - Math.max(0, u.sessionMin - 45) * 1.5 - Math.max(0, u.activeTodayMin - 360) * 0.1 - u.nightTodayMin * 0.3);
      g.repos = { value: Math.round(repos), detail: 'Session : ' + Math.round(u.sessionMin) + ' min', source: u.source };
    } else {
      g.repos = { value: null, detail: 'Indisponible', source: null };
    }

    // Santé globale : moyenne pondérée des jauges disponibles.
    var total = 0;
    var weight = 0;
    Object.keys(WEIGHTS).forEach(function (key) {
      if (g[key].value !== null) {
        total += g[key].value * WEIGHTS[key];
        weight += WEIGHTS[key];
      }
    });
    var health = weight ? Math.round(total / weight) : 70;

    // États visibles sur Lumi.
    var conds = [];
    var care = typeof input.care === 'number' ? input.care : 60;
    if (care < 25) conds.push('sick');
    if (b && !b.mains && !b.charging && b.level < 0.2) conds.push('hungry');
    if (b && !b.mains && b.charging && b.level < 0.995) conds.push('eating');
    if (g.calme.value !== null && g.calme.value <= 30) conds.push('stressed');
    if (g.espace.value !== null && g.espace.value <= 20) conds.push('cramped');
    if (input.online === false) conds.push('lonely');
    if ((u && u.onBreak) || isNight(input.hour)) conds.push('sleepy');
    if (u && !u.onBreak && u.sessionMin >= SESSION_LIMIT) conds.push('needsBreak');
    var troubled = conds.some(function (c) { return NEGATIVE.indexOf(c) !== -1; });
    if (health >= 80 && !troubled) conds.push('happy');

    var main = 'ok';
    for (var i = 0; i < PRIORITY.length; i++) {
      if (conds.indexOf(PRIORITY[i]) !== -1) { main = PRIORITY[i]; break; }
    }

    return { gauges: g, health: health, conditions: conds, main: main, message: messageFor(main, input, g) };
  }

  function messageFor(main, input, g) {
    var n = input.name || 'Lumi';
    var b = input.battery;
    var pct = b ? Math.round(b.level * 100) + ' %' : '';
    var u = input.usage;
    switch (main) {
      case 'sick':
        return n + ' est malade : sa santé est basse depuis trop longtemps. Prends soin de ton appareil et de tes pauses.';
      case 'hungry':
        return n + ' a faim : batterie à ' + pct + '. Branche ton chargeur !';
      case 'stressed':
        return n + ' transpire : ' + (g.calme.detail || 'ton appareil est surchargé').toLowerCase() + '. Ferme ce dont tu n\'as plus besoin.';
      case 'needsBreak':
        return Math.round(u.sessionMin) + ' min d\'écran d\'affilée : ' + n + ' te propose une pause de 5 minutes.';
      case 'sleepy':
        return u && u.onBreak ? 'Chut… ' + n + ' fait la sieste pendant ta pause.' : 'Il est tard… ' + n + ' a mis son bonnet de nuit. Et si on allait dormir ?';
      case 'lonely':
        return n + ' se sent seul : pas de connexion internet.';
      case 'cramped':
        return n + ' est à l\'étroit : ' + g.espace.detail.toLowerCase() + '.';
      case 'eating':
        return 'Miam ! ' + n + ' reprend des forces : batterie à ' + pct + ', en charge.';
      case 'happy':
        return n + ' pète la forme : ton appareil va bien et tu prends soin de toi.';
      default:
        return 'Tout est calme. ' + n + ' te tient compagnie.';
    }
  }

  /** Les soins suivent la santé, lissés sur environ 6 h de vie. */
  function updateCare(life, health, livedDelta) {
    var s = clone(life);
    var k = 1 - Math.exp(-Math.max(0, livedDelta) / CARE_TAU);
    s.care = Math.round((s.care + (health - s.care) * k) * 10) / 10;
    return s;
  }

  /** Ajoute un point au carnet de santé (toutes les 5 min, sur 24 h). */
  function addSample(life, now, health, main) {
    if (now - life.lastSampleAt < SAMPLE_EVERY) return life;
    var s = clone(life);
    s.samples.push({ t: now, h: Math.round(health), c: main });
    s.samples = s.samples.filter(function (x) { return now - x.t <= DAY; });
    s.lastSampleAt = now;
    return s;
  }

  /** La santé d'un relevé du capteur PC (pour le carnet, appli fermée comprise). */
  function healthFromAgentSample(sample) {
    var battery = null;
    if (sample.batterie) battery = { level: sample.batterie.niveau, charging: !!sample.batterie.en_charge, source: 'capteur' };
    else if (sample.alimentation === 'secteur') battery = { level: 1, charging: true, mains: true, source: 'capteur' };
    return computeVitals({
      battery: battery,
      stress: typeof sample.cpu === 'number' ? { value: sample.cpu, source: 'capteur' } : null,
      memory: typeof sample.memoire === 'number' ? { value: sample.memoire, source: 'capteur' } : null,
      disk: typeof sample.disque === 'number' ? { value: sample.disque, source: 'capteur' } : null,
      temperature: sample.temperature,
      online: true,
      connection: null,
      usage: null,
      hour: new Date(sample.t * 1000).getHours(),
      care: 60
    }).health;
  }

  /* ---------- Sauvegarde ---------- */

  function exportJson(life) {
    return JSON.stringify({ app: 'lumi-vivant', savedAt: new Date().toISOString(), life: life }, null, 2);
  }

  function importJson(text, now) {
    var parsed = JSON.parse(text);
    var incoming = parsed && parsed.app === 'lumi-vivant' ? parsed.life : null;
    if (!incoming || typeof incoming.lived !== 'number' || typeof incoming.bornAt !== 'number') {
      throw new Error("Ce fichier n'est pas une sauvegarde de Lumi Vivant.");
    }
    var s = newLife(now);
    Object.keys(s).forEach(function (key) {
      if (incoming[key] !== undefined) s[key] = incoming[key];
    });
    return s;
  }

  var api = {
    MIN: MIN,
    HOUR: HOUR,
    DAY: DAY,
    STAGES: STAGES,
    VARIANTS: VARIANTS,
    SPEEDS: SPEEDS,
    SESSION_LIMIT: SESSION_LIMIT,
    BREAK_AFTER: BREAK_AFTER,
    dayKey: dayKey,
    isNight: isNight,
    formatDuration: formatDuration,
    newLife: newLife,
    advance: advance,
    stageIndex: stageIndex,
    stageInfo: stageInfo,
    variantFor: variantFor,
    checkGrowth: checkGrowth,
    currentVariant: currentVariant,
    tickUsage: tickUsage,
    takeBreak: takeBreak,
    usageSummary: usageSummary,
    usageFromAgent: usageFromAgent,
    stressFromPressure: stressFromPressure,
    computeVitals: computeVitals,
    updateCare: updateCare,
    addSample: addSample,
    healthFromAgentSample: healthFromAgentSample,
    exportJson: exportJson,
    importJson: importJson
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LumiVie = api;
})(typeof window !== 'undefined' ? window : globalThis);
