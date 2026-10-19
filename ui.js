// ---------- Interface : écrans, écurie de cerveaux, curseurs ----------
// Aucune règle de simulation ici : on pilote seulement le moteur
// (nn.js, ga.js, vehicle.js, sketch.js).

const $ = id => document.getElementById(id);
const ROSTER_KEY = 'ecurieV2';
let roster = {};           // un cerveau mémorisé par famille
let trainingStarted = false;
let toastT = 0;

// Les noms de cerveaux sont saisis par l'utilisateur : on les échappe avant de les afficher
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Liste des cerveaux (créés et modifiés par le joueur) ----------
const TYPES_KEY = 'ecurieTypes';
const BRAIN_COLORS = ['#ffd23f', '#ff9ec7', '#7aa2ff', '#ff9f43', '#2ec4b6', '#b8f27c', '#f25f5c', '#a0e7e5'];

function saveBrainTypes() {
  try { localStorage.setItem(TYPES_KEY, JSON.stringify(BRAIN_TYPES)); } catch (e) {}
}

// Remplace le contenu de BRAIN_TYPES (le tableau reste le même objet)
function setBrainTypes(list) {
  BRAIN_TYPES.length = 0;
  list.forEach(b => BRAIN_TYPES.push({ id: b.id, name: b.name, hidden: b.hidden.slice(), color: b.color }));
  activeBrain = BRAIN_TYPES[0];
}

function validBrain(b) {
  return b && typeof b.id === 'string' && typeof b.name === 'string' && b.name.trim() && b.name.length <= 16
    && Array.isArray(b.hidden) && b.hidden.length >= 1 && b.hidden.length <= MAX_LAYERS
    && b.hidden.every(n => Number.isInteger(n) && n >= 1 && n <= MAX_NEURONS)
    && typeof b.color === 'string' && /^#[0-9a-f]{6}$/i.test(b.color);
}

function loadBrainTypes() {
  let list = null;
  try { list = JSON.parse(localStorage.getItem(TYPES_KEY)); } catch (e) {}
  const ok = Array.isArray(list) && list.length >= 1 && list.length <= MAX_BRAINS
    && list.every(validBrain) && new Set(list.map(b => b.id)).size === list.length;
  setBrainTypes(ok ? list : DEFAULT_BRAINS);
}

// ---------- Écurie : un cerveau mémorisé par famille ----------
function emptyEntry() {
  return { brain: null, ready: false, tr: {} };
}

function loadRoster() {
  let r = null;
  try { r = JSON.parse(localStorage.getItem(ROSTER_KEY)); } catch (e) {}
  BRAIN_TYPES.forEach(b => {
    const e = r && r[b.id];
    roster[b.id] = e && typeof e === 'object'
      ? { brain: e.brain || null, ready: Boolean(e.ready), tr: e.tr && typeof e.tr === 'object' ? e.tr : {} }
      : emptyEntry();
  });
}

function saveRoster() {
  try { localStorage.setItem(ROSTER_KEY, JSON.stringify(roster)); } catch (e) {}
}

// Renvoie le cerveau mémorisé d'une famille (ou null s'il n'existe pas ou s'il ne correspond plus aux capteurs)
function storedBrain(type) {
  const e = roster[type.id];
  if (!e || !e.brain) return null;
  const nn = NeuralNetwork.fromJSON(e.brain);
  const expected = [RAYS + 1, ...type.hidden, 2].join(',');
  return nn && nn.sizes.join(',') === expected ? nn : null;
}

// Appelé par ga.js à la fin de chaque génération
function rosterSync(best) {
  if (mode !== 'train' || !bestEver) return;
  const e = roster[activeBrain.id];
  e.brain = bestEver.brain.toJSON();
  const pct = bestEver.finished ? 100 : Math.min(99, Math.round(bestEver.score * 100));
  const old = e.tr[currentTrack];
  if (!old || pct >= old.pct) e.tr[currentTrack] = { pct: pct, fin: bestEver.finished };
  if (bestEver.finished && !e.ready) {
    e.ready = true;
    toast(activeBrain.name + ' est prêt : il a terminé un tour.');
  }
  saveRoster();
  renderBrains();
}

