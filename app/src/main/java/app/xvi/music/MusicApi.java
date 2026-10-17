package app.xvi.music;

import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;

/** Direct HTTPS requests. No proxy server, embedded Node runtime or user-supplied endpoint. */
public final class MusicApi {
    /** Desktop client identity sent with every request; update these together when the service requires it. */
    static final String CLIENT_VERSION = "3.1.17.204416";
    static final String CLIENT_OS_VERSION = "Microsoft-Windows-10-Professional-build-19045-64bit";
    static final String CLIENT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36";
    private static final String WEAPI_BASE = "https://music.163.com/weapi/";
    private static final String EAPI_BASE = "https://interfacepc.music.163.com/eapi/";
    private static final int MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final Settings settings;

    public MusicApi(Settings settings) { this.settings = settings; }

    public JSONObject request(String route, JSONObject params) throws Exception {
        ApiRoutes.Request request = ApiRoutes.build(route, params);
        JSONObject data = request.data();
        Map<String, String> cookies = parseCookies(settings.cookie());
        String csrf = cookies.getOrDefault("__csrf", "");
        cookies.put("os", "pc");
        cookies.put("appver", CLIENT_VERSION);
        cookies.put("__remember_me", "true");
        data.put("e_r", false);

        String body;
        if (request.web()) {
            data.put("csrf_token", csrf);
            String[] encrypted = ApiCrypto.weapi(data.toString());
            body = "params=" + encode(encrypted[0]) + "&encSecKey=" + encrypted[1];
        } else {
            JSONObject header = new JSONObject(cookies)
                    .put("osver", CLIENT_OS_VERSION)
                    .put("deviceId", deviceId())
                    .put("channel", "netease")
                    .put("__csrf", csrf)
                    .put("requestId", System.currentTimeMillis() + "_" + (RANDOM.nextInt(9000) + 1000));
            data.put("header", header);
            body = "params=" + ApiCrypto.eapi(request.path(), data.toString());
        }

        String base = request.web() ? WEAPI_BASE : EAPI_BASE;
        HttpURLConnection connection = (HttpURLConnection) new URL(base + request.path().substring(5)).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(20000);
        connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        connection.setRequestProperty("Referer", "https://music.163.com/");
        connection.setRequestProperty("User-Agent", CLIENT_USER_AGENT);
        connection.setRequestProperty("Cookie", cookieString(cookies));
        try {
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.getBytes(StandardCharsets.UTF_8));
            }
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) throw new IOException("音乐接口发生跳转，请稍后重试");
            JSONObject result = readJson(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
            int code = result.optInt("code", status);
            checkResponse(route, status, code);
            // Only an explicitly confirmed QR login may replace the account session.
            if (route.equals("/login/qr/check") && code == 803) {
                saveSessionCookies(connection, result, "登录信息未返回，请刷新二维码后重试");
            }
            result.remove("cookie");
            if (route.equals("/login/qr/key") || route.equals("/login/status")) {
                return new JSONObject().put("code", 200).put("data", result);
            }
            return result;
        } catch (SocketTimeoutException e) {
            throw new IOException("连接超时，请检查网络后重试");
        } finally {
            connection.disconnect();
        }
    }

    /** Maps HTTP status and service code to a user-facing error; QR polling codes 800-803 are states, not failures. */
    static void checkResponse(String route, int status, int code) throws IOException {
        if (code == 301 || status == 401) throw new IOException("请先登录网易云音乐账号");
        boolean qrState = route.equals("/login/qr/check") && code >= 800 && code <= 803;
        if (status >= 400 || (code != 200 && !qrState)) {
            throw new IOException("音乐接口请求失败（" + code + "），请稍后重试");
        }
    }

    private static JSONObject readJson(InputStream stream) throws IOException {
        if (stream == null) throw new IOException("音乐服务未返回内容");
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (stream) {
            byte[] buffer = new byte[8192];
            int n;
            while ((n = stream.read(buffer)) != -1) {
                if (output.size() + n > MAX_RESPONSE_BYTES) throw new IOException("返回内容过大");
                output.write(buffer, 0, n);
            }
        }
        try {
            return new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
        } catch (Exception error) {
            throw new IOException("音乐接口返回异常，请稍后重试");
        }
    }

    private synchronized String deviceId() {
        String value = settings.prefs.getString("deviceId", "");
        if (value.isEmpty()) {
            value = UUID.randomUUID().toString();
            settings.prefs.edit().putString("deviceId", value).apply();
        }
        return value;
    }

    private void saveSessionCookies(HttpURLConnection connection, JSONObject result, String message) throws Exception {
        Map<String, String> session = new LinkedHashMap<>();
        connection.getHeaderFields().forEach((name, headers) -> {
            if (name == null || !name.equalsIgnoreCase("Set-Cookie")) return;
            for (String header : headers) session.putAll(parseCookies(header.split(";", 2)[0]));
        });
        String bodyCookie = result.optString("cookie", "");
        if (!bodyCookie.isEmpty()) session.putAll(parseCookies(bodyCookie));
        JSONObject data = result.optJSONObject("data");
        if (data != null && !data.optString("cookie", "").isEmpty()) session.putAll(parseCookies(data.optString("cookie")));
        if (!session.containsKey("MUSIC_U")) throw new IOException(message);
        settings.setCookie(cookieString(session));
    }

    static Map<String, String> parseCookies(String value) {
        Map<String, String> result = new LinkedHashMap<>();
        for (String part : value.split(";")) {
            int i = part.indexOf('=');
            if (i > 0) result.put(part.substring(0, i).trim(), part.substring(i + 1).trim());
        }
        return result;
    }

    static String cookieString(Map<String, String> values) {
        StringBuilder out = new StringBuilder();
        values.forEach((key, value) -> {
            if (out.length() > 0) out.append("; ");
            out.append(key).append('=').append(value);
        });
        return out.toString();
    }

    private static String encode(String value) throws Exception { return URLEncoder.encode(value, "UTF-8"); }

    public String resolve(String id, String quality) throws Exception {
        JSONObject response = request("/song/url/v1", new JSONObject().put("id", id).put("level", quality));
        JSONObject item = response.getJSONArray("data").optJSONObject(0);
        if (item == null || item.isNull("url") || item.optString("url").isEmpty()) {
            throw new UnplayableException("这首歌暂时无法播放，请检查账号权限或尝试其他歌曲");
        }
        if (item.has("freeTrialInfo") && !item.isNull("freeTrialInfo")) {
            throw new UnplayableException("这首歌仅支持试听，请在官方客户端确认播放权限");
        }
        URI uri = new URI(item.getString("url"));
        if ("http".equals(uri.getScheme())) uri = new URI("https", null, uri.getHost(), uri.getPort(), uri.getPath(), uri.getQuery(), null);
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null) throw new IOException("播放地址无效");
        return uri.toString();
    }
}
