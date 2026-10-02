/*
 * vie.test.js — Les tests des règles de vie (js/vie.js).
 *
 * Deux façons de les lancer :
 *   - avec Node.js :        node tests/vie.test.js
 *   - sans rien installer : ouvrir tests/tests.html dans un navigateur.
 */
(function () {
  'use strict';

  var isNode = typeof window === 'undefined';
  var V = isNode ? require('../js/vie.js') : window.LumiVie;

  var results = [];
  function test(name, fn) {
    try {
      fn();
      results.push({ name: name, ok: true });
    } catch (e) {
      results.push({ name: name, ok: false, error: e.message });
    }
  }
  function equal(actual, expected, what) {
    if (actual !== expected) throw new Error((what ? what + ' : ' : '') + 'attendu ' + JSON.stringify(expected) + ', obtenu ' + JSON.stringify(actual));
  }
  function check(value, what) {
    if (!value) throw new Error(what || 'condition fausse');
  }
  function near(actual, expected, tolerance, what) {
    if (Math.abs(actual - expected) > tolerance) throw new Error((what ? what + ' : ' : '') + 'attendu ≈ ' + expected + ', obtenu ' + actual);
  }

  var MIN = V.MIN;
  var HOUR = V.HOUR;
  var DAY = V.DAY;
  var T0 = new Date(2026, 9, 2, 10, 0, 0).getTime(); // 2 octobre 2026, 10 h

  function usage(over) {
    return Object.assign({ activeTodayMin: 60, nightTodayMin: 0, sessionMin: 10, lastBreak: null, onBreak: false, source: 'navigateur' }, over || {});
  }
  function input(over) {
    return Object.assign({
      battery: { level: 0.8, charging: false, source: 'navigateur' },
      stress: { value: 20, source: 'capteur' },
      memory: { value: 50, source: 'capteur' },
      disk: { value: 60, source: 'capteur' },
      temperature: null,
      online: true,
      connection: { type: '4g' },
      usage: usage(),
      hour: 15,
      care: 70
    }, over || {});
  }

  /* ---------- Âge et croissance ---------- */

  test('Lumi naît sous forme d\'œuf', function () {
    var life = V.newLife(T0);
    equal(V.stageInfo(life.lived).stage.name, 'Œuf');
  });

  test('Le temps passe même appli fermée : 2 h plus tard, c\'est un bébé', function () {
    var step = V.advance(V.newLife(T0), T0 + 2 * HOUR);
    equal(step.livedDelta, 2 * HOUR);
    equal(V.stageInfo(step.life.lived).stage.name, 'Bébé');
  });

  test('Le mode démo accélère l\'âge : 5 min réelles = 5 jours de vie', function () {
    var life = V.newLife(T0);
    life.speed = 1440;
    var step = V.advance(life, T0 + 5 * MIN);
    equal(step.life.lived, 5 * DAY);
    equal(V.stageInfo(step.life.lived).stage.name, 'Ado');
  });

  test('La croissance avance dans chaque âge', function () {
    var info = V.stageInfo(12 * HOUR);
    equal(info.stage.name, 'Bébé');
    near(info.progress, (12 * HOUR - 10 * MIN) / (24 * HOUR - 10 * MIN), 1e-9, 'progression');
    equal(info.next.name, 'Enfant');
    equal(info.remaining, 12 * HOUR);
  });

  test('Le caractère se fixe selon les soins à l\'ado puis à l\'adulte', function () {
    var life = V.newLife(T0);
    life.lived = 3 * DAY + MIN;
    life.stage = 2;
    life.care = 82;
    var g = V.checkGrowth(life);
    check(g.grew, 'il grandit');
    equal(g.variant, 'radieux');
    var adult = g.life;
    adult.lived = 7 * DAY + MIN;
    adult.care = 30;
    var g2 = V.checkGrowth(adult);
    equal(g2.variant, 'grognon', 'adulte négligé');
    equal(g2.life.variants.ado, 'radieux', 'l\'ado garde son caractère');
  });

  test('Une longue absence fait sauter plusieurs âges d\'un coup', function () {
    var life = V.newLife(T0);
    life.lived = 8 * DAY;
    var g = V.checkGrowth(life);
    equal(g.from, 0);
    equal(g.to, 4);
    check(g.life.variants.ado && g.life.variants.adulte, 'caractères fixés');
  });

  /* ---------- Santé ---------- */

  test('Tout va bien : Lumi est en pleine forme', function () {
    var v = V.computeVitals(input());
    check(v.health >= 80, 'santé ' + v.health);
    equal(v.main, 'happy');
  });

  test('Batterie faible sans chargeur : Lumi a faim', function () {
    var v = V.computeVitals(input({ battery: { level: 0.15, charging: false, source: 'navigateur' } }));
    equal(v.main, 'hungry');
    check(v.message.indexOf('15 %') !== -1, 'le message donne le niveau');
    equal(v.gauges.energie.value, 15);
  });

  test('En charge : Lumi mange', function () {
    var v = V.computeVitals(input({ battery: { level: 0.5, charging: true, source: 'navigateur' } }));
    check(v.conditions.indexOf('eating') !== -1, 'repas');
    equal(v.main, 'eating');
  });

  test('Ordinateur de bureau sur secteur : énergie pleine, pas de repas', function () {
    var v = V.computeVitals(input({ battery: { level: 1, charging: true, mains: true, source: 'capteur' } }));
    equal(v.gauges.energie.value, 100);
    check(v.conditions.indexOf('eating') === -1, 'pas de repas');
  });

  test('Processeur à 90 % : Lumi transpire', function () {
    var v = V.computeVitals(input({ stress: { value: 90, source: 'capteur' } }));
    equal(v.main, 'stressed');
    equal(v.gauges.calme.value, 10);
  });

  test('Fièvre (90 °C) : Lumi transpire aussi', function () {
    var v = V.computeVitals(input({ temperature: 90 }));
    check(v.conditions.indexOf('stressed') !== -1, 'stress');
  });

  test('Mémoire à 95 % : Lumi est à l\'étroit', function () {
    var v = V.computeVitals(input({ memory: { value: 95, source: 'capteur' } }));
    equal(v.main, 'cramped');
  });

  test('Hors ligne : Lumi se sent seul', function () {
    var v = V.computeVitals(input({ online: false }));
    equal(v.main, 'lonely');
  });

  test('Tard le soir : bonnet de nuit', function () {
    var v = V.computeVitals(input({ hour: 23 }));
    equal(v.main, 'sleepy');
  });

  test('55 min d\'écran d\'affilée : Lumi propose une pause', function () {
    var v = V.computeVitals(input({ usage: usage({ sessionMin: 55 }) }));
    equal(v.main, 'needsBreak');
    check(v.gauges.repos.value < 100, 'repos entamé');
  });

  test('La faim passe avant le stress dans le message', function () {
    var v = V.computeVitals(input({ battery: { level: 0.1, charging: false, source: 'navigateur' }, stress: { value: 95, source: 'capteur' } }));
    equal(v.main, 'hungry');
    check(v.conditions.indexOf('stressed') !== -1, 'le stress reste visible sur Lumi');
  });

  test('Soins très bas : Lumi tombe malade', function () {
    equal(V.computeVitals(input({ care: 20 })).main, 'sick');
  });

  test('Les mesures absentes sont ignorées, pas comptées à zéro', function () {
    var v = V.computeVitals(input({ battery: null, stress: null, memory: null, disk: null }));
    equal(v.gauges.energie.value, null);
    equal(v.gauges.espace.value, null);
    check(v.health >= 90, 'santé calculée sur le lien et le repos : ' + v.health);
  });

  /* ---------- Temps d'écran ---------- */

  test('Temps d\'écran, session, pause automatique', function () {
    var u = V.newLife(T0).usage;
    var t = T0;
    for (var i = 0; i < 360; i++) { t += 5000; u = V.tickUsage(u, t, true, 10); }
    var s = V.usageSummary(u, t);
    near(s.activeTodayMin, 30, 0.01, 'temps du jour');
    near(s.sessionMin, 30, 0.01, 'session');
    for (var j = 0; j < 72; j++) { t += 5000; u = V.tickUsage(u, t, false, 10); }
    check(V.usageSummary(u, t).onBreak, 'en pause après 5 min');
    t += 5000;
    u = V.tickUsage(u, t, true, 10);
    equal(V.usageSummary(u, t).lastBreak, t, 'pause notée');
    equal(V.usageSummary(u, t).sessionMin, 0, 'nouvelle session');
  });

  test('Une veille de plus de 5 min compte comme une pause', function () {
    var u = V.newLife(T0).usage;
    u = V.tickUsage(u, T0 + 20 * MIN, true, 10);
    equal(u.lastBreak, T0 + 20 * MIN);
    equal(u.activeMs, 0, 'la veille ne compte pas comme du temps d\'écran');
  });

  test('Le temps d\'écran tardif est compté à part', function () {
    var u = V.newLife(T0).usage;
    var t = T0;
    for (var i = 0; i < 12; i++) { t += 5000; u = V.tickUsage(u, t, true, 23); }
    near(V.usageSummary(u, t).nightTodayMin, 1, 0.01);
  });

  test('Le bouton pause remet la session à zéro', function () {
    var u = V.takeBreak(V.newLife(T0).usage, T0 + 40 * MIN);
    equal(V.usageSummary(u, T0 + 40 * MIN).sessionMin, 0);
    equal(u.lastBreak, T0 + 40 * MIN);
  });

  test('Les chiffres du capteur PC sont convertis', function () {
    var s = V.usageFromAgent({ actif_aujourd_hui_s: 7200, nuit_aujourd_hui_s: 600, session_s: 1800, derniere_pause: 1790000000, en_pause: false });
    equal(s.activeTodayMin, 120);
    equal(s.sessionMin, 30);
    equal(s.lastBreak, 1790000000000);
    equal(s.source, 'capteur');
  });

  /* ---------- Soins et carnet ---------- */

  test('Les soins suivent la santé, lissés sur 6 h de vie', function () {
    var life = V.newLife(T0);
    life.care = 60;
    var after = V.updateCare(life, 20, 6 * HOUR);
    near(after.care, 60 + (20 - 60) * (1 - Math.exp(-1)), 0.1);
  });

  test('Le carnet garde un point toutes les 5 min, sur 24 h', function () {
    var life = V.newLife(T0);
    life = V.addSample(life, T0, 80, 'happy');
    life = V.addSample(life, T0 + MIN, 70, 'ok');
    equal(life.samples.length, 1, 'pas deux points en 5 min');
    life = V.addSample(life, T0 + 6 * MIN, 70, 'ok');
    equal(life.samples.length, 2);
    life = V.addSample(life, T0 + 25 * HOUR, 60, 'ok');
    equal(life.samples.length, 1, 'les points de plus de 24 h partent');
  });

  test('La santé se calcule aussi sur l\'historique du capteur PC', function () {
    var calm = V.healthFromAgentSample({ t: 1790000000, cpu: 10, memoire: 40, disque: 50, alimentation: 'secteur', batterie: null });
    var busy = V.healthFromAgentSample({ t: 1790000000, cpu: 98, memoire: 96, disque: 50, alimentation: 'batterie', batterie: { niveau: 0.1, en_charge: false } });
    check(calm > 85, 'ordinateur au calme : ' + calm);
    check(busy < 40, 'ordinateur surchargé : ' + busy);
  });

  test('Export puis import redonnent la même vie', function () {
    var life = V.newLife(T0, 'Pito');
    life.lived = 2 * DAY;
    var back = V.importJson(V.exportJson(life), T0);
    equal(back.name, 'Pito');
    equal(back.lived, 2 * DAY);
    var refused = false;
    try { V.importJson('{"app":"autre"}', T0); } catch (e) { refused = true; }
    check(refused, 'un fichier étranger est refusé');
  });

  /* ---------- Compte rendu ---------- */
  var failed = results.filter(function (r) { return !r.ok; });
  if (isNode) {
    results.forEach(function (r) {
      console.log((r.ok ? 'OK    ' : 'ÉCHEC ') + r.name + (r.ok ? '' : '\n      ' + r.error));
    });
    console.log('\n' + (results.length - failed.length) + ' / ' + results.length + ' tests réussis');
    if (failed.length) process.exitCode = 1;
  } else {
    var box = document.getElementById('results');
    results.forEach(function (r) {
      var li = document.createElement('li');
      li.className = r.ok ? 'ok' : 'ko';
      li.textContent = (r.ok ? 'OK — ' : 'ÉCHEC — ') + r.name + (r.ok ? '' : ' : ' + r.error);
      box.appendChild(li);
    });
    document.getElementById('summary').textContent = (results.length - failed.length) + ' / ' + results.length + ' tests réussis';
  }
})();
