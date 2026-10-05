package app.xvi.music;

import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Direct HTTPS requests. No proxy server, embedded Node runtime or user-supplied endpoint. */
public final class MusicApi {
    private final Settings settings;
    public MusicApi(Settings settings) { this.settings = settings; }
    public JSONObject request(String route, JSONObject params) throws Exception {
        ApiRoutes.Request request = ApiRoutes.build(route, params);
        JSONObject data=request.data(); Map<String,String> cookies=parseCookies(settings.cookie());
        String csrf=cookies.getOrDefault("__csrf", "");
        cookies.put("os","pc"); cookies.put("appver","3.1.17.204416"); cookies.put("__remember_me","true");
        data.put("e_r",false);
        String body;
        String base = request.web()?"https://music.163.com/weapi/":"https://interfacepc.music.163.com/eapi/";
        if(request.web()) {
            data.put("csrf_token",csrf); String[] encrypted=ApiCrypto.weapi(data.toString());
            body="params="+encode(encrypted[0])+"&encSecKey="+encrypted[1];
        } else {
            JSONObject header=new JSONObject(cookies).put("osver","Microsoft-Windows-10-Professional-build-19045-64bit")
                    .put("deviceId",deviceId()).put("channel","netease").put("__csrf",csrf)
                    .put("requestId",System.currentTimeMillis()+"_"+(new java.security.SecureRandom().nextInt(9000)+1000));
            data.put("header",header); body="params="+ApiCrypto.eapi(request.path(),data.toString());
        }
        HttpURLConnection connection=(HttpURLConnection)new URL(base+request.path().substring(5)).openConnection();
        connection.setInstanceFollowRedirects(false); connection.setRequestMethod("POST"); connection.setDoOutput(true);
        connection.setConnectTimeout(12000); connection.setReadTimeout(20000);
        connection.setRequestProperty("Content-Type","application/x-www-form-urlencoded");
        connection.setRequestProperty("Referer","https://music.163.com/");
        connection.setRequestProperty("User-Agent","Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36");
        connection.setRequestProperty("Cookie",cookieString(cookies));
        try {
            try(OutputStream output=connection.getOutputStream()){output.write(body.getBytes(StandardCharsets.UTF_8));}
            int status=connection.getResponseCode();
            if(status>=300&&status<400)throw new IOException("音乐接口发生跳转，请稍后重试");
            InputStream stream=status>=400?connection.getErrorStream():connection.getInputStream();
            if(stream==null)throw new IOException("音乐服务未返回内容");
            ByteArrayOutputStream output=new ByteArrayOutputStream();
            try(stream){byte[] buffer=new byte[8192];int n;while((n=stream.read(buffer))!=-1){if(output.size()+n>8*1024*1024)throw new IOException("返回内容过大");output.write(buffer,0,n);}}
            JSONObject result;
            try { result=new JSONObject(output.toString(StandardCharsets.UTF_8.name())); }
            catch(Exception error){throw new IOException("音乐接口返回异常，请稍后重试");}
            int code=result.optInt("code",status);
            if(code==301||status==401)throw new IOException("请先登录网易云音乐账号");
            if(status>=400 || (code!=200 && !(route.equals("/login/qr/check")&&code>=800&&code<=803)))
                throw new IOException("音乐接口请求失败（"+code+"），请稍后重试");
            // Only an explicitly confirmed QR login may replace the account session.
            if(route.equals("/login/qr/check")&&code==803){
                saveSessionCookies(connection,result,"登录信息未返回，请刷新二维码后重试");
            }
            result.remove("cookie");
            if(route.equals("/login/qr/key")||route.equals("/login/status"))return new JSONObject().put("code",200).put("data",result);
            return result;
        } catch(SocketTimeoutException e){throw new IOException("连接超时，请检查网络后重试");}
        finally{connection.disconnect();}
    }
    private synchronized String deviceId(){String value=settings.prefs.getString("deviceId","");if(value.isEmpty()){value=UUID.randomUUID().toString();settings.prefs.edit().putString("deviceId",value).apply();}return value;}
    private void saveSessionCookies(HttpURLConnection connection,JSONObject result)throws Exception{saveSessionCookies(connection,result,"登录信息未返回，请重试");}
    private void saveSessionCookies(HttpURLConnection connection,JSONObject result,String message)throws Exception{
        Map<String,String> session=new LinkedHashMap<>();
        connection.getHeaderFields().forEach((name,headers)->{if(name!=null&&name.equalsIgnoreCase("Set-Cookie"))for(String h:headers)session.putAll(parseCookies(h.split(";",2)[0]));});
        String bodyCookie=result.optString("cookie", "");
        if(!bodyCookie.isEmpty())session.putAll(parseCookies(bodyCookie));
        JSONObject data=result.optJSONObject("data");
        if(data!=null&&!data.optString("cookie","").isEmpty())session.putAll(parseCookies(data.optString("cookie")));
        if(!session.containsKey("MUSIC_U"))throw new IOException(message);
        settings.setCookie(cookieString(session));
    }
    static Map<String,String> parseCookies(String value){Map<String,String> result=new LinkedHashMap<>();for(String part:value.split(";")){int i=part.indexOf('=');if(i>0)result.put(part.substring(0,i).trim(),part.substring(i+1).trim());}return result;}
    static String cookieString(Map<String,String> values){StringBuilder out=new StringBuilder();values.forEach((key,value)->{if(out.length()>0)out.append("; ");out.append(key).append('=').append(value);});return out.toString();}
    private static String encode(String value)throws Exception{return URLEncoder.encode(value,"UTF-8");}
    public String resolve(String id)throws Exception{
        JSONObject response=request("/song/url/v1",new JSONObject().put("id",id).put("level",settings.prefs.getString("quality","exhigh")));
        JSONObject item=response.getJSONArray("data").optJSONObject(0);
        if(item==null||item.isNull("url")||item.optString("url").isEmpty())throw new IOException("这首歌暂时无法播放，请检查账号权限或尝试其他歌曲");
        if(item.has("freeTrialInfo")&&!item.isNull("freeTrialInfo"))throw new IOException("这首歌仅支持试听，请在官方客户端确认播放权限");
        URI uri=new URI(item.getString("url"));
        if("http".equals(uri.getScheme()))uri=new URI("https",null,uri.getHost(),uri.getPort(),uri.getPath(),uri.getQuery(),null);
        if(!"https".equals(uri.getScheme())||uri.getHost()==null)throw new IOException("播放地址无效");
        return uri.toString();
    }
}
