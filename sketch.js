// ---------- Réglages (modifiables par les curseurs de l'interface) ----------
let TOTAL = 50;            // nombre de voitures par génération
let MUTATION_RATE = 0.1;   // taux de mutation
let LIFESPAN = 45;         // images autorisées entre deux checkpoints
let SIGHT = 150;           // portée des capteurs
let MAX_SPEED = 5;         // vitesse maximale
let MAX_FORCE = 0.3;       // force du moteur (accélération et braquage)
let RAYS = 7;              // nombre de capteurs
let FOV = 160;             // angle de vision (degrés)
let PENALTY = 0.5;         // pénalité par sortie de piste (course)

const W = 900, H = 600;    // taille du canvas
const TRAIN_LAPS = 1;      // tours demandés à l'entraînement
const RACE_LAPS = 3;       // tours de la course
const RACE_CARS = 12;      // voitures dans la course
const RACE_MAX = 3600;     // durée maximale de la course (images)
const SIGHT_MAX = 250;

// ---------- Le circuit ----------
let walls = [];            // murs du circuit
let inside = [];           // bord intérieur
let outside = [];          // bord extérieur
let checkpoints = [];      // lignes à franchir, dans l'ordre
let nearWalls = [];        // pour chaque checkpoint : les murs proches (accélère les capteurs)
let start;                 // position de départ
let startAngle = 0;        // direction de départ
let trackLength = 0;       // longueur d'un tour (pixels)
let trackLayer;            // dessin du circuit, fait une seule fois

// ---------- Les voitures ----------
let population = [];       // voitures encore en piste
let savedVehicles = [];    // voitures mortes ou arrivées (génération terminée)

// ---------- État du jeu ----------
let mode = 'train';        // 'train' | 'race' | 'results'
let paused = true;
let currentTrack = 0;
let activeBrain = BRAIN_TYPES[0];
let bestP = null;          // voiture mise en évidence
let raceFrame = 0;
let raceRanking = [];
let raceBestLap = 0;
let hudTimer = 0;

// ---------- Construction du circuit ----------

// Circuit aléatoire (idée du projet de référence : le rayon varie de façon lisse avec l'angle)
function randomTrackEdges() {
  const noiseMax = 4;
  const total = 60;
  const half = TRACK_HALF_WIDTH;
  for (let attempt = 0; attempt < 40; attempt++) {
    const ins = [], outs = [];
    const startX = random(1000);
    const startY = random(1000);
    for (let i = 0; i < total; i++) {
      let a = map(i, 0, total, 0, TWO_PI);
      let xoff = map(cos(a), -1, 1, 0, noiseMax) + startX;
      let yoff = map(sin(a), -1, 1, 0, noiseMax) + startY;
      let n = noise(xoff, yoff);
      let xr = map(n, 0, 1, 110, W * 0.5 - 20);
      let yr = map(n, 0, 1, 110, H * 0.5 - 20);
      ins.push(createVector(W / 2 + (xr - half) * cos(a), H / 2 + (yr - half) * sin(a)));
      outs.push(createVector(W / 2 + (xr + half) * cos(a), H / 2 + (yr + half) * sin(a)));
    }
    if (!selfIntersects(ins) && !selfIntersects(outs)) return { inside: ins, outside: outs };
  }
  // en dernier recours : un cercle
  const ins = [], outs = [];
  for (let i = 0; i < total; i++) {
    const a = (i / total) * TWO_PI;
    ins.push(createVector(W / 2 + 190 * cos(a), H / 2 + 150 * sin(a)));
    outs.push(createVector(W / 2 + 254 * cos(a), H / 2 + 214 * sin(a)));
  }
  return { inside: ins, outside: outs };
}

/* construit un nouveau circuit */
function buildTrack(index) {
  if (index === undefined) index = currentTrack;
  const T = TRACKS[index];

  let edges;
  if (T.random) {
    edges = randomTrackEdges();
  } else {
    const center = resampleClosed(centerLine(T), CHECKPOINT_SPACING);
    edges = edgesFromCenter(center, TRACK_HALF_WIDTH);
  }
  inside = edges.inside;
  outside = edges.outside;

  // un checkpoint par paire de points (bord intérieur - bord extérieur)
  const M = inside.length;
  checkpoints = [];
  for (let i = 0; i < M; i++) {
    checkpoints.push(new Boundary(inside[i].x, inside[i].y, outside[i].x, outside[i].y));
  }
  // sens de la course à chaque checkpoint
  trackLength = 0;
  for (let i = 0; i < M; i++) {
    const c = checkpoints[i], n = checkpoints[(i + 1) % M];
    const dx = n.mx - c.mx, dy = n.my - c.my, L = Math.hypot(dx, dy) || 1;
    c.fx = dx / L;
    c.fy = dy / L;
    trackLength += L;
  }

  // les murs : deux segments par checkpoint, un de chaque côté
  walls = [];
  for (let i = 0; i < M; i++) {
    let a1 = inside[i];
    let b1 = inside[(i + 1) % M];
    walls.push(new Boundary(a1.x, a1.y, b1.x, b1.y));
    let a2 = outside[i];
    let b2 = outside[(i + 1) % M];
    walls.push(new Boundary(a2.x, a2.y, b2.x, b2.y));
  }

  // pour chaque checkpoint, la liste des murs situés autour de lui
  const reach = Math.ceil(SIGHT_MAX / (trackLength / M)) + 3;
  nearWalls = [];
  for (let i = 0; i < M; i++) {
    const list = [];
    for (let k = -reach; k <= reach; k++) {
      const j = (((i + k) % M) + M) % M;
      list.push(walls[2 * j], walls[2 * j + 1]);
    }
    nearWalls.push(list);
  }

  start = checkpoints[0].midpoint();
  startAngle = Math.atan2(checkpoints[1].my - checkpoints[0].my, checkpoints[1].mx - checkpoints[0].mx);
  renderTrackLayer();
}

