package app.xvi.music;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class ApiRoutesTest {
    @Test public void searchUsesBoundedPagination()throws Exception{
        var r=ApiRoutes.build("/cloudsearch",new JSONObject().put("keywords","音乐").put("limit",10000).put("offset",-1));
        assertEquals("/api/cloudsearch/pc",r.path());assertEquals(100,r.data().getInt("limit"));assertEquals(0,r.data().getInt("offset"));
    }
    @Test public void detailUsesNumericIds()throws Exception{
        var r=ApiRoutes.build("/song/detail",new JSONObject().put("ids","1,2"));
        assertEquals(2,new JSONArray(r.data().getString("c")).length());assertTrue(r.web());
    }
    @Test(expected=IllegalArgumentException.class)public void noArbitraryEndpoint()throws Exception{ApiRoutes.build("https://evil.example",new JSONObject());}
    @Test(expected=IllegalArgumentException.class)public void rejectsIdInjection()throws Exception{ApiRoutes.build("/song/detail",new JSONObject().put("ids","1},{}"));}
    @Test public void playbackQualityIsIncluded()throws Exception{var r=ApiRoutes.build("/song/url/v1",new JSONObject().put("id",123).put("level","lossless"));assertEquals("[123]",r.data().getString("ids"));assertEquals("lossless",r.data().getString("level"));}
    @Test public void playlistSubscriptionUsesExplicitOperations()throws Exception{
        var subscribe=ApiRoutes.build("/playlist/subscribe",new JSONObject().put("id",123).put("t",1));
        var unsubscribe=ApiRoutes.build("/playlist/subscribe",new JSONObject().put("id",123).put("t",2));
        assertEquals("/api/playlist/subscribe",subscribe.path());assertEquals("/api/playlist/unsubscribe",unsubscribe.path());
        assertEquals(123,subscribe.data().getLong("id"));assertTrue(subscribe.web());
    }
    @Test(expected=IllegalArgumentException.class)public void rejectsInvalidSubscriptionOperation()throws Exception{ApiRoutes.build("/playlist/subscribe",new JSONObject().put("id",123).put("t",0));}
    @Test(expected=IllegalArgumentException.class)public void rejectsInvalidPlaylistId()throws Exception{ApiRoutes.build("/playlist/subscribe",new JSONObject().put("id",0).put("t",1));}
}
