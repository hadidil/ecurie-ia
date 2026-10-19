// Distance sous laquelle un rayon qui touche un mur tue la voiture
const HIT_DIST = 6;
// Amplitude du braquage : le réseau choisit un angle entre -STEER_RANGE et +STEER_RANGE
let STEER_RANGE = Math.PI / 2;
// Plus cette valeur est petite, plus la sélection favorise les meilleures voitures
let SELECTION_PRESSURE = 3;

// Est-ce que le déplacement p -> q coupe le segment a-b ?
function segmentsCross(p, q, a, b) {
  const side = (u, v, w) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
  const d1 = side(a, b, p), d2 = side(a, b, q);
  const d3 = side(p, q, a), d4 = side(p, q, b);
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
}

class Vehicle {
  // brain : cerveau à copier (sinon on en crée un au hasard)
  // type  : famille de cerveau (voir BRAIN_TYPES dans nn.js)
  constructor(brain, type) {
    this.type = type || BRAIN_TYPES[0];

    this.fitness = 0;       // résultat final, calculé par calculateFitness()
    this.progress = 0;      // avancée en checkpoints (avec fraction), avant sélection
    this.points = 0;        // nombre de checkpoints passés
    this.laps = 0;          // tours terminés
    this.targetLaps = 1;    // nombre de tours à faire
    this.crashes = 0;       // sorties de piste (en course)
    this.bestLap = 0;       // meilleur tour, en images
    this.dead = false;
    this.finished = false;
    this.finishFrame = 0;
    this.trail = [];        // trace du parcours (x, y, x, y, ...)
    this.crashFlash = 0;    // anneau orange affiché quand la voiture sort
    this.crashX = 0;
    this.crashY = 0;

    this.pos = createVector(start.x, start.y);
    this.prev = this.pos.copy();
    this.vel = p5.Vector.fromAngle(startAngle);
    this.vel.setMag(1);
    this.acc = createVector();
    this.maxspeed = MAX_SPEED;
    this.maxforce = MAX_FORCE;
    this.sight = SIGHT;

    // les rayons des capteurs, répartis symétriquement sur l'angle de vision FOV
    this.rays = [];
    this.hits = [];
    for (let i = 0; i < RAYS; i++) {
      const a = RAYS > 1 ? -FOV / 2 + (i * FOV) / (RAYS - 1) : 0;
      this.rays.push(new Ray(this.pos, radians(a)));
    }
    this.rotateRays();

    this.goal = null;       // checkpoint à atteindre
    this.index = 1;         // indice du prochain checkpoint
    this.counter = 0;       // images écoulées depuis le dernier checkpoint
    this.total = 0;         // images écoulées depuis le départ
    this.lapStart = 0;

    // On crée le "cerveau" de la voiture : un réseau de neurones.
    // Entrées : un neurone par rayon + la vitesse. Sorties : direction et vitesse.
    if (brain) {
      this.brain = brain.copy();
    } else {
      this.brain = new NeuralNetwork(RAYS + 1, this.type.hidden, 2);
    }
  }

  dispose() {
    this.brain.dispose();
  }

  // La voiture sort de la piste (ou n'avance plus assez vite)
  kill() {
    if (this.dead) return;
    this.dead = true;
    this.crashFlash = 18;
    this.crashX = this.pos.x;
    this.crashY = this.pos.y;
  }

  rotateRays() {
    const heading = this.vel.heading();
    for (let i = 0; i < this.rays.length; i++) this.rays[i].rotate(heading);
  }

  applyBehaviors(walls) {
    // On appelle le comportement look
    let force = this.look(walls);
    this.applyForce(force);
  }

  // Applique une mutation à l'ADN (réseau de neurones) de la voiture courante
  mutate() {
    this.brain.mutate(MUTATION_RATE);
  }

  applyForce(force) {
    this.acc.add(force);
  }

