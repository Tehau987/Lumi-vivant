package io.github.tehau987.lumivivant;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

/**
 * Le pont entre Lumi (JavaScript) et le téléphone : window.LumiAndroid.
 * Ces méthodes sont appelées depuis js/capteurs.js et js/app.js.
 */
final class Pont {

    private final MainActivity activite;

    Pont(MainActivity activite) {
        this.activite = activite;
    }

    /** Toutes les mesures du téléphone, en JSON (voir Mesures.java). */
    @JavascriptInterface
    public String mesures() {
        return Mesures.lire(activite).toString();
    }

    /** Ouvre le réglage « Accès aux données d'utilisation » pour le temps d'écran. */
    @JavascriptInterface
    public void ouvrirReglagesUsage() {
        activite.runOnUiThread(() -> {
            Intent reglage = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
            // Certains téléphones ouvrent directement la page de Lumi Vivant.
            reglage.setData(Uri.fromParts("package", activite.getPackageName(), null));
            try {
                activite.startActivity(reglage);
            } catch (Exception e) {
                activite.startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
            }
        });
    }

    /** Met à jour le widget : l'état de Lumi (JSON) et son image (PNG en base64, ou vide). */
    @JavascriptInterface
    public void majWidget(String etat, String imagePng) {
        LumiWidget.enregistrer(activite, etat, imagePng);
    }

    /** Enregistre une sauvegarde de Lumi dans un fichier choisi par la personne. */
    @JavascriptInterface
    public void exporter(String nom, String texte) {
        activite.runOnUiThread(() -> activite.exporter(nom, texte));
    }
}
