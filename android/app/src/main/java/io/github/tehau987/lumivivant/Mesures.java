package io.github.tehau987.lumivivant;

import android.app.ActivityManager;
import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.os.Process;
import android.os.StatFs;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Ce que le téléphone mesure, au format attendu par js/capteurs.js :
 * {
 *   appareil, batterie: { niveau 0..1, en_charge, temperature °C },
 *   memoire %, disque %, reseau: { en_ligne, type },
 *   ecran: { autorise, debut, allume, evenements: [[t, 1 allumé | 0 éteint], …] }
 * }
 * Une mesure impossible est simplement absente. Les règles (temps d'écran, pauses)
 * sont dans js/vie.js, testées comme le reste.
 */
final class Mesures {

    private Mesures() {
    }

    static JSONObject lire(Context ctx) {
        JSONObject m = new JSONObject();
        try {
            m.put("appareil", Build.MODEL);
            m.putOpt("batterie", batterie(ctx));
            m.putOpt("memoire", memoire(ctx));
            m.putOpt("disque", disque());
            m.putOpt("reseau", reseau(ctx));
            m.put("ecran", ecran(ctx));
        } catch (JSONException e) {
            // Une mesure ratée ne doit pas empêcher les autres.
        }
        return m;
    }

    /** La batterie : niveau, branchement et température (en dixièmes de degré pour Android). */
    static JSONObject batterie(Context ctx) throws JSONException {
        Intent etat = ctx.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (etat == null) return null;
        int niveau = etat.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int echelle = etat.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        if (niveau < 0 || echelle <= 0) return null;
        JSONObject b = new JSONObject();
        b.put("niveau", niveau / (double) echelle);
        b.put("en_charge", etat.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0);
        int dixiemes = etat.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
        if (dixiemes != Integer.MIN_VALUE && dixiemes > 0) b.put("temperature", dixiemes / 10.0);
        return b;
    }

    /** La mémoire vive utilisée, en %. */
    private static Double memoire(Context ctx) {
        ActivityManager am = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
        if (am == null) return null;
        ActivityManager.MemoryInfo info = new ActivityManager.MemoryInfo();
        am.getMemoryInfo(info);
        if (info.totalMem <= 0) return null;
        return Math.round((info.totalMem - info.availMem) * 1000.0 / info.totalMem) / 10.0;
    }

    /** Le stockage utilisé, en %. */
    private static Double disque() {
        try {
            StatFs fs = new StatFs(Environment.getDataDirectory().getPath());
            long total = fs.getTotalBytes();
            if (total <= 0) return null;
            return Math.round((total - fs.getAvailableBytes()) * 1000.0 / total) / 10.0;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** La connexion : en ligne ou non, et par quel moyen. */
    private static JSONObject reseau(Context ctx) throws JSONException {
        ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return null;
        JSONObject r = new JSONObject();
        Network actif = cm.getActiveNetwork();
        NetworkCapabilities cap = actif == null ? null : cm.getNetworkCapabilities(actif);
        boolean enLigne = cap != null && cap.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        r.put("en_ligne", enLigne);
        if (enLigne) {
            if (cap.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) r.put("type", "wifi");
            else if (cap.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) r.put("type", "mobile");
            else if (cap.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) r.put("type", "ethernet");
        }
        return r;
    }

    /** L'accès au temps d'écran a-t-il été autorisé dans les réglages ? */
    static boolean usageAutorise(Context ctx) {
        AppOpsManager ops = (AppOpsManager) ctx.getSystemService(Context.APP_OPS_SERVICE);
        if (ops == null) return false;
        int mode;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            mode = ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName());
        } else {
            mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName());
        }
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    /** Les allumages et extinctions de l'écran depuis la veille à 18 h. */
    private static JSONObject ecran(Context ctx) throws JSONException {
        JSONObject e = new JSONObject();
        boolean autorise = usageAutorise(ctx);
        e.put("autorise", autorise);
        if (!autorise) return e;

        Calendar debut = Calendar.getInstance();
        debut.set(Calendar.HOUR_OF_DAY, 0);
        debut.set(Calendar.MINUTE, 0);
        debut.set(Calendar.SECOND, 0);
        debut.set(Calendar.MILLISECOND, 0);
        debut.add(Calendar.HOUR_OF_DAY, -6);
        long maintenant = System.currentTimeMillis();

        JSONArray liste = new JSONArray();
        UsageStatsManager usm = (UsageStatsManager) ctx.getSystemService(Context.USAGE_STATS_SERVICE);
        if (usm != null) {
            UsageEvents evenements = usm.queryEvents(debut.getTimeInMillis(), maintenant);
            UsageEvents.Event ev = new UsageEvents.Event();
            while (evenements != null && evenements.hasNextEvent()) {
                evenements.getNextEvent(ev);
                int type = ev.getEventType();
                if (type == UsageEvents.Event.SCREEN_INTERACTIVE || type == UsageEvents.Event.SCREEN_NON_INTERACTIVE) {
                    JSONArray paire = new JSONArray();
                    paire.put(ev.getTimeStamp());
                    paire.put(type == UsageEvents.Event.SCREEN_INTERACTIVE ? 1 : 0);
                    liste.put(paire);
                }
            }
        }
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        e.put("debut", debut.getTimeInMillis());
        e.put("allume", pm == null || pm.isInteractive());
        e.put("evenements", liste);
        return e;
    }
}
