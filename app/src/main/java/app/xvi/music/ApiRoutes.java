package app.xvi.music;

import org.json.JSONArray;
import org.json.JSONObject;

/** Explicit subset of api-enhanced module contracts, no arbitrary URLs from the UI. */
public final class ApiRoutes {
    public record Request(String path, JSONObject data, boolean web) {}
    public static Request build(String route, JSONObject p) throws Exception {
        JSONObject data = new JSONObject(); String path; boolean web = true;
        int limit = Math.min(100, Math.max(1, p.optInt("limit", 30)));
        int offset = Math.max(0, p.optInt("offset", 0));
        switch (route) {
            case "/top/playlist": path="/api/playlist/list"; data.put("cat",p.optString("cat","全部")).put("order","hot").put("limit",limit).put("offset",offset).put("total",true); break;
            case "/recommend/resource": path="/api/v1/discovery/recommend/resource"; break;
            case "/recommend/songs": path="/api/v3/discovery/recommend/songs"; break;
            case "/personal_fm": path="/api/v1/radio/get"; break;
            case "/cloudsearch": path="/api/cloudsearch/pc"; web=false; data.put("s",p.getString("keywords")).put("type",p.optInt("type",1)).put("limit",limit).put("offset",offset).put("total",true); break;
            case "/playlist/detail": path="/api/v6/playlist/detail"; data.put("id",id(p,"id")).put("n",100000).put("s",8); break;
            case "/playlist/subscribe": int operation=p.getInt("t");if(operation!=1&&operation!=2)throw new IllegalArgumentException("收藏操作无效");path=operation==1?"/api/playlist/subscribe":"/api/playlist/unsubscribe";data.put("id",id(p,"id"));break;
            case "/song/detail": path="/api/v3/song/detail"; JSONArray ids=new JSONArray(); for(String id:p.getString("ids").split(",")){ if(!id.matches("[0-9]+")||ids.length()>=100)throw new IllegalArgumentException("歌曲数量或编号无效"); ids.put(new JSONObject().put("id",Long.parseLong(id))); } data.put("c",ids.toString()); break;
            case "/song/url/v1": path="/api/song/enhance/player/url/v1"; web=false; data.put("ids","["+id(p,"id")+"]").put("level",p.optString("level","exhigh")).put("encodeType","flac"); break;
            case "/lyric": path="/api/song/lyric"; web=false; data.put("id",id(p,"id")).put("tv",-1).put("lv",-1).put("rv",-1).put("kv",-1).put("_nmclfl",1); break;
            case "/user/playlist": path="/api/user/playlist"; data.put("uid",id(p,"uid")).put("limit",limit).put("offset",offset).put("includeVideo",true); break;
            case "/user/cloud": path="/api/v1/cloud/get"; data.put("limit",limit).put("offset",offset); break;
            case "/likelist": path="/api/song/like/get"; data.put("uid",id(p,"uid")); break;
            case "/like": path="/api/radio/like"; data.put("alg","itembased").put("trackId",id(p,"id")).put("like",p.optBoolean("like",true)).put("time","3"); break;
            case "/login/qr/key": path="/api/login/qrcode/unikey"; web=false; data.put("type",3); break;
            case "/login/qr/check": path="/api/login/qrcode/client/login"; web=false; data.put("type",3).put("key",p.getString("key")); break;
            case "/login/status": path="/api/w/nuser/account/get"; break;
            case "/album": path="/api/v1/album/"+id(p,"id"); break;
            case "/artists": path="/api/v1/artist/"+id(p,"id"); break;
            case "/top/song": path="/api/v1/discovery/new/songs"; data.put("areaId",0).put("total",true); break;
            default: throw new IllegalArgumentException("不支持的音乐接口");
        }
        return new Request(path,data,web);
    }
    private static long id(JSONObject p,String name) throws Exception {long id=p.getLong(name); if(id<=0)throw new IllegalArgumentException("编号无效");return id;}
}
