package app.xvi.music;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public final class Settings {
    public final SharedPreferences prefs;
    public Settings(Context context) { prefs = context.getSharedPreferences("music", Context.MODE_PRIVATE); }
    private static final int MAX_SEARCHES = 10;
    private static final java.util.Set<String> QUALITIES = java.util.Set.of("standard", "exhigh", "lossless", "hires");

    public boolean background() { return prefs.getBoolean("background", true); }
    /** Whether the saved theme, or the system setting when following it, is dark. */
    public boolean dark(android.content.res.Configuration config) {
        String mode = prefs.getString("theme", "system");
        boolean systemDark = (config.uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        return mode.equals("dark") || (mode.equals("system") && systemDark);
    }
    public String quality() { return prefs.getString("quality", "exhigh"); }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias("music-account")) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder("music-account", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey("music-account", null);
    }
    public synchronized void setCookie(String value) throws Exception {
        if (value.isEmpty()) { prefs.edit().remove("account").apply(); return; }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        String encrypted = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":"
                + Base64.encodeToString(cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)), Base64.NO_WRAP);
        prefs.edit().putString("account", encrypted).apply();
    }
    public synchronized String cookie() {
        String value = prefs.getString("account", ""); if (value.isEmpty()) return "";
        try {
            String[] parts = value.split(":"); Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) { prefs.edit().remove("account").apply(); return ""; }
    }
    public JSONObject publicState() throws Exception {
        return new JSONObject().put("background", background())
                .put("theme", prefs.getString("theme", "system")).put("quality", prefs.getString("quality", "exhigh"))
                .put("tapPlay", prefs.getBoolean("tapPlay", false))
                .put("version", BuildConfig.VERSION_NAME)
                .put("loggedIn", cookie().contains("MUSIC_U="));
    }
    public void update(JSONObject value) throws Exception {
        if (value.has("background")) prefs.edit().putBoolean("background", value.getBoolean("background")).apply();
        if (value.has("tapPlay")) prefs.edit().putBoolean("tapPlay", value.getBoolean("tapPlay")).apply();
        if (value.has("theme")) {
            String theme = value.getString("theme");
            if (!java.util.Set.of("light", "dark", "system").contains(theme)) throw new IllegalArgumentException("外观选项无效");
            prefs.edit().putString("theme", theme).apply();
        }
        if (value.has("quality")) {
            String quality = value.getString("quality");
            if (!QUALITIES.contains(quality)) throw new IllegalArgumentException("音质选项无效");
            prefs.edit().putString("quality", quality).apply();
        }
    }

    /** Removes the account and everything tied to it; web login cookies are cleared by LoginActivity. */
    public synchronized void clearAccount() throws Exception {
        setCookie("");
        prefs.edit().remove("history").remove("queue").remove("playback").remove("searches").putBoolean("fm", false).apply();
    }

    public synchronized org.json.JSONArray searches() {
        try { return new org.json.JSONArray(prefs.getString("searches", "[]")); }
        catch (Exception e) { return new org.json.JSONArray(); }
    }

    public synchronized org.json.JSONArray addSearch(String keyword) {
        String value = keyword == null ? "" : keyword.trim();
        org.json.JSONArray old = searches(), next = new org.json.JSONArray();
        if (value.isEmpty() || value.length() > 200) return old;
        next.put(value);
        for (int i = 0; i < old.length() && next.length() < MAX_SEARCHES; i++) {
            if (!value.equals(old.optString(i))) next.put(old.optString(i));
        }
        prefs.edit().putString("searches", next.toString()).apply();
        return next;
    }

    public synchronized void clearSearches() { prefs.edit().remove("searches").apply(); }
}
