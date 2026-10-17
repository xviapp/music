package app.xvi.music;

import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.*;
import androidx.media3.common.*;
import androidx.media3.database.StandaloneDatabaseProvider;
import androidx.media3.datasource.*;
import androidx.media3.datasource.cache.CacheDataSource;
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor;
import androidx.media3.datasource.cache.SimpleCache;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.*;
import com.google.common.collect.ImmutableList;
import com.google.common.util.concurrent.*;
import org.json.*;
import java.io.File;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.*;

@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
public final class PlaybackService extends MediaSessionService {
    /** App to service. */
    static final SessionCommand SLEEP = new SessionCommand("music.sleep", Bundle.EMPTY);
    static final SessionCommand LIKES = new SessionCommand("music.likes", Bundle.EMPTY);
    static final SessionCommand RELOAD = new SessionCommand("music.reload", Bundle.EMPTY);
    /** App or notification to service. */
    static final SessionCommand LIKE = new SessionCommand("music.like", Bundle.EMPTY);
    static final SessionCommand TRASH = new SessionCommand("music.trash", Bundle.EMPTY);
    /** Service to app. */
    static final String NOTICE = "music.notice";
    static final String LIKED = "music.liked";

    private static final long AUDIO_CACHE_BYTES = 512L * 1024 * 1024;
    private static final long URL_TTL_MS = 60_000;
    private static final long SAVE_INTERVAL_MS = 5_000;

