/* boa-autopublish.js — couche compagnon pour Battle Orb Arena.
 * Se greffe sur l'export existant SANS modifier le bundle React.
 * - capte les videos exportees (hook sur le <a download>)
 * - programme les videos sur YouTube (API officielle, 3/jour x 7)
 * - telecharge les videos pretes pour TikTok (tel)
 *
 * >>> A CONFIGURER pour YouTube : colle ton identifiant OAuth Google ci-dessous <<<
 *   (console.cloud.google.com -> API YouTube Data v3 -> ID client OAuth "Web")
 */
const BOA = {
  GOOGLE_CLIENT_ID: "140690714741-0egspb6rug6t4blbpvrl8telu8b6kscd.apps.googleusercontent.com",
  SLOTS: ["09:00", "14:00", "19:00"],   // 3 creneaux/jour
  START_OFFSET_DAYS: 1,                  // 1 = commence demain
};

/* ---------- 1. Capture des exports ---------- */
const CAP = [];                          // {name, blob, yt}
const _blobByUrl = new Map();
const _createURL = URL.createObjectURL.bind(URL);
URL.createObjectURL = function (obj) {
  const u = _createURL(obj);
  if (obj instanceof Blob && /video|octet-stream|mp4|webm/i.test(obj.type || "")) _blobByUrl.set(u, obj);
  return u;
};
const _click = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function () {
  try {
    const dl = this.download || "";
    if (/\.(mp4|webm)$/i.test(dl) && _blobByUrl.has(this.href)) {
      CAP.push({ name: dl.replace(/\.webm$/i, ".mp4"), blob: _blobByUrl.get(this.href) });
      render();
      if (window.__BOA_SUPPRESS_DL) return;   // n'ecrase pas le telechargement d'origine
    }
  } catch (e) { console.warn("[BOA]", e); }
  return _click.apply(this, arguments);
};

/* ---------- 2. Programmation YouTube (API officielle) ---------- */
function loadGIS() {
  return new Promise((res, rej) => {
    if (window.google?.accounts?.oauth2) return res();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}
function getToken() {
  return new Promise((res, rej) => {
    const tc = google.accounts.oauth2.initTokenClient({
      client_id: BOA.GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/youtube.upload",
      callback: (r) => (r.access_token ? res(r.access_token) : rej(r)),
    });
    tc.requestAccessToken();
  });
}
function slotDate(i) {
  const d = new Date();
  d.setDate(d.getDate() + BOA.START_OFFSET_DAYS + Math.floor(i / BOA.SLOTS.length));
  const [h, m] = BOA.SLOTS[i % BOA.SLOTS.length].split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}
async function uploadOne(token, blob, title, publishAtISO) {
  const meta = {
    snippet: { title: title.slice(0, 100), description: `${title}\n\n#BattleOrbArena #shorts`, categoryId: "20" },
    status: { privacyStatus: "private", publishAt: publishAtISO, selfDeclaredMadeForKids: false },
  };
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
      "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": blob.size },
    body: JSON.stringify(meta),
  });
  if (!init.ok) throw new Error("init " + init.status + " " + (await init.text()).slice(0, 200));
  const put = await fetch(init.headers.get("location"), { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: blob });
  if (!put.ok) throw new Error("upload " + put.status + " " + (await put.text()).slice(0, 200));
  return (await put.json()).id;
}
async function scheduleYouTube() {
  if (BOA.GOOGLE_CLIENT_ID.startsWith("REMPLACE"))
    return alert("YouTube pas encore configure : colle ton ID OAuth Google dans boa-autopublish.js (ligne GOOGLE_CLIENT_ID).");
  if (!CAP.length) return alert("Aucune video captee. Lance d'abord l'export dans l'arene.");
  status("Connexion Google...");
  await loadGIS();
  const token = await getToken();
  let ok = 0;
  for (let i = 0; i < CAP.length; i++) {
    const when = slotDate(i);
    status(`YouTube ${i + 1}/${CAP.length} -> ${when.toLocaleString()}`);
    try {
      CAP[i].yt = await uploadOne(token, CAP[i].blob, CAP[i].name.replace(/\.mp4$/i, ""), when.toISOString());
      ok++; render();
    } catch (e) { console.error("[BOA]", e); status("Erreur: " + e.message); }
  }
  status(`Termine : ${ok}/${CAP.length} programmees sur YouTube.`);
}

/* ---------- 3. TikTok : telecharge les fichiers prets ---------- */
function downloadForTikTok() {
  if (!CAP.length) return alert("Aucune video captee.");
  CAP.forEach((c, i) => setTimeout(() => {
    const a = document.createElement("a");
    a.href = _createURL(c.blob); a.download = c.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }, i * 400));
  status("Telechargement... publie-les depuis le planificateur TikTok du telephone.");
}

/* ---------- 4. UI ---------- */
function status(t) { const el = document.getElementById("boa-status"); if (el) el.textContent = t; }
function render() {
  const el = document.getElementById("boa-count");
  if (el) el.textContent = `${CAP.length} captee(s) · ${CAP.filter(c => c.yt).length} sur YouTube`;
}
function panel() {
  const box = document.createElement("div");
  box.id = "boa-panel";
  box.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:99999;width:260px;background:#20201c;color:#f5f0e8;font:12px/1.4 Inter,system-ui,sans-serif;border-radius:12px;padding:12px;box-shadow:0 10px 40px rgba(0,0,0,.5)";
  box.innerHTML = `
    <div style="font:700 12px 'Press Start 2P',monospace;color:#F5A623;margin-bottom:8px">PUBLICATION</div>
    <div id="boa-count" style="opacity:.8;margin-bottom:8px">0 captee(s)</div>
    <button id="boa-yt" style="width:100%;margin:3px 0;padding:9px;border:0;border-radius:8px;font-weight:800;cursor:pointer;background:#E84040;color:#fff">Programmer sur YouTube</button>
    <button id="boa-tt" style="width:100%;margin:3px 0;padding:9px;border:0;border-radius:8px;font-weight:800;cursor:pointer;background:#40C040;color:#0f1a0f">Télécharger pour TikTok</button>
    <button id="boa-r"  style="width:100%;margin:3px 0;padding:6px;border:0;border-radius:8px;cursor:pointer;background:#3a3a32;color:#f5f0e8">Vider la file</button>
    <div id="boa-status" style="margin-top:8px;opacity:.75;min-height:16px"></div>`;
  document.body.appendChild(box);
  document.getElementById("boa-yt").onclick = () => scheduleYouTube().catch(e => status("Erreur: " + e.message));
  document.getElementById("boa-tt").onclick = downloadForTikTok;
  document.getElementById("boa-r").onclick = () => { CAP.length = 0; render(); status("File videe."); };
  render();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", panel);
else panel();
console.log("[BOA] publication chargee.");