function renderBrains() {
  $('brains').innerHTML = BRAIN_TYPES.map(b => {
    const e = roster[b.id];
    const p = (e.tr[currentTrack] || {}).pct || 0;
    return `<button class="brain${b === activeBrain ? ' on' : ''}" data-id="${b.id}" style="--c:${b.color}"><span>${esc(b.name)}</span><small>${b.hidden.join(' + ')} neurones</small><i class="bar"><u style="width:${p}%"></u></i><em>${e.ready ? 'Prêt ✓' : p ? p + ' %' : 'Débutant'}</em></button>`;
  }).join('');
  document.querySelectorAll('.brain').forEach(el => {
    el.onclick = () => {
      if (mode === 'train') startTraining(BRAIN_TYPES.find(b => b.id === el.dataset.id));
      renderBrains();
    };
  });
  const n = BRAIN_TYPES.filter(b => roster[b.id].ready).length;
  $('bGoRace').disabled = $('bToRace').disabled = !n;
  $('bNewBrain').disabled = BRAIN_TYPES.length >= MAX_BRAINS;
  $('bDelBrain').disabled = BRAIN_TYPES.length <= 1;
  $('raceHint').textContent = n
    ? n + ' cerveau' + (n > 1 ? 'x' : '') + ' prêt' + (n > 1 ? 's' : '') + '. Les autres partiront avec ce qu\'ils ont appris.'
    : 'Termine un tour avec un cerveau pour débloquer la course.';
  drawNet();
}

function resetEcurie() {
  BRAIN_TYPES.forEach(b => roster[b.id] = emptyEntry());
  saveRoster();
  startTraining(activeBrain);
  renderBrains();
}

function toast(t) {
  const e = $('toast');
  e.textContent = t;
  e.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => e.hidden = true, 4000);
}

const say = t => $('note').textContent = t;

// ---------- Éditeur de cerveaux : créer, modifier, supprimer ----------
let editing = null; // cerveau en cours de modification (null = création)

function nextColor() {
  const used = BRAIN_TYPES.map(b => b.color.toLowerCase());
  return BRAIN_COLORS.find(c => !used.includes(c)) || BRAIN_COLORS[0];
}

function layersFromForm() {
  return ['bdL1', 'bdL2', 'bdL3'].map(id => parseInt($(id).value, 10)).filter(n => Number.isInteger(n) && n > 0);
}

// Message d'erreur du formulaire, ou chaîne vide si tout est bon
function brainFormError() {
  const name = $('bdName').value.trim();
  if (!name) return 'Donne un nom au cerveau.';
  if (BRAIN_TYPES.some(b => b !== editing && b.name.toLowerCase() === name.toLowerCase())) return 'Ce nom est déjà pris.';
  const raw = [$('bdL1').value, $('bdL2').value, $('bdL3').value];
  if (!(parseInt(raw[0], 10) >= 1)) return 'La couche 1 doit avoir au moins 1 neurone.';
  if (raw.some(v => v !== '' && !(parseInt(v, 10) >= 0 && parseInt(v, 10) <= MAX_NEURONS))) return 'Chaque couche a entre 0 et ' + MAX_NEURONS + ' neurones.';
  return '';
}

function refreshBrainForm() {
  const err = brainFormError();
  const hidden = layersFromForm();
  $('bdWarn').textContent = err;
  $('bdSave').disabled = Boolean(err);
  if (hidden.length) {
    const probe = new NeuralNetwork(RAYS + 1, hidden, 2);
    $('bdInfo').textContent = [RAYS + 1, ...hidden, 2].join(' → ') + ' : ' + probe.geneCount + ' poids et biais';
  } else {
    $('bdInfo').textContent = '';
  }
}

function openBrainEditor(brain) {
  editing = brain || null;
  $('bdTitle').textContent = brain ? 'Modifier « ' + brain.name + ' »' : 'Nouveau cerveau';
  $('bdName').value = brain ? brain.name : '';
  $('bdColor').value = brain ? brain.color : nextColor();
  const h = brain ? brain.hidden : [8];
  $('bdL1').value = h[0] || '';
  $('bdL2').value = h[1] || '';
  $('bdL3').value = h[2] || '';
  $('bdHint').textContent = brain ? 'Changer les couches remet ce cerveau à zéro (ses poids ne correspondraient plus).' : 'Un nouveau cerveau commence sans rien savoir.';
  refreshBrainForm();
  const d = $('brainDialog');
  if (d.showModal) d.showModal(); else d.setAttribute('open', '');
}

function closeBrainEditor() {
  const d = $('brainDialog');
  if (d.close) d.close(); else d.removeAttribute('open');
}

