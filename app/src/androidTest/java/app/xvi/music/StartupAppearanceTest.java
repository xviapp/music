package app.xvi.music;

import android.content.SharedPreferences;
import android.graphics.drawable.ColorDrawable;
import android.os.ParcelFileDescriptor;
import android.util.TypedValue;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class StartupAppearanceTest {
    @Test public void darkStartupWindowMatchesTheHomepageBackground() throws Exception {
        SharedPreferences prefs = new Settings(InstrumentationRegistry.getInstrumentation()
                .getTargetContext()).prefs;
        String original = prefs.getString("theme", null);
        try {
            prefs.edit().putString("theme", "dark").commit();
            // Establish the foreground before launching an internal activity on OEM devices.
            try (ParcelFileDescriptor output = InstrumentationRegistry.getInstrumentation()
                    .getUiAutomation().executeShellCommand("am start -W -n app.xvi.music/.MainActivity");
                 java.io.InputStream stream = new ParcelFileDescriptor.AutoCloseInputStream(output)) {
                byte[] buffer = new byte[1024];
                while (stream.read(buffer) != -1) { }
            }
            try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
                scenario.onActivity(activity -> {
                    TypedValue background = new TypedValue();
                    assertTrue(activity.getTheme().resolveAttribute(android.R.attr.windowBackground, background, true));
                    assertEquals("The window must not flash paper-white before a dark homepage", 0xff191817, background.data);
                    ColorDrawable rootBackground = (ColorDrawable) activity.findViewById(android.R.id.content)
                            .getRootView().getBackground();
                    assertEquals(0xff191817, rootBackground.getColor());
                });
            }
        } finally {
            if (original == null) prefs.edit().remove("theme").commit();
            else prefs.edit().putString("theme", original).commit();
        }
    }
}
