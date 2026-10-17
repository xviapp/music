package app.xvi.music;

import android.content.*;
import android.graphics.Bitmap;
import android.os.*;
import android.webkit.*;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.*;
import androidx.media3.common.*;
import androidx.media3.session.*;
import androidx.webkit.*;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.zxing.*;
import com.google.zxing.common.BitMatrix;
import org.json.*;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Set;
import java.util.concurrent.*;

@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
public final class MainActivity extends ComponentActivity {
    private static final int PAPER_DARK = 0xff191817;
    private static final int PAPER_LIGHT = 0xffF8F2E8;
    private static final long PROGRESS_INTERVAL_MS = 750;
    private static final String ORIGIN = "https://appassets.androidplatform.net";

    private WebView web;
    private android.widget.FrameLayout root;
    private Settings settings;
    private MediaController player;
    private ListenableFuture<MediaController> future;
    private final ExecutorService io = Executors.newFixedThreadPool(3);
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean ready = false;
    /** The page has the current queue; afterwards it is only resent when the timeline changes. */
    private boolean queueSent = false;
    private boolean loginLaunched = false;

    @Override public void onCreate(Bundle saved) {
        settings = new Settings(this);
        boolean dark = settings.dark(getResources().getConfiguration());
        setTheme(dark ? R.style.AppTheme_Dark : R.style.AppTheme_Light);
        super.onCreate(saved);
        web = new WebView(this);
        // Keep the native canvas visible until the themed HTML has actually painted.
        web.setAlpha(0f);
        root = new android.widget.FrameLayout(this);
        root.setBackgroundColor(dark ? PAPER_DARK : PAPER_LIGHT);
        root.addView(web, new android.widget.FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        appearance(dark);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 1001);
        }
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            androidx.core.graphics.Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        WebSettings options = web.getSettings();
        options.setJavaScriptEnabled(true);
        options.setDomStorageEnabled(false);
        options.setAllowFileAccess(false);
        options.setAllowContentAccess(false);
        options.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder().addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return loader.shouldInterceptRequest(r.getUrl()); }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return true; }
            @Override public void onPageFinished(WebView v, String url) {
                ready = true;
                queueSent = false;
                emit(true);
            }
        });
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            android.widget.TextView message = new android.widget.TextView(this);
            message.setText("请更新 Android 系统 WebView 后重新打开音乐");
            message.setPadding(32, 64, 32, 32);
            setContentView(message);
            return;
        }
        WebViewCompat.addWebMessageListener(web, "MusicNative", Set.of(ORIGIN), (view, message, origin, isMainFrame, reply) -> {
            if (!isMainFrame) return;
            String raw = message.getData();
            if (raw == null || raw.length() > 1_000_000) return;
            try {
                JSONObject request = new JSONObject(raw);
                JSONObject args = request.optJSONObject("args");
                dispatch(request.getInt("id"), request.getString("method"), args == null ? new JSONObject() : args, reply);
            } catch (Exception ignored) {
                // Malformed messages have no id to answer.
            }
        });
        future = new MediaController.Builder(this, new SessionToken(this, new ComponentName(this, PlaybackService.class)))
                .setListener(new ServiceMessages())
                .buildAsync();
        future.addListener(() -> {
            try {
                player = future.get();
                player.addListener(new Player.Listener() {
                    @Override public void onEvents(Player p, Player.Events events) { emit(events.contains(Player.EVENT_TIMELINE_CHANGED)); }
                });
                emit(true);
            } catch (Exception e) {
                notice("播放器连接失败，请重新打开应用");
            }
        }, main::post);
        web.loadUrl(ORIGIN + "/assets/ui/index.html");
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                web.evaluateJavascript("window.musicBack ? window.musicBack() : false", result -> {
                    if (!"true".equals(result)) moveTaskToBack(true);
                });
            }
        });
    }

    /** Messages the playback service sends to the app, such as skipped songs or notification likes. */
    private final class ServiceMessages implements MediaController.Listener {
        @Override public ListenableFuture<SessionResult> onCustomCommand(MediaController controller, SessionCommand command, Bundle args) {
            if (command.customAction.equals(PlaybackService.NOTICE)) notice(args.getString("message", ""));
            else if (command.customAction.equals(PlaybackService.LIKED) && ready) {
                web.evaluateJavascript("window.onLiked?.(" + JSONObject.quote(args.getString("id", "")) + "," + args.getBoolean("like") + ")", null);
            }
            return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_SUCCESS));
        }
    }

    private void dispatch(int id, String method, JSONObject args, JavaScriptReplyProxy reply) {
        switch (method) {
            case "uiReady":
                web.postVisualStateCallback(id, new WebView.VisualStateCallback() {
                    @Override public void onComplete(long requestId) {
                        if (isDestroyed()) return;
                        web.setAlpha(1f);
                        respond(reply, id, new JSONObject(), null);
                    }
                });
                return;
            case "appearance":
                appearance(args.optBoolean("dark"));
                respond(reply, id, new JSONObject(), null);
                return;
            case "player":
                try {
                    control(args);
                    respond(reply, id, new JSONObject(), null);
                } catch (Exception e) {
                    respond(reply, id, null, e.getMessage());
                }
                return;
            case "likes":
                try {
                    syncLikes(args.getJSONArray("ids"));
                    respond(reply, id, new JSONObject(), null);
                } catch (Exception e) {
                    respond(reply, id, null, e.getMessage());
                }
                return;
            case "officialLogin":
                loginLaunched = true;
                main.post(() -> startActivity(new Intent(this, LoginActivity.class)));
                respond(reply, id, new JSONObject(), null);
                return;
            default:
                io.execute(() -> {
                    try {
                        respond(reply, id, background(method, args), null);
                    } catch (Exception e) {
                        respond(reply, id, null, e.getMessage() == null ? "操作失败，请重试" : e.getMessage());
                    }
                });
        }
    }

    /** Bridge methods that may touch the network, the keystore or preferences. */
    private Object background(String method, JSONObject args) throws Exception {
        switch (method) {
            case "init": return settings.publicState();
            case "settings":
                settings.update(args);
                return settings.publicState();
            case "api": {
                JSONObject params = args.optJSONObject("params");
                return new MusicApi(settings).request(args.getString("route"), params == null ? new JSONObject() : params);
            }
            case "history": return new JSONArray(settings.prefs.getString("history", "[]"));
            case "searches": return settings.searches();
            case "searchAdd": return settings.addSearch(args.optString("keyword"));
            case "searchClear":
                settings.clearSearches();
                return new JSONArray();
            case "logout":
                settings.clearAccount();
                main.post(() -> {
                    LoginActivity.clearWebSession(null);
                    if (player == null) return;
                    player.stop();
                    player.clearMediaItems();
                    player.sendCustomCommand(PlaybackService.LIKES, Bundle.EMPTY);
                });
                return new JSONObject();
            case "qr": return new JSONObject().put("image", qr(args.getString("key")));
            default: throw new IllegalArgumentException("不支持的操作");
        }
    }

    private void appearance(boolean dark) {
        int canvas = dark ? PAPER_DARK : PAPER_LIGHT;
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(canvas));
        root.setBackgroundColor(canvas);
        web.setBackgroundColor(canvas);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), root);
        bars.setAppearanceLightStatusBars(!dark);
        bars.setAppearanceLightNavigationBars(!dark);
    }

    private void respond(JavaScriptReplyProxy reply, int id, Object value, String error) {
        main.post(() -> {
            if (isDestroyed()) return;
            try {
                JSONObject result = new JSONObject().put("id", id);
                if (error == null) result.put("value", value);
                else result.put("error", error);
                reply.postMessage(result.toString());
            } catch (Exception ignored) {
                // The page is gone; nothing to answer.
            }
        });
    }

    private void control(JSONObject args) throws Exception {
        if (player == null) throw new IllegalStateException("播放器正在准备，请稍后重试");
        switch (args.getString("action")) {
            case "queue": {
                List<MediaItem> tracks = Tracks.items(args.getJSONArray("songs"));
                if (tracks.isEmpty()) throw new IllegalArgumentException("没有可播放的歌曲");
                int start = args.optInt("index", 0);
                if (start < 0 || start >= tracks.size()) throw new IllegalArgumentException("播放位置无效");
                setFm(args.optBoolean("fm"));
                player.setMediaItems(tracks, start, 0);
                player.prepare();
                player.play();
                break;
            }
            case "append": {
                List<MediaItem> added = Tracks.items(args.getJSONArray("songs"));
                if (added.isEmpty()) throw new IllegalArgumentException("没有可添加的歌曲");
                if (player.getMediaItemCount() + added.size() > Tracks.MAX_QUEUE) throw new IllegalArgumentException("队列最多容纳 " + Tracks.MAX_QUEUE + " 首歌曲");
                prepareForAddition();
                player.addMediaItems(added);
                break;
            }
            case "playnext": playNext(Tracks.item(args.getJSONObject("song"))); break;
            case "move": {
                int from = args.getInt("from"), to = args.getInt("to"), count = player.getMediaItemCount();
                if (from < 0 || from >= count || to < 0 || to >= count) throw new IllegalArgumentException("播放位置无效");
                if (from != to) player.moveMediaItem(from, to);
                break;
            }
            case "clear":
                setFm(false);
                player.stop();
                player.clearMediaItems();
                break;
            case "play":
                if (player.getMediaItemCount() == 0) return;
                if (player.getPlaybackState() == Player.STATE_ENDED) player.seekToDefaultPosition();
                player.prepare();
                player.play();
                break;
            case "pause": player.pause(); break;
            case "next": player.seekToNextMediaItem(); break;
            case "previous": player.seekToPrevious(); break;
            case "seek": player.seekTo(Math.max(0, args.getLong("position"))); break;
            case "jump": {
                int index = args.getInt("index");
                if (index < 0 || index >= player.getMediaItemCount()) throw new IllegalArgumentException("播放位置无效");
                player.seekToDefaultPosition(index);
                player.prepare();
                player.play();
                break;
            }
            case "remove": {
                int index = args.getInt("index");
                if (index >= 0 && index < player.getMediaItemCount()) player.removeMediaItem(index);
                break;
            }
            case "repeat": player.setRepeatMode((player.getRepeatMode() + 1) % 3); break;
            case "shuffle": player.setShuffleModeEnabled(!player.getShuffleModeEnabled()); break;
            case "sleep": {
                Bundle bundle = new Bundle();
                bundle.putInt("minutes", args.getInt("minutes"));
                player.sendCustomCommand(PlaybackService.SLEEP, bundle);
                break;
            }
            case "reload": player.sendCustomCommand(PlaybackService.RELOAD, Bundle.EMPTY); break;
            case "trash": {
                Bundle bundle = new Bundle();
                bundle.putString("id", args.getString("id"));
                player.sendCustomCommand(PlaybackService.TRASH, bundle);
                break;
            }
            default: throw new IllegalArgumentException("不支持的播放操作");
        }
        emit(false);
    }

    /** Gives the playback service the liked songs so its notification button matches the app. */
    private void syncLikes(JSONArray ids) throws JSONException {
        if (player == null) return;
        String[] values = new String[ids.length()];
        for (int i = 0; i < values.length; i++) values[i] = ids.getString(i);
        Bundle bundle = new Bundle();
        bundle.putStringArray("ids", values);
        player.sendCustomCommand(PlaybackService.LIKES, bundle);
    }

    private void setFm(boolean fm) { settings.prefs.edit().putBoolean("fm", fm).apply(); }

    /** Adding to an empty or finished queue should not start playing by itself. */
    private void prepareForAddition() {
        if (player.getMediaItemCount() == 0) {
            setFm(false);
            player.pause();
        } else if (player.getPlaybackState() == Player.STATE_ENDED) {
            player.pause();
        }
    }

    private void playNext(MediaItem item) {
        int count = player.getMediaItemCount(), current = player.getCurrentMediaItemIndex(), existing = -1;
        for (int i = 0; i < count; i++) {
            if (player.getMediaItemAt(i).mediaId.equals(item.mediaId)) {
                existing = i;
                break;
            }
        }
        int target = PlaybackRules.playNextTarget(current, existing, count);
        if (target < 0) return;
        if (existing >= 0) {
            player.moveMediaItem(existing, target);
            return;
        }
        if (count >= Tracks.MAX_QUEUE) throw new IllegalArgumentException("队列最多容纳 " + Tracks.MAX_QUEUE + " 首歌曲");
        prepareForAddition();
        player.addMediaItem(target, item);
    }

    private String qr(String key) throws Exception {
        if (!key.matches("[a-zA-Z0-9_-]{10,200}")) throw new IllegalArgumentException("二维码无效");
        int size = 480;
        BitMatrix bits = new MultiFormatWriter().encode("https://music.163.com/login?codekey=" + key, BarcodeFormat.QR_CODE, size, size);
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        int[] pixels = new int[size * size];
        for (int y = 0; y < size; y++) {
            for (int x = 0; x < size; x++) pixels[y * size + x] = bits.get(x, y) ? 0xff304f65 : 0xffffffff;
        }
        bitmap.setPixels(pixels, 0, size, 0, 0, size, size);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, output);
        bitmap.recycle();
        return "data:image/png;base64," + android.util.Base64.encodeToString(output.toByteArray(), android.util.Base64.NO_WRAP);
    }

    private JSONObject withSleep(JSONObject state) throws JSONException {
        int sleep = settings.prefs.getInt("sleep", 0);
        long remaining = sleep > 0 ? Math.max(0, settings.prefs.getLong("sleepDeadline", 0) - System.currentTimeMillis()) : 0;
        return state.put("sleep", sleep).put("sleepRemaining", remaining);
    }

    /** Sends the playback structure; the queue is included only when it may have changed. */
    private void emit(boolean queueChanged) {
        if (!ready || player == null || isDestroyed()) return;
        try {
            boolean includeQueue = queueChanged || !queueSent;
            JSONObject state = withSleep(Tracks.state(player, includeQueue));
            queueSent = true;
            web.evaluateJavascript("window.onPlayback?.(" + state + ")", null);
        } catch (Exception ignored) {
            // The next event or tick sends a fresh state.
        }
    }

    private void emitProgress() {
        if (!ready || player == null || isDestroyed()) return;
        boolean sleeping = settings.prefs.getInt("sleep", 0) > 0;
        if (!player.isPlaying() && player.getPlaybackState() != Player.STATE_BUFFERING && !sleeping) return;
        try {
            web.evaluateJavascript("window.onProgress?.(" + withSleep(Tracks.progress(player)) + ")", null);
        } catch (Exception ignored) {
            // The next tick sends a fresh position.
        }
    }

    private void notice(String message) {
        if (ready && !message.isEmpty()) web.evaluateJavascript("window.onNativeError?.(" + JSONObject.quote(message) + ")", null);
    }

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            emitProgress();
            main.postDelayed(this, PROGRESS_INTERVAL_MS);
        }
    };

    @Override public void onStart() {
        super.onStart();
        emit(false);
        main.post(tick);
    }

    @Override public void onResume() {
        super.onResume();
        if (loginLaunched) {
            loginLaunched = false;
            main.postDelayed(this::syncLogin, 250);
        }
    }

    private void syncLogin() {
        if (!ready) return;
        try {
            JSONObject state = settings.publicState();
            if (state.optBoolean("loggedIn")) web.evaluateJavascript("window.onOfficialLogin?.(" + state + ")", null);
        } catch (Exception ignored) {
            // The user can retry the login from the account page.
        }
    }

    @Override public void onStop() {
        main.removeCallbacks(tick);
        if (!settings.background() && player != null && !isChangingConfigurations()) player.pause();
        super.onStop();
    }

    @Override public void onDestroy() {
        ready = false;
        main.removeCallbacksAndMessages(null);
        io.shutdownNow();
        if (future != null) MediaController.releaseFuture(future);
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