function saveBrainEditor() {
  if (brainFormError()) return refreshBrainForm();
  const name = $('bdName').value.trim().slice(0, 16);
  const color = $('bdColor').value;
  const hidden = layersFromForm();

  if (editing) {
    const sameShape = hidden.join(',') === editing.hidden.join(',');
    editing.name = name;
    editing.color = color;
    if (!sameShape) {
      editing.hidden = hidden;
      roster[editing.id] = emptyEntry();   // les anciens poids ne vont plus
    }
    saveBrainTypes();
    saveRoster();
    if (!sameShape && mode === 'train' && editing === activeBrain) startTraining(editing);
    say(name + ' a été modifié' + (sameShape ? '.' : ' et repart de zéro.'));
  } else {
    if (BRAIN_TYPES.length >= MAX_BRAINS) return;
    const brain = { id: 'b' + Date.now().toString(36), name: name, hidden: hidden, color: color };
    BRAIN_TYPES.push(brain);
    roster[brain.id] = emptyEntry();
    saveBrainTypes();
    saveRoster();
    if (mode === 'train') startTraining(brain); else activeBrain = brain;
    say(name + ' est créé : lance l\'entraînement et regarde-le apprendre.');
  }
  closeBrainEditor();
  renderBrains();
}

function deleteActiveBrain() {
  if (BRAIN_TYPES.length <= 1) return;
  if (!confirm('Supprimer le cerveau « ' + activeBrain.name + ' » et tout ce qu\'il a appris ?')) return;
  const gone = activeBrain;
  BRAIN_TYPES.splice(BRAIN_TYPES.indexOf(gone), 1);
  delete roster[gone.id];
  saveBrainTypes();
  saveRoster();
  activeBrain = BRAIN_TYPES[0];
  if (mode === 'train') startTraining(activeBrain);
  renderBrains();
  say(gone.name + ' a été supprimé.');
}

function restoreDefaultBrains() {
  if (!confirm('Remettre les cerveaux d\'origine ? Les cerveaux créés et tout ce qu\'ils ont appris seront effacés.')) return;
  setBrainTypes(DEFAULT_BRAINS);
  roster = {};
  BRAIN_TYPES.forEach(b => roster[b.id] = emptyEntry());
  saveBrainTypes();
  saveRoster();
  if (mode === 'train') startTraining(activeBrain);
  renderBrains();
  say('Les cerveaux d\'origine sont de retour.');
}

// ---------- Schéma du cerveau ----------
function drawNet() {
  const c = $('nn');
  if (!c) return;
  const S = [RAYS + 1, ...activeBrain.hidden, 2];
  const x = c.getContext('2d'), w = c.width, h = c.height;
  const K = S.map(n => Math.min(n, 10));
  const px = l => 30 + l * (w - 60) / (S.length - 1);
  const py = (l, i) => h / 2 - 8 + (i - (K[l] - 1) / 2) * Math.min(17, (h - 40) / K[l]);
  x.clearRect(0, 0, w, h);
  x.lineWidth = 1;
  x.strokeStyle = 'rgba(130,150,160,.22)';
  for (let l = 1; l < S.length; l++)
    for (let i = 0; i < K[l - 1]; i++)
      for (let j = 0; j < K[l]; j++) {
        x.beginPath(); x.moveTo(px(l - 1), py(l - 1, i)); x.lineTo(px(l), py(l, j)); x.stroke();
      }
  S.forEach((n, l) => {
    x.fillStyle = l === 0 ? '#5b9bd5' : l === S.length - 1 ? '#e0a526' : activeBrain.color;
    for (let i = 0; i < K[l]; i++) { x.beginPath(); x.arc(px(l), py(l, i), 5, 0, 7); x.fill(); }
    x.fillStyle = '#8a98a2'; x.font = '12px sans-serif'; x.textAlign = 'center';
    x.fillText((n > 10 ? n + ' (10 affichés)' : n) + (l === 0 ? ' entrées' : l === S.length - 1 ? ' sorties' : ' neurones'), px(l), h - 8);
  });
  const probe = new NeuralNetwork(S[0], activeBrain.hidden, 2);
  $('nnInfo').textContent = S.join(' → ') + ' : ' + probe.geneCount + ' poids et biais';
}

// ---------- Affichage des chiffres ----------
function speedValue() {
  const e = $('mul');
  return e ? +e.value : 2;
}

function pct(x) {
  return Math.min(100, Math.max(0, Math.round(x * 100)));
}

