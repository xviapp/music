package app.xvi.music;

import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.*;
import androidx.media3.common.*;
import androidx.media3.datasource.*;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.*;
import com.google.common.util.concurrent.*;
import org.json.*;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.*;

@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
public final class PlaybackService extends MediaSessionService {
    static final SessionCommand SLEEP=new SessionCommand("music.sleep",Bundle.EMPTY);
    private ExoPlayer player;
    private MediaSession session;
    private Settings settings;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final ExecutorService fmExecutor=Executors.newSingleThreadExecutor();
    private boolean sleepAfterSong=false;
    private long sleepDeadline=0;
    private boolean extending=false;
    private final Map<String,String> urls=new ConcurrentHashMap<>();
    private final Map<String,Long> expires=new ConcurrentHashMap<>();
    private final Runnable sleep=()->{sleepDeadline=0;sleepAfterSong=false;player.pause();save();};

    @Override public void onCreate(){
        super.onCreate();settings=new Settings(this);MusicApi api=new MusicApi(settings);
        DefaultHttpDataSource.Factory http=new DefaultHttpDataSource.Factory().setUserAgent("XviMusic/0.1.0")
                .setConnectTimeoutMs(15000).setReadTimeoutMs(20000).setAllowCrossProtocolRedirects(false);
        ResolvingDataSource.Factory source=new ResolvingDataSource.Factory(http,spec->{
            if(!"music.invalid".equals(spec.uri.getHost()))return spec;
            String id=spec.uri.getLastPathSegment(); String key=id+":"+settings.prefs.getString("quality","exhigh");
            try{
                if(!urls.containsKey(key)||expires.getOrDefault(key,0L)<SystemClock.elapsedRealtime()){
                    urls.put(key,api.resolve(id));expires.put(key,SystemClock.elapsedRealtime()+60000);
                }
                return spec.withUri(Uri.parse(urls.get(key)));
            }catch(Exception e){throw new IOException(e.getMessage(),e);}
        });
        player=new ExoPlayer.Builder(this).setMediaSourceFactory(new DefaultMediaSourceFactory(source)).build();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),true);
        player.setHandleAudioBecomingNoisy(true);player.setWakeMode(C.WAKE_MODE_NETWORK);
        player.addListener(new Player.Listener(){
            @Override public void onEvents(Player p,Player.Events events){save();}
            @Override public void onPlayerError(PlaybackException error){urls.clear();expires.clear();}
            @Override public void onMediaItemTransition(MediaItem item,int reason){
                if(sleepAfterSong&&(reason==Player.MEDIA_ITEM_TRANSITION_REASON_AUTO||reason==Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT)){
                    sleepAfterSong=false;player.pause();
                }
                remember(item);extendFm();
            }
            @Override public void onPlaybackStateChanged(int state){
                if(state==Player.STATE_ENDED){if(sleepAfterSong){sleepAfterSong=false;player.pause();}else extendFm();}
            }
        });
        restore();
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        session=new MediaSession.Builder(this,player).setSessionActivity(open).setCallback(new MediaSession.Callback(){
            @Override public MediaSession.ConnectionResult onConnect(MediaSession session,MediaSession.ControllerInfo controller){
                if(!controller.getPackageName().equals(getPackageName())&&!controller.isTrusted())return MediaSession.ConnectionResult.reject();
                return new MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                        .setAvailableSessionCommands(MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon().add(SLEEP).build()).build();
            }
            @Override public ListenableFuture<SessionResult> onCustomCommand(MediaSession s,MediaSession.ControllerInfo c,SessionCommand command,Bundle args){
                if(!c.getPackageName().equals(getPackageName())||!command.customAction.equals(SLEEP.customAction))return Futures.immediateFuture(new SessionResult(SessionError.ERROR_NOT_SUPPORTED));
                handler.removeCallbacks(sleep);sleepDeadline=0;sleepAfterSong=false;
                int minutes=args.getInt("minutes",0);
                if(minutes==-1)sleepAfterSong=true;
                else if(minutes>0&&minutes<=120){sleepDeadline=SystemClock.elapsedRealtime()+minutes*60000L;handler.postDelayed(sleep,minutes*60000L);}
                settings.prefs.edit().putInt("sleep",minutes).apply();
                return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_SUCCESS));
            }
        }).build();
        handler.post(tick);
    }
    private final Runnable tick=new Runnable(){public void run(){save();handler.postDelayed(this,5000);}};
    private void save(){try{
        JSONObject state=Tracks.state(player);
        state.put("sleep",sleepAfterSong?-1:sleepDeadline>0?(int)Math.ceil((sleepDeadline-SystemClock.elapsedRealtime())/60000.0):0);
        settings.prefs.edit().putString("queue",state.toString()).putInt("sleep",state.getInt("sleep")).apply();
    }catch(Exception ignored){}}
    private void restore(){try{
        JSONObject state=new JSONObject(settings.prefs.getString("queue","{}"));JSONArray queue=state.optJSONArray("queue");
        if(queue!=null&&queue.length()>0){player.setMediaItems(Tracks.items(queue),Math.min(state.optInt("index"),queue.length()-1),Math.max(0,state.optLong("position")));player.setRepeatMode(state.optInt("repeat"));player.setShuffleModeEnabled(state.optBoolean("shuffle"));}
        settings.prefs.edit().putInt("sleep",0).apply();
    }catch(Exception ignored){settings.prefs.edit().remove("queue").apply();}}
    private void remember(MediaItem item){if(item==null)return;try{
        JSONArray old=new JSONArray(settings.prefs.getString("history","[]"));JSONArray recent=new JSONArray().put(Tracks.json(item));
        for(int i=0;i<old.length()&&recent.length()<100;i++)if(!item.mediaId.equals(old.getJSONObject(i).optString("id")))recent.put(old.getJSONObject(i));
        settings.prefs.edit().putString("history",recent.toString()).apply();
    }catch(Exception ignored){}}
    private void extendFm(){
        if(!settings.prefs.getBoolean("fm",false)||extending||sleepAfterSong||player.getCurrentMediaItemIndex()<player.getMediaItemCount()-2)return;
        extending=true;
        fmExecutor.execute(()->{try{
            JSONArray raw=new MusicApi(settings).request("/personal_fm",new JSONObject()).getJSONArray("data");JSONArray normalized=new JSONArray();
            for(int i=0;i<raw.length();i++){
                JSONObject s=raw.getJSONObject(i),al=s.optJSONObject("album");JSONArray artists=s.optJSONArray("artists");StringBuilder names=new StringBuilder();
                if(artists!=null)for(int j=0;j<artists.length();j++){if(j>0)names.append(" / ");names.append(artists.getJSONObject(j).optString("name"));}
                normalized.put(new JSONObject().put("id",s.getString("id")).put("name",s.optString("name")).put("artist",names.toString())
                        .put("album",al==null?"":al.optString("name")).put("cover",al==null?"":al.optString("picUrl").replace("http://","https://"))
                        .put("artists",artists==null?new JSONArray():artists).put("albumId",al==null?"":al.optString("id",""))
                        .put("duration",s.optLong("duration",s.optLong("dt",0))));
            }
            List<MediaItem> items=Tracks.items(normalized);
            handler.post(()->{if(player!=null&&settings.prefs.getBoolean("fm",false)){boolean ended=player.getPlaybackState()==Player.STATE_ENDED&&player.getPlayWhenReady();int next=player.getMediaItemCount();player.addMediaItems(items);if(ended&&!items.isEmpty()){player.seekTo(next,0);player.prepare();player.play();}}extending=false;});
        }catch(Exception e){handler.post(()->extending=false);}});
    }
    @Override public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo){return session;}
    @Override public void onTaskRemoved(Intent rootIntent){if(!settings.background()){player.pause();save();stopSelf();}else super.onTaskRemoved(rootIntent);}
    @Override public void onDestroy(){handler.removeCallbacksAndMessages(null);fmExecutor.shutdownNow();if(player!=null){save();player.release();player=null;}if(session!=null)session.release();super.onDestroy();}
}
