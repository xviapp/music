package app.xvi.music;

import android.net.Uri;
import android.os.Bundle;
import androidx.media3.common.*;
import org.json.*;
import java.util.*;

final class Tracks {
    static final int MAX_QUEUE = 1000;

    private Tracks() {}

    static MediaItem item(JSONObject song) throws Exception {
        String id = song.getString("id");
        if (!id.matches("[0-9]+") || Long.parseLong(id) <= 0) throw new IllegalArgumentException("歌曲编号无效");
        Bundle extras = new Bundle();
        extras.putString("artists", song.optJSONArray("artists") == null ? "[]" : song.getJSONArray("artists").toString());
        extras.putString("albumId", song.optString("albumId", ""));
        extras.putLong("duration", song.optLong("duration", 0));
        MediaMetadata.Builder metadata = new MediaMetadata.Builder()
                .setTitle(song.optString("name", "未知歌曲"))
                .setArtist(song.optString("artist", ""))
                .setAlbumTitle(song.optString("album", ""))
                .setExtras(extras);
        String artwork = song.optString("cover", "");
        if (artwork.startsWith("https://")) metadata.setArtworkUri(Uri.parse(artwork));
        return new MediaItem.Builder()
                .setMediaId(id)
                .setUri("https://music.invalid/" + id)
                .setMimeType(MimeTypes.AUDIO_MPEG)
                .setMediaMetadata(metadata.build())
                .build();
    }

    static JSONObject json(MediaItem item) throws Exception {
        MediaMetadata m = item.mediaMetadata;
        Bundle extras = m.extras;
        return new JSONObject()
                .put("id", item.mediaId)
                .put("name", m.title == null ? "" : m.title.toString())
                .put("artist", m.artist == null ? "" : m.artist.toString())
                .put("album", m.albumTitle == null ? "" : m.albumTitle.toString())
                .put("cover", m.artworkUri == null ? "" : m.artworkUri.toString())
                .put("artists", new JSONArray(extras == null ? "[]" : extras.getString("artists", "[]")))
                .put("albumId", extras == null ? "" : extras.getString("albumId", ""))
                .put("duration", extras == null ? 0 : extras.getLong("duration", 0));
    }

    static List<MediaItem> items(JSONArray array) throws Exception {
        if (array.length() > MAX_QUEUE) throw new IllegalArgumentException("队列最多容纳 " + MAX_QUEUE + " 首歌曲");
        List<MediaItem> items = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) items.add(item(array.getJSONObject(i)));
        return items;
    }

    static JSONArray queue(Player player) throws Exception {
        JSONArray queue = new JSONArray();
        for (int i = 0; i < player.getMediaItemCount(); i++) queue.put(json(player.getMediaItemAt(i)));
        return queue;
    }

    /** Playback structure. The queue is optional because it only changes with the timeline. */
    static JSONObject state(Player player, boolean includeQueue) throws Exception {
        JSONObject state = progress(player)
                .put("index", Math.max(0, player.getCurrentMediaItemIndex()))
                .put("count", player.getMediaItemCount())
                .put("playing", player.getPlayWhenReady() && player.getPlaybackState() != Player.STATE_ENDED && player.getPlayerError() == null)
                .put("repeat", player.getRepeatMode())
                .put("shuffle", player.getShuffleModeEnabled())
                .put("error", error(player));
        if (includeQueue) state.put("queue", queue(player));
        return state;
    }

    /** The small, frequently sent part of the playback state. */
    static JSONObject progress(Player player) throws Exception {
        return new JSONObject()
                .put("position", Math.max(0, player.getCurrentPosition()))
                .put("duration", duration(player))
                .put("buffering", player.getPlaybackState() == Player.STATE_BUFFERING);
    }

    private static long duration(Player player) {
        long duration = Math.max(0, player.getDuration());
        int index = Math.max(0, player.getCurrentMediaItemIndex());
        if (duration == 0 && index < player.getMediaItemCount()) {
            Bundle extras = player.getMediaItemAt(index).mediaMetadata.extras;
            if (extras != null) duration = Math.max(0, extras.getLong("duration", 0));
        }
        return duration;
    }

    private static String error(Player player) {
        PlaybackException error = player.getPlayerError();
        if (error == null) return "";
        Throwable cause = error;
        while (cause.getCause() != null) cause = cause.getCause();
        String message = cause.getMessage();
        return message != null && message.matches(".*[\\u4e00-\\u9fff].*") ? message : "播放失败，请检查网络后重试，或选择下一首";
    }
}
