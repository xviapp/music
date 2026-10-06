package app.xvi.music;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Opt-in real-network read-only checks; never signs into a user account. */
@RunWith(AndroidJUnit4.class)
public class DirectApiTest {
    private MusicApi api;
    @Before public void setup(){api=new MusicApi(new Settings(InstrumentationRegistry.getInstrumentation().getTargetContext()));}
    @Test public void publicPlaylists()throws Exception{JSONObject result=api.request("/top/playlist",new JSONObject().put("limit",2));assertTrue(result.getJSONArray("playlists").length()>0);}
    @Test public void search()throws Exception{JSONObject result=api.request("/cloudsearch",new JSONObject().put("keywords","晴天").put("limit",2));assertTrue(result.getJSONObject("result").getJSONArray("songs").length()>0);}
    @Test public void lyrics()throws Exception{JSONObject result=api.request("/lyric",new JSONObject().put("id",347230));assertEquals(200,result.getInt("code"));}
    @Test public void qrKey()throws Exception{JSONObject result=api.request("/login/qr/key",new JSONObject());assertFalse(result.getJSONObject("data").getString("unikey").isEmpty());}
    @Test public void rankings()throws Exception{JSONObject result=api.request("/toplist",new JSONObject());assertTrue(result.getJSONArray("list").length()>0);}
    @Test public void songComments()throws Exception{JSONObject result=api.request("/comment/music",new JSONObject().put("id",186016).put("limit",2));assertEquals(200,result.getInt("code"));assertTrue(result.has("comments"));}
    @Test public void searchSuggestions()throws Exception{JSONObject result=api.request("/search/suggest",new JSONObject().put("keywords","晴天"));assertTrue(result.getJSONObject("result").getJSONArray("allMatch").length()>0);}
}
