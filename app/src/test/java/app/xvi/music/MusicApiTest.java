package app.xvi.music;

import java.io.IOException;
import org.junit.Test;
import static org.junit.Assert.*;

public class MusicApiTest {
    private static String error(String route, int status, int code) {
        try {
            MusicApi.checkResponse(route, status, code);
            return null;
        } catch (IOException e) {
            return e.getMessage();
        }
    }

    @Test public void mapsServiceErrorsToMessages() {
        assertNull(error("/lyric", 200, 200));
        assertEquals("请先登录网易云音乐账号", error("/like", 200, 301));
        assertEquals("请先登录网易云音乐账号", error("/like", 401, 200));
        assertEquals("音乐接口请求失败（405），请稍后重试", error("/lyric", 200, 405));
        assertEquals("音乐接口请求失败（200），请稍后重试", error("/lyric", 503, 200));
    }

    @Test public void qrPollingStatesAreNotFailures() {
        for (int code = 800; code <= 803; code++) assertNull(error("/login/qr/check", 200, code));
        assertNotNull("only the QR route treats 8xx as a state", error("/lyric", 200, 802));
    }

    @Test public void cookiesRoundTrip() {
        var cookies = MusicApi.parseCookies("MUSIC_U=abc; __csrf=x=y; broken");
        assertEquals("abc", cookies.get("MUSIC_U"));
        assertEquals("x=y", cookies.get("__csrf"));
        assertEquals("MUSIC_U=abc; __csrf=x=y", MusicApi.cookieString(cookies));
    }
}
