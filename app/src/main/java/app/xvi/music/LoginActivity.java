package app.xvi.music;

import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import java.util.LinkedHashMap;
import java.util.Map;

/** Official NetEase login page. The app never renders or submits a password form. */
public final class LoginActivity extends ComponentActivity {
    private int paper;
    private int primary;
    private int text;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable cookiePoll = new Runnable() {
        @Override public void run() {
            if (isFinishing() || completed) return;
            finishWhenLoggedIn();
            if (!completed) main.postDelayed(this, 1000);
        }
    };
    private Settings settings;
    private WebView web;
    private boolean completed;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        settings = new Settings(this);
        boolean dark = settings.dark(getResources().getConfiguration());
        paper = dark ? Color.rgb(25, 24, 23) : Color.rgb(248, 242, 232);
        primary = dark ? Color.rgb(235, 161, 107) : Color.rgb(168, 73, 31);
        text = dark ? Color.rgb(238, 231, 221) : Color.rgb(48, 43, 38);
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(paper);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            androidx.core.graphics.Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(16), 0, dp(8), 0);
        toolbar.setBackgroundColor(paper);
        TextView title = new TextView(this);
        title.setText("网易云音乐登录");
        title.setTextColor(text);
        title.setTextSize(19);
        title.setGravity(Gravity.CENTER_VERTICAL);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, dp(56), 1));
        TextView close = new TextView(this);
        close.setText("关闭");
        close.setTextColor(primary);
        close.setTextSize(15);
        close.setGravity(Gravity.CENTER);
        close.setMinWidth(dp(64));
        close.setOnClickListener(view -> finish());
        toolbar.addView(close, new LinearLayout.LayoutParams(dp(64), dp(56)));
        root.addView(toolbar, new LinearLayout.LayoutParams(-1, dp(56)));

        web = new WebView(this);
        WebSettings options = web.getSettings();
        options.setJavaScriptEnabled(true);
        options.setDomStorageEnabled(true);
        options.setDatabaseEnabled(true);
        options.setAllowFileAccess(false);
        options.setAllowContentAccess(false);
        options.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        cookies.setAcceptThirdPartyCookies(web, true);
        web.setBackgroundColor(paper);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !allowed(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !allowed(Uri.parse(url));
            }
            @Override public void onPageFinished(WebView view, String url) {
                finishWhenLoggedIn();
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        // The window's decor view must exist before accessing its insets controller.
        androidx.core.view.WindowInsetsControllerCompat barsController = androidx.core.view.WindowCompat.getInsetsController(getWindow(), root);
        barsController.setAppearanceLightStatusBars(!dark);
        barsController.setAppearanceLightNavigationBars(!dark);
        // Start from a clean web session: an old or expired MUSIC_U cookie must never count as a new login.
        clearWebSession(cleared -> {
            if (isFinishing() || isDestroyed()) return;
            web.loadUrl("https://music.163.com/#/login");
            main.post(cookiePoll);
        });
    }

    /** Clears cookies and storage left by the official login page. Call on the main thread. */
    static void clearWebSession(ValueCallback<Boolean> done) {
        CookieManager cookies = CookieManager.getInstance();
        WebStorage.getInstance().deleteAllData();
        cookies.removeAllCookies(cleared -> {
            cookies.flush();
            if (done != null) done.onReceiveValue(cleared);
        });
    }

    private boolean allowed(Uri uri) {
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (!"https".equalsIgnoreCase(scheme) || host == null) return false;
        return host.equals("music.163.com") || host.endsWith(".music.163.com")
                || host.endsWith(".music.126.net") || host.endsWith(".netease.com");
    }

    private void finishWhenLoggedIn() {
        if (completed) return;
        Map<String, String> cookies = new LinkedHashMap<>();
        String[] domains = {"https://music.163.com", "https://interface.music.163.com", "https://interfacepc.music.163.com"};
        CookieManager manager = CookieManager.getInstance();
        for (String domain : domains) mergeCookies(cookies, manager.getCookie(domain));
        if (!cookies.containsKey("MUSIC_U") || cookies.get("MUSIC_U").isEmpty()) return;
        try {
            manager.flush();
            settings.setCookie(cookieString(cookies));
            completed = true;
            setResult(RESULT_OK);
            finish();
        } catch (Exception error) {
            Toast.makeText(this, "登录信息保存失败，请重试", Toast.LENGTH_SHORT).show();
        }
    }

    private static void mergeCookies(Map<String, String> target, String raw) {
        if (raw == null || raw.isEmpty()) return;
        for (String part : raw.split(";")) {
            int split = part.indexOf('=');
            if (split > 0) target.put(part.substring(0, split).trim(), part.substring(split + 1).trim());
        }
    }

    private static String cookieString(Map<String, String> values) {
        StringBuilder result = new StringBuilder();
        values.forEach((key, value) -> {
            if (result.length() > 0) result.append("; ");
            result.append(key).append('=').append(value);
        });
        return result.toString();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override protected void onDestroy() {
        main.removeCallbacksAndMessages(null);
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
