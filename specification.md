# Écurie IA — spécification

## Comment ça marche

Écurie IA est un jeu où tu entraînes quatre « cerveaux » (Réflexe, Équilibré, Profond, Large) à conduire une voiture, puis tu les fais courir. Chaque voiture possède des capteurs (des rayons qui mesurent la distance aux murs) reliés à un petit réseau de neurones, qui décide de la direction et de la vitesse. L'apprentissage se fait par **algorithme génétique** : à chaque génération, des dizaines de voitures roulent sur le circuit ; celles qui vont le plus loin sont choisies comme parents (sélection à la roulette), puis légèrement modifiées (mutation) pour former la génération suivante. Un cerveau devient « Prêt » dès qu'il termine un tour : ses poids sont alors mémorisés dans le navigateur. Quand au moins un cerveau est prêt, la course s'ouvre : douze voitures font 3 tours sans apprendre, une voiture qui sort de la piste est remise sur la route, et le meilleur score gagne.

Le code reprend la structure du projet de référence « 9 – VoitureSuitCircuit genetic algo » : `index.html`, `nn.js`, `ga.js`, `ray.js`, `boundary.js`, `vehicle.js`, `sketch.js`, avec les mêmes classes et fonctions (`NeuralNetwork`, `Vehicle`, `Ray`, `Boundary`, `nextGeneration`, `pickOne`, `calculateFitnessForAllCars`, `buildTrack`, `setup`, `draw`). Trois fichiers sont ajoutés : `tracks.js`, `ui.js` et `style.css`.

Tu peux aussi créer, modifier et supprimer tes propres cerveaux depuis le panneau de l'entraînement.

Pour lancer le jeu : ouvrir `index.html` (une connexion est nécessaire pour charger p5.js depuis le CDN).

---

