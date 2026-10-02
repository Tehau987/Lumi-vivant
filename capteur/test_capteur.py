# -*- coding: utf-8 -*-
"""
Tests du capteur PC.  Lancer :  python3 -m unittest discover -s capteur -v

Les lecteurs sont testés avec de vraies sorties des systèmes (Linux, macOS),
le suivi d'usage avec une horloge simulée, et le serveur avec un vrai appel HTTP.
"""
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
import http.server

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lumi_capteur as lc  # noqa: E402

PROC_STAT = 'cpu  4705 356 584 3699 23 23 0 0 0 0\ncpu0 1393280 32966 572056 13343292 6130 0 17875 0 23933 0\n'
MEMINFO = 'MemTotal:       16000000 kB\nMemFree:          800000 kB\nMemAvailable:    4000000 kB\nBuffers:          200000 kB\n'
VM_STAT = """Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               12000.
Pages active:                            200000.
Pages inactive:                          190000.
Pages wired down:                        100000.
"Translation faults":                  123456789.
Pages occupied by compressor:            100000.
"""
PMSET_DECHARGE = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=4653155)\t81%; discharging; 4:52 remaining present: true\n"
PMSET_CHARGE = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=4653155)\t47%; charging; 1:10 remaining present: true\n"
PMSET_BUREAU = "Now drawing from 'AC Power'\n"
IOREG = '    | |   "HIDIdleTime" = 4200000000\n    | |   "HIDIdleTimeX" = 1\n'


class Lecteurs(unittest.TestCase):
    def test_processeur_linux(self):
        avant = lc.lire_proc_stat(PROC_STAT)
        self.assertEqual(avant, (3699 + 23, 4705 + 356 + 584 + 3699 + 23 + 23))
        apres = (avant[0] + 50, avant[1] + 200)  # 150 sur 200 occupés
        self.assertEqual(lc.pourcentage_cpu(avant, apres), 75.0)
        self.assertIsNone(lc.pourcentage_cpu(None, apres))

    def test_memoire_linux(self):
        self.assertEqual(lc.lire_meminfo(MEMINFO), 75.0)

    def test_memoire_mac(self):
        total = 16 * 1024 ** 3
        attendu = round(100 * (200000 + 100000 + 100000) * 16384 / total, 1)
        self.assertEqual(lc.lire_vm_stat(VM_STAT, total), attendu)

    def test_batterie_mac(self):
        batterie, alimentation = lc.lire_pmset(PMSET_DECHARGE)
        self.assertEqual(batterie, {'niveau': 0.81, 'en_charge': False})
        self.assertEqual(alimentation, 'batterie')
        batterie, alimentation = lc.lire_pmset(PMSET_CHARGE)
        self.assertTrue(batterie['en_charge'])
        self.assertEqual(alimentation, 'secteur')
        self.assertEqual(lc.lire_pmset(PMSET_BUREAU), (None, 'secteur'))

    def test_inactivite_mac(self):
        self.assertAlmostEqual(lc.lire_ioreg_inactivite(IOREG), 4.2)
        self.assertIsNone(lc.lire_ioreg_inactivite('rien'))

    def test_batterie_linux(self):
        self.assertEqual(lc.lire_batterie_sysfs('64\n', 'Discharging\n'), {'niveau': 0.64, 'en_charge': False})
        self.assertTrue(lc.lire_batterie_sysfs('100', 'Full')['en_charge'])

    def test_demarrage_mac(self):
        self.assertEqual(lc.lire_boottime('{ sec = 1696000000, usec = 12 } Mon Oct  2'), 1696000000)


def a_heure(heure, minute=0):
    """Un horodatage d'aujourd'hui à l'heure donnée (heure locale)."""
    t = time.localtime()
    return time.mktime((t.tm_year, t.tm_mon, t.tm_mday, heure, minute, 0, 0, 0, -1))


class SuiviUsage(unittest.TestCase):
    def test_session_et_pause(self):
        debut = a_heure(10)
        suivi = lc.Suivi(debut)
        for i in range(1, 361):  # 30 min d'activité, une mesure toutes les 5 s
            suivi.enregistrer(debut + i * 5, 0)
        resume = suivi.resume(debut + 1800)
        self.assertEqual(resume['session_s'], 1800)
        self.assertEqual(resume['actif_aujourd_hui_s'], 1800)
        # 6 min sans toucher l'ordinateur : c'est une pause.
        for i in range(1, 73):
            suivi.enregistrer(debut + 1800 + i * 5, i * 5)
        self.assertTrue(suivi.resume(debut + 2160)['en_pause'])
        self.assertEqual(suivi.resume(debut + 2160)['session_s'], 0)
        # Retour à l'ordinateur : la pause est notée, une nouvelle session commence.
        suivi.enregistrer(debut + 2165, 1)
        resume = suivi.resume(debut + 2165)
        self.assertFalse(resume['en_pause'])
        self.assertEqual(resume['derniere_pause'], debut + 2165)
        self.assertEqual(resume['session_s'], 0)

    def test_veille_compte_comme_pause(self):
        debut = a_heure(14)
        suivi = lc.Suivi(debut)
        suivi.enregistrer(debut + 600, None)  # 10 min sans mesure : ordinateur en veille
        self.assertEqual(suivi.resume(debut + 600)['derniere_pause'], debut + 600)
        self.assertEqual(suivi.resume(debut + 600)['actif_aujourd_hui_s'], 0)

    def test_usage_tardif(self):
        debut = a_heure(23, 10)
        suivi = lc.Suivi(debut)
        for i in range(1, 13):
            suivi.enregistrer(debut + i * 5, 0)
        self.assertEqual(suivi.resume(debut + 60)['nuit_aujourd_hui_s'], 60)