    private ExoPlayer player;
    private MediaSession session;
    private SimpleCache cache;
    private Settings settings;
    private MusicApi api;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final PlaybackRules.SleepTimer sleepTimer = new PlaybackRules.SleepTimer();
    private final PlaybackRules.SkipGuard skipGuard = new PlaybackRules.SkipGuard();
    private final Set<String> likes = ConcurrentHashMap.newKeySet();
    private volatile boolean likesKnown = false;
    private boolean extending = false;
    private boolean skipWhenExtended = false;
    private final Map<String, String> urls = new ConcurrentHashMap<>();
    private final Map<String, Long> expires = new ConcurrentHashMap<>();
    /** Quality used for each song while it is loaded, so seeks never mix two encodings. */
    private final Map<String, String> qualities = new ConcurrentHashMap<>();
    private final SharedPreferences.OnSharedPreferenceChangeListener qualityChange = (prefs, key) -> {
        if ("quality".equals(key)) qualities.clear();
    };
    private final Runnable sleep = () -> {
        sleepTimer.clear();
        player.pause();
        saveSleep();
    };
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            savePlayback();
            handler.postDelayed(this, SAVE_INTERVAL_MS);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        settings = new Settings(this);
        api = new MusicApi(settings);
        settings.prefs.registerOnSharedPreferenceChangeListener(qualityChange);
        player = new ExoPlayer.Builder(this).setMediaSourceFactory(new DefaultMediaSourceFactory(dataSource())).build();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true);
        player.setHandleAudioBecomingNoisy(true);
        player.setWakeMode(C.WAKE_MODE_NETWORK);
        player.addListener(new Player.Listener() {
            @Override public void onEvents(Player p, Player.Events events) {
                if (events.contains(Player.EVENT_TIMELINE_CHANGED)) {
                    saveQueue();
                    refreshButtons();
                }
                savePlayback();
            }
            @Override public void onIsPlayingChanged(boolean playing) {
                if (playing) skipGuard.reset();
            }
            @Override public void onPlayerError(PlaybackException error) {
                urls.clear();
                expires.clear();
                if (UnplayableException.in(error)) skipUnplayable(error);
            }
            @Override public void onMediaItemTransition(MediaItem item, int reason) {
                boolean automatic = reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO || reason == Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT;
                if (sleepTimer.afterSong() && automatic) stopForSleep();
                remember(item);
                refreshButtons();
                extendFm();
            }
            @Override public void onPlaybackStateChanged(int state) {
                if (state != Player.STATE_ENDED) return;
                if (sleepTimer.afterSong()) stopForSleep();
                else extendFm();
            }
        });
        restore();
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        session = new MediaSession.Builder(this, player)
                .setSessionActivity(open)
                .setCallback(new Callback())
                .setMediaButtonPreferences(buttons())
                .build();
        handler.post(tick);
        loadLikes();
    }

    private DataSource.Factory dataSource() {
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setUserAgent("XviMusic/" + BuildConfig.VERSION_NAME)
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(20000)
                .setAllowCrossProtocolRedirects(false);
        ResolvingDataSource.Factory resolving = new ResolvingDataSource.Factory(http, spec -> {
            if (!"music.invalid".equals(spec.uri.getHost())) return spec;
            String id = spec.uri.getLastPathSegment();
            String key = cacheKey(id);
            try {
                if (!urls.containsKey(key) || expires.getOrDefault(key, 0L) < SystemClock.elapsedRealtime()) {
                    urls.put(key, api.resolve(id, quality(id)));
                    expires.put(key, SystemClock.elapsedRealtime() + URL_TTL_MS);
                }
                return spec.withUri(Uri.parse(urls.get(key)));
            } catch (IOException e) {
                throw e;
            } catch (Exception e) {
                throw new IOException(e.getMessage(), e);
            }
        });
        cache = new SimpleCache(new File(getCacheDir(), "audio"), new LeastRecentlyUsedCacheEvictor(AUDIO_CACHE_BYTES),
                new StandaloneDatabaseProvider(this));
        // Resolved URLs are signed and short lived, so cached audio is keyed by song and quality instead.
        return new CacheDataSource.Factory()
                .setCache(cache)
                .setUpstreamDataSourceFactory(resolving)
                .setCacheKeyFactory(spec -> "music.invalid".equals(spec.uri.getHost()) ? cacheKey(spec.uri.getLastPathSegment()) : spec.uri.toString())
                .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);
    }

    private String quality(String id) { return qualities.computeIfAbsent(id, key -> settings.quality()); }

    private String cacheKey(String id) { return id + ":" + quality(id); }

    private final class Callback implements MediaSession.Callback {
        @Override public MediaSession.ConnectionResult onConnect(MediaSession session, MediaSession.ControllerInfo controller) {
            if (!own(controller) && !controller.isTrusted()) return MediaSession.ConnectionResult.reject();
            SessionCommands commands = MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon()
                    .add(SLEEP).add(LIKES).add(RELOAD).add(LIKE).add(TRASH).build();
            return new MediaSession.ConnectionResult.AcceptedResultBuilder(session).setAvailableSessionCommands(commands).build();
        }

        @Override public ListenableFuture<SessionResult> onCustomCommand(MediaSession s, MediaSession.ControllerInfo controller, SessionCommand command, Bundle args) {
            String action = command.customAction;
            boolean appOnly = action.equals(SLEEP.customAction) || action.equals(LIKES.customAction) || action.equals(RELOAD.customAction);
            if (appOnly && !own(controller)) return result(SessionError.ERROR_NOT_SUPPORTED);
            if (action.equals(SLEEP.customAction)) setSleep(args.getInt("minutes", 0));
            else if (action.equals(LIKES.customAction)) setLikes(args.getStringArray("ids"));
            else if (action.equals(RELOAD.customAction)) reload();
            else if (action.equals(LIKE.customAction)) toggleLike();
            else if (action.equals(TRASH.customAction)) trash(args.getString("id", currentId()));
            else return result(SessionError.ERROR_NOT_SUPPORTED);
            return result(SessionResult.RESULT_SUCCESS);
        }

        private boolean own(MediaSession.ControllerInfo controller) { return controller.getPackageName().equals(getPackageName()); }

        private ListenableFuture<SessionResult> result(int code) { return Futures.immediateFuture(new SessionResult(code)); }
    }

    private void setSleep(int minutes) {
        handler.removeCallbacks(sleep);
        long delay = sleepTimer.set(minutes, System.currentTimeMillis());
        if (delay > 0) handler.postDelayed(sleep, delay);
        saveSleep();
    }

    private void stopForSleep() {
        sleepTimer.clear();
        player.pause();
        saveSleep();
    }

    private void saveSleep() {
        settings.prefs.edit().putInt("sleep", sleepTimer.mode()).putLong("sleepDeadline", sleepTimer.deadline()).apply();
    }

    /** Restart the current song so a new quality setting takes effect immediately. */
    private void reload() {
        qualities.clear();
        urls.clear();
        expires.clear();
        if (player.getMediaItemCount() == 0) return;
        int index = player.getCurrentMediaItemIndex();
        long position = player.getCurrentPosition();
        boolean play = player.getPlayWhenReady();
        player.stop();
        player.seekTo(index, position);
        player.prepare();
        if (play) player.play();
    }

    private void skipUnplayable(PlaybackException error) {
        MediaItem item = player.getCurrentMediaItem();
        String title = item == null || item.mediaMetadata.title == null ? "这首歌" : "《" + item.mediaMetadata.title + "》";
        if (!skipGuard.tryConsume()) {
            notice("连续多首歌曲无法播放，已停止自动跳过");
            return;
        }
        if (player.hasNextMediaItem()) {
            player.seekToNextMediaItem();
            player.prepare();
            player.play();
        } else if (fm()) {
            skipWhenExtended = true;
            extendFm();
        } else {
            return;
        }
        notice("已跳过" + title + "：" + rootMessage(error));
    }

    private static String rootMessage(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof UnplayableException) return cause.getMessage();
        }
        return "无法播放";
    }

    private void notice(String message) {
        Bundle args = new Bundle();
        args.putString("message", message);
        session.broadcastCustomCommand(new SessionCommand(NOTICE, Bundle.EMPTY), args);
    }

    private String currentId() {
        MediaItem item = player.getCurrentMediaItem();
        return item == null ? "" : item.mediaId;
    }

    private boolean fm() { return settings.prefs.getBoolean("fm", false); }

    private void loadLikes() {
        io.execute(() -> {
            try {
                if (!settings.cookie().contains("MUSIC_U=")) return;
                JSONObject profile = api.request("/login/status", new JSONObject()).getJSONObject("data").optJSONObject("profile");
                if (profile == null) return;
                JSONArray ids = api.request("/likelist", new JSONObject().put("uid", profile.getLong("userId"))).optJSONArray("ids");
                Set<String> loaded = new HashSet<>();
                for (int i = 0; ids != null && i < ids.length(); i++) loaded.add(ids.optString(i));
                handler.post(() -> {
                    if (likesKnown) return;
                    likes.addAll(loaded);
                    likesKnown = true;
                    refreshButtons();
                });
            } catch (Exception ignored) {
                // The notification simply keeps the unliked icon until the app sends the like list.
            }
        });
    }

    private void setLikes(String[] ids) {
        likes.clear();
        if (ids != null) likes.addAll(Arrays.asList(ids));
        likesKnown = ids != null;
        refreshButtons();
    }

    private void toggleLike() {
        String id = currentId();
        if (id.isEmpty()) return;
        if (!likesKnown) {
            notice("请先在应用中登录网易云音乐账号");
            return;
        }
        boolean like = !likes.contains(id);
        io.execute(() -> {
            try {
                api.request("/like", new JSONObject().put("id", id).put("like", like));
                handler.post(() -> {
                    if (like) likes.add(id);
                    else likes.remove(id);
                    refreshButtons();
                    Bundle args = new Bundle();
                    args.putString("id", id);
                    args.putBoolean("like", like);
                    session.broadcastCustomCommand(new SessionCommand(LIKED, Bundle.EMPTY), args);
                });
            } catch (Exception e) {
                handler.post(() -> notice(e.getMessage() == null ? "操作失败，请重试" : e.getMessage()));
            }
        });
    }

    private void trash(String id) {
        if (id == null || id.isEmpty()) return;
        io.execute(() -> {
            try {
                api.request("/fm_trash", new JSONObject().put("id", id));
                handler.post(() -> {
                    if (!id.equals(currentId())) return;
                    if (player.hasNextMediaItem()) {
                        player.seekToNextMediaItem();
                        player.play();
                    } else if (fm()) {
                        skipWhenExtended = true;
                        extendFm();
                    }
                    notice("将减少推荐类似歌曲");
                });
            } catch (Exception e) {
                handler.post(() -> notice(e.getMessage() == null ? "操作失败，请重试" : e.getMessage()));
            }
        });
    }

    /** Notification and system media control buttons beyond play, previous and next. */
    private ImmutableList<CommandButton> buttons() {
        ImmutableList.Builder<CommandButton> buttons = ImmutableList.builder();
        if (likesKnown && player != null && player.getCurrentMediaItem() != null) {
            boolean liked = likes.contains(currentId());
            buttons.add(new CommandButton.Builder(liked ? CommandButton.ICON_HEART_FILLED : CommandButton.ICON_HEART_UNFILLED)
                    .setDisplayName(liked ? "取消喜欢" : "喜欢")
                    .setSessionCommand(LIKE)
                    .setSlots(CommandButton.SLOT_FORWARD_SECONDARY, CommandButton.SLOT_OVERFLOW)
                    .build());
        }
        if (fm() && player != null && player.getCurrentMediaItem() != null) {
            buttons.add(new CommandButton.Builder(CommandButton.ICON_THUMB_DOWN_UNFILLED)
                    .setDisplayName("不喜欢")
                    .setSessionCommand(TRASH)
                    .setSlots(CommandButton.SLOT_BACK_SECONDARY, CommandButton.SLOT_OVERFLOW)
                    .build());
        }
        return buttons.build();
    }

    private void refreshButtons() {
        if (session != null) session.setMediaButtonPreferences(buttons());
    }

    private void saveQueue() {
        try {
            settings.prefs.edit().putString("queue", new JSONObject().put("queue", Tracks.queue(player)).toString()).apply();
        } catch (Exception ignored) {
            // Persisting is best effort; the live queue is unaffected.
        }
    }

    private void savePlayback() {
        try {
            JSONObject state = new JSONObject()
                    .put("index", Math.max(0, player.getCurrentMediaItemIndex()))
                    .put("position", Math.max(0, player.getCurrentPosition()))
                    .put("repeat", player.getRepeatMode())
                    .put("shuffle", player.getShuffleModeEnabled());
            settings.prefs.edit().putString("playback", state.toString()).apply();
        } catch (Exception ignored) {
            // Persisting is best effort; the live state is unaffected.
        }
    }

    private void restore() {
        try {
            JSONObject saved = new JSONObject(settings.prefs.getString("queue", "{}"));
            JSONArray queue = saved.optJSONArray("queue");
            // Older versions kept index and position inside the queue record.
            JSONObject state = settings.prefs.contains("playback") ? new JSONObject(settings.prefs.getString("playback", "{}")) : saved;
            if (queue != null && queue.length() > 0) {
                player.setMediaItems(Tracks.items(queue), Math.min(state.optInt("index"), queue.length() - 1), Math.max(0, state.optLong("position")));
                player.setRepeatMode(state.optInt("repeat"));
                player.setShuffleModeEnabled(state.optBoolean("shuffle"));
            }
        } catch (Exception ignored) {
            settings.prefs.edit().remove("queue").remove("playback").apply();
        }
        saveSleep();
    }

    private void remember(MediaItem item) {
        if (item == null) return;
        try {
            JSONArray old = new JSONArray(settings.prefs.getString("history", "[]"));
            JSONArray recent = new JSONArray().put(Tracks.json(item));
            for (int i = 0; i < old.length() && recent.length() < 100; i++) {
                if (!item.mediaId.equals(old.getJSONObject(i).optString("id"))) recent.put(old.getJSONObject(i));
            }
            settings.prefs.edit().putString("history", recent.toString()).apply();
        } catch (Exception ignored) {
            // History is a convenience; a corrupt record is simply not updated.
        }
    }

    private void extendFm() {
        if (!PlaybackRules.shouldExtendFm(fm(), extending, sleepTimer.afterSong(), player.getCurrentMediaItemIndex(), player.getMediaItemCount())) return;
        extending = true;
        io.execute(() -> {
            try {
                JSONArray songs = SongJson.fromApi(api.request("/personal_fm", new JSONObject()).optJSONArray("data"));
                List<MediaItem> items = Tracks.items(songs);
                handler.post(() -> appendFm(items));
            } catch (Exception e) {
                handler.post(() -> {
                    extending = false;
                    skipWhenExtended = false;
                });
            }
        });
    }

    private void appendFm(List<MediaItem> items) {
        extending = false;
        boolean skip = skipWhenExtended;
        skipWhenExtended = false;
        if (player == null || !fm() || items.isEmpty()) return;
        boolean ended = player.getPlaybackState() == Player.STATE_ENDED && player.getPlayWhenReady();
        int next = player.getMediaItemCount();
        player.addMediaItems(items);
        if (ended || skip) {
            player.seekTo(next, 0);
            player.prepare();
            player.play();
        }
    }

    @Override public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) { return session; }

    @Override public void onTaskRemoved(Intent rootIntent) {
        if (settings.background()) {
            super.onTaskRemoved(rootIntent);
            return;
        }
        player.pause();
        savePlayback();
        stopSelf();
    }

    @Override public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        io.shutdownNow();
        settings.prefs.unregisterOnSharedPreferenceChangeListener(qualityChange);
        if (player != null) {
            savePlayback();
            player.release();
            player = null;
        }
        if (session != null) session.release();
        if (cache != null) cache.release();
        super.onDestroy();
    }
}