function updateHUD() {
  const M = checkpoints.length || 1;
  const e = roster[activeBrain.id];
  const saved = e && e.tr[currentTrack];
  if (mode === 'train') {
    $('lTry').textContent = 'Génération';
    $('sTry').textContent = generationCount;
    $('lCur').textContent = 'Avancée';
    $('sCur').textContent = bestP ? pct(bestP.points / M) + '%' : '0%';
    const bestScore = bestEver && bestEver.score ? bestEver.score : 0;
    $('sBest').textContent = (bestEver && bestEver.finished ? 100 : saved ? saved.pct : pct(bestScore)) + '%';
    const lap = bestEver && bestEver.bestLap ? bestEver.bestLap : 0;
    $('sRec').textContent = lap ? (lap / 60).toFixed(2) + ' s' : '–';
    $('sState').textContent = paused ? 'En pause' : 'En cours';
  } else {
    $('lTry').textContent = 'Mode';
    $('sTry').textContent = 'Course';
    $('lCur').textContent = 'Tours du leader';
    const lead = [...population].sort((a, b) => raceScore(b) - raceScore(a))[0] || raceRanking[0];
    $('sCur').textContent = lead ? Math.min(lead.laps, RACE_LAPS) + '/' + RACE_LAPS : '0';
    $('sBest').textContent = (saved ? saved.pct : 0) + '%';
    $('sRec').textContent = raceBestLap ? (raceBestLap / 60).toFixed(2) + ' s' : '–';
    $('sState').textContent = mode === 'results' ? 'Terminée' : paused ? 'En pause' : 'Grand Prix';
  }
}

function leaderboardRows(list) {
  return list.map((v, i) => {
    const lap = v.bestLap ? (v.bestLap / 60).toFixed(2) + ' s' : '–';
    return `<tr${i ? '' : ' class="top"'}><td>${i + 1}</td><td>n°${v.number}</td><td><i class="sw" style="background:${v.type.color}"></i>${esc(v.type.name)}</td><td>${Math.min(v.laps + (v.finished ? 0 : 1), RACE_LAPS)}/${RACE_LAPS}</td><td>${lap}</td><td>${v.crashes}</td><td>${raceScore(v).toFixed(2)}</td></tr>`;
  }).join('');
}

const LB_HEAD = '<tr><th>#</th><th>Voiture</th><th>Cerveau</th><th>Tour</th><th>Meilleur tour</th><th>Sorties</th><th>Score</th></tr>';

// Classement en direct pendant la course
function renderLB() {
  const list = mode === 'results' ? raceRanking : [...population].sort((a, b) => raceScore(b) - raceScore(a));
  $('lbT').textContent = '· ' + RACE_LAPS + ' tours · ' + RACE_CARS + ' voitures';
  $('lb').innerHTML = LB_HEAD + leaderboardRows(list);
}

// Fiche de résultats, affichée quand la course est terminée
function showRaceResults() {
  renderLB();
  const w = raceRanking[0];
  if (!w) return;
  $('resultsReward').textContent = 'Voiture n°' + w.number + ' · ' + w.type.name;
  $('resultsSummary').textContent = (w.bestLap ? 'Meilleur tour : ' + (w.bestLap / 60).toFixed(2) + ' s. ' : 'Aucun tour terminé. ')
    + 'Elle a le meilleur score de la course (' + raceScore(w).toFixed(2) + ').';
  $('resultsTable').innerHTML = '<table>' + LB_HEAD + leaderboardRows(raceRanking.slice(0, 8)) + '</table>';
  $('bPause').disabled = true;
  $('raceResults').hidden = false;
  updateHUD();
}

// ---------- Écrans ----------
const main = () => document.querySelector('main');

function syncPause() {
  $('bPause').textContent = paused ? '▶ Reprendre' : '⏸ Pause';
}

function setPaused(p) {
  paused = p;
  syncPause();
  updateHUD();
}

function showView(v) {
  main().dataset.view = v;
  if (v === 'menu') paused = true;
  else if (mode !== 'results') paused = false;
  syncPause();
  updateHUD();
}

function goTrain() {
  $('raceResults').hidden = true;
  $('bPause').disabled = false;
  if (!trainingStarted || mode !== 'train') {
    trainingStarted = true;
    startTraining(activeBrain);
  }
  showView('train');
  say('Choisis un cerveau et laisse-le apprendre.');
  renderBrains();
}

function goRace() {
  $('raceResults').hidden = true;
  $('bPause').disabled = false;
  startRace();
  showView('race');
  renderLB();
  say('Course : les voitures font ' + RACE_LAPS + ' tours. Une voiture qui sort de la piste est remise sur la route.');
}

