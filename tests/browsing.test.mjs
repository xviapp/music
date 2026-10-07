import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import * as model from '../app/src/main/assets/ui/model.js';

// Exercise the real action handlers without the Android bridge or DOM renderer.
const source=readFileSync(new URL('../app/src/main/assets/ui/app.js',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').split('\nrender();\nif(isAndroid)')[0];
const song=id=>model.track({id,name:`歌曲 ${id}`,ar:[{name:'歌手'}],al:{name:'专辑'},dt:180000});
function setup(responders={}){
  const calls=[],requests=[];
  const handlers=new Map(),timers=new Map();let timerId=0;
  const node={scrollTop:0,addEventListener(name,handler){handlers.set(name,handler);},blur(){}};
  const context=createContext({...model,e:model.escape,isAndroid:false,
    document:{querySelector:()=>node,addEventListener(){}},window:{},
    matchMedia:()=>({matches:false,addEventListener(){}}),setTimeout:handler=>{const id=++timerId;timers.set(id,handler);return id;},clearTimeout:id=>timers.delete(id),
    native:async method=>method==='history'?[song(3)]:{},
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
  const ui=runInContext(`${source}\nrender=()=>{};toast=()=>{};({s,action,back,rows,sheet,songDetail,artistPage,artistLinks,player,favoritesPage,entitySubscriptionButton,rankingsPage,commentsPage,onSearchInput,fetchSuggestions,suggestionMarkup,tab,search,collection});`,context);
  ui.s.settings.loggedIn=true;
  ui.s.profile={userId:1};
  ui.s.playback={...ui.s.playback,queue:[song(1),song(4)],index:0,playing:true,position:12345};
  ui.s.songs=[song(2),song(3)];ui.s.history=[song(3)];ui.s.home=[{id:5,name:'歌单'}];
  return {...ui,node,calls,requests,handlers,flushTimers:async()=>{const queued=[...timers.values()];timers.clear();for(const handler of queued)await handler();}};
}
test('song, recent and queue titles browse without playback commands',async()=>{
  for(const name of ['song','recent','queuedetail']){
    const ui=setup(),before=JSON.stringify(ui.s.playback);
    await ui.action(name,'0');
    assert.equal(ui.s.page,'songdetail');assert.equal(ui.calls.length,0);
    assert.equal(JSON.stringify(ui.s.playback),before);
    assert.equal(ui.s.detailSong.id,name==='song'?'2':name==='recent'?'3':'1');
    ui.back();assert.equal(ui.s.page,'home');
  }
});
test('individual artist links open a profile without changing playback',async()=>{
  const ui=setup();ui.s.songs[0].artists=[{id:'10',name:'甲'},{id:'11',name:'乙'}];
  const before=JSON.stringify(ui.s.playback);
  await ui.action('song','0');
  assert.match(ui.songDetail(),/data-action="songartist:detail-0"/);
  assert.match(ui.songDetail(),/data-action="songartist:detail-1"/);
  await ui.action('songartist','detail-1');
  assert.equal(ui.s.page,'artistpage');assert.equal(ui.s.artistInfo.id,'11');
  assert.equal(ui.requests.at(-1).params.id,'11');assert.equal(ui.calls.length,0);
  assert.equal(JSON.stringify(ui.s.playback),before);
  ui.back();assert.equal(ui.s.page,'songdetail');assert.equal(ui.s.detailSong.id,'2');
});
test('artist song and album pagination and biography browsing never play',async()=>{
  const ui=setup();ui.s.cards=[{id:10,name:'歌手'}];
  const before=JSON.stringify(ui.s.playback);
  await ui.action('artist','0');assert.equal(ui.s.songs[0].id,'2');
  await ui.action('artisttab','songs');assert.equal(ui.s.songs.length,30);assert.equal(ui.s.more,true);
  await ui.action('more');assert.equal(ui.s.songs.length,60);assert.equal(ui.s.more,false);
  assert.equal(ui.requests.at(-1).params.offset,30);
  await ui.action('song','0');ui.back();assert.equal(ui.s.artistTab,'songs');assert.equal(ui.s.songs.length,60);
  await ui.action('artisttab','albums');assert.equal(ui.s.cards.length,30);
  await ui.action('more');assert.equal(ui.s.cards.length,60);
  await ui.action('album','0');ui.back();assert.equal(ui.s.artistTab,'albums');assert.equal(ui.s.cards.length,60);
  await ui.action('artisttab','bio');assert.match(ui.artistPage(),/歌手简介/);
  assert.match(ui.artistPage(),/&lt;img onerror/);assert.doesNotMatch(ui.artistPage(),/<img onerror/);
  assert.equal(ui.calls.length,0);assert.equal(JSON.stringify(ui.s.playback),before);
});
test('legacy playback metadata resolves artists without replacing its queue',async()=>{
  const ui=setup({'/song/detail':()=>({songs:[{id:1,name:'旧歌曲',ar:[{id:10,name:'甲'},{id:11,name:'乙'}]}]})});
  ui.s.player=true;ui.s.playback.queue[0].artists=[];
  const before=JSON.stringify(ui.s.playback);
  await ui.action('songartist','current-lookup');assert.equal(ui.s.page,'home');
  assert.match(ui.player(),/data-action="songartist:current-1"/);
  await ui.action('songartist','current-1');assert.equal(ui.s.page,'artistpage');
  assert.equal(ui.s.artistInfo.id,'11');assert.equal(ui.calls.length,0);
  assert.equal(JSON.stringify(ui.s.playback),before);
});
test('late artist responses cannot overwrite another page',async()=>{
  let resolve;
  const ui=setup({'/artists':()=>new Promise(done=>resolve=done)});
  ui.s.cards=[{id:10,name:'歌手'}];const loading=ui.action('artist','0');
  await ui.action('tab','settings');resolve({artist:{id:10,name:'旧页面'},hotSongs:[song(2)]});
  await loading;assert.equal(ui.s.page,'settings');assert.equal(ui.s.artistInfo,null);
  assert.equal(ui.s.songs.length,0);assert.equal(ui.calls.length,0);
});
test('empty artist panes and failed requests provide an appropriate retry',async()=>{
  const ui=setup({'/artist/album':()=>({hotAlbums:[],more:false}),'/artist/desc':()=>({}),'/artist/songs':()=>{throw new Error('连接超时');}});
  ui.s.cards=[{id:10,name:'歌手'}];await ui.action('artist','0');
  await ui.action('artisttab','albums');assert.match(ui.artistPage(),/暂无专辑/);
  await ui.action('artisttab','bio');assert.match(ui.artistPage(),/暂无歌手简介/);
  await ui.action('artisttab','songs');assert.match(ui.artistPage(),/连接超时/);
  assert.match(ui.artistPage(),/data-action="artistrefresh"/);assert.equal(ui.calls.length,0);
});
test('artist and album subscriptions update only after success without player commands',async()=>{
  const ui=setup();ui.s.cards=[{id:10,name:'歌手'}];
  await ui.action('artist','0');await ui.action('entitysub','artist');
  assert.equal(ui.requests.at(-1).route,'/artist/sub');assert.equal(ui.requests.at(-1).params.t,1);
  assert.match(ui.artistPage(),/取消收藏/);
  await ui.action('entitysub','artist');assert.equal(ui.requests.at(-1).params.t,2);
  ui.back();ui.s.cards=[{id:300,name:'专辑'}];await ui.action('album','0');
  await ui.action('entitysub','album');assert.equal(ui.requests.at(-1).route,'/album/sub');
  assert.match(ui.entitySubscriptionButton('album',ui.s.collection),/取消收藏/);
  assert.equal(ui.calls.length,0);
});
test('failed and duplicate subscriptions retain the prior state',async()=>{
  let finish;
  const ui=setup({'/artist/sub':()=>new Promise(resolve=>finish=resolve),'/album/sub':()=>{throw new Error('失败');}});
  ui.s.cards=[{id:10,name:'歌手'}];await ui.action('artist','0');
  const pending=ui.action('entitysub','artist');await ui.action('entitysub','artist');
  assert.equal(ui.requests.filter(r=>r.route==='/artist/sub').length,1);
  assert.match(ui.artistPage(),/aria-busy="true"/);finish({code:200});await pending;
  ui.back();ui.s.cards=[{id:300,name:'专辑'}];await ui.action('album','0');
  await assert.rejects(ui.action('entitysub','album'),/失败/);
  assert.match(ui.entitySubscriptionButton('album',ui.s.collection),/收藏专辑/);
  assert.doesNotMatch(ui.entitySubscriptionButton('album',ui.s.collection),/取消收藏/);
});
test('favorite entries browse and unsubscription updates the saved library page',async()=>{
  const ui=setup({'/artists':()=>({artist:{id:10,name:'歌手',followed:true},hotSongs:[]})});
  await ui.action('favoriteartists');assert.equal(ui.s.page,'favorites');
  await ui.action('artist','0');await ui.action('entitysub','artist');ui.back();
  assert.equal(ui.s.page,'favorites');assert.equal(ui.s.cards.length,0);
  await ui.action('favoritealbums');assert.equal(ui.s.favoriteKind,'album');
  await ui.action('album','0');assert.equal(ui.s.collection.kind,'album');
  assert.equal(ui.calls.length,0);
});
test('unknown album subscription state offers a read-only retry',async()=>{
  const ui=setup({'/album/detail/dynamic':()=>{throw new Error('网络失败');}});
  ui.s.cards=[{id:300,name:'专辑'}];await ui.action('album','0');
  assert.match(ui.entitySubscriptionButton('album',ui.s.collection),/entitystatus:album/);
  assert.equal(ui.requests.filter(r=>r.route==='/album/sub').length,0);
});
test('unauthenticated collection writes navigate to login without posting',async()=>{
  const ui=setup();ui.s.settings.loggedIn=false;ui.s.cards=[{id:10,name:'歌手'}];
  await ui.action('artist','0');await ui.action('entitysub','artist');
  assert.equal(ui.s.page,'account');assert.equal(ui.requests.filter(r=>r.route==='/artist/sub').length,0);
  assert.equal(ui.calls.length,0);
});
test('favorite pagination and late subscription responses respect account logout',async()=>{
  let finish;
  const ui=setup({'/artist/sublist':p=>({data:Array.from({length:30},(_,i)=>({id:10+p.offset+i,name:'歌手'})),hasMore:p.offset===0}),'/artist/sub':()=>new Promise(resolve=>finish=resolve)});
  await ui.action('favoriteartists');await ui.action('more');assert.equal(ui.s.cards.length,60);
  assert.equal(ui.requests.at(-1).params.offset,30);assert.equal(ui.s.more,false);
  await ui.action('artist','0');const artist=ui.s.artistInfo;
  const pending=ui.action('entitysub','artist');await ui.action('logout');finish({code:200});await pending;
  assert.equal(ui.s.stack.length,0);assert.equal(ui.s.cards.length,0);
  assert.match(ui.entitySubscriptionButton('artist',artist),/aria-pressed="false"/);
});
test('an older artist read cannot overwrite a newly successful subscription',async()=>{
  let finish,reads=0;
  const ui=setup({'/artists':()=>++reads===1?{artist:{id:10,name:'歌手',followed:false},hotSongs:[]}:new Promise(resolve=>finish=resolve)});
  ui.s.cards=[{id:10,name:'歌手'}];await ui.action('artist','0');
  const old=ui.action('artistrefresh');await ui.action('entitysub','artist');
  finish({artist:{id:10,name:'歌手',followed:false},hotSongs:[]});await old;
  assert.match(ui.artistPage(),/取消收藏/);
});
test('rankings open as playlists and returning restores the ranking list',async()=>{
  const ui=setup(),before=JSON.stringify(ui.s.playback);await ui.action('rankings');
  assert.equal(ui.s.page,'rankings');assert.match(ui.rankingsPage(),/每日更新/);
  await ui.action('ranking','0');assert.equal(ui.s.collection.kind,'playlist');
  ui.back();assert.equal(ui.s.page,'rankings');assert.equal(ui.s.cards[0].id,5);
  assert.equal(ui.calls.length,0);assert.equal(JSON.stringify(ui.s.playback),before);
});
test('song comments are escaped, paginated and independent of the current song',async()=>{
  const ui=setup(),before=JSON.stringify(ui.s.playback);await ui.action('song','0');
  await ui.action('comments','detail');assert.equal(ui.s.commentSong.id,'2');
  assert.match(ui.commentsPage(),/热门评论/);assert.match(ui.commentsPage(),/&lt;img onerror/);
  assert.doesNotMatch(ui.commentsPage(),/<img onerror/);assert.match(ui.commentsPage(),/另一位听众/);
  await ui.action('more');assert.equal(ui.requests.at(-1).params.offset,20);
  assert.equal(ui.s.comments.length,2);assert.equal(ui.s.more,false);
  ui.back();assert.equal(ui.s.page,'songdetail');assert.equal(ui.s.detailSong.id,'2');
  assert.equal(ui.calls.length,0);assert.equal(JSON.stringify(ui.s.playback),before);
});
test('comments beyond 5000 use a timestamp cursor',async()=>{
  const ui=setup();await ui.action('comments','current');ui.s.offset=4980;
  ui.s.comments=[{commentId:1,time:12345678}];await ui.action('more');
  assert.equal(ui.requests.at(-1).params.offset,0);assert.equal(ui.requests.at(-1).params.before,12345678);
});
test('failed comment pages preserve content and retry the same page',async()=>{
  let fail=false;
  const ui=setup({'/comment/music':params=>{if(fail)throw new Error('超时');return {comments:[{commentId:1,content:'保留内容'}],more:true,total:30};}});
  await ui.action('comments','current');fail=true;await ui.action('more');
  assert.equal(ui.s.comments.length,1);assert.equal(ui.s.offset,0);
  assert.match(ui.commentsPage(),/commentsmore/);assert.match(ui.commentsPage(),/保留内容/);
  fail=false;await ui.action('commentsmore');assert.equal(ui.requests.at(-1).params.offset,20);
});
test('suggestions are deduplicated and explicitly selected before searching',async()=>{
  const ui=setup();await ui.action('tab','search');ui.onSearchInput('测试');
  await ui.fetchSuggestions();assert.equal(ui.s.suggestions.length,2);
  assert.match(ui.suggestionMarkup(),/suggestion:0/);await ui.action('suggestion','0');
  assert.equal(ui.s.query,'测试歌曲');assert.equal(ui.s.suggestions.length,0);
  assert.equal(ui.requests.at(-1).route,'/cloudsearch');assert.equal(ui.calls.length,0);
});
test('late suggestions cannot replace newer input or appear after leaving search',async()=>{
  const waiting=[];
  const ui=setup({'/search/suggest':()=>new Promise(resolve=>waiting.push(resolve))});
  await ui.action('tab','search');ui.onSearchInput('旧');const old=ui.fetchSuggestions();
  ui.onSearchInput('新');const next=ui.fetchSuggestions();waiting[1]({result:{allMatch:[{keyword:'新建议'}]}});await next;
  waiting[0]({result:{allMatch:[{keyword:'旧建议'}]}});await old;
  assert.equal(ui.s.suggestions[0],'新建议');
  ui.onSearchInput('再输入');const last=ui.fetchSuggestions();await ui.action('tab','settings');
  waiting[2]({result:{allMatch:[{keyword:'不应出现'}]}});await last;
  assert.equal(ui.s.suggestions.length,0);assert.equal(ui.s.suggestBusy,false);
});
test('suggestion failures keep ordinary search available',async()=>{
  const ui=setup({'/search/suggest':()=>{throw new Error('超时');}});
  await ui.action('tab','search');ui.onSearchInput('测试');await ui.fetchSuggestions();
  assert.match(ui.suggestionMarkup(),/suggestretry/);await ui.action('search');
  assert.equal(ui.requests.at(-1).route,'/cloudsearch');assert.equal(ui.s.songs.length,1);
});
test('suggestions debounce typing and wait for Chinese composition to finish',async()=>{
  const ui=setup();await ui.action('tab','search');ui.onSearchInput('晴');ui.onSearchInput('晴天');
  await ui.flushTimers();assert.equal(ui.requests.filter(r=>r.route==='/search/suggest').length,1);
  const target={id:'query',value:'中'};ui.handlers.get('compositionstart')({target});
  ui.handlers.get('input')({target,isComposing:true});await ui.flushTimers();
  assert.equal(ui.requests.filter(r=>r.route==='/search/suggest').length,1);
  target.value='中文';ui.handlers.get('compositionend')({target});await ui.flushTimers();
  assert.equal(ui.requests.at(-1).params.keywords,'中文');
  ui.onSearchInput('');await ui.flushTimers();assert.equal(ui.s.suggestions.length,0);
});
test('top-level tabs restore search results, query and scroll position',async()=>{
  const ui=setup();
  await ui.action('tab','search');
  ui.s.query='测试';
  await ui.action('search');
  ui.node.scrollTop=37;
  assert.equal(ui.s.songs.length,1);
  await ui.action('tab','settings');
  await ui.action('tab','search');
  assert.equal(ui.s.query,'测试');
  assert.equal(ui.s.songs.length,1);
  assert.equal(ui.s.type,1);
  assert.equal(ui.node.scrollTop,37);
});
test('unknown playback duration is visibly unavailable and metadata duration is used when present',()=>{
  const ui=setup();
  ui.s.playback.queue=[{...song(1),duration:0}];ui.s.playback.index=0;ui.s.playback.position=120000;ui.s.player=true;
  assert.match(ui.player(),/value="0"/);
  assert.match(ui.player(),/--:--/);
  assert.match(ui.player(),/disabled/);
  ui.s.playback.queue[0].duration=180000;
  assert.match(ui.player(),/3:00/);
  ui.s.playback.repeat=1;ui.s.playback.sleep=30;
  assert.match(ui.player(),/<b>1<\/b>/);
  assert.match(ui.player(),/定时 30 分钟/);
});
test('playlist and recommendation entries only load content',async()=>{
  for(const name of ['homecard','daily','new','fm','cloud','likes','history']){
    const ui=setup(),before=JSON.stringify(ui.s.playback);
    await ui.action(name,'0');
    assert.equal(ui.s.page,'collection',name);assert.equal(ui.calls.length,0,name);
    assert.equal(JSON.stringify(ui.s.playback),before,name);
  }
});
test('adding and liking a viewed song do not seek or start playback',async()=>{
  const ui=setup(),before=JSON.stringify(ui.s.playback);
  await ui.action('song','0');await ui.action('queueadd');await ui.action('likedetail');
  assert.equal(ui.calls.length,1);assert.equal(ui.calls[0].action,'append');
  assert.equal(ui.calls[0].songs[0].id,'2');
  assert.equal(ui.requests.at(-1).params.id,'2');
  assert.equal(JSON.stringify(ui.s.playback),before);
});
test('only explicit play starts a new queue and preserves FM mode',async()=>{
  const ui=setup();await ui.action('fm');await ui.action('song','0');
  assert.equal(ui.calls.length,0);await ui.action('playdetail');
  assert.equal(ui.calls[0].action,'queue');assert.equal(ui.calls[0].fm,true);
  assert.equal(ui.s.player,true);
});
test('explicit queue-detail play jumps within the existing queue',async()=>{
  const ui=setup();await ui.action('queuedetail','1');await ui.action('playdetail');
  assert.equal(ui.calls[0].action,'jump');assert.equal(ui.calls[0].index,1);
  assert.equal(ui.s.player,true);
});
test('returning from nested details restores the previous song context',async()=>{
  const ui=setup();await ui.action('song','0');await ui.action('queuedetail','1');
  ui.back();assert.equal(ui.s.detailSong.id,'2');assert.equal(ui.s.detailSource,'');
  await ui.action('playdetail');assert.equal(ui.calls[0].songs[0].id,'2');
});
test('list and queue markup separate view and play targets and escape titles',()=>{
  const ui=setup();ui.s.songs[0].name='<img onerror="bad">';
  const rows=ui.rows();assert.match(rows,/data-action="song:0"/);
  assert.match(rows,/data-action="songplay:0"/);assert.doesNotMatch(rows,/<img onerror/);
  ui.s.sheet='queue';assert.match(ui.sheet(),/data-action="queuedetail:0"/);
  assert.match(ui.sheet(),/data-action="jump:0"/);
});
