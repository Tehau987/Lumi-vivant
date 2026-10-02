#!/bin/bash
# Lance le capteur PC de Lumi (Mac) puis ouvre Lumi dans le navigateur.
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  python3 capteur/lumi_capteur.py
else
  echo "Python 3 est introuvable. Installe-le depuis https://www.python.org/downloads/ puis relance ce fichier."
  echo "En attendant, ouvre index.html : Lumi marche aussi sans capteur."
  read -r -p "Appuie sur Entree pour fermer."
fi
