// Fonctions pour le calcul génétique

// Numéro de la génération en cours
let generationCount = 1;
// Meilleur cerveau jamais vu pendant cet entraînement (il est conservé sans mutation)
let bestEver = null;

// On va créer une nouvelle génération de voitures
function nextGeneration() {
  // On calcule la fitness de chaque voiture : avancée sur le circuit
  const best = calculateFitnessForAllCars();

  // Si cette génération a fait mieux que tout ce qu'on a vu, on garde son cerveau
  if (best && (!bestEver || best.progress / checkpoints.length > bestEver.score)) {
    bestEver = {
      brain: best.brain.copy(),
      score: best.progress / checkpoints.length,
      finished: best.finished,
      bestLap: best.bestLap,
      path: best.trail.slice()   // son parcours, affiché en jaune
    };
  } else if (best && best.finished && best.bestLap && (!bestEver.bestLap || best.bestLap < bestEver.bestLap)) {
    bestEver.bestLap = best.bestLap;
  }

  // L'interface est prévenue (sauvegarde de l'écurie, affichage)
  if (typeof rosterSync === 'function') rosterSync(best);

  // Circuit aléatoire : on en construit un nouveau pour la génération suivante
  // (après le calcul de la fitness, qui a besoin de l'ancien circuit)
  if (TRACKS[currentTrack].random) buildTrack(currentTrack);

  const type = activeBrain;
  for (let i = 0; i < TOTAL; i++) {
    if (i === 0 && bestEver) {
      // l'élite : le meilleur cerveau passe tel quel dans la génération suivante
      population[i] = new Vehicle(bestEver.brain, type);
    } else {
      // Pour les autres, on choisit un parent au hasard (roulette) puis on le mute
      population[i] = pickOne();
    }
  }

  // On vide le tableau des voitures mortes
  for (let i = 0; i < savedVehicles.length; i++) {
    savedVehicles[i].dispose();
  }
  savedVehicles = [];
  generationCount++;
}

// On choisit un parent au hasard
function pickOne() {
  let index = 0;

  // Algorithme de la roulette
  // On tire au hasard une voiture parmi les meilleures,
  // avec une probabilité proportionnelle à la fitness :
  // la voiture qui est allée le plus loin a plus de chances d'être choisie
  let r = random(1);
  while (r > 0 && index < savedVehicles.length) {
    r = r - savedVehicles[index].fitness;
    index++;
  }
  index = Math.max(0, index - 1);

  // l'heureux élu !
  let vehicle = savedVehicles[index];
  // on en fait une copie et on la mute
  let child = new Vehicle(vehicle.brain, vehicle.type);
  child.mutate();
  return child;
}

// On calcule la fitness de chaque voiture
// Renvoie la meilleure voiture de la génération
function calculateFitnessForAllCars() {
  let best = null;
  for (let vehicle of savedVehicles) {
    vehicle.calculateFitness();
    if (!best || vehicle.progress > best.progress) best = vehicle;
  }
  // Normalise toutes les valeurs : la somme des fitness vaut 1
  let sum = 0;
  for (let vehicle of savedVehicles) {
    sum += vehicle.fitness;
  }
  for (let vehicle of savedVehicles) {
    vehicle.fitness = vehicle.fitness / sum;
  }
  return best;
}
