package app.xvi.music;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class ApiRoutesTest {
    @Test public void artistAndAlbumSubscriptionsHaveExplicitOperations()throws Exception{
        var artist=ApiRoutes.build("/artist/sub",new JSONObject().put("id",12).put("t",1));
        assertEquals("/api/artist/sub",artist.path());assertEquals(12,artist.data().getLong("artistId"));assertEquals("[12]",artist.data().getString("artistIds"));assertTrue(artist.web());
        assertEquals("/api/artist/unsub",ApiRoutes.build("/artist/sub",new JSONObject().put("id",12).put("t",2)).path());
        var album=ApiRoutes.build("/album/sub",new JSONObject().put("id",13).put("t",2));
        assertEquals("/api/album/unsub",album.path());assertEquals(13,album.data().getLong("id"));assertTrue(album.web());
        assertEquals("/api/album/sub",ApiRoutes.build("/album/sub",new JSONObject().put("id",13).put("t",1)).path());
    }
    @Test(expected=IllegalArgumentException.class)public void rejectsUnknownArtistSubscriptionOperation()throws Exception{ApiRoutes.build("/artist/sub",new JSONObject().put("id",12).put("t",0));}
    @Test(expected=IllegalArgumentException.class)public void rejectsInvalidAlbumSubscriptionId()throws Exception{ApiRoutes.build("/album/sub",new JSONObject().put("id",0).put("t",1));}
    @Test public void favoriteListsAndAlbumStatusUseFixedRoutes()throws Exception{
        for(String route:new String[]{"/artist/sublist","/album/sublist"}){
            var r=ApiRoutes.build(route,new JSONObject().put("limit",1000).put("offset",-20));
            assertEquals("/api"+route,r.path());assertEquals(100,r.data().getInt("limit"));assertEquals(0,r.data().getInt("offset"));assertTrue(r.web());
        }
        var status=ApiRoutes.build("/album/detail/dynamic",new JSONObject().put("id",12));
        assertEquals("/api/album/detail/dynamic",status.path());assertEquals(12,status.data().getLong("id"));
    }
    @Test public void rankingsAndCommentsMatchEnhancedApi()throws Exception{
        var ranks=ApiRoutes.build("/toplist",new JSONObject());assertEquals("/api/toplist",ranks.path());assertFalse(ranks.web());
        var comments=ApiRoutes.build("/comment/music",new JSONObject().put("id",12).put("offset",20).put("limit",20).put("before",12345));
        assertEquals("/api/v1/resource/comments/R_SO_4_12",comments.path());assertEquals(12,comments.data().getLong("rid"));
        assertEquals(20,comments.data().getInt("offset"));assertEquals(12345,comments.data().getLong("beforeTime"));assertTrue(comments.web());
    }
    @Test(expected=IllegalArgumentException.class)public void rejectsInvalidCommentId()throws Exception{ApiRoutes.build("/comment/music",new JSONObject().put("id",-1));}
    @Test public void suggestionsUseMobileKeywords()throws Exception{
        var r=ApiRoutes.build("/search/suggest",new JSONObject().put("keywords"," 音乐 "));
        assertEquals("/api/search/suggest/keyword",r.path());assertEquals("音乐",r.data().getString("s"));assertTrue(r.web());
    }
    @Test(expected=IllegalArgumentException.class)public void rejectsBlankSuggestionKeywords()throws Exception{ApiRoutes.build("/search/suggest",new JSONObject().put("keywords"," "));}
    @Test(expected=IllegalArgumentException.class)public void rejectsOversizedSuggestionKeywords()throws Exception{ApiRoutes.build("/search/suggest",new JSONObject().put("keywords","a".repeat(201)));}
    @Test public void artistSongsUsesBoundedPagination()throws Exception{
        var r=ApiRoutes.build("/artist/songs",new JSONObject().put("id",12).put("limit",1000).put("offset",-1));
        assertEquals("/api/v1/artist/songs",r.path());assertFalse(r.web());
        assertEquals(12,r.data().getLong("id"));assertEquals(100,r.data().getInt("limit"));assertEquals(0,r.data().getInt("offset"));
        assertEquals("hot",r.data().getString("order"));assertEquals(1,r.data().getInt("work_type"));assertEquals("true",r.data().getString("private_cloud"));
    }
    @Test public void artistAlbumsAndBiographyMatchEnhancedApi()throws Exception{
        var albums=ApiRoutes.build("/artist/album",new JSONObject().put("id",12).put("offset",30));
        assertEquals("/api/artist/albums/12",albums.path());assertTrue(albums.web());
        assertEquals(30,albums.data().getInt("offset"));assertEquals(30,albums.data().getInt("limit"));assertTrue(albums.data().getBoolean("total"));
        var bio=ApiRoutes.build("/artist/desc",new JSONObject().put("id",12));
        assertEquals("/api/artist/introduction",bio.path());assertTrue(bio.web());assertEquals(12,bio.data().getLong("id"));
    }
    @Test(expected=IllegalArgumentException.class)public void rejectsInvalidArtistId()throws Exception{ApiRoutes.build("/artist/songs",new JSONObject().put("id",0));}
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
    @Test public void fmTrashAndHotSearchUseFixedRoutes()throws Exception{
        var trash=ApiRoutes.build("/fm_trash",new JSONObject().put("id",12));
        assertEquals("/api/radio/trash/add",trash.path());assertEquals(12,trash.data().getLong("songId"));assertEquals("RT",trash.data().getString("alg"));assertTrue(trash.web());
        var hot=ApiRoutes.build("/search/hot/detail",new JSONObject());
        assertEquals("/api/hotsearchlist/get",hot.path());assertTrue(hot.web());
    }
    @Test(expected=IllegalArgumentException.class)public void rejectsInvalidFmTrashId()throws Exception{ApiRoutes.build("/fm_trash",new JSONObject().put("id",0));}
}
