// Types de cerveaux de l'écurie : chaque famille a sa propre architecture
// (nombre de neurones dans chaque couche cachée)
const BRAIN_TYPES = [
  { id: 'reflex',   name: 'Réflexe',   hidden: [6],     color: '#ff7a59' },
  { id: 'balanced', name: 'Équilibré', hidden: [8],     color: '#4fb6c9' },
  { id: 'deep',     name: 'Profond',   hidden: [10, 6], color: '#c77dff' },
  { id: 'wide',     name: 'Large',     hidden: [16],    color: '#5fd38d' }
];

// Copie des cerveaux d'origine (pour pouvoir les restaurer) et limites de l'éditeur
const DEFAULT_BRAINS = BRAIN_TYPES.map(b => ({ id: b.id, name: b.name, hidden: b.hidden.slice(), color: b.color }));
const MAX_BRAINS = 8;    // nombre maximal de cerveaux dans l'écurie
const MAX_LAYERS = 3;    // nombre maximal de couches cachées
const MAX_NEURONS = 32;  // nombre maximal de neurones par couche

// Amplitude (écart-type) d'une mutation sur un poids
let MUTATION_SIZE = 0.4;

// Réseau de neurones : même interface que celle du projet de référence
// (copy, mutate, predict, dispose, createModel) mais écrit en JavaScript pur,
// sans TensorFlow.js : beaucoup plus rapide quand on simule des dizaines de voitures.
class NeuralNetwork {
  // inputs  : nombre de neurones en entrée (un par capteur + la vitesse)
  // hidden  : nombre de neurones de la couche cachée, ou tableau si plusieurs couches
  // outputs : nombre de neurones en sortie (2 : direction et vitesse)
  // model   : (optionnel) poids déjà prêts, utilisé par copy() et fromJSON()
  constructor(inputs, hidden, outputs, model) {
    this.input_nodes = inputs;
    this.hidden_nodes = Array.isArray(hidden) ? hidden.slice() : [hidden];
    this.output_nodes = outputs;
    this.sizes = [inputs, ...this.hidden_nodes, outputs];
    this.model = model || this.createModel();
  }

  // On crée les poids : une liste de couches, chacune avec sa matrice w et ses biais b
  createModel() {
    const layers = [];
    for (let l = 1; l < this.sizes.length; l++) {
      const nIn = this.sizes[l - 1];
      const nOut = this.sizes[l];
      const limit = Math.sqrt(6 / (nIn + nOut)); // initialisation de Glorot
      const w = new Float32Array(nIn * nOut);
      for (let i = 0; i < w.length; i++) w[i] = random(-limit, limit);
      layers.push({ w: w, b: new Float32Array(nOut) });
    }
    return layers;
  }

  // Copie indépendante du réseau (utile pour la mutation)
  copy() {
    const layers = this.model.map(L => ({ w: L.w.slice(), b: L.b.slice() }));
    return new NeuralNetwork(this.input_nodes, this.hidden_nodes, this.output_nodes, layers);
  }

  // Applique une mutation au "cerveau" de la voiture
  // rate est le taux de mutation : probabilité qu'un poids soit modifié
  mutate(rate, amount = MUTATION_SIZE) {
    for (const L of this.model) {
      for (let i = 0; i < L.w.length; i++) {
        if (random(1) < rate) L.w[i] += randomGaussian(0, amount);
      }
      for (let i = 0; i < L.b.length; i++) {
        if (random(1) < rate) L.b[i] += randomGaussian(0, amount);
      }
    }
  }

  // Libère les ressources (rien à faire sans TensorFlow, gardé pour garder la même interface)
  dispose() {}

  // On prédit la sortie en fonction de l'entrée (activation sigmoïde, valeurs entre 0 et 1)
  predict(inputs) {
    let a = inputs;
    for (let l = 0; l < this.model.length; l++) {
      const { w, b } = this.model[l];
      const nIn = this.sizes[l];
      const nOut = this.sizes[l + 1];
      const out = new Array(nOut);
      for (let j = 0; j < nOut; j++) {
        let s = b[j];
        const row = j * nIn;
        for (let i = 0; i < nIn; i++) s += w[row + i] * a[i];
        out[j] = 1 / (1 + Math.exp(-s));
      }
      a = out;
    }
    return a;
  }

  // Nombre total de poids et de biais
  get geneCount() {
    let n = 0;
    for (let l = 1; l < this.sizes.length; l++) n += this.sizes[l - 1] * this.sizes[l] + this.sizes[l];
    return n;
  }

  // Sauvegarde / chargement (localStorage)
  toJSON() {
    return {
      sizes: this.sizes,
      model: this.model.map(L => ({ w: Array.from(L.w), b: Array.from(L.b) }))
    };
  }

  // Renvoie null si les données sont invalides
  static fromJSON(o) {
    try {
      if (!o || !Array.isArray(o.sizes) || o.sizes.length < 3 || !Array.isArray(o.model)) return null;
      if (o.model.length !== o.sizes.length - 1) return null;
      const layers = [];
      for (let l = 0; l < o.model.length; l++) {
        const nIn = o.sizes[l], nOut = o.sizes[l + 1], L = o.model[l];
        if (!L || L.w.length !== nIn * nOut || L.b.length !== nOut) return null;
        if (!L.w.every(Number.isFinite) || !L.b.every(Number.isFinite)) return null;
        layers.push({ w: Float32Array.from(L.w), b: Float32Array.from(L.b) });
      }
      return new NeuralNetwork(o.sizes[0], o.sizes.slice(1, -1), o.sizes[o.sizes.length - 1], layers);
    } catch (e) {
      return null;
    }
  }
}
