package app.xvi.music;

import org.json.JSONArray;
import org.json.JSONObject;

/** Java counterpart of model.js track(): normalizes API songs into the queue format. */
final class SongJson {
    private SongJson() {}

    static JSONObject fromApi(JSONObject song) throws Exception {
        JSONObject album = song.optJSONObject("al");
        if (album == null) album = song.optJSONObject("album");
        JSONArray rawArtists = song.optJSONArray("ar");
        if (rawArtists == null) rawArtists = song.optJSONArray("artists");
        JSONArray artists = new JSONArray();
        StringBuilder names = new StringBuilder();
        if (rawArtists != null) {
            for (int i = 0; i < rawArtists.length(); i++) {
                JSONObject artist = rawArtists.optJSONObject(i);
                if (artist == null || artist.optString("name").isEmpty()) continue;
                if (names.length() > 0) names.append(" / ");
                names.append(artist.optString("name"));
                artists.put(new JSONObject().put("id", artist.optString("id", "")).put("name", artist.optString("name")));
            }
        }
        String cover = album == null ? "" : album.optString("picUrl", "");
        if (cover.startsWith("http://")) cover = "https://" + cover.substring(7);
        if (!cover.startsWith("https://")) cover = "";
        return new JSONObject()
                .put("id", song.optString("id"))
                .put("name", song.optString("name", "未知歌曲"))
                .put("artist", names.toString())
                .put("artists", artists)
                .put("album", album == null ? "" : album.optString("name", ""))
                .put("albumId", album == null ? "" : album.optString("id", ""))
                .put("cover", cover)
                .put("duration", song.optLong("dt", song.optLong("duration", 0)));
    }

    static JSONArray fromApi(JSONArray songs) throws Exception {
        JSONArray result = new JSONArray();
        if (songs == null) return result;
        for (int i = 0; i < songs.length(); i++) {
            JSONObject song = songs.optJSONObject(i);
            if (song == null || !song.optString("id").matches("[1-9][0-9]*")) continue;
            result.put(fromApi(song));
        }
        return result;
    }
}