## Tâche 1 — Page et squelette du projet
**Fichiers :** `index.html`, `style.css`
**À faire :** créer la page (zone du circuit, panneau de contrôle, classement, fenêtre d'aide), charger p5.js puis les scripts dans l'ordre du projet de référence : `nn`, `ga`, `ray`, `boundary`, `vehicle`, `tracks`, `ui`, `sketch`.
**Validation :** la page s'ouvre, le canvas p5 apparaît dans `#stage`, aucune erreur dans la console.
**Statut :** ✅ réalisée

## Tâche 2 — Le cerveau (réseau de neurones)
**Fichier :** `nn.js`
**À faire :** écrire la classe `NeuralNetwork` avec la même interface que le projet de référence (`createModel`, `copy`, `mutate`, `predict`, `dispose`) en JavaScript pur, plus `toJSON` / `fromJSON` pour la sauvegarde. Définir les quatre familles de cerveaux dans `BRAIN_TYPES` (couches cachées : 6, 8, 10+6, 16 neurones).
**Validation :** `predict` renvoie deux valeurs entre 0 et 1 ; une copie est indépendante de l'original ; un cerveau sauvegardé puis rechargé donne les mêmes sorties.
**Statut :** ✅ réalisée

## Tâche 3 — Capteurs et murs
**Fichiers :** `ray.js`, `boundary.js`
**À faire :** `Boundary` représente un segment (mur ou checkpoint, avec son milieu et son sens de course). `Ray` lance un rayon depuis la voiture et renvoie le point d'intersection le plus proche avec un mur (`cast`), suit la direction de la voiture (`rotate`) et se dessine (`show`).
**Validation :** à la ligne de départ du niveau 1, les capteurs renvoient des distances cohérentes (32, 39, 61, 111, 41, 32 px).
**Statut :** ✅ réalisée

## Tâche 4 — Les circuits
**Fichiers :** `tracks.js`, `sketch.js` (`buildTrack`, `renderTrackLayer`)
**À faire :** définir cinq circuits (niveaux 1 à 4 fixes, niveau 5 aléatoire reconstruit à chaque génération). `buildTrack` produit le bord intérieur, le bord extérieur, les checkpoints, les murs, la liste des murs proches de chaque checkpoint (pour accélérer les capteurs) et le point de départ. Dessiner le circuit une seule fois : ombre, bordures claires, asphalte, ligne pointillée, checkpoints numérotés, ligne de départ à damier.
**Validation :** les bords des cinq circuits ne se coupent pas eux-mêmes ; les murs coïncident avec l'asphalte dessiné.
**Statut :** ✅ réalisée

## Tâche 5 — La voiture
**Fichier :** `vehicle.js`
**À faire :** classe `Vehicle` avec ses capteurs (7 par défaut, sur 160°), son cerveau (entrées : un neurone par capteur + la vitesse ; sorties : direction et vitesse), `look` (le cerveau décide, la voiture applique une force), `update`, `check` (franchissement d'un checkpoint dans le bon sens, comptage des tours), `calculateFitness`, `kill`, `respawn` (course), `show` et `highlight` (voiture à roues, pare-brise, capteurs rouges).
**Validation :** une voiture qui touche un mur ou qui met trop de temps entre deux checkpoints est éliminée ; un tour complet est bien compté.
**Statut :** ✅ réalisée

## Tâche 6 — L'algorithme génétique
**Fichier :** `ga.js`
**À faire :** `calculateFitnessForAllCars` (fitness puis normalisation), `pickOne` (roulette : un parent choisi avec une probabilité proportionnelle à sa fitness, puis copié et muté), `nextGeneration` (nouvelle population ; le meilleur cerveau passe sans mutation).
**Validation :** les performances progressent d'une génération à l'autre ; sur les 4 cerveaux et les 5 circuits, un tour complet est obtenu en 2 à 23 générations (cerveau « Profond » le plus lent).
**Statut :** ✅ réalisée

## Tâche 7 — Boucle d'entraînement et affichage
**Fichier :** `sketch.js` (`startTraining`, `trainStep`, `setup`, `draw`)
**À faire :** démarrer l'entraînement d'un cerveau (en repartant de ses poids mémorisés s'il en a), faire avancer la simulation de plusieurs images par frame selon le curseur de vitesse, retirer les voitures mortes ou arrivées, passer à la génération suivante quand il n'en reste plus. Afficher les traces cyan, le meilleur parcours en jaune, les voitures mortes en pâle avec l'anneau orange, et la meilleure voiture en surbrillance avec ses capteurs.
**Validation :** l'entraînement tourne sans erreur ; au niveau 5, le circuit est reconstruit à chaque génération.
**Statut :** ✅ réalisée

## Tâche 8 — L'écurie et l'interface
**Fichier :** `ui.js`
**À faire :** mémoriser un cerveau par famille dans le `localStorage` (clé `ecurieV2`), passer un cerveau à « Prêt » quand il termine un tour, afficher les cartes de cerveaux avec leur progression, le schéma du réseau, les statistiques (génération, avancée, meilleur parcours, meilleur tour, état), les curseurs (vitesse de simulation, voitures par génération, mutation, vitesse max, force moteur, portée, patience, pénalité, nombre de capteurs, angle de vision), le choix du circuit, la pause et la navigation entre les écrans.
**Validation :** les poids sont sauvegardés et rechargés ; changer de circuit ou de réglage physique conserve le cerveau ; changer le nombre de capteurs remet l'écurie à zéro.
**Statut :** ✅ réalisée

## Tâche 9 — Créer et modifier les cerveaux
**Fichiers :** `ui.js`, `index.html`, `style.css`, `nn.js` (limites et cerveaux d'origine)
**À faire :** ajouter une fenêtre d'édition (nom, couleur, 1 à 3 couches cachées de 1 à 32 neurones) accessible par les boutons « Nouveau », « Modifier », « Supprimer » et « Cerveaux d'origine ». Limiter l'écurie à 8 cerveaux, en garder au moins un, vérifier la saisie (nom obligatoire et unique, tailles de couches valides) et échapper les noms avant de les afficher. Sauvegarder la liste dans le `localStorage` (clé `ecurieTypes`). Changer seulement le nom ou la couleur conserve ce que le cerveau a appris ; changer les couches le remet à zéro. La course prend en compte tous les cerveaux (au moins 2 voitures par cerveau, 12 voitures minimum).
**Validation :** un cerveau créé s'entraîne, devient « Prêt », participe à la course, survit au rechargement de la page ; un nom en double ou une couche de plus de 32 neurones est refusé ; des données corrompues dans le `localStorage` sont ignorées.
**Statut :** ✅ réalisée

## Tâche 10 — La course
**Fichiers :** `sketch.js` (`startRace`, `raceStep`, `endRace`, `raceScore`), `ui.js` (classement, résultats)
**À faire :** lancer 12 voitures (les cerveaux entraînés puis des variantes légèrement mutées) sur 3 tours, remettre sur la route une voiture qui sort, terminer quand une voiture finit les 3 tours, classer par score (tours parcourus − pénalité de sorties + bonus d'arrivée), afficher le classement en direct puis la fiche de résultats.
**Validation :** une course complète se termine avec un gagnant ; « Relancer la course » et « Retour à l'entraînement » fonctionnent.
**Statut :** ✅ réalisée

## Tâche 11 — Tests et vérification
**À faire :** tester le moteur sans navigateur (géométrie des circuits, apprentissage sur tous les circuits et cerveaux, course complète), puis le parcours de l'interface avec le vrai p5.js (menu, entraînement, passage « Prêt », sauvegarde, réglages, course, résultats, retour), puis contrôler le rendu sur des images générées.
**Validation :** aucune erreur ; rendu conforme à la version d'origine du jeu.
**Statut :** ✅ réalisée. Reste à ouvrir le jeu une fois dans un vrai navigateur pour confirmer le rendu et les performances.

## Tâche 12 — Publication sur GitHub
**À faire :**
1. Créer un dépôt public sur GitHub.
2. Depuis le dossier du projet (celui qui contient `index.html`) : `git init`, `git add .`, `git commit -m "Écurie IA"`, `git branch -M main`, `git remote add origin <url du dépôt>`, `git push -u origin main`.
3. Dans *Settings → Pages*, choisir *Deploy from a branch*, branche `main`, dossier `/ (root)`.
4. Ouvrir `https://<pseudo>.github.io/<dépôt>/`.

**Validation :** le jeu se charge à l'adresse GitHub Pages et l'entraînement démarre.
**Statut :** ⏳ à faire par toi

---

## Différences avec le projet de référence
- Le réseau de neurones est en JavaScript pur (même interface que la version TensorFlow.js) : la simulation de dizaines de voitures reste fluide.
- Le réseau reçoit en plus la vitesse de la voiture ; plusieurs couches cachées sont possibles.
- Un checkpoint est franchi quand la trajectoire coupe son segment dans le bon sens.
- Le meilleur cerveau passe sans mutation dans la génération suivante (élitisme).

## Limites
Simulation dans le navigateur ; l'écurie est liée au navigateur (`localStorage`).