// Dessine le circuit une fois pour toutes dans une image
// (ombre, bordure claire, asphalte, ligne pointillée, checkpoints numérotés, ligne de départ)
function renderTrackLayer() {
  if (!trackLayer) {
    trackLayer = createGraphics(W, H);
    trackLayer.pixelDensity(1);
  }
  const g = trackLayer;
  const c = g.drawingContext;
  const M = checkpoints.length;
  const TW = TRACK_HALF_WIDTH * 2;
  g.background('#0f1a2c');

  const edge = pts => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); };
  const middle = () => { c.beginPath(); checkpoints.forEach((cp, i) => i ? c.lineTo(cp.mx, cp.my) : c.moveTo(cp.mx, cp.my)); c.closePath(); };
  c.lineJoin = 'round';

  // ombre portée sous la piste
  c.lineWidth = 12;
  c.strokeStyle = 'rgba(0,0,0,.28)';
  c.shadowColor = 'rgba(0,0,0,.35)';
  c.shadowBlur = 10;
  c.shadowOffsetY = 5;
  edge(inside); c.stroke();
  edge(outside); c.stroke();
  c.shadowColor = 'transparent';
  c.shadowBlur = 0;
  c.shadowOffsetY = 0;

  // bordures claires
  c.lineWidth = 10;
  c.strokeStyle = '#c9d3ea';
  edge(inside); c.stroke();
  edge(outside); c.stroke();

  // asphalte : la surface entre les deux bords, exactement là où sont les murs
  c.fillStyle = '#2a3142';
  c.beginPath();
  inside.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
  c.closePath();
  outside.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
  c.closePath();
  c.fill('evenodd');

  // ligne centrale pointillée
  c.lineWidth = 2;
  c.strokeStyle = '#566079';
  c.setLineDash([12, 14]);
  middle(); c.stroke();
  c.setLineDash([]);

  // checkpoints (lignes bleues en travers de la piste), un sur quelques-uns, numérotés
  const every = Math.max(1, Math.round(100 / (trackLength / M)));
  c.lineWidth = 2;
  c.strokeStyle = 'rgba(80,170,255,.62)';
  c.font = 'bold 10px system-ui';
  for (let k = every; k < M; k += every) {
    const cp = checkpoints[k];
    c.beginPath(); c.moveTo(cp.a.x, cp.a.y); c.lineTo(cp.b.x, cp.b.y); c.stroke();
    c.fillStyle = 'rgba(190,230,255,.85)';
    c.fillText(String(k / every), cp.mx + (cp.b.x - cp.a.x) * 0.38, cp.my + (cp.b.y - cp.a.y) * 0.38);
  }

  // ligne de départ à damier
  c.save();
  c.translate(start.x, start.y);
  c.rotate(startAngle);
  c.fillStyle = '#fff';
  c.fillRect(-2, -TW / 2, 4, TW);
  c.fillStyle = '#202b33';
  for (let k = 0; k < 8; k++) c.fillRect(-2, -TW / 2 + k * 8, 4, 4);
  c.restore();
}

// Trace une ligne à partir d'une liste [x, y, x, y, ...]
function drawTrail(list, color, width, alpha) {
  if (list.length < 4) return;
  const c = drawingContext;
  c.save();
  c.globalAlpha = alpha;
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(list[0], list[1]);
  for (let i = 2; i < list.length; i += 2) c.lineTo(list[i], list[i + 1]);
  c.stroke();
  c.restore();
}

// ---------- Entraînement ----------

// Démarre (ou redémarre) l'entraînement d'une famille de cerveaux
function startTraining(type) {
  mode = 'train';
  activeBrain = type || activeBrain;
  generationCount = 1;
  bestEver = null;
  savedVehicles = [];
  buildTrack(currentTrack);

  // un cerveau déjà entraîné garde ses poids (repart de la mémoire de l'écurie)
  const known = typeof storedBrain === 'function' ? storedBrain(activeBrain) : null;
  population = [];
  for (let i = 0; i < TOTAL; i++) {
    const v = new Vehicle(known, activeBrain);
    if (known && i > 0) v.mutate();
    population.push(v);
  }
  if (known) bestEver = { brain: known.copy(), score: 0, finished: false, bestLap: 0, path: [] };
  bestP = population[0];
  paused = false;
}

