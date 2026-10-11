package app.xvi.music;

import java.io.IOException;

/** The service returned no usable audio for this song (no rights, trial only); skipping it is safe. */
final class UnplayableException extends IOException {
    UnplayableException(String message) { super(message); }

    static boolean in(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof UnplayableException) return true;
        }
        return false;
    }
}
