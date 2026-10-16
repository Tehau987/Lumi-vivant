package io.github.tehau987.lumivivant;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * L'écran principal : l'appli web de Lumi (assets/www), affichée dans une WebView.
 * Le pont « LumiAndroid » (voir Pont.java) lui donne les mesures du téléphone.
 */
public class MainActivity extends Activity {

    private static final int CHOISIR_FICHIER = 1;
    private static final int EXPORTER = 2;

    private WebView web;
    private ValueCallback<Uri[]> choixFichier;
    private String texteAExporter;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(getColor(R.color.nuit));
        setContentView(web);

        // Android 15 dessine l'appli sous les barres du système : on laisse leur place.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            web.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets barres = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                v.setPadding(barres.left, barres.top, barres.right, barres.bottom);
                return WindowInsets.CONSUMED;
            });
        }

        WebSettings reglages = web.getSettings();
        reglages.setJavaScriptEnabled(true);
        reglages.setDomStorageEnabled(true); // localStorage : la vie de Lumi y est enregistrée

        web.addJavascriptInterface(new Pont(this), "LumiAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Lumi reste chez lui : aucune page extérieure.
                return !"file".equals(request.getUrl().getScheme());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                // « Importer » : choisir un fichier de sauvegarde.
                if (choixFichier != null) choixFichier.onReceiveValue(null);
                choixFichier = callback;
                Intent choix = new Intent(Intent.ACTION_GET_CONTENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("*/*");
                try {
                    startActivityForResult(choix, CHOISIR_FICHIER);
                    return true;
                } catch (ActivityNotFoundException e) {
                    choixFichier = null;
                    return false;
                }
            }
        });

        if (savedInstanceState == null) web.loadUrl("file:///android_asset/www/index.html");
        else web.restoreState(savedInstanceState);
    }

    /** « Exporter » : demande où enregistrer la sauvegarde (appelé par le pont). */
    void exporter(String nom, String texte) {
        texteAExporter = texte;
        Intent creer = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("application/json")
                .putExtra(Intent.EXTRA_TITLE, nom);
        try {
            startActivityForResult(creer, EXPORTER);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.export_rate, Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == CHOISIR_FICHIER && choixFichier != null) {
            choixFichier.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            choixFichier = null;
        } else if (requestCode == EXPORTER) {
            Uri cible = resultCode == RESULT_OK && data != null ? data.getData() : null;
            if (cible != null && texteAExporter != null) {
                try (OutputStream sortie = getContentResolver().openOutputStream(cible)) {
                    sortie.write(texteAExporter.getBytes(StandardCharsets.UTF_8));
                    Toast.makeText(this, R.string.export_ok, Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Toast.makeText(this, R.string.export_rate, Toast.LENGTH_SHORT).show();
                }
            }
            texteAExporter = null;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        // Lumi enregistre sa vie avant que l'appli passe en arrière-plan.
        web.evaluateJavascript("window.dispatchEvent(new Event('pagehide'))", null);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
