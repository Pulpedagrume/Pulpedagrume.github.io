/* boa-audio-fix.js — corrige le son de Battle Orb Arena.
 * A charger AVANT le bundle du jeu (script classique en <head>).
 *
 * 1) LIMITEUR + VOLUME MAITRE sur toute la sortie (anti-saturation / grésillement).
 * 2) FOND SONORE DE L'ARENE baisse tout seul (bus "music" du jeu uniquement,
 *    sans toucher aux bruits de combat).
 *
 * Reglages a chaud (console) :
 *    __boaAudio.setVolume(0.6)      // volume global 0..1
 *    __boaAudio.setBackground(0.25) // fond de l'arene 0..1
 */
(function () {
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;

  var CFG = {
    master: 0.45,       // volume global
    background: 0.40,   // fond de l'arene (ambiance). Plus bas = plus discret.
    threshold: -3, knee: 3, ratio: 20, attack: 0.002, release: 0.15,
  };
  var masters = [];

  /* --- 1. Limiteur + master sur la sortie --- */
  function install(ctx) {
    var realDest = ctx.destination;                 // vraie sortie (lue avant redirection)
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = CFG.threshold; comp.knee.value = CFG.knee;
    comp.ratio.value = CFG.ratio; comp.attack.value = CFG.attack; comp.release.value = CFG.release;
    var master = ctx.createGain(); master.gain.value = CFG.master;
    comp.connect(master); master.connect(realDest); masters.push(master);
    try { Object.defineProperty(ctx, "destination", { value: comp, configurable: true }); } catch (e) {}
    ctx.__boaMaster = master;
  }
  function Patched() { var c = new AC(...arguments); try { install(c); } catch (e) { console.warn("[BOA audio]", e); } return c; }
  Patched.prototype = AC.prototype;
  window.AudioContext = Patched; window.webkitAudioContext = Patched;

  /* --- 2. Baisse du fond sonore (bus "music" du jeu) --- */
  var bgGain = null;
  function hookBackground() {
    var B = window.__arena && window.__arena.SFX;
    if (!B || !B.ctx || !B.music || !B.master || B.__bgReduced) return;
    try {
      var g = B.ctx.createGain(); g.gain.value = CFG.background;
      B.music.disconnect();          // music ne sortait que vers master
      B.music.connect(g); g.connect(B.master);
      B.__bgReduced = true; B.__bgGain = g; bgGain = g;
      console.log("[BOA audio] fond de l'arene reduit (background=" + CFG.background + ").");
    } catch (e) { console.warn("[BOA audio bg]", e); }
  }
  var iv = setInterval(function () { hookBackground(); if (bgGain) clearInterval(iv); }, 700);

  window.__boaAudio = {
    setVolume: function (v) { CFG.master = v; masters.forEach(function (m) { m.gain.value = v; }); },
    setBackground: function (v) { CFG.background = v; if (bgGain) bgGain.gain.value = v; },
    get volume() { return CFG.master; },
    get background() { return CFG.background; },
  };
  console.log("[BOA audio] limiteur + master installes (master=" + CFG.master + ", background=" + CFG.background + ").");
})();
