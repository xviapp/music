import {createContext,runInContext} from 'node:vm';
import * as model from '../app/src/main/assets/ui/model.js';
import {uiSource} from './ui-source.mjs';

const source=uiSource().split('\n// Startup\n')[0];
// Exercise the real action handlers without the Android bridge or DOM renderer.
export const song=id=>model.track({id,name:`歌曲 ${id}`,ar:[{name:'歌手'}],al:{name:'专辑'},dt:180000});
export function setup(responders={},natives={}){
  const calls=[],requests=[],nativeCalls=[];
  const handlers=new Map(),timers=new Map();let timerId=0;
  const node={scrollTop:0,addEventListener(name,handler){handlers.set(name,handler);},blur(){}};
  const context=createContext({...model,e:model.escape,isAndroid:false,
    document:{querySelector:()=>node,addEventListener(){}},window:{},
    matchMedia:()=>({matches:false,addEventListener(){}}),setTimeout:handler=>{const id=++timerId;timers.set(id,handler);return id;},clearTimeout:id=>timers.delete(id),
    native:async (method,args={})=>{nativeCalls.push({method,...args});if(natives[method])return natives[method](args);return method==='history'?[song(3)]:{};},
    control:async (action,args={})=>{calls.push({action,...args});},
    api:async (route,params)=>{
      requests.push({route,params});
      if(responders[route])return responders[route](params);
      if(route==='/artists')return {artist:{id:10,name:'歌手',followed:false,musicSize:70,albumSize:35,picUrl:'https://example.com/artist.jpg'},hotSongs:[song(2)]};
      if(route==='/album')return {album:{id:300,name:'专辑'},songs:[song(2)]};
      if(route==='/album/detail/dynamic')return {isSub:false};
      if(route==='/artist/sublist')return {data:[{id:10,name:'歌手'}],hasMore:false};
      if(route==='/album/sublist')return {data:[{id:300,name:'专辑'}],hasMore:false};
      if(route==='/toplist')return {list:[{id:5,name:'测试榜单',updateFrequency:'每日更新'}]};
      if(route==='/comment/music')return {comments:[{commentId:params.offset+1,time:12345678,content:'<img onerror="bad">',user:{nickname:'听众'},beReplied:[{content:'回复',user:{nickname:'另一位听众'}}]}],hotComments:[{commentId:100,content:'热评'}],total:40,more:params.offset===0};
      if(route==='/search/suggest')return {result:{allMatch:[{keyword:'测试歌曲'},{keyword:'测试歌曲'},{keyword:'测试歌手'}]}};
      if(route==='/cloudsearch')return {result:{songs:[song(2)],songCount:1}};
      if(route==='/artist/songs')return {songs:Array.from({length:30},(_,i)=>song(100+params.offset+i)),more:params.offset===0};
      if(route==='/artist/album')return {hotAlbums:Array.from({length:30},(_,i)=>({id:300+params.offset+i,name:`专辑 ${i}`})),more:params.offset===0};
      if(route==='/artist/desc')return {briefDesc:'歌手简介',introduction:[{ti:'经历',txt:'<img onerror="bad">'}]};
      if(route==='/playlist/detail')return {playlist:{name:'歌单',tracks:[song(2)]}};
      if(route==='/recommend/songs')return {data:{dailySongs:[song(2)]}};
      if(route==='/login/status')return {data:{profile:{userId:1}}};
      if(route==='/likelist')return {ids:['2']};
      if(route==='/song/detail')return {songs:[song(2)]};
      return {data:[song(2)]};
    }});
  const ui=runInContext(`${source}\nrender=()=>{};toast=()=>{};({s,action,back,rows,sheet,songDetail,artistPage,artistLinks,player,favoritesPage,entitySubscriptionButton,rankingsPage,commentsPage,onSearchInput,fetchSuggestions,suggestionMarkup,tab,search,collection,settings,mini,queueFill:()=>queueFill,window});`,context);
  ui.s.settings.loggedIn=true;
  ui.s.profile={userId:1};
  ui.s.playback={...ui.s.playback,queue:[song(1),song(4)],index:0,playing:true,position:12345};
  ui.s.songs=[song(2),song(3)];ui.s.history=[song(3)];ui.s.home=[{id:5,name:'歌单'}];
  return {...ui,node,calls,requests,nativeCalls,handlers,flushTimers:async()=>{const queued=[...timers.values()];timers.clear();for(const handler of queued)await handler();}};
}