package app.xvi.music;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Protocol port of api-enhanced/util/crypto.js; see THIRD_PARTY_NOTICES. */
public final class ApiCrypto {
    private static final String PUBLIC_KEY = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB";
    private static final String ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final char[] HEX = "0123456789abcdef".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final PublicKey RSA_KEY;

    static {
        try {
            RSA_KEY = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(PUBLIC_KEY)));
        } catch (Exception e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    private ApiCrypto() {}

    static byte[] aes(String text, String key, String mode) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/" + mode + "/PKCS5Padding");
        SecretKeySpec secret = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "AES");
        if (mode.equals("CBC")) cipher.init(Cipher.ENCRYPT_MODE, secret, new IvParameterSpec("0102030405060708".getBytes(StandardCharsets.UTF_8)));
        else cipher.init(Cipher.ENCRYPT_MODE, secret);
        return cipher.doFinal(text.getBytes(StandardCharsets.UTF_8));
    }

    public static String[] weapi(String json) throws Exception {
        char[] secret = new char[16];
        for (int i = 0; i < secret.length; i++) secret[i] = ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length()));
        return weapi(json, new String(secret));
    }

    static String[] weapi(String json, String secret) throws Exception {
        String first = Base64.getEncoder().encodeToString(aes(json, "0CoJUm6Qyw8W8jud", "CBC"));
        String params = Base64.getEncoder().encodeToString(aes(first, secret, "CBC"));
        Cipher rsa = Cipher.getInstance("RSA/ECB/NoPadding");
        rsa.init(Cipher.ENCRYPT_MODE, RSA_KEY);
        return new String[]{params, hex(rsa.doFinal(new StringBuilder(secret).reverse().toString().getBytes(StandardCharsets.UTF_8)))};
    }

    public static String eapi(String path, String json) throws Exception {
        String digest = hex(MessageDigest.getInstance("MD5").digest(("nobody" + path + "use" + json + "md5forencrypt").getBytes(StandardCharsets.UTF_8)));
        return hex(aes(path + "-36cd479b6b5-" + json + "-36cd479b6b5-" + digest, "e82ckenh8dichen8", "ECB")).toUpperCase(java.util.Locale.ROOT);
    }

    static String hex(byte[] bytes) {
        char[] out = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            int v = bytes[i] & 0xff;
            out[i * 2] = HEX[v >>> 4];
            out[i * 2 + 1] = HEX[v & 0x0f];
        }
        return new String(out);
    }
}