// ---------- Curseurs ----------
// [clé, libellé, min, max, pas, défaut, effet]
// effet : 0 immédiat · 1 physique (le cerveau garde ses poids) · 2 capteurs (tout repart de zéro)
const PARAMS = [
  ['mul',   'Vitesse de simulation',      1, 30, 1,    2,    0],
  ['nc',    'Voitures par génération',   10, 120, 5,   50,   0],
  ['mut',   'Taux de mutation',         .02, .5, .01,  .1,   0],
  ['speed', 'Vitesse max',                2, 6,  .5,   5,    1],
  ['force', 'Force moteur',              .1, .6, .05,  .3,   1],
  ['sight', 'Portée des capteurs',       50, 250, 10,  150,  1],
  ['life',  'Patience (images entre 2 checkpoints)', 20, 150, 5, 45, 1],
  ['pen',   'Pénalité de sortie (course)', 0, 2, .1,   .5,   0],
  ['rays',  'Nombre de capteurs',         3, 15, 1,    7,    2],
  ['fov',   'Angle de vision (°)',       90, 220, 10,  160,  2]
];
const DEFAULTS = Object.fromEntries(PARAMS.map(p => [p[0], p[5]]));
const SETTERS = {
  nc: v => TOTAL = v, mut: v => MUTATION_RATE = v, speed: v => MAX_SPEED = v, force: v => MAX_FORCE = v,
  sight: v => SIGHT = v, life: v => LIFESPAN = v, pen: v => PENALTY = v, rays: v => RAYS = v, fov: v => FOV = v
};

function applyParam(k, v) {
  if (SETTERS[k]) SETTERS[k](v);
}

function paramChanged() {
  if (mode !== 'train') return;
  startTraining(activeBrain);
  renderBrains();
  say('Réglages modifiés : le cerveau garde ce qu\'il a appris et réapprend avec cette physique.');
}

function buildSliders() {
  PARAMS.forEach(([k, label, mn, mx, st, df, fx]) => {
    const d = document.createElement('div');
    d.className = 'sl';
    d.innerHTML = `<label for="${k}">${label}</label><input id="${k}" type="range" min="${mn}" max="${mx}" step="${st}" value="${df}"><output id="o_${k}">${df}</output>`;
    $(k === 'mul' ? 'speedBox' : fx === 0 && k !== 'pen' ? 'sliders' : 'advSliders').appendChild(d);
    $(k).oninput = e => {
      $('o_' + k).textContent = e.target.value;
      if (fx !== 2) applyParam(k, +e.target.value);
    };
    $(k).onchange = e => {
      if (fx === 2) {
        applyParam(k, +e.target.value);
        resetEcurie();
        say('Les capteurs ont changé : tous les cerveaux repartent de zéro.');
      } else if (fx === 1) {
        paramChanged();
      }
    };
  });
}

function resetSliders() {
  const structural = RAYS !== DEFAULTS.rays || FOV !== DEFAULTS.fov;
  PARAMS.forEach(([k, , , , , df]) => {
    $(k).value = df;
    $('o_' + k).textContent = df;
    applyParam(k, df);
  });
  if (structural) resetEcurie(); else paramChanged();
}

// ---------- Démarrage de l'interface (appelée par setup() dans sketch.js) ----------
function initUI() {
  loadBrainTypes();
  loadRoster();
  buildSliders();

  TRACKS.forEach((t, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = t.name;
    $('trk').appendChild(o);
  });
  $('trk').value = currentTrack;
  $('trk').onchange = e => {
    currentTrack = +e.target.value;
    if (mode === 'train') startTraining(activeBrain);
    renderBrains();
    say('Nouveau circuit : le cerveau garde ce qu\'il a appris.');
  };

  $('bMenu').onclick = () => showView('menu');
  $('bGoTrain').onclick = goTrain;
  $('bGoRace').onclick = $('bToRace').onclick = $('bRaceNew').onclick = goRace;
  $('bBackTrain').onclick = () => { trainingStarted = true; startTraining(activeBrain); showView('train'); $('raceResults').hidden = true; $('bPause').disabled = false; renderBrains(); };
  $('bHelp').onclick = () => $('helpDialog').showModal();
  $('bPause').onclick = () => setPaused(!paused);
  $('bDef').onclick = resetSliders;
  $('bResetBrain').onclick = () => {
    roster[activeBrain.id] = emptyEntry();
    saveRoster();
    startTraining(activeBrain);
    renderBrains();
    say(activeBrain.name + ' repart de zéro.');
  };

  $('bNewBrain').onclick = () => openBrainEditor(null);
  $('bEditBrain').onclick = () => openBrainEditor(activeBrain);
  $('bDelBrain').onclick = deleteActiveBrain;
  $('bDefaultBrains').onclick = restoreDefaultBrains;
  $('bdSave').onclick = saveBrainEditor;
  $('bdCancel').onclick = closeBrainEditor;
  ['bdName', 'bdL1', 'bdL2', 'bdL3'].forEach(id => $(id).oninput = refreshBrainForm);

  renderBrains();
  showView('menu');
}
