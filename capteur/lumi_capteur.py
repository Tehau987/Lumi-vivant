#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lumi — capteur de santé de l'ordinateur.

Ce petit programme mesure la santé de ton ordinateur (processeur, mémoire, disque,
batterie, température quand c'est possible) et ton temps d'utilisation réel
(activité, sessions, pauses, usage tardif). Il les donne à Lumi par une adresse locale :

    http://127.0.0.1:8765                  l'appli Lumi
    http://127.0.0.1:8765/api/sante        la mesure actuelle (JSON)
    http://127.0.0.1:8765/api/historique   les mesures des dernières 24 h (JSON)

Il n'a besoin que de Python 3.8 ou plus, sans rien installer. Si la bibliothèque
« psutil » est présente, il s'en sert pour des mesures plus précises.
Rien ne sort de l'ordinateur : le serveur n'écoute que sur 127.0.0.1, et l'historique
(dossier capteur/donnees) est effacé au bout de 7 jours.

Lancer :
    Windows :      py capteur\\lumi_capteur.py
    Mac, Linux :   python3 capteur/lumi_capteur.py
Options :
    --port 8765           le port local (8765 par défaut)
    --sans-navigateur     ne pas ouvrir le navigateur au démarrage
    --intervalle 5        secondes entre deux mesures
    --une-mesure          afficher une mesure et quitter (pour vérifier)
"""

import argparse
import collections
import ctypes
import datetime
import glob
import http.server
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
import webbrowser

try:
    import psutil  # facultatif
except ImportError:  # pragma: no cover - dépend de l'ordinateur
    psutil = None

VERSION = 1
SYSTEME = platform.system()  # 'Windows', 'Darwin' (macOS) ou 'Linux'
NOM_SYSTEME = {'Windows': 'Windows', 'Darwin': 'macOS', 'Linux': 'Linux'}
ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)  # le dossier du projet (index.html)
DOSSIER_DONNEES = os.path.join(ICI, 'donnees')

PAUSE_APRES_S = 300  # 5 min sans clavier ni souris = une pause
ACTIF_SI_INACTIF_MOINS_DE_S = 120  # moins de 2 min sans action = en train d'utiliser l'ordinateur
GARDER_FICHIERS_JOURS = 7


def _jour(horodatage):
    return datetime.datetime.fromtimestamp(horodatage).strftime('%Y-%m-%d')


def _est_nuit(horodatage):
    heure = datetime.datetime.fromtimestamp(horodatage).hour
    return heure >= 23 or heure < 6


def _commande(arguments):
    resultat = subprocess.run(arguments, capture_output=True, text=True, timeout=3)
    return resultat.stdout


# ---------------------------------------------------------------------------
# Lecteurs de texte : ils transforment la sortie du système en chiffres.
# Ils ne touchent pas au système, ce qui permet de les tester partout.
# ---------------------------------------------------------------------------

def lire_proc_stat(texte):
    """Ligne « cpu » de /proc/stat (Linux) -> (temps inactif, temps total)."""
    for ligne in texte.splitlines():
        if ligne.startswith('cpu '):
            valeurs = [int(v) for v in ligne.split()[1:]]
            inactif = valeurs[3] + (valeurs[4] if len(valeurs) > 4 else 0)
            return inactif, sum(valeurs[:8])
    raise ValueError('ligne « cpu » introuvable')


def pourcentage_cpu(avant, apres):
    """Deux relevés (inactif, total) -> pourcentage d'occupation du processeur."""
    if not avant or not apres:
        return None
    total = apres[1] - avant[1]
    inactif = apres[0] - avant[0]
    if total <= 0:
        return None
    return round(max(0.0, min(100.0, 100.0 * (1 - inactif / total))), 1)


def lire_meminfo(texte):
    """/proc/meminfo (Linux) -> pourcentage de mémoire utilisée."""
    infos = {}
    for ligne in texte.splitlines():
        trouve = re.match(r'(\w+):\s+(\d+)', ligne)
        if trouve:
            infos[trouve.group(1)] = int(trouve.group(2))
    total = infos.get('MemTotal')
    disponible = infos.get('MemAvailable')
    if disponible is None and 'MemFree' in infos:
        disponible = infos['MemFree'] + infos.get('Buffers', 0) + infos.get('Cached', 0)
    if not total or disponible is None:
        return None
    return round(100.0 * (1 - disponible / total), 1)


def lire_vm_stat(texte, total_octets):
    """Sortie de « vm_stat » (macOS) -> pourcentage de mémoire utilisée."""
    taille = re.search(r'page size of (\d+) bytes', texte)
    taille_page = int(taille.group(1)) if taille else 4096
    pages = {}
    for ligne in texte.splitlines():
        trouve = re.match(r'\s*"?([^":]+)"?:\s+(\d+)\.', ligne)
        if trouve:
            pages[trouve.group(1).strip()] = int(trouve.group(2))
    utilisees = pages.get('Pages active', 0) + pages.get('Pages wired down', 0) + pages.get('Pages occupied by compressor', 0)
    if not total_octets:
        return None
    return round(min(100.0, 100.0 * utilisees * taille_page / total_octets), 1)


def lire_pmset(texte):
    """Sortie de « pmset -g batt » (macOS) -> (batterie ou None, alimentation)."""
    secteur = "'AC Power'" in texte
    trouve = re.search(r'(\d+)%;\s*([a-zA-Z ]+);', texte)
    if not trouve:
        return None, 'secteur' if secteur else None
    etat = trouve.group(2).strip().lower()
    batterie = {'niveau': int(trouve.group(1)) / 100, 'en_charge': etat in ('charging', 'charged', 'finishing charge')}
    return batterie, 'secteur' if secteur else 'batterie'


def lire_ioreg_inactivite(texte):
    """Sortie de « ioreg -c IOHIDSystem » (macOS) -> secondes sans clavier ni souris."""
    trouve = re.search(r'"HIDIdleTime"\s*=\s*(\d+)', texte)
    return int(trouve.group(1)) / 1e9 if trouve else None


def lire_batterie_sysfs(capacite, statut):
    """Fichiers capacity et status d'une batterie Linux -> batterie."""
    niveau = max(0, min(100, int(capacite.strip()))) / 100
    return {'niveau': niveau, 'en_charge': statut.strip().lower() in ('charging', 'full')}


def lire_boottime(texte):
    """Sortie de « sysctl -n kern.boottime » (macOS) -> horodatage du démarrage."""
    trouve = re.search(r'sec\s*=\s*(\d+)', texte)
    return int(trouve.group(1)) if trouve else None


# ---------------------------------------------------------------------------
# Windows : appels directs au système, sans rien installer.
# ---------------------------------------------------------------------------

def _windows_temps_systeme():
    class FILETIME(ctypes.Structure):
        _fields_ = [('bas', ctypes.c_uint32), ('haut', ctypes.c_uint32)]

    inactif, noyau, utilisateur = FILETIME(), FILETIME(), FILETIME()
    if not ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(inactif), ctypes.byref(noyau), ctypes.byref(utilisateur)):
        return None

    def valeur(ft):
        return (ft.haut << 32) | ft.bas

    # Le temps « noyau » comprend déjà le temps inactif.
    return valeur(inactif), valeur(noyau) + valeur(utilisateur)