  update() {
    if (this.dead || this.finished) return;

    this.prev.set(this.pos);
    this.pos.add(this.vel);
    this.vel.add(this.acc);
    this.vel.limit(this.maxspeed);
    this.acc.set(0, 0);

    // On incrémente le compteur : si la voiture met trop de temps
    // pour atteindre le checkpoint suivant, on la tue
    this.counter++;
    this.total++;
    if (this.counter > LIFESPAN) {
      this.kill();
    }

    // on mémorise un point du parcours toutes les 3 images
    if (this.total % 3 === 0 && this.trail.length < 2400) this.trail.push(this.pos.x, this.pos.y);

    // on a fait déplacer et tourner la voiture, on fait aussi tourner les rayons
    this.rotateRays();
  }

  // On vérifie si on a franchi le checkpoint visé (dans le bon sens),
  // et si on a bouclé un tour
  check(checkpoints) {
    if (this.finished || this.dead) return;

    this.goal = checkpoints[this.index];
    const cp = this.goal;

    const forward = (this.pos.x - this.prev.x) * cp.fx + (this.pos.y - this.prev.y) * cp.fy > 0;
    if (forward && segmentsCross(this.prev, this.pos, cp.a, cp.b)) {
      // Si on l'a franchi, on passe au checkpoint suivant
      this.index = (this.index + 1) % checkpoints.length;
      this.points++;
      this.counter = 0;

      if (this.points % checkpoints.length === 0) this.completeLap();
    }
  }

  completeLap() {
    this.laps++;
    const lapTime = this.total - this.lapStart;
    this.lapStart = this.total;
    if (!this.bestLap || lapTime < this.bestLap) this.bestLap = lapTime;
    if (this.laps >= this.targetLaps) {
      this.finished = true;
      this.finishFrame = this.total;
    }
  }

  // Ajustage de la fonction de fitness
  calculateFitness() {
    const M = checkpoints.length;
    let progress = this.points;

    // fraction du trajet déjà faite vers le prochain checkpoint
    if (!this.finished) {
      const last = checkpoints[(this.index - 1 + M) % M];
      const next = checkpoints[this.index];
      const d0 = Math.hypot(next.mx - last.mx, next.my - last.my);
      const d = Math.hypot(next.mx - this.pos.x, next.my - this.pos.y);
      progress += constrain(1 - d / d0, 0, 1);
    } else {
      // bonus pour un tour terminé, d'autant plus grand que le tour est rapide
      const ideal = (trackLength * this.targetLaps) / this.maxspeed;
      progress += M * 0.1 + 3 * Math.min(1, ideal / Math.max(1, this.total));
    }
    this.progress = progress;

    // On rend la sélection plus sévère : 2 puissance (avancée en tours * pression)
    this.fitness = pow(2, (progress / M) * SELECTION_PRESSURE * 10);
  }

  // C'est LE comportement de la voiture :
  // elle regarde autour d'elle, son cerveau décide, et elle applique une force.
  look(walls) {
    const inputs = [];

    // Optimisation : on ne teste que les murs proches du prochain checkpoint
    const list = (typeof nearWalls !== 'undefined' && nearWalls[this.index]) || walls;

    // Pour chaque rayon
    for (let i = 0; i < this.rays.length; i++) {
      const ray = this.rays[i];
      let record = this.sight;
      let closest = null;

      // Pour chaque mur
      for (let wall of list) {
        // On regarde si le rayon intersecte le mur en question
        const pt = ray.cast(wall);
        if (pt && pt.d < record) {
          record = pt.d;
          closest = pt;
        }
      }
      this.hits[i] = closest;

      // Si on est trop près d'un mur, on meurt
      if (record < HIT_DIST) {
        this.kill();
      }

      // Entrée du réseau entre 0 et 1 : 1 = mur tout proche, 0 = rien en vue
      inputs[i] = map(record, 0, this.sight, 1, 0);
    }
    inputs.push(this.vel.mag() / this.maxspeed);

    // On demande au réseau de neurones de prédire la prochaine action
    // output[0] est la direction, output[1] est la vitesse
    const output = this.brain.predict(inputs);

    let angle = map(output[0], 0, 1, -STEER_RANGE, STEER_RANGE);
    let speed = map(output[1], 0, 1, 0, this.maxspeed);
    // On ajoute l'angle de la voiture à l'angle calculé par le réseau de neurones
    angle += this.vel.heading();

    // vitesse souhaitée, puis force = vitesse souhaitée - vitesse actuelle
    const vitesseSouhaitee = p5.Vector.fromAngle(angle);
    vitesseSouhaitee.setMag(speed);
    let force = p5.Vector.sub(vitesseSouhaitee, this.vel);

    // On limite la force
    force.limit(this.maxforce);
    return force;
  }