class FausseMesure:
    systeme = 'Linux'

    def cpu(self): return 42.0
    def memoire(self): return 61.0
    def disque(self): return 70.0
    def temperature(self): return None
    def alimentation(self): return {'niveau': 0.5, 'en_charge': True}, 'secteur'
    def inactivite(self): return 3.0
    def demarrage_s(self): return 1000


class CapteurEtServeur(unittest.TestCase):
    def setUp(self):
        self.dossier = tempfile.mkdtemp()
        self.horloge_valeur = a_heure(11)
        self.capteur = lc.Capteur(FausseMesure(), lc.Journal(os.path.join(self.dossier, 'donnees')), horloge=lambda: self.horloge_valeur)

    def tearDown(self):
        shutil.rmtree(self.dossier, ignore_errors=True)

    def test_mesure_et_historique(self):
        etat = self.capteur.instantane()
        self.assertEqual(etat['source'], 'capteur-pc')
        self.assertEqual(etat['cpu'], 42.0)
        self.assertEqual(etat['batterie'], {'niveau': 0.5, 'en_charge': True})
        self.assertIn('usage', etat)
        for _ in range(13):  # un peu plus d'une minute
            self.horloge_valeur += 5
            self.capteur.mesurer()
        historique = self.capteur.historique()
        self.assertEqual(len(historique), 1)
        self.assertTrue(historique[0]['actif'])
        # Un nouveau capteur relit l'historique et reprend le temps actif du jour.
        autre = lc.Capteur(FausseMesure(), lc.Journal(os.path.join(self.dossier, 'donnees')), horloge=lambda: self.horloge_valeur)
        self.assertEqual(len(autre.historique()), 1)
        self.assertGreaterEqual(autre.instantane()['usage']['actif_aujourd_hui_s'], 60)

    def test_serveur_local(self):
        site = os.path.join(self.dossier, 'site')
        os.makedirs(os.path.join(site, 'capteur'))
        with open(os.path.join(site, 'index.html'), 'w', encoding='utf-8') as f:
            f.write('<p>Lumi</p>')
        with open(os.path.join(site, 'capteur', 'secret.txt'), 'w', encoding='utf-8') as f:
            f.write('privé')
        serveur = http.server.ThreadingHTTPServer(('127.0.0.1', 0), lc.fabriquer_gestionnaire(self.capteur, site))
        fil = threading.Thread(target=serveur.serve_forever, daemon=True)
        fil.start()
        base = 'http://127.0.0.1:%d' % serveur.server_address[1]
        try:
            with urllib.request.urlopen(base + '/api/sante') as reponse:
                self.assertEqual(reponse.headers['Access-Control-Allow-Origin'], '*')
                self.assertEqual(json.loads(reponse.read().decode('utf-8'))['source'], 'capteur-pc')
            with urllib.request.urlopen(base + '/api/historique') as reponse:
                self.assertIn('echantillons', json.loads(reponse.read().decode('utf-8')))
            with urllib.request.urlopen(base + '/index.html') as reponse:
                self.assertIn('Lumi', reponse.read().decode('utf-8'))
            with self.assertRaises(urllib.error.HTTPError) as erreur:
                urllib.request.urlopen(base + '/capteur/secret.txt')
            self.assertEqual(erreur.exception.code, 404)
            requete = urllib.request.Request(base + '/api/sante', method='OPTIONS')
            with urllib.request.urlopen(requete) as reponse:
                self.assertEqual(reponse.status, 204)
                self.assertEqual(reponse.headers['Access-Control-Allow-Private-Network'], 'true')
        finally:
            serveur.shutdown()
            serveur.server_close()

    def test_vraies_mesures_de_cet_ordinateur(self):
        mesures = lc.Mesures()
        cpu = mesures.cpu()
        self.assertTrue(cpu is None or 0 <= cpu <= 100)
        memoire = mesures.memoire()
        self.assertTrue(memoire is None or 0 <= memoire <= 100)
        disque = mesures.disque()
        self.assertTrue(disque is None or 0 <= disque <= 100)
        batterie, alimentation = mesures.alimentation()
        self.assertIn(alimentation, (None, 'secteur', 'batterie'))

    def test_mesures_sans_psutil(self):
        """Le capteur doit marcher avec Python seul, sans aucune bibliothèque."""
        sauvegarde = lc.psutil
        lc.psutil = None
        try:
            mesures = lc.Mesures()
            cpu = mesures.cpu()
            self.assertTrue(cpu is None or 0 <= cpu <= 100)
            memoire = mesures.memoire()
            self.assertTrue(memoire is None or 0 <= memoire <= 100)
            if lc.SYSTEME == 'Linux':
                self.assertIsNotNone(cpu)
                self.assertIsNotNone(memoire)
            batterie, alimentation = mesures.alimentation()
            self.assertIn(alimentation, (None, 'secteur', 'batterie'))
            self.assertTrue(mesures.demarrage_s() is None or mesures.demarrage_s() > 0)
        finally:
            lc.psutil = sauvegarde


if __name__ == '__main__':
    unittest.main()