def _windows_memoire():
    class MEMORYSTATUSEX(ctypes.Structure):
        _fields_ = [
            ('dwLength', ctypes.c_uint32), ('dwMemoryLoad', ctypes.c_uint32),
            ('ullTotalPhys', ctypes.c_uint64), ('ullAvailPhys', ctypes.c_uint64),
            ('ullTotalPageFile', ctypes.c_uint64), ('ullAvailPageFile', ctypes.c_uint64),
            ('ullTotalVirtual', ctypes.c_uint64), ('ullAvailVirtual', ctypes.c_uint64),
            ('ullAvailExtendedVirtual', ctypes.c_uint64),
        ]

    etat = MEMORYSTATUSEX()
    etat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(etat)):
        return None
    return float(etat.dwMemoryLoad)


def _windows_alimentation():
    class SYSTEM_POWER_STATUS(ctypes.Structure):
        _fields_ = [
            ('ACLineStatus', ctypes.c_ubyte), ('BatteryFlag', ctypes.c_ubyte),
            ('BatteryLifePercent', ctypes.c_ubyte), ('SystemStatusFlag', ctypes.c_ubyte),
            ('BatteryLifeTime', ctypes.c_uint32), ('BatteryFullLifeTime', ctypes.c_uint32),
        ]

    etat = SYSTEM_POWER_STATUS()
    if not ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(etat)):
        return None, None
    secteur = etat.ACLineStatus == 1
    if etat.BatteryFlag == 255 or etat.BatteryFlag & 128 or etat.BatteryLifePercent == 255:
        # 128 : pas de batterie (ordinateur de bureau).
        return None, 'secteur' if (secteur or etat.BatteryFlag & 128) else None
    return {'niveau': etat.BatteryLifePercent / 100, 'en_charge': secteur}, 'secteur' if secteur else 'batterie'


