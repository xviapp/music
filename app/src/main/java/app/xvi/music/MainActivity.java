package app.xvi.music;

import android.content.*;
import android.graphics.Bitmap;
import android.os.*;
import android.webkit.*;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.*;
import androidx.media3.common.*;
import androidx.media3.session.*;
import androidx.webkit.*;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.zxing.*;
import com.google.zxing.common.BitMatrix;
import org.json.*;
import java.io.ByteArrayOutputStream;
import java.util.Set;
import java.util.concurrent.*;

@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
public final class MainActivity extends ComponentActivity {
    private WebView web;
    private android.widget.FrameLayout root;
    private Settings settings;
    private MediaController player;
    private ListenableFuture<MediaController> future;
    private final ExecutorService io=Executors.newFixedThreadPool(3);
    private final Handler main=new Handler(Looper.getMainLooper());
    private boolean ready=false;
    private boolean loginLaunched=false;
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);settings=new Settings(this);web=new WebView(this);
        root=new android.widget.FrameLayout(this);root.addView(web,new android.widget.FrameLayout.LayoutParams(-1,-1));setContentView(root);
        String mode=settings.prefs.getString("theme","system");boolean systemDark=(getResources().getConfiguration().uiMode&android.content.res.Configuration.UI_MODE_NIGHT_MASK)==android.content.res.Configuration.UI_MODE_NIGHT_YES;
        appearance(mode.equals("dark")||(mode.equals("system")&&systemDark));
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=android.content.pm.PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},1001);
        ViewCompat.setOnApplyWindowInsetsListener(root,(view,insets)->{androidx.core.graphics.Insets bars=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.ime());view.setPadding(bars.left,bars.top,bars.right,bars.bottom);return WindowInsetsCompat.CONSUMED;});
        WebSettings options=web.getSettings();options.setJavaScriptEnabled(true);options.setDomStorageEnabled(false);
        options.setAllowFileAccess(false);options.setAllowContentAccess(false);options.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebViewAssetLoader loader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){return loader.shouldInterceptRequest(r.getUrl());}
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return true;}
            @Override public void onPageFinished(WebView v,String url){ready=true;emit();}
        });
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
            android.widget.TextView message=new android.widget.TextView(this);message.setText("请更新 Android 系统 WebView 后重新打开音乐");message.setPadding(32,64,32,32);setContentView(message);return;
        }
        WebViewCompat.addWebMessageListener(web,"MusicNative",Set.of("https://appassets.androidplatform.net"),(view,message,origin,isMainFrame,reply)->{
            if(!isMainFrame)return;
            String raw=message.getData();if(raw==null||raw.length()>1_000_000)return;
            try{JSONObject request=new JSONObject(raw);int id=request.getInt("id");String method=request.getString("method");JSONObject args=request.optJSONObject("args");if(args==null)args=new JSONObject();dispatch(id,method,args,reply);}catch(Exception ignored){}
        });
        future=new MediaController.Builder(this,new SessionToken(this,new ComponentName(this,PlaybackService.class))).buildAsync();
        future.addListener(()->{try{player=future.get();player.addListener(new Player.Listener(){@Override public void onEvents(Player p,Player.Events e){emit();}});emit();}catch(Exception e){sendError("播放器连接失败，请重新打开应用");}},main::post);
        web.loadUrl("https://appassets.androidplatform.net/assets/ui/index.html");
        getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true){@Override public void handleOnBackPressed(){web.evaluateJavascript("window.musicBack ? window.musicBack() : false",result->{if(!"true".equals(result))moveTaskToBack(true);});}});
    }
    private void dispatch(int id,String method,JSONObject args,JavaScriptReplyProxy reply){
        if(method.equals("appearance")){appearance(args.optBoolean("dark"));respond(reply,id,new JSONObject(),null);return;}
        if(method.equals("player")){try{control(args);respond(reply,id,new JSONObject(),null);}catch(Exception e){respond(reply,id,null,e.getMessage());}return;}
        if(method.equals("officialLogin")){
            loginLaunched=true;
            main.post(()->startActivity(new Intent(this,LoginActivity.class)));
            respond(reply,id,new JSONObject(),null);
            return;
        }
        io.execute(()->{try{
            Object value;
            switch(method){
                case "init":value=settings.publicState();break;
                case "settings":settings.update(args);value=settings.publicState();break;
                case "api":value=new MusicApi(settings).request(args.getString("route"),args.optJSONObject("params")==null?new JSONObject():args.getJSONObject("params"));break;
                case "history":value=new JSONArray(settings.prefs.getString("history","[]"));break;
                case "logout":settings.setCookie("");settings.prefs.edit().remove("history").remove("queue").putBoolean("fm",false).apply();main.post(()->{if(player!=null){player.stop();player.clearMediaItems();}});value=new JSONObject();break;
                case "qr":value=new JSONObject().put("image",qr(args.getString("key")));break;
                default:throw new IllegalArgumentException("不支持的操作");
            }
            respond(reply,id,value,null);
        }catch(Exception e){respond(reply,id,null,e.getMessage()==null?"操作失败，请重试":e.getMessage());}});
    }
    private void appearance(boolean dark){
        int canvas=dark?0xff191817:0xffF8F2E8;root.setBackgroundColor(canvas);web.setBackgroundColor(canvas);
        WindowInsetsControllerCompat bars=WindowCompat.getInsetsController(getWindow(),root);bars.setAppearanceLightStatusBars(!dark);bars.setAppearanceLightNavigationBars(!dark);
    }
    private void respond(JavaScriptReplyProxy reply,int id,Object value,String error){main.post(()->{if(isDestroyed())return;try{JSONObject result=new JSONObject().put("id",id);if(error==null)result.put("value",value);else result.put("error",error);reply.postMessage(result.toString());}catch(Exception ignored){}});}
    private void control(JSONObject args)throws Exception{
        if(player==null)throw new IllegalStateException("播放器正在准备，请稍后重试");
        switch(args.getString("action")){
            case "queue":var tracks=Tracks.items(args.getJSONArray("songs"));if(tracks.isEmpty())throw new IllegalArgumentException("没有可播放的歌曲");int start=args.optInt("index",0);if(start<0||start>=tracks.size())throw new IllegalArgumentException("播放位置无效");settings.prefs.edit().putBoolean("fm",args.optBoolean("fm")).apply();player.setMediaItems(tracks,start,0);player.prepare();player.play();break;
            case "play":if(player.getMediaItemCount()==0)return;if(player.getPlaybackState()==Player.STATE_ENDED)player.seekToDefaultPosition();player.prepare();player.play();break;
            case "pause":player.pause();break;
            case "next":player.seekToNextMediaItem();break;
            case "previous":player.seekToPrevious();break;
            case "seek":player.seekTo(Math.max(0,args.getLong("position")));break;
            case "jump":int index=args.getInt("index");if(index<0||index>=player.getMediaItemCount())throw new IllegalArgumentException("播放位置无效");player.seekToDefaultPosition(index);player.prepare();player.play();break;
            case "remove":int remove=args.getInt("index");if(remove>=0&&remove<player.getMediaItemCount())player.removeMediaItem(remove);break;
            case "repeat":player.setRepeatMode((player.getRepeatMode()+1)%3);break;
            case "shuffle":player.setShuffleModeEnabled(!player.getShuffleModeEnabled());break;
            case "sleep":Bundle bundle=new Bundle();bundle.putInt("minutes",args.getInt("minutes"));player.sendCustomCommand(PlaybackService.SLEEP,bundle);break;
            default:throw new IllegalArgumentException("不支持的播放操作");
        }
        emit();
    }
    private String qr(String key)throws Exception{
        if(!key.matches("[a-zA-Z0-9_-]{10,200}"))throw new IllegalArgumentException("二维码无效");
        BitMatrix bits=new MultiFormatWriter().encode("https://music.163.com/login?codekey="+key,BarcodeFormat.QR_CODE,480,480);
        Bitmap bitmap=Bitmap.createBitmap(480,480,Bitmap.Config.ARGB_8888);int[] pixels=new int[480*480];
        for(int y=0;y<480;y++)for(int x=0;x<480;x++)pixels[y*480+x]=bits.get(x,y)?0xff304f65:0xffffffff;
        bitmap.setPixels(pixels,0,480,0,0,480,480);ByteArrayOutputStream output=new ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.PNG,100,output);bitmap.recycle();
        return "data:image/png;base64,"+android.util.Base64.encodeToString(output.toByteArray(),android.util.Base64.NO_WRAP);
    }
    private void emit(){if(!ready||player==null||isDestroyed())return;try{
        JSONObject state=Tracks.state(player).put("sleep",settings.prefs.getInt("sleep",0));
        web.evaluateJavascript("window.onPlayback?.("+state+")",null);
    }catch(Exception ignored){}}
    private void sendError(String message){if(ready)web.evaluateJavascript("window.onNativeError?.("+JSONObject.quote(message)+")",null);}
    private final Runnable tick=new Runnable(){public void run(){emit();main.postDelayed(this,750);}};
    @Override public void onStart(){super.onStart();main.post(tick);}
    @Override public void onResume(){super.onResume();if(loginLaunched){loginLaunched=false;main.postDelayed(this::syncLogin,250);}}
    private void syncLogin(){if(!ready)return;try{JSONObject state=settings.publicState();if(state.optBoolean("loggedIn"))web.evaluateJavascript("window.onOfficialLogin?.("+state+")",null);}catch(Exception ignored){}}
    @Override public void onStop(){main.removeCallbacks(tick);if(!settings.background()&&player!=null&&!isChangingConfigurations())player.pause();super.onStop();}
    @Override public void onDestroy(){ready=false;main.removeCallbacksAndMessages(null);io.shutdownNow();if(future!=null)MediaController.releaseFuture(future);if(web!=null)web.destroy();super.onDestroy();}
}
