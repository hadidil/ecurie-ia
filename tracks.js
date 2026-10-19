// Les circuits : données et outils de géométrie.
// Un circuit est une ligne centrale. buildTrack() (dans sketch.js) en tire deux bords
// (inside / outside), des checkpoints et des murs, comme dans le projet de référence.

const TRACK_HALF_WIDTH = 32;   // demi-largeur de la piste (en pixels)
const CHECKPOINT_SPACING = 16; // distance visée entre deux checkpoints

const TRACKS = [
  { name: 'Niveau 1 · Courbes douces', level: 1,
    spline: [[143,122],[400,90],[651,110],[800,180],[819,301],[701,360],[613,300],[538,367],[590,480],[500,540],[330,500],[250,420],[138,463],[80,380],[100,241]] },
  { name: 'Niveau 2 · Mixte : 90° et diagonale', level: 2, r: 60,
    points: [[80,80],[430,80],[560,210],[820,210],[820,360],[700,360],[700,520],[400,520],[400,380],[250,380],[250,520],[80,520]] },
  { name: 'Niveau 3 · Angles droits (20 virages)', level: 3, r: 60,
    points: [[70,70],[400,70],[400,200],[560,200],[560,70],[830,70],[830,230],[680,230],[680,360],[830,360],[830,540],[500,540],[500,420],[350,420],[350,540],[70,540],[70,400],[210,400],[210,290],[70,290]] },
  { name: 'Niveau 4 · Labyrinthe (22 virages, épingles et chicanes)', level: 4, r: 60,
    points: [[70,70],[300,70],[300,190],[180,190],[180,300],[420,300],[420,170],[560,170],[560,70],[830,70],[830,260],[690,260],[690,400],[830,400],[830,540],[560,540],[560,420],[420,420],[420,540],[250,540],[250,430],[70,430]] },
  { name: 'Niveau 5 · Aléatoire (nouveau à chaque génération)', level: 5, random: true }
];

// Courbe lisse qui passe par les points de contrôle (Catmull-Rom)
function spline(ctrl) {
  const out = [];
  const n = ctrl.length;
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i + n - 1) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
    for (let k = 0; k < 30; k++) {
      const t = k / 30, t2 = t * t, t3 = t2 * t;
      const f = j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  return out;
}

// Polygone dont les angles sont arrondis (rayon r)
function roundedPolygon(pts, r) {
  const out = [], n = pts.length;
  let prev = null, first = null;
  const seg = (a, b) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.round(L / 6));
    for (let i = 0; i < k; i++) out.push([a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k]);
  };
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n], v = pts[i], q = pts[(i + 1) % n];
    const l1 = Math.hypot(v[0] - p[0], v[1] - p[1]), l2 = Math.hypot(q[0] - v[0], q[1] - v[1]);
    const d = Math.min(r, l1 / 2, l2 / 2);
    const a = [v[0] + (p[0] - v[0]) / l1 * d, v[1] + (p[1] - v[1]) / l1 * d];
    const b = [v[0] + (q[0] - v[0]) / l2 * d, v[1] + (q[1] - v[1]) / l2 * d];
    if (prev) seg(prev, a); else first = a;
    for (let k = 0; k < 10; k++) {
      const t = k / 10, u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * v[0] + t * t * b[0], u * u * a[1] + 2 * u * t * v[1] + t * t * b[1]]);
    }
    prev = b;
  }
  seg(prev, first);
  // la ligne de départ est au milieu du premier côté
  const m = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
  let bi = 0, bd = 1e9;
  out.forEach((s, i) => { const d = (s[0] - m[0]) ** 2 + (s[1] - m[1]) ** 2; if (d < bd) { bd = d; bi = i; } });
  return out.slice(bi).concat(out.slice(0, bi));
}

// Ligne centrale (dense) d'un circuit
function centerLine(T) {
  return T.spline ? spline(T.spline) : roundedPolygon(T.points, T.r);
}

// Redécoupe une courbe fermée en points régulièrement espacés
function resampleClosed(pts, spacing) {
  const n = pts.length, seg = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(L);
    total += L;
  }
  const M = Math.max(12, Math.round(total / spacing)), step = total / M;
  const out = [];
  let i = 0, acc = 0;
  for (let k = 0; k < M; k++) {
    const target = k * step;
    while (i < n - 1 && acc + seg[i] < target) { acc += seg[i]; i++; }
    const a = pts[i], b = pts[(i + 1) % n];
    const t = seg[i] > 0 ? (target - acc) / seg[i] : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

// Bords de la piste : on décale la ligne centrale de part et d'autre
function edgesFromCenter(center, half) {
  const M = center.length, inner = [], outer = [];
  for (let i = 0; i < M; i++) {
    const p = center[(i + M - 1) % M], q = center[(i + 1) % M], c = center[i];
    let tx = q[0] - p[0], ty = q[1] - p[1];
    const L = Math.hypot(tx, ty) || 1;
    tx /= L; ty /= L;
    inner.push(createVector(c[0] + ty * half, c[1] - tx * half));
    outer.push(createVector(c[0] - ty * half, c[1] + tx * half));
  }
  return { inside: inner, outside: outer };
}

// Vrai si deux segments (a1-a2) et (b1-b2) se croisent
function segIntersect(a1, a2, b1, b2) {
  const d = (u, v, w) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
  return (d(a1, a2, b1) > 0) !== (d(a1, a2, b2) > 0) && (d(b1, b2, a1) > 0) !== (d(b1, b2, a2) > 0);
}

// Vrai si une courbe fermée se coupe elle-même
function selfIntersects(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}