def _windows_inactivite():
    class LASTINPUTINFO(ctypes.Structure):
        _fields_ = [('cbSize', ctypes.c_uint), ('dwTime', ctypes.c_uint32)]

    info = LASTINPUTINFO()
    info.cbSize = ctypes.sizeof(LASTINPUTINFO)
    if not ctypes.windll.user32.GetLastInputInfo(ctypes.byref(info)):
        return None
    maintenant = ctypes.windll.kernel32.GetTickCount() & 0xFFFFFFFF
    return ((maintenant - info.dwTime) & 0xFFFFFFFF) / 1000.0


# ---------------------------------------------------------------------------
# Les mesures : chacune renvoie None quand elle est impossible ici.
# ---------------------------------------------------------------------------

class Mesures:
    """Lit la santé de l'ordinateur, selon le système."""

    def __init__(self, systeme=SYSTEME):
        self.systeme = systeme
        self._cpu_avant = None
        self._amorce = time.time()
        if psutil:
            try:
                psutil.cpu_percent(None)
            except Exception:
                pass
        else:
            self._cpu_avant = self._releve_cpu()

    def _releve_cpu(self):
        try:
            if self.systeme == 'Linux':
                with open('/proc/stat', encoding='utf-8') as fichier:
                    return lire_proc_stat(fichier.read())
            if self.systeme == 'Windows':
                return _windows_temps_systeme()
        except Exception:
            return None
        return None

    def cpu(self):
        # La charge se mesure entre deux relevés : on laisse passer un court instant au départ.
        attente = 0.3 - (time.time() - self._amorce)
        if attente > 0:
            time.sleep(attente)
        if psutil:
            try:
                return round(psutil.cpu_percent(None), 1)
            except Exception:
                pass
        if self.systeme == 'Darwin':
            try:
                charge = os.getloadavg()[0]
                return round(min(100.0, 100.0 * charge / (os.cpu_count() or 1)), 1)
            except Exception:
                return None
        apres = self._releve_cpu()
        avant, self._cpu_avant = self._cpu_avant, apres
        return pourcentage_cpu(avant, apres)

    def memoire(self):
        if psutil:
            try:
                return round(psutil.virtual_memory().percent, 1)
            except Exception:
                pass
        try:
            if self.systeme == 'Linux':
                with open('/proc/meminfo', encoding='utf-8') as fichier:
                    return lire_meminfo(fichier.read())
            if self.systeme == 'Windows':
                return _windows_memoire()
            if self.systeme == 'Darwin':
                total = int(_commande(['sysctl', '-n', 'hw.memsize']).strip())
                return lire_vm_stat(_commande(['vm_stat']), total)
        except Exception:
            return None
        return None

    def disque(self):
        try:
            if self.systeme == 'Windows':
                chemin = os.environ.get('SystemDrive', 'C:') + '\\'
            else:
                chemin = os.path.expanduser('~')
            usage = shutil.disk_usage(chemin)
            return round(100.0 * usage.used / usage.total, 1)
        except Exception:
            return None

    def alimentation(self):
        """-> (batterie ou None, 'secteur' | 'batterie' | None)."""
        if psutil:
            try:
                b = psutil.sensors_battery()
                if b is None:
                    return None, 'secteur'
                return {'niveau': round(b.percent / 100, 3), 'en_charge': bool(b.power_plugged)}, 'secteur' if b.power_plugged else 'batterie'
            except Exception:
                pass
        try:
            if self.systeme == 'Windows':
                return _windows_alimentation()
            if self.systeme == 'Darwin':
                return lire_pmset(_commande(['pmset', '-g', 'batt']))
            if self.systeme == 'Linux':
                batteries = sorted(glob.glob('/sys/class/power_supply/BAT*'))
                if not batteries:
                    return None, 'secteur'
                with open(os.path.join(batteries[0], 'capacity'), encoding='utf-8') as c, \
                        open(os.path.join(batteries[0], 'status'), encoding='utf-8') as s:
                    batterie = lire_batterie_sysfs(c.read(), s.read())
                return batterie, 'secteur' if batterie['en_charge'] else 'batterie'
        except Exception:
            return None, None
        return None, None

    def inactivite(self):
        """Secondes depuis la dernière action au clavier ou à la souris (None si inconnu)."""
        try:
            if self.systeme == 'Windows':
                return _windows_inactivite()
            if self.systeme == 'Darwin':
                return lire_ioreg_inactivite(_commande(['ioreg', '-c', 'IOHIDSystem']))
            if self.systeme == 'Linux' and shutil.which('xprintidle'):
                return int(_commande(['xprintidle']).strip()) / 1000.0
        except Exception:
            return None
        return None

    def temperature(self):
        if psutil and hasattr(psutil, 'sensors_temperatures'):
            try:
                valeurs = [t.current for liste in psutil.sensors_temperatures().values() for t in liste if t.current]
                if valeurs:
                    return round(max(valeurs), 1)
            except Exception:
                pass
        if self.systeme == 'Linux':
            valeurs = []
            for chemin in glob.glob('/sys/class/thermal/thermal_zone*/temp'):
                try:
                    with open(chemin, encoding='utf-8') as fichier:
                        valeur = int(fichier.read().strip()) / 1000
                    if 0 < valeur < 130:
                        valeurs.append(valeur)
                except Exception:
                    pass
            if valeurs:
                return round(max(valeurs), 1)
        return None

    def demarrage_s(self):
        """Secondes depuis le démarrage de l'ordinateur."""
        try:
            if psutil:
                return round(time.time() - psutil.boot_time())
            if self.systeme == 'Windows':
                noyau = ctypes.windll.kernel32
                noyau.GetTickCount64.restype = ctypes.c_uint64
                return round(noyau.GetTickCount64() / 1000)
            if self.systeme == 'Linux':
                with open('/proc/uptime', encoding='utf-8') as fichier:
                    return round(float(fichier.read().split()[0]))
            if self.systeme == 'Darwin':
                debut = lire_boottime(_commande(['sysctl', '-n', 'kern.boottime']))
                return round(time.time() - debut) if debut else None
        except Exception:
            return None
        return None


