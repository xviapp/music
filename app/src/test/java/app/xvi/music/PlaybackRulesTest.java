package app.xvi.music;

import org.junit.Test;
import static org.junit.Assert.*;

public class PlaybackRulesTest {
    @Test public void fmExtendsOnlyNearTheEndOfAnIdleFmQueue() {
        assertTrue(PlaybackRules.shouldExtendFm(true, false, false, 3, 5));
        assertTrue(PlaybackRules.shouldExtendFm(true, false, false, 4, 5));
        assertFalse(PlaybackRules.shouldExtendFm(true, false, false, 2, 5));
        assertFalse("not in FM mode", PlaybackRules.shouldExtendFm(false, false, false, 4, 5));
        assertFalse("a request is already running", PlaybackRules.shouldExtendFm(true, true, false, 4, 5));
        assertFalse("sleeping after this song", PlaybackRules.shouldExtendFm(true, false, true, 4, 5));
    }

    @Test public void playNextPlacesSongsDirectlyAfterTheCurrentOne() {
        assertEquals("empty queue", 0, PlaybackRules.playNextTarget(-1, -1, 0));
        assertEquals("new song", 3, PlaybackRules.playNextTarget(2, -1, 6));
        assertEquals("already later in the queue", 3, PlaybackRules.playNextTarget(2, 5, 6));
        assertEquals("earlier in the queue: current shifts back by one", 2, PlaybackRules.playNextTarget(2, 0, 6));
        assertEquals("already playing", -1, PlaybackRules.playNextTarget(2, 2, 6));
    }

    @Test public void skippingStopsAfterThreeUnplayableSongsInARow() {
        PlaybackRules.SkipGuard guard = new PlaybackRules.SkipGuard();
        assertTrue(guard.tryConsume());
        assertTrue(guard.tryConsume());
        assertTrue(guard.tryConsume());
        assertFalse(guard.tryConsume());
        guard.reset();
        assertTrue("a song that plays resets the count", guard.tryConsume());
    }

    @Test public void sleepTimerCountsDownAndRejectsInvalidDurations() {
        PlaybackRules.SleepTimer timer = new PlaybackRules.SleepTimer();
        assertEquals(30 * 60_000L, timer.set(30, 1_000));
        assertEquals(30, timer.mode());
        assertEquals(30 * 60_000L - 5_000, timer.remaining(6_000));
        assertEquals(0, timer.remaining(Long.MAX_VALUE / 2));
        assertEquals(0, timer.set(-1, 0));
        assertTrue(timer.afterSong());
        assertEquals("no countdown when stopping after the song", 0, timer.remaining(0));
        assertEquals(0, timer.set(121, 0));
        assertEquals(0, timer.mode());
        timer.set(15, 0);
        timer.clear();
        assertEquals(0, timer.mode());
        assertFalse(timer.afterSong());
    }

    @Test public void unplayableErrorsAreFoundAnywhereInTheCauseChain() {
        Exception wrapped = new RuntimeException("source", new java.io.IOException("io", new UnplayableException("仅支持试听")));
        assertTrue(UnplayableException.in(wrapped));
        assertFalse(UnplayableException.in(new java.io.IOException("network")));
    }
}
