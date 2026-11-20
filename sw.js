// Tată, rămâi cu noi — service worker
// 1) Ține aplicația disponibilă și fără internet (pagina e luată întâi de pe net, ca să vină actualizările).
// 2) Trimite o notificare pe zi, fără server: Android trezește aplicația periodic (Periodic Background Sync),
//    iar la fiecare deschidere a aplicației se recuperează mesajul zilei dacă telefonul l-a sărit.

const CACHE = 'ramai-v3';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const HOUR = 3600e3, DAY = 24 * HOUR;

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'ramai-state').map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});

// ---------- daily message ----------
async function readJSON(name) {
  const c = await caches.open('ramai-state'); const r = await c.match(name);
  return r ? r.json() : null;
}
async function writeJSON(name, obj) {
  const c = await caches.open('ramai-state');
  await c.put(name, new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } }));
}
function todayKey(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function fmt(n) { return Math.round(n).toLocaleString('ro-RO'); }

async function dailyMessage(opts) {
  const s = await readJSON('state.json');
  if (!s || !s.start) return;
  const now = new Date();
  if (opts && opts.catchup && now.getHours() < 8) return; // nu-l trezim noaptea
  const last = (await readJSON('last.json')) || {};
  const key = todayKey(now);
  if (last.day === key) return; // un singur mesaj pe zi

  const e = Math.max(0, now - s.start), ec = Math.max(0, now - (s.signed || s.start));
  const day = Math.floor(e / DAY) + 1;
  const capsOpen = s.caps.filter(c => ec >= c.h * HOUR);
  const tIdx = s.targets.filter(t => e >= t.h * HOUR).length;
  const daysLeft = Math.max(0, Math.ceil((s.pactDays * DAY - e) / DAY));

  let title, body;
  if (capsOpen.length > (last.caps || 0)) {
    const c = capsOpen[capsOpen.length - 1];
    title = '💌 Ai un mesaj nou de la ' + c.from;
    body = c.when + ' fără țigări. Deschide aplicația să-l citești.';
  } else if (tIdx > (last.target || 0) && tIdx > 0) {
    const t = s.targets[tIdx - 1];
    title = '🏅 ' + t.n + ' fără țigări!';
    body = 'Ai câștigat o medalie nouă. ' + s.son.charAt(0).toUpperCase() + s.son.slice(1) + ' e mândru de tine.';
  } else {
    title = 'Ziua ' + day + ' fără țigări, tată 💪';
    const q = s.quotes[(day - 1) % s.quotes.length];
    const money = e / DAY * s.price / s.eur;
    body = q + (daysLeft > 0 ? ' Mai ai ' + daysLeft + (daysLeft === 1 ? ' zi' : (daysLeft % 100 >= 20 ? ' de zile' : ' zile')) + ' până la Duster 🔑' : ' Duster-ul e al tău 🔑') + ' · ' + fmt(money) + ' € strânși.';
  }
  await self.registration.showNotification(title, {
    body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'zilnic', renotify: true, data: { url: './' }
  });
  await writeJSON('last.json', { day: key, caps: capsOpen.length, target: tIdx });
}

self.addEventListener('periodicsync', e => { if (e.tag === 'zilnic') e.waitUntil(dailyMessage()); });
self.addEventListener('message', e => { if (e.data && e.data.type === 'catchup') e.waitUntil(dailyMessage({ catchup: true })); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) { if ('focus' in w) return w.focus(); }
    return clients.openWindow('./');
  }));
});