# ---------------------------------------------------------------------------
# Le temps d'utilisation : activité, sessions, pauses, usage tardif.
# ---------------------------------------------------------------------------

class Suivi:
    """Compte le temps d'utilisation réel de l'ordinateur."""

    def __init__(self, maintenant):
        self.jour = _jour(maintenant)
        self.actif_s = 0.0
        self.nuit_s = 0.0
        self.session_debut = maintenant
        self.en_pause = False
        self.derniere_pause = None
        self.dernier_releve = maintenant

    def enregistrer(self, maintenant, inactivite_s):
        """À appeler à chaque mesure. inactivite_s : secondes sans action (None si inconnu)."""
        if _jour(maintenant) != self.jour:
            self.jour = _jour(maintenant)
            self.actif_s = 0.0
            self.nuit_s = 0.0
        ecart = max(0.0, maintenant - self.dernier_releve)
        self.dernier_releve = maintenant
        if ecart > PAUSE_APRES_S:
            # L'ordinateur était en veille (ou le capteur arrêté) : c'était une pause.
            self._fin_de_pause(maintenant)
            return
        actif = inactivite_s is None or inactivite_s < ACTIF_SI_INACTIF_MOINS_DE_S
        if inactivite_s is not None and inactivite_s >= PAUSE_APRES_S:
            self.en_pause = True
        elif actif and self.en_pause:
            self._fin_de_pause(maintenant)
        if actif:
            self.actif_s += ecart
            if _est_nuit(maintenant):
                self.nuit_s += ecart

    def _fin_de_pause(self, maintenant):
        self.en_pause = False
        self.derniere_pause = maintenant
        self.session_debut = maintenant

    def resume(self, maintenant):
        return {
            'actif_aujourd_hui_s': round(self.actif_s),
            'nuit_aujourd_hui_s': round(self.nuit_s),
            'session_s': 0 if self.en_pause else round(max(0.0, maintenant - self.session_debut)),
            'derniere_pause': self.derniere_pause,
            'en_pause': self.en_pause,
        }


