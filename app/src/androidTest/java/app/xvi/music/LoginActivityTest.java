package app.xvi.music;

import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.TextView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import android.os.ParcelFileDescriptor;
import org.junit.Test;
import org.junit.runner.RunWith;

import static org.junit.Assert.*;

/** Exercises the same activity startup used by the official-login button. */
@RunWith(AndroidJUnit4.class)
public class LoginActivityTest {
    private static void foregroundMain() throws Exception {
        // Start as the user would, so OEM background-launch restrictions do not
        // block the internal login activity before its onCreate is exercised.
        try (ParcelFileDescriptor output = InstrumentationRegistry.getInstrumentation()
                .getUiAutomation().executeShellCommand("am start -W -n app.xvi.music/.MainActivity");
             java.io.InputStream stream = new ParcelFileDescriptor.AutoCloseInputStream(output)) {
            byte[] buffer = new byte[1024];
            while (stream.read(buffer) != -1) { /* Wait for the foreground launch. */ }
        }
    }

    @Test public void officialLoginOpensAndCloses() throws Exception {
        foregroundMain();
        try (ActivityScenario<LoginActivity> scenario = ActivityScenario.launch(LoginActivity.class)) {
            scenario.onActivity(activity -> {
                assertFalse(activity.isFinishing());
                ViewGroup content = activity.findViewById(android.R.id.content);
                assertNotNull(find(content, WebView.class, null));
                assertNotNull(find(content, TextView.class, "网易云音乐登录"));
                View close = find(content, TextView.class, "关闭");
                assertNotNull(close);
                close.performClick();
                assertTrue(activity.isFinishing());
            });
        }
    }

    @Test public void officialLoginButtonLaunchesLoginActivity() throws Exception {
        foregroundMain();
        android.app.Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        android.app.Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(
                LoginActivity.class.getName(), null, false);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            java.util.concurrent.CountDownLatch clicked = new java.util.concurrent.CountDownLatch(1);
            scenario.onActivity(activity -> {
                WebView web = (WebView) find(activity.findViewById(android.R.id.content), WebView.class, null);
                assertNotNull(web);
                web.evaluateJavascript("(() => { const timer = setInterval(() => { " +
                        "const settings = document.querySelector('[data-action=\"tab:settings\"]'); " +
                        "if (!settings) return; clearInterval(timer); settings.click(); " +
                        "document.querySelector('[data-action=\"account\"]').click(); " +
                        "document.querySelector('[data-action=\"official-login\"]').click(); " +
                        "}, 100); })()", result -> clicked.countDown());
            });
            assertTrue(clicked.await(5, java.util.concurrent.TimeUnit.SECONDS));
            android.app.Activity login = instrumentation.waitForMonitorWithTimeout(monitor, 10000);
            assertNotNull("The official-login button must open LoginActivity", login);
            instrumentation.runOnMainSync(() -> {
                assertNotNull(find(login.findViewById(android.R.id.content), TextView.class, "网易云音乐登录"));
                login.finish();
            });
        } finally {
            instrumentation.removeMonitor(monitor);
        }
    }

    private static View find(View view, Class<? extends View> type, String label) {
        if (type.isInstance(view) && (label == null ||
                (view instanceof TextView && label.contentEquals(((TextView) view).getText())))) return view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                View match = find(group.getChildAt(i), type, label);
                if (match != null) return match;
            }
        }
        return null;
    }
}
