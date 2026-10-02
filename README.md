# Lumi Vivant — le compagnon de ton appareil

Lumi est un Tamagotchi moderne qui **vit au rythme de ton ordinateur ou de ton téléphone**.

- **Il grandit avec le temps réel** : œuf, bébé, enfant, ado puis adulte en 7 jours,
  même quand l'appli est fermée.
- **Son corps reflète la santé de l'appareil** : la batterie est sa faim (la recharge,
  son repas), le processeur son stress (il transpire), la mémoire sa place (il est à
  l'étroit), la connexion son lien (hors ligne, il se sent seul).
- **Son humeur reflète tes habitudes** : après 50 minutes d'écran sans pause il te
  propose une pause ; tard le soir, il met son bonnet de nuit.
- **Tes soins façonnent son caractère** : selon sa santé moyenne, il devient un ado
  puis un adulte *Radieux*, *Serein* ou *Grognon*.
- **Un carnet de santé** retrace les dernières 24 heures.

Tout reste sur ton appareil : rien n'est envoyé sur internet.

La vision complète et la suite du projet sont dans [VISION.md](VISION.md).

---

## 1. Démarrer en une minute

Décompresse le dossier, puis double-clique sur **`index.html`**. Lumi s'ouvre dans ton
navigateur, sans rien installer. Garde l'onglet ouvert : c'est son habitat.

Pour voir toute sa vie en quelques minutes : **Réglages → Vitesse du temps → Démo**
(1 minute = 1 jour). Reviens en « Temps réel » ensuite.

## 2. Des mesures complètes sur ordinateur : le capteur PC

Le navigateur ne voit qu'une partie de la santé de l'ordinateur. Le **capteur PC** est
un petit programme Python qui mesure tout (processeur, mémoire, disque, batterie,
vrai temps d'utilisation et pauses), même quand Lumi est fermé.

- **Windows** : double-clique sur **`Lancer Lumi (Windows).bat`**.
  S'il manque Python, installe-le depuis <https://www.python.org/downloads/>
  (coche « Add python.exe to PATH »), puis relance.
- **Mac** : double-clique sur **`Lancer Lumi (Mac).command`**
  (ou, dans le Terminal : `python3 capteur/lumi_capteur.py`).
- **Linux** : `python3 capteur/lumi_capteur.py`.

Le navigateur s'ouvre sur <http://127.0.0.1:8765> et l'étiquette en haut affiche
**« Capteur PC connecté »**. Garde la fenêtre du capteur ouverte (`Ctrl+C` pour l'arrêter).
Aucune bibliothèque à installer ; si `psutil` est présent, il est utilisé pour plus de précision.

> Sur un ordinateur professionnel géré par un service informatique, lancer Python ou un
> petit serveur local peut être interdit : demande d'abord. `index.html` seul fonctionne partout.

## 3. Sur téléphone

Lumi est une appli web installable. Pour l'installer sur l'écran d'accueil, il doit être
publié en `https` (par exemple avec GitHub Pages — tu peux demander à Claude Code de
t'aider). Ouvre alors l'adresse dans Chrome (Android) ou Safari (iPhone), puis
« Ajouter à l'écran d'accueil ».

Un téléphone protège beaucoup ses informations : voir le tableau ci-dessous.
Le vrai « temps d'écran » d'un téléphone n'est lisible que par une appli native
(étape 2 de [VISION.md](VISION.md)).

## 4. Ce que Lumi peut mesurer, selon l'endroit

| Mesure | Navigateur sur ordinateur | Capteur PC | Android (Chrome) | iPhone (Safari) |
| --- | --- | --- | --- | --- |
| Batterie et recharge | Chrome, Edge | Oui | Oui | Non |
| Charge du processeur | Chrome récent ; sinon estimation | Oui, en % | Estimation | Estimation |
| Mémoire et disque | Non | Oui | Non | Non |
| Température | Non | Souvent sous Linux | Non | Non |
| Connexion | Oui | Oui (via le navigateur) | Oui | En ligne / hors ligne |
| Temps d'écran | Pendant que Lumi est ouvert | Tout le temps | Pendant que Lumi est ouvert | Pendant que Lumi est ouvert |
| Pauses | Veille de plus de 5 min ; Chrome et Edge : détection d'inactivité (sur autorisation) | Clavier et souris (Windows, Mac) | Veille de plus de 5 min | Veille de plus de 5 min |

Chaque jauge indique sa source : **mesuré**, **capteur PC**, **estimé** ou **indisponible**.
Une mesure indisponible n'est jamais comptée comme mauvaise : elle est simplement ignorée.

## 5. Vie privée

- Les mesures restent sur l'appareil. Le capteur n'écoute que sur `127.0.0.1`
  (ton ordinateur), jamais sur le réseau.
- L'historique du capteur est dans `capteur/donnees` et s'efface au bout de 7 jours.
- La vie de Lumi est enregistrée dans le navigateur ; **Exporter** en fait une copie.

## 6. Travailler sur le projet avec Claude

- **Claude Code** : ouvre ce dossier dans Claude Code (appli de bureau, onglet Code, ou
  `claude` dans un terminal). Le fichier `CLAUDE.md` lui explique le projet et ses règles.
  Commence par : « Explique-moi ce projet simplement. »
- **Projet Claude** (claude.ai) : crée un projet, ajoute les fichiers dans ses
  connaissances et colle le contenu de `CLAUDE.md` dans ses instructions.

## 7. Organisation

```
lumi-vivant/
├── index.html                    la page de l'appli
├── css/style.css                 l'apparence (mode sombre automatique)
├── js/vie.js                     les règles de vie : âge, santé, usage, soins (testées)
├── js/creature.js                le dessin de Lumi, ses gestes et ses états de santé
├── js/capteurs.js                les mesures du navigateur et la liaison au capteur PC
├── js/app.js                     l'interface, la boucle de vie, le carnet de santé
├── capteur/lumi_capteur.py       le capteur PC (Python seul)
├── capteur/test_capteur.py       ses tests
├── tests/vie.test.js             les tests des règles de vie
├── tests/tests.html              les mêmes tests, dans un navigateur
├── manifest.webmanifest, sw.js   pour installer Lumi comme une appli
├── Lancer Lumi (Windows).bat     lance le capteur sous Windows
├── Lancer Lumi (Mac).command     lance le capteur sur Mac
├── VISION.md                     la vision et la suite du projet
└── CLAUDE.md                     les consignes pour Claude
```

## 8. Tests

- Règles de vie : `node tests/vie.test.js`, ou ouvrir `tests/tests.html` dans un navigateur.
- Capteur PC : `python3 -m unittest discover -s capteur -v`.