class Journal:
    """L'historique : une mesure par minute, dans capteur/donnees (7 jours gardés)."""

    def __init__(self, dossier=DOSSIER_DONNEES, garder_s=86400):
        self.dossier = dossier
        self.garder_s = garder_s
        self.echantillons = collections.deque()
        os.makedirs(dossier, exist_ok=True)

    def _chemin(self, horodatage):
        return os.path.join(self.dossier, 'journal-' + _jour(horodatage) + '.jsonl')

    def charger(self, maintenant):
        lus = []
        for moment in (maintenant - 86400, maintenant):
            chemin = self._chemin(moment)
            if not os.path.exists(chemin):
                continue
            with open(chemin, encoding='utf-8') as fichier:
                for ligne in fichier:
                    try:
                        echantillon = json.loads(ligne)
                    except ValueError:
                        continue
                    if 0 <= maintenant - echantillon.get('t', 0) <= self.garder_s:
                        lus.append(echantillon)
        uniques = {e['t']: e for e in lus}
        self.echantillons = collections.deque(sorted(uniques.values(), key=lambda e: e['t']))

    def ajouter(self, echantillon):
        self.echantillons.append(echantillon)
        while self.echantillons and echantillon['t'] - self.echantillons[0]['t'] > self.garder_s:
            self.echantillons.popleft()
        with open(self._chemin(echantillon['t']), 'a', encoding='utf-8') as fichier:
            fichier.write(json.dumps(echantillon, ensure_ascii=False) + '\n')
        self._nettoyer(echantillon['t'])

    def _nettoyer(self, maintenant):
        limite = _jour(maintenant - GARDER_FICHIERS_JOURS * 86400)
        for chemin in glob.glob(os.path.join(self.dossier, 'journal-*.jsonl')):
            jour = os.path.basename(chemin)[len('journal-'):-len('.jsonl')]
            if jour < limite:
                try:
                    os.remove(chemin)
                except OSError:
                    pass

    def liste(self, maintenant):
        return [e for e in self.echantillons if 0 <= maintenant - e['t'] <= self.garder_s]


class Capteur:
    """Mesure régulièrement, tient le compte de l'usage et garde l'historique."""

    def __init__(self, mesures=None, journal=None, horloge=time.time):
        self.mesures = mesures or Mesures()
        self.journal = journal or Journal()
        self.horloge = horloge
        self.verrou = threading.Lock()
        maintenant = horloge()
        self.journal.charger(maintenant)
        self.suivi = Suivi(maintenant)
        self._restaurer(maintenant)
        self._cpu_minute = []
        self._derniere_minute = maintenant
        self.etat = None
        self.mesurer()

    def _restaurer(self, maintenant):
        """Après un redémarrage du capteur, reprend le temps actif du jour depuis l'historique."""
        aujourd_hui = _jour(maintenant)
        for echantillon in self.journal.liste(maintenant):
            if _jour(echantillon['t']) == aujourd_hui and echantillon.get('actif'):
                self.suivi.actif_s += 60
                if _est_nuit(echantillon['t']):
                    self.suivi.nuit_s += 60

    def mesurer(self):
        maintenant = self.horloge()
        m = self.mesures
        batterie, alimentation = m.alimentation()
        inactivite = m.inactivite()
        etat = {
            'source': 'capteur-pc',
            'version': VERSION,
            'horodatage': round(maintenant, 1),
            'systeme': NOM_SYSTEME.get(m.systeme, m.systeme),
            'machine': platform.node(),
            'cpu': m.cpu(),
            'memoire': m.memoire(),
            'disque': m.disque(),
            'temperature': m.temperature(),
            'batterie': batterie,
            'alimentation': alimentation,
            'inactivite_s': None if inactivite is None else round(inactivite),
            'demarrage_il_y_a_s': m.demarrage_s(),
            'psutil': psutil is not None,
        }
        with self.verrou:
            self.suivi.enregistrer(maintenant, inactivite)
            etat['usage'] = self.suivi.resume(maintenant)
            self.etat = etat
            if etat['cpu'] is not None:
                self._cpu_minute.append(etat['cpu'])
            if maintenant - self._derniere_minute >= 60:
                self._derniere_minute = maintenant
                cpu = round(sum(self._cpu_minute) / len(self._cpu_minute), 1) if self._cpu_minute else etat['cpu']
                self._cpu_minute = []
                self.journal.ajouter({
                    't': round(maintenant),
                    'cpu': cpu,
                    'memoire': etat['memoire'],
                    'disque': etat['disque'],
                    'temperature': etat['temperature'],
                    'batterie': batterie,
                    'alimentation': alimentation,
                    'actif': inactivite is None or inactivite < ACTIF_SI_INACTIF_MOINS_DE_S,
                })
        return etat

    def instantane(self):
        with self.verrou:
            return dict(self.etat)

    def historique(self):
        with self.verrou:
            return self.journal.liste(self.horloge())

    def boucle(self, arret, intervalle):
        while not arret.wait(intervalle):
            try:
                self.mesurer()
            except Exception as erreur:  # une mesure ratée ne doit pas arrêter Lumi
                print('Mesure impossible :', erreur, file=sys.stderr)


