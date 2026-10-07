package app.xvi.music;

import android.net.Uri;
import android.os.Bundle;
import androidx.media3.common.*;
import org.json.*;
import java.util.*;

final class Tracks {
    static MediaItem item(JSONObject song) throws Exception {
        String id=song.getString("id");
        if(!id.matches("[0-9]+") || Long.parseLong(id)<=0)throw new IllegalArgumentException("歌曲编号无效");
        MediaMetadata.Builder metadata=new MediaMetadata.Builder().setTitle(song.optString("name","未知歌曲"))
                .setArtist(song.optString("artist","")).setAlbumTitle(song.optString("album",""));
        Bundle extras=new Bundle();
        extras.putString("artists",song.optJSONArray("artists")==null?"[]":song.getJSONArray("artists").toString());
        extras.putString("albumId",song.optString("albumId",""));extras.putLong("duration",song.optLong("duration",0));
        metadata.setExtras(extras);
        String artwork=song.optString("cover","");
        if(artwork.startsWith("https://"))metadata.setArtworkUri(Uri.parse(artwork));
        return new MediaItem.Builder().setMediaId(id).setUri("https://music.invalid/"+id)
                .setMimeType(MimeTypes.AUDIO_MPEG).setMediaMetadata(metadata.build()).build();
    }
    static JSONObject json(MediaItem item) throws Exception {
        MediaMetadata m=item.mediaMetadata;
        return new JSONObject().put("id",item.mediaId).put("name",m.title==null?"":m.title.toString())
                .put("artist",m.artist==null?"":m.artist.toString()).put("album",m.albumTitle==null?"":m.albumTitle.toString())
                .put("cover",m.artworkUri==null?"":m.artworkUri.toString())
                .put("artists",new JSONArray(m.extras==null?"[]":m.extras.getString("artists","[]")))
                .put("albumId",m.extras==null?"":m.extras.getString("albumId",""))
                .put("duration",m.extras==null?0:m.extras.getLong("duration",0));
    }
    static List<MediaItem> items(JSONArray array)throws Exception{
        if(array.length()>1000)throw new IllegalArgumentException("队列最多容纳 1000 首歌曲");
        List<MediaItem> items=new ArrayList<>();for(int i=0;i<array.length();i++)items.add(item(array.getJSONObject(i)));return items;
    }
    static JSONObject state(Player player)throws Exception{
        JSONArray queue=new JSONArray();for(int i=0;i<player.getMediaItemCount();i++)queue.put(json(player.getMediaItemAt(i)));
        String error="";
        if(player.getPlayerError()!=null){
            Throwable cause=player.getPlayerError();
            while(cause.getCause()!=null)cause=cause.getCause();
            String message=cause.getMessage();
            error=message!=null&&message.matches(".*[\\u4e00-\\u9fff].*")?message:"播放失败，请检查网络后重试，或选择下一首";
        }
        long duration=Math.max(0,player.getDuration());
        int index=Math.max(0,player.getCurrentMediaItemIndex());
        if(duration==0&&index<player.getMediaItemCount()){
            Bundle extras=player.getMediaItemAt(index).mediaMetadata.extras;
            if(extras!=null)duration=Math.max(0,extras.getLong("duration",0));
        }
        return new JSONObject().put("queue",queue).put("index",index)
                .put("playing",player.getPlayWhenReady()&&player.getPlaybackState()!=Player.STATE_ENDED&&player.getPlayerError()==null)
                .put("buffering",player.getPlaybackState()==Player.STATE_BUFFERING)
                .put("position",Math.max(0,player.getCurrentPosition())).put("duration",duration)
                .put("repeat",player.getRepeatMode()).put("shuffle",player.getShuffleModeEnabled()).put("error",error);
    }
}