  // En course : une voiture qui sort est remise sur la route, au dernier checkpoint franchi
  respawn() {
    const M = checkpoints.length;
    const last = checkpoints[(this.index - 1 + M) % M];
    const next = checkpoints[this.index];
    this.pos.set(last.mx, last.my);
    this.prev.set(this.pos);
    this.vel = createVector(next.mx - last.mx, next.my - last.my);
    this.vel.setMag(1.2);
    this.acc.set(0, 0);
    this.dead = false;
    this.counter = 0;
    this.crashes++;
    this.trail = [];
    this.rotateRays();
  }

  // Dessin de la voiture (roues, carrosserie à la couleur du cerveau, pare-brise, phare)
  show(highlighted) {
    const c = drawingContext;
    c.save();
    c.translate(this.pos.x, this.pos.y);
    c.rotate(this.vel.heading());
    // en entraînement, les voitures mortes ou arrivées sont pâles ; en course, seules les mortes
    c.globalAlpha = this.dead || (this.finished && mode === 'train') ? 0.34 : 1;
    c.shadowColor = 'rgba(0,0,0,.45)';
    c.shadowBlur = 4;
    c.shadowOffsetY = 2;
    c.fillStyle = '#111820';
    c.fillRect(-11, -5.5, 4, 11);
    c.fillRect(7, -5.5, 4, 11);
    c.shadowColor = 'transparent';
    c.shadowBlur = 0;
    c.shadowOffsetY = 0;
    c.fillStyle = this.type.color;
    c.strokeStyle = highlighted ? '#fff' : '#17232b';
    c.lineWidth = highlighted ? 2 : 1.25;
    c.beginPath();
    c.roundRect(-9, -5, 18, 10, 2.5);
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(226,245,250,.82)';
    c.beginPath();
    c.roundRect(-3.5, -3.4, 6.5, 6.8, 1.5);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.7)';
    c.fillRect(5, -2.5, 2, 5);
    if (highlighted) {
      c.strokeStyle = 'rgba(255,255,255,.6)';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(0, 0, 14, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();

    // anneau orange qui s'estompe quand la voiture sort de la piste
    if (this.crashFlash > 0) {
      c.save();
      c.globalAlpha = this.crashFlash / 18;
      c.strokeStyle = '#ff714d';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(this.crashX, this.crashY, 11 + (18 - this.crashFlash) * 0.35, 0, Math.PI * 2);
      c.stroke();
      c.restore();
      this.crashFlash--;
    }
  }

  // Met en surbrillance la voiture : ses capteurs sont dessinés, et elle passe au premier plan
  highlight() {
    const c = drawingContext;
    c.strokeStyle = '#ff5a5a';
    c.lineWidth = 1;
    // pas de capteurs affichés avant le premier regard de la voiture
    for (let i = 0; i < this.rays.length && this.total > 0; i++) {
      const h = this.hits[i];
      const len = h ? h.d : this.sight;
      c.beginPath();
      c.moveTo(this.pos.x, this.pos.y);
      c.lineTo(this.pos.x + this.rays[i].dir.x * len, this.pos.y + this.rays[i].dir.y * len);
      c.stroke();
    }
    this.show(true);
  }
}