# ---------------------------------------------------------------------------
# Le petit serveur local : l'appli et les mesures, sur 127.0.0.1 uniquement.
# ---------------------------------------------------------------------------

def fabriquer_gestionnaire(capteur, racine=RACINE):
    class Gestionnaire(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=racine, **kwargs)

        def log_message(self, format, *args):  # pas de bavardage dans le terminal
            pass

        def end_headers(self):
            self.send_header('Cache-Control', 'no-store')
            super().end_headers()

        def _json(self, donnees):
            corps = json.dumps(donnees, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(corps)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(corps)

        def _interdit(self, chemin):
            # Le code du capteur et ses données ne sont pas servis, ni les fichiers cachés.
            return chemin.startswith('/capteur') or '/.' in chemin

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', '*')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
            self.end_headers()

        def do_GET(self):
            chemin = urllib.parse.urlparse(self.path).path
            if chemin == '/api/sante':
                return self._json(capteur.instantane())
            if chemin == '/api/historique':
                return self._json({'echantillons': capteur.historique()})
            if self._interdit(chemin):
                return self.send_error(404, 'Introuvable')
            return super().do_GET()

        def do_HEAD(self):
            if self._interdit(urllib.parse.urlparse(self.path).path):
                return self.send_error(404, 'Introuvable')
            return super().do_HEAD()

    return Gestionnaire


def demarrer(port=8765, ouvrir=True, intervalle=5.0):
    capteur = Capteur()
    serveur = http.server.ThreadingHTTPServer(('127.0.0.1', port), fabriquer_gestionnaire(capteur))
    arret = threading.Event()
    threading.Thread(target=capteur.boucle, args=(arret, intervalle), daemon=True).start()
    adresse = 'http://127.0.0.1:%d/' % port
    print('')
    print('  Lumi capteur est réveillé !')
    print('  Ouvre Lumi ici : ' + adresse)
    print('  Garde cette fenêtre ouverte. Pour arrêter : Ctrl+C.')
    print('')
    if ouvrir:
        webbrowser.open(adresse)
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print('\n  Lumi s\'endort. À bientôt !')
    finally:
        arret.set()
        serveur.server_close()


def main(arguments=None):
    lecteur = argparse.ArgumentParser(description="Capteur de santé de l'ordinateur pour Lumi Vivant.")
    lecteur.add_argument('--port', type=int, default=8765, help='port local (8765 par défaut)')
    lecteur.add_argument('--sans-navigateur', action='store_true', help="ne pas ouvrir le navigateur")
    lecteur.add_argument('--intervalle', type=float, default=5.0, help='secondes entre deux mesures')
    lecteur.add_argument('--une-mesure', action='store_true', help='afficher une mesure et quitter')
    options = lecteur.parse_args(arguments)

    if options.une_mesure:
        print(json.dumps(Capteur().instantane(), indent=2, ensure_ascii=False))
        return 0
    try:
        demarrer(options.port, not options.sans_navigateur, options.intervalle)
    except OSError:
        print('Le port %d est déjà utilisé : Lumi capteur tourne peut-être déjà.' % options.port)
        print('Ouvre http://127.0.0.1:%d ou choisis un autre port : --port %d' % (options.port, options.port + 1))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
