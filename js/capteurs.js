/*
 * capteurs.js — Ce que l'appareil laisse mesurer, normalisé pour vie.js.
 *
 * Trois sources :
 *  1. Le navigateur (partout, partiel) : batterie (Chrome, Edge, Android), charge du
 *     processeur (Chrome récent), fluidité de la page, connexion, activité et inactivité.
 *  2. Le capteur PC (capteur/lumi_capteur.py), s'il tourne : processeur, mémoire,
 *     disque, batterie, température, vrai temps actif et pauses, même appli fermée.
 *  3. L'appli Android (dossier android/), quand Lumi y est ouvert : elle fournit
 *     window.LumiAndroid (batterie et sa température, mémoire, stockage, connexion,
 *     allumages de l'écran).
 * Rien ne quitte l'appareil : le capteur PC répond seulement sur 127.0.0.1, et l'appli
 * Android n'a même pas la permission d'aller sur internet.
 */
(function () {
  'use strict';

  const AGENT_PORT = 8765;
  const PRESSURE_LABEL = { nominal: 'Charge du processeur : faible', fair: 'Charge du processeur : moyenne', serious: 'Charge du processeur : élevée', critical: 'Charge du processeur : critique' };

  const state = {
    battery: null, // { level, charging }
    pressure: null, // 'nominal' | 'fair' | 'serious' | 'critical'
    lag: [], // retards de l'horloge de la page (ms), quand elle est visible
    online: navigator.onLine,
    connection: null,
    lastInput: Date.now(),
    idle: { supported: 'IdleDetector' in window, granted: false, userState: null, screenState: null },
    agent: { connected: false, data: null, lastOk: 0, tries: 0, history: null, historyAt: 0 },
    support: { battery: false, pressure: false, connection: false }
  };

  /* L'appli Android, si Lumi tourne dedans. Ses mesures sont relues au plus toutes les 4 s. */
  const android = { bridge: window.LumiAndroid || null, data: null, at: 0 };

  const listeners = [];
  function emit() { listeners.forEach(fn => fn()); }

  /* ---------- Navigateur ---------- */

  async function initBattery() {
    if (!navigator.getBattery) return;
    try {
      const b = await navigator.getBattery();
      state.support.battery = true;
      const update = () => { state.battery = { level: b.level, charging: b.charging }; emit(); };
      update();
      b.addEventListener('levelchange', update);
      b.addEventListener('chargingchange', update);
    } catch (e) { /* non disponible */ }
  }

  function initPressure() {
    if (!('PressureObserver' in window)) return;
    try {
      const observer = new PressureObserver(records => {
        const last = records[records.length - 1];
        if (last) { state.pressure = last.state; emit(); }
      });
      observer.observe('cpu', { sampleInterval: 2000 }).then(() => { state.support.pressure = true; }, () => {});
    } catch (e) { /* non disponible */ }
  }

  /* La fluidité : si l'horloge de la page prend du retard, l'appareil peine. */
  function initResponsiveness() {
    let expected = performance.now() + 1000;
    const loop = () => {
      const now = performance.now();
      if (document.visibilityState === 'visible') {
        state.lag.push(Math.max(0, now - expected));
        if (state.lag.length > 30) state.lag.shift();
      }
      expected = now + 1000;
      setTimeout(loop, 1000);
    };
    setTimeout(loop, 1000);
  }

  function lagStress() {
    if (state.lag.length < 5) return null;
    const sorted = state.lag.slice().sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    return Math.max(0, Math.min(100, (p90 - 30) / 4.5));
  }

  function initNetwork() {
    window.addEventListener('online', () => { state.online = true; emit(); });
    window.addEventListener('offline', () => { state.online = false; emit(); });
    const c = navigator.connection;
    if (c) {
      state.support.connection = true;
      const update = () => { state.connection = { type: c.effectiveType || null, rtt: c.rtt }; emit(); };
      update();
      c.addEventListener('change', update);
    }
  }

  function initInput() {
    ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach(type => {
      window.addEventListener(type, () => { state.lastInput = Date.now(); }, { passive: true });
    });
  }

  /** Demande la détection d'inactivité de tout l'appareil (Chrome, Edge). */
  async function requestIdleDetection() {
    if (!state.idle.supported) return false;
    try {
      const permission = await window.IdleDetector.requestPermission();
      if (permission !== 'granted') return false;
      const detector = new window.IdleDetector();
      detector.addEventListener('change', () => {
        state.idle.userState = detector.userState;
        state.idle.screenState = detector.screenState;
        emit();
      });
      await detector.start({ threshold: 60000 });
      state.idle.granted = true;
      state.idle.userState = detector.userState;
      state.idle.screenState = detector.screenState;
      emit();
      return true;
    } catch (e) {
      return false;
    }
  }

  /** L'appareil est-il utilisé en ce moment ? */
  function isActive() {
    if (state.idle.granted) return state.idle.userState === 'active' && state.idle.screenState !== 'locked';
    // Sans détecteur : une page visible sans aucune action depuis 5 min = personne devant l'écran.
    if (document.visibilityState === 'visible' && Date.now() - state.lastInput > 5 * 60 * 1000) return false;
    return true;
  }

  /* ---------- Capteur PC ---------- */

  function agentUrl(path) {
    const served = location.protocol === 'http:' || location.protocol === 'https:';
    return served ? path : 'http://127.0.0.1:' + AGENT_PORT + path;
  }

  async function getJson(path) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const res = await fetch(agentUrl(path), { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function pollAgent() {
    state.agent.tries += 1;
    try {
      const data = await getJson('/api/sante');
      if (!data || data.source !== 'capteur-pc') throw new Error('réponse inattendue');
      state.agent.connected = true;
      state.agent.data = data;
      state.agent.lastOk = Date.now();
      if (Date.now() - state.agent.historyAt > 5 * 60 * 1000) {
        const hist = await getJson('/api/historique');
        state.agent.history = hist && Array.isArray(hist.echantillons) ? hist.echantillons : null;
        state.agent.historyAt = Date.now();
      }
    } catch (e) {
      state.agent.connected = false;
    }
    emit();
    // Si le capteur ne répond jamais, on vérifie moins souvent.
    const delay = state.agent.connected ? 10000 : state.agent.tries < 3 ? 15000 : 60000;
    setTimeout(pollAgent, delay);
  }

  /* ---------- Appli Android ---------- */

  function readAndroid() {
    if (!android.bridge) return null;
    if (Date.now() - android.at > 4000) {
      try {
        android.data = JSON.parse(android.bridge.mesures());
      } catch (e) {
        android.data = null;
      }
      android.at = Date.now();
    }
    return android.data;
  }

  /** Ouvre l'écran des réglages Android où l'on autorise l'accès au temps d'écran. */
  function requestScreenTime() {
    if (android.bridge) android.bridge.ouvrirReglagesUsage();
    android.at = 0;
  }

  /* ---------- Lecture normalisée ---------- */

  function read() {
    const a = state.agent.connected ? state.agent.data : null;
    const d = readAndroid();
    let battery = null;
    if (d && d.batterie) battery = { level: d.batterie.niveau, charging: !!d.batterie.en_charge, source: 'android' };
    else if (a && a.batterie) battery = { level: a.batterie.niveau, charging: !!a.batterie.en_charge, source: 'capteur' };
    else if (a && a.alimentation === 'secteur') battery = { level: 1, charging: true, mains: true, source: 'capteur' };
    else if (state.battery) battery = { level: state.battery.level, charging: state.battery.charging, source: 'navigateur' };

    let stress = null;
    if (a && typeof a.cpu === 'number') stress = { value: a.cpu, source: 'capteur' };
    else if (state.pressure) stress = { value: window.LumiVie.stressFromPressure(state.pressure), source: 'pression', label: PRESSURE_LABEL[state.pressure] };
    else {
      const lag = lagStress();
      if (lag !== null) stress = { value: lag, source: 'fluidite', label: 'Fluidité de la page (estimation)' };
    }

    return {
      battery,
      stress,
      memory: d && typeof d.memoire === 'number' ? { value: d.memoire, source: 'android' } : a && typeof a.memoire === 'number' ? { value: a.memoire, source: 'capteur' } : null,
      disk: d && typeof d.disque === 'number' ? { value: d.disque, source: 'android' } : a && typeof a.disque === 'number' ? { value: a.disque, source: 'capteur' } : null,
      temperature: a && typeof a.temperature === 'number' ? a.temperature : null,
      batteryTemp: d && d.batterie && typeof d.batterie.temperature === 'number' ? d.batterie.temperature : null,
      online: d && d.reseau ? !!d.reseau.en_ligne : state.online,
      connection: d && d.reseau && d.reseau.en_ligne ? { type: d.reseau.type } : state.connection,
      active: isActive(),
      agentUsage: a && a.usage ? a.usage : null,
      agentConnected: !!a,
      agentInfo: a ? { systeme: a.systeme, machine: a.machine } : null,
      agentHistory: state.agent.connected ? state.agent.history : null,
      android: d ? { appareil: d.appareil, ecran: d.ecran && d.ecran.autorise ? d.ecran : null, ecranAutorise: !!(d.ecran && d.ecran.autorise) } : null,
      idle: { supported: state.idle.supported, granted: state.idle.granted },
      support: state.support
    };
  }

  function start(onChange) {
    if (onChange) listeners.push(onChange);
    initBattery();
    initPressure();
    initResponsiveness();
    initNetwork();
    initInput();
    // Le capteur PC vit sur un ordinateur : inutile de le chercher dans l'appli Android.
    if (!android.bridge) pollAgent();
  }

  window.LumiCapteurs = { start, read, requestIdleDetection, requestScreenTime };
})();
