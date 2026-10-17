package app.xvi.music;

import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;

/** Mirrors model.test.mjs so FM songs added by the service look like songs added by the UI. */
public class SongJsonTest {
    @Test public void normalizesModernSongs() throws Exception {
        JSONObject song = SongJson.fromApi(new JSONObject("{\"id\":1,\"name\":\"歌\",\"ar\":[{\"id\":10,\"name\":\"甲\"},{\"id\":11,\"name\":\"乙\"}],\"al\":{\"id\":20,\"name\":\"专辑\",\"picUrl\":\"http://example.com/a\"},\"dt\":1200}"));
        assertEquals("1", song.getString("id"));
        assertEquals("甲 / 乙", song.getString("artist"));
        assertEquals("11", song.getJSONArray("artists").getJSONObject(1).getString("id"));
        assertEquals("专辑", song.getString("album"));
        assertEquals("20", song.getString("albumId"));
        assertEquals("https://example.com/a", song.getString("cover"));
        assertEquals(1200, song.getLong("duration"));
    }

    @Test public void normalizesLegacyFmSongsAndDropsInvalidOnes() throws Exception {
        JSONArray songs = SongJson.fromApi(new JSONArray("[{\"id\":2,\"name\":\"FM\",\"artists\":[{\"id\":3,\"name\":\"丙\"}],\"album\":{\"id\":4,\"name\":\"碟\",\"picUrl\":\"javascript:x\"},\"duration\":900},{\"id\":0},{\"name\":\"no id\"}]"));
        assertEquals(1, songs.length());
        JSONObject song = songs.getJSONObject(0);
        assertEquals("丙", song.getString("artist"));
        assertEquals("碟", song.getString("album"));
        assertEquals("", song.getString("cover"));
        assertEquals(900, song.getLong("duration"));
        assertEquals(0, SongJson.fromApi((JSONArray) null).length());
    }
}
