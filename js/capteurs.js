/*
 * capteurs.js — Ce que l'appareil laisse mesurer, normalisé pour vie.js.
 *
 * Deux sources :
 *  1. Le navigateur (partout, partiel) : batterie (Chrome, Edge, Android), charge du
 *     processeur (Chrome récent), fluidité de la page, connexion, activité et inactivité.
 *  2. Le capteur PC (capteur/lumi_capteur.py), s'il tourne : processeur, mémoire,
 *     disque, batterie, température, vrai temps actif et pauses, même appli fermée.
 * Rien ne quitte l'appareil : le capteur PC répond seulement sur 127.0.0.1.
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

  /* ---------- Lecture normalisée ---------- */

  function read() {
    const a = state.agent.connected ? state.agent.data : null;
    let battery = null;
    if (a && a.batterie) battery = { level: a.batterie.niveau, charging: !!a.batterie.en_charge, source: 'capteur' };
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
      memory: a && typeof a.memoire === 'number' ? { value: a.memoire, source: 'capteur' } : null,
      disk: a && typeof a.disque === 'number' ? { value: a.disque, source: 'capteur' } : null,
      temperature: a && typeof a.temperature === 'number' ? a.temperature : null,
      online: state.online,
      connection: state.connection,
      active: isActive(),
      agentUsage: a && a.usage ? a.usage : null,
      agentConnected: !!a,
      agentInfo: a ? { systeme: a.systeme, machine: a.machine } : null,
      agentHistory: state.agent.connected ? state.agent.history : null,
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
    pollAgent();
  }

  window.LumiCapteurs = { start, read, requestIdleDetection };
})();
