package io.github.tehau987.lumivivant;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;

/**
 * Le widget de l'écran d'accueil : Lumi tel qu'il était à la dernière ouverture
 * de l'appli (son image, son nom, son âge, sa santé), et la batterie actuelle.
 */
public class LumiWidget extends AppWidgetProvider {

    private static final String PREFS = "widget";
    private static final String IMAGE = "lumi-widget.png";
    private static final long UNE_HEURE = 60 * 60 * 1000L;

    /** Appelé par l'appli (via le pont) quand Lumi change. */
    static void enregistrer(Context ctx, String etat, String imagePng) {
        Context app = ctx.getApplicationContext();
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("etat", etat).apply();
        if (imagePng != null && !imagePng.isEmpty()) {
            try (FileOutputStream sortie = new FileOutputStream(new File(app.getFilesDir(), IMAGE))) {
                sortie.write(Base64.decode(imagePng, Base64.DEFAULT));
            } catch (Exception e) {
                // On garde l'image précédente.
            }
        }
        AppWidgetManager awm = AppWidgetManager.getInstance(app);
        int[] ids = awm.getAppWidgetIds(new ComponentName(app, LumiWidget.class));
        for (int id : ids) dessiner(app, awm, id);
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager awm, int[] ids) {
        for (int id : ids) dessiner(ctx, awm, id);
    }

    private static void dessiner(Context ctx, AppWidgetManager awm, int id) {
        RemoteViews vue = new RemoteViews(ctx.getPackageName(), R.layout.widget_lumi);

        Bitmap image = BitmapFactory.decodeFile(new File(ctx.getFilesDir(), IMAGE).getPath());
        if (image != null) vue.setImageViewBitmap(R.id.widget_image, image);

        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String ligne = ctx.getString(R.string.widget_ouvre);
        try {
            JSONObject etat = new JSONObject(prefs.getString("etat", "{}"));
            if (etat.has("nom")) vue.setTextViewText(R.id.widget_nom, etat.getString("nom"));
            if (etat.has("age")) {
                ligne = etat.getString("age") + " · santé " + etat.optInt("sante");
                // Sans nouvelles depuis plus d'une heure : on invite à ouvrir l'appli.
                if (System.currentTimeMillis() - etat.optLong("t") > UNE_HEURE) {
                    ligne += "\n" + ctx.getString(R.string.widget_ouvre);
                } else {
                    JSONObject batterie = Mesures.batterie(ctx);
                    if (batterie != null) {
                        ligne += " · batterie " + Math.round(batterie.getDouble("niveau") * 100) + " %";
                    }
                }
            }
        } catch (Exception e) {
            // État illisible : on affiche l'invitation.
        }
        vue.setTextViewText(R.id.widget_ligne, ligne);

        Intent ouvrir = new Intent(ctx, MainActivity.class);
        PendingIntent clic = PendingIntent.getActivity(ctx, 0, ouvrir,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        vue.setOnClickPendingIntent(R.id.widget, clic);
        awm.updateAppWidget(id, vue);
    }
}
