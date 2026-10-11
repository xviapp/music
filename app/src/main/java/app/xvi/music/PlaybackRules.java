package app.xvi.music;

/** Playback decisions kept free of Android types so they can be unit tested. */
final class PlaybackRules {
    static final int MAX_CONSECUTIVE_SKIPS = 3;
    static final int MAX_SLEEP_MINUTES = 120;
    static final int SLEEP_AFTER_SONG = -1;

    private PlaybackRules() {}

    /** Fetch more personal FM songs once playback reaches the last two items. */
    static boolean shouldExtendFm(boolean fm, boolean extending, boolean sleepAfterSong, int index, int count) {
        return fm && !extending && !sleepAfterSong && index >= count - 2;
    }

    /** Where "play next" should place a song, or -1 when it is already the current song. */
    static int playNextTarget(int current, int existing, int count) {
        if (count == 0) return 0;
        if (existing == current) return -1;
        if (existing >= 0 && existing < current) return current;
        return current + 1;
    }

    /** Limits automatic skipping so a run of unplayable songs cannot loop through the whole queue. */
    static final class SkipGuard {
        private int consecutive;

        boolean tryConsume() {
            if (consecutive >= MAX_CONSECUTIVE_SKIPS) return false;
            consecutive++;
            return true;
        }

        void reset() { consecutive = 0; }
    }

    /** Sleep timer state; the clock is passed in so tests do not depend on wall time. */
    static final class SleepTimer {
        private int mode;
        private long deadline;

        /** Returns the delay to schedule in milliseconds, or 0 when nothing should be scheduled. */
        long set(int minutes, long now) {
            mode = 0;
            deadline = 0;
            if (minutes == SLEEP_AFTER_SONG) {
                mode = SLEEP_AFTER_SONG;
                return 0;
            }
            if (minutes <= 0 || minutes > MAX_SLEEP_MINUTES) return 0;
            mode = minutes;
            deadline = now + minutes * 60_000L;
            return minutes * 60_000L;
        }

        void clear() { set(0, 0); }

        boolean afterSong() { return mode == SLEEP_AFTER_SONG; }

        int mode() { return mode; }

        long deadline() { return deadline; }

        long remaining(long now) { return mode > 0 ? Math.max(0, deadline - now) : 0; }
    }
}
