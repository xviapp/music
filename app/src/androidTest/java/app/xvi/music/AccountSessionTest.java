package app.xvi.music;

import android.content.Context;
import android.webkit.CookieManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;

import static org.junit.Assert.*;

/** Logging out must not leave a web session that would silently log the old account back in. */
@RunWith(AndroidJUnit4.class)
public class AccountSessionTest {
    @Test public void logoutClearsAccountAndWebLoginCookies() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Settings settings = new Settings(context);
        // Runs on real devices: keep the user's account and local data intact.
        String previousAccount = settings.cookie();
        java.util.Map<String, ?> previousPrefs = new java.util.HashMap<>(settings.prefs.getAll());
        try {
            settings.setCookie("MUSIC_U=test-account");
            settings.prefs.edit().putString("history", "[{\"id\":\"1\"}]").putString("searches", "[\"x\"]").putBoolean("fm", true).apply();
            CountDownLatch done = new CountDownLatch(1);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                CookieManager.getInstance().setCookie("https://music.163.com", "MUSIC_U=test-web-session");
                assertTrue(CookieManager.getInstance().getCookie("https://music.163.com").contains("MUSIC_U"));
                LoginActivity.clearWebSession(cleared -> done.countDown());
            });
            assertTrue(done.await(5, TimeUnit.SECONDS));
            settings.clearAccount();
            String web = CookieManager.getInstance().getCookie("https://music.163.com");
            assertTrue(web == null || !web.contains("MUSIC_U"));
            assertEquals("", settings.cookie());
            assertFalse(settings.prefs.contains("history"));
            assertFalse(settings.prefs.contains("searches"));
            assertFalse(settings.prefs.getBoolean("fm", true));
        } finally {
            android.content.SharedPreferences.Editor restore = settings.prefs.edit().clear();
            previousPrefs.forEach((key, value) -> {
                if (value instanceof String) restore.putString(key, (String) value);
                else if (value instanceof Boolean) restore.putBoolean(key, (Boolean) value);
                else if (value instanceof Integer) restore.putInt(key, (Integer) value);
                else if (value instanceof Long) restore.putLong(key, (Long) value);
            });
            restore.commit();
            if (!previousAccount.isEmpty()) settings.setCookie(previousAccount);
        }
    }
}
