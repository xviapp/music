package app.xvi.music;
import org.junit.Test;
import static org.junit.Assert.*;

public class ApiCryptoTest {
    @Test public void eapiMatchesNodeVector()throws Exception{
        assertEquals("9B1595479B79266065903BA79E9883029338432CD7D98D1A3626E997A2C5312101AD9C3C1DAA5C91A5172685F807E9374011DD8602D0FBF62CF11FB64B63DC308161D49201E1F4F5950D3E472FBFBD9AD5D31FE451213EAFF5297687CCB2CCAE",ApiCrypto.eapi("/api/song/lyric","{\"id\":347230}"));
    }
    @Test public void weapiMatchesNodeVector()throws Exception{
        String[] encrypted=ApiCrypto.weapi("{\"id\":347230}","abcdefghijklmnop");
        assertEquals("rPqEDSmwUbfL96kQlV+9hc8jWEf0v4VicMEu/V81Ig4=",encrypted[0]);
        assertEquals(256,encrypted[1].length());
        assertTrue(encrypted[1].matches("[0-9a-f]+"));
    }
    @Test public void weapiRandomizesEveryRequest()throws Exception{assertNotEquals(ApiCrypto.weapi("{}")[0],ApiCrypto.weapi("{}")[0]);}
}