// Une image de simulation pour l'entraînement
function trainStep() {
  // Pour chaque voiture
  for (let vehicle of population) {
    // On applique le comportement
    vehicle.applyBehaviors(walls);
    // on regarde si on a passé un checkpoint
    vehicle.check(checkpoints);
    // classique.... on met à jour accélérations, vitesses et positions
    vehicle.update();
  }

  // On supprime les voitures mortes ou celles qui ont fini le circuit
  for (let i = population.length - 1; i >= 0; i--) {
    const vehicle = population[i];
    if (vehicle.dead || vehicle.finished) {
      savedVehicles.push(population.splice(i, 1)[0]);
    }
  }

  // Si jamais on a plus de voitures, on passe à la génération suivante
  if (population.length === 0) {
    nextGeneration();
  }
}

// ---------- Course ----------

function raceScore(v) {
  const M = checkpoints.length;
  return v.points / M - PENALTY * 0.3 * v.crashes + (v.finished ? 1 + (RACE_MAX - v.finishFrame) / RACE_MAX : 0);
}

function startRace() {
  mode = 'race';
  raceFrame = 0;
  raceRanking = [];
  buildTrack(currentTrack);
  population = [];
  savedVehicles = [];
  for (let i = 0; i < RACE_CARS; i++) {
    const type = BRAIN_TYPES[i % BRAIN_TYPES.length];
    const known = typeof storedBrain === 'function' ? storedBrain(type) : null;
    const v = new Vehicle(known, type);
    // les quatre premières voitures sont les cerveaux tels quels, les autres des variantes
    if (known && i >= BRAIN_TYPES.length) v.brain.mutate(0.05, 0.15);
    v.targetLaps = RACE_LAPS;
    v.number = i + 1;
    // départ côte à côte
    const t = 0.5 + ((i % 4) - 1.5) * 0.14;
    v.pos.set(lerp(checkpoints[0].a.x, checkpoints[0].b.x, t), lerp(checkpoints[0].a.y, checkpoints[0].b.y, t));
    v.prev.set(v.pos);
    population.push(v);
  }
  bestP = population[0];
  paused = false;
}

// Une image de simulation pour la course
function raceStep() {
  for (let vehicle of population) {
    if (vehicle.dead) vehicle.respawn();
    vehicle.applyBehaviors(walls);
    vehicle.check(checkpoints);
    vehicle.update();
  }
  raceFrame++;
  if (raceFrame >= RACE_MAX || population.some(v => v.finished)) endRace();
}

function endRace() {
  raceRanking = [...population].sort((a, b) => raceScore(b) - raceScore(a));
  for (const v of population) {
    if (v.bestLap && (!raceBestLap || v.bestLap < raceBestLap)) raceBestLap = v.bestLap;
  }
  mode = 'results';
  paused = true;
  if (typeof showRaceResults === 'function') showRaceResults();
}

// ---------- p5.js ----------

function setup() {
  pixelDensity(1);
  const canvas = createCanvas(W, H);
  canvas.parent('stage');
  initUI();
  buildTrack(currentTrack);
  population = [];
  for (let i = 0; i < 12; i++) population.push(new Vehicle(null, activeBrain));
  bestP = population[0];
  paused = true;
}

// Appelée 60 fois / seconde
function draw() {
  // Nombre de cycles par frame ("époques par frame"), réglé par le curseur de vitesse
  const cycles = speedValue();
  if (!paused) {
    for (let n = 0; n < cycles; n++) {
      if (mode === 'train') trainStep();
      else if (mode === 'race') raceStep();
      if (paused) break;
    }
  }

  // Par défaut le meilleur candidat est le premier de la population
  if (population.length) {
    bestP = population[0];
    for (let vehicle of population) {
      // une voiture vivante passe avant une morte, sinon celle qui a passé le plus de checkpoints
      const better = vehicle.dead === bestP.dead ? vehicle.points > bestP.points : !vehicle.dead;
      if (better) bestP = vehicle;
    }
  }

  // on dessine le circuit
  image(trackLayer, 0, 0);

  // le meilleur parcours trouvé jusqu'ici, en jaune
  if (mode === 'train' && bestEver && bestEver.path) drawTrail(bestEver.path, '#e8b923', 2.5, 0.85);

  // les traces des voitures (celle du meilleur en plus marqué)
  const all = savedVehicles.concat(population);
  for (let vehicle of all) {
    if (vehicle !== bestP) drawTrail(vehicle.trail, '#7fd3e6', 1.5, 0.3);
  }
  if (bestP && mode !== 'results') drawTrail(bestP.trail, '#7fd3e6', 1.5, 1);

  // On dessine les voitures : les mortes (pâles) d'abord, puis celles en piste
  for (let vehicle of savedVehicles) vehicle.show(false);
  for (let vehicle of population) if (vehicle !== bestP) vehicle.show(false);

  // On met la voiture la meilleure en surbrillance (capteurs visibles, au premier plan)
  if (bestP) {
    if (mode !== 'results' && !bestP.dead) bestP.highlight();
    else bestP.show(false);
  }

  if (++hudTimer % 6 === 0) updateHUD();
  if (mode === 'race' && hudTimer % 15 === 0) renderLB();
}
