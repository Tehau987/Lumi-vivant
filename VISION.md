# Vision — Lumi Vivant

## L'idée

Un Tamagotchi qui ne vit pas dans un écran à part, mais **dans ton appareil** :
il grandit avec le temps et se porte comme ton ordinateur ou ton téléphone,
et comme toi devant l'écran. Prendre soin de Lumi, c'est prendre soin de ton
appareil et de tes habitudes.

## Les quatre piliers

1. **Une vraie vie, au temps réel.** Œuf (10 premières minutes), bébé (jusqu'à 1 jour),
   enfant (1 à 3 jours), ado (3 à 7 jours), adulte (dès 7 jours). Il grandit aussi
   appli fermée ; le mode démo accélère le temps pour tout voir.
2. **Un corps qui traduit la santé de l'appareil.**

   | Mesure | Jauge | Ce que fait Lumi |
   | --- | --- | --- |
   | Batterie | Énergie | En charge : il mange (éclair). Sous 20 % : il a faim, paupières lourdes, pile vide au-dessus de la tête |
   | Processeur, température | Calme | Au-dessus de 70 % ou de 85 °C : il transpire et respire vite |
   | Mémoire, disque | Espace | Mémoire saturée ou disque plein : il est tout écrasé |
   | Connexion | Lien | Hors ligne : point d'interrogation, couleurs ternes |

3. **Une humeur qui traduit tes habitudes.**

   | Usage | Jauge | Ce que fait Lumi |
   | --- | --- | --- |
   | 50 min d'écran sans pause | Repos | Il bâille et te propose une pause de 5 minutes |
   | Entre 23 h et 6 h | Repos | Bonnet de nuit, Zzz, il s'endort |
   | Pause (5 min d'inactivité ou bouton pause) | Repos | Il fait la sieste, puis repart en forme |

4. **Des soins qui façonnent son caractère.** La santé globale est lissée sur environ
   6 heures de vie : ce sont ses **soins**. Quand il devient ado puis adulte, son caractère
   se fixe : *Radieux* (soins ≥ 70), *Serein* (≥ 40) ou *Grognon*. Des soins très bas
   (< 25) le rendent malade (thermomètre, teint verdâtre).

## Les principes

- **Honnête** : chaque jauge dit d'où vient sa mesure (mesurée, estimée, indisponible).
  Une mesure absente n'est jamais comptée comme mauvaise.
- **Bienveillant** : Lumi encourage (pauses, recharge, coucher) sans culpabiliser ;
  il tombe malade mais ne meurt pas.
- **Privé** : tout reste sur l'appareil, aucun compte, aucun envoi.
- **Simple à lancer** : un double-clic sur `index.html` ; le capteur PC est un bonus.

## Les limites à connaître

- Un **navigateur** ne voit qu'une partie de l'appareil et ne mesure que lorsque Lumi est
  ouvert. Le **capteur PC** comble ce manque sur ordinateur.
- Sur **iPhone**, Safari ne donne ni la batterie ni la connexion détaillée ; sur
  **Android**, la batterie et la connexion sont lisibles.
- Le **temps d'écran réel d'un téléphone** (toutes applis confondues) n'est accessible
  qu'à une appli native, avec l'autorisation de l'utilisateur.

## La suite

1. **Aujourd'hui** — appli web installable + capteur PC (ce projet).
2. **Étape 2 — appli Android native** (dossier `android/`) : lire le vrai temps d'écran
   (`UsageStatsManager`, avec autorisation), la batterie et sa température
   (`BatteryManager`), et afficher Lumi en **widget** sur l'écran d'accueil.
   Première version faite : l'appli reprend le Lumi web dans une WebView et lui ajoute
   ces mesures. Le widget montre Lumi tel qu'à la dernière ouverture de l'appli.
3. **Étape 3 — rappels** : notifications de pause et de coucher, réglables.
4. **Étape 4 — plusieurs appareils** : un compagnon par appareil, ou un seul Lumi
   nourri par l'ordinateur et le téléphone.
