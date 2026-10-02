# CLAUDE.md — consignes pour travailler sur Lumi Vivant

## Le projet

Lumi Vivant est un Tamagotchi web : une créature qui grandit avec le temps réel et dont
l'animation et l'humeur traduisent la santé de l'appareil (batterie, processeur, mémoire,
disque, connexion) et le temps d'écran de son propriétaire. La vision est dans `VISION.md`.

## La personne avec qui tu travailles

- Elle débute en programmation. Réponds en **français simple**.
- Avant de modifier, dis en une phrase ce que tu vas faire ; après, dis ce qui a changé
  et comment le voir (quel fichier ouvrir ou recharger).
- Avance par petites étapes et lance les tests après chaque changement de règles.

## Architecture

| Fichier | Rôle |
| --- | --- |
| `js/vie.js` | Règles pures (aucun DOM) : âges, jauges, états, temps d'écran, soins, carnet. Testées. |
| `js/creature.js` | Dessin SVG de Lumi ; gestes (`g-…`), états de santé (`c-…`), caractère (`v-…`), tout en CSS |
| `js/capteurs.js` | Mesures du navigateur + liaison au capteur PC (`/api/sante`, `/api/historique`) ; renvoie des mesures normalisées |
| `js/app.js` | Boucle de vie toutes les 5 s, affichage, carnet de santé, pause, réglages, sauvegarde |
| `capteur/lumi_capteur.py` | Capteur PC : mesures système, suivi d'usage, historique, petit serveur sur 127.0.0.1 |

Le flux : `capteurs.read()` → `vie.computeVitals()` → classes `c-…` sur Lumi + jauges.

## Règles à respecter

- **Aucune dépendance externe, aucun outil de build, aucun CDN** : l'appli doit marcher
  hors ligne en double-cliquant sur `index.html`.
- **Scripts classiques** (`<script src>`), pas de modules ES : ils ne se chargent pas
  depuis `file://`.
- Toute nouvelle règle de vie va dans `vie.js`, sans DOM, **avec un test** dans
  `tests/vie.test.js`.
- Une mesure indisponible vaut `null` et n'est jamais comptée comme mauvaise.
- Chaque jauge indique sa source (mesuré, capteur PC, estimé, indisponible) : ne jamais
  présenter une estimation comme une mesure.
- Le capteur PC n'utilise que la bibliothèque standard de Python 3.8+ (`psutil` reste
  facultatif), n'écoute que sur `127.0.0.1` et ne sert jamais le dossier `capteur/`.
- **Vie privée** : aucune donnée ne sort de l'appareil ; pas d'appel réseau hors `127.0.0.1`.
- Textes de l'interface en français ; accessibilité : vrais boutons, libellés, contrastes.
- Sauvegarde : clé `localStorage` `lumi-vivant-v1`. Si la structure change, garder les
  anciennes sauvegardes lisibles (`importJson` complète avec `newLife`).

## Commandes

- Tests des règles : `node tests/vie.test.js` (ou ouvrir `tests/tests.html`).
- Tests du capteur : `python3 -m unittest discover -s capteur -v`.
- Une mesure du capteur : `python3 capteur/lumi_capteur.py --une-mesure`.
- Lancer avec le capteur : `python3 capteur/lumi_capteur.py`, puis <http://127.0.0.1:8765>.
