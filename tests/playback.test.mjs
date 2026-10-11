import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,song} from './ui-harness.mjs';

const detail=params=>({songs:params.ids.split(',').map(id=>({id:Number(id),name:`歌曲 ${id}`,ar:[{name:'歌手'}],al:{name:'专辑'}}))});
const playlist=count=>({playlist:{name:'长歌单',trackCount:count,trackIds:Array.from({length:count},(_,i)=>({id:1000+i}))}});

test('play all queues the loaded songs and appends the rest of a long playlist',async()=>{
  const ui=setup({'/playlist/detail':()=>playlist(170),'/song/detail':detail});
  await ui.action('homecard','0');
  assert.equal(ui.s.songs.length,50);assert.equal(ui.s.offset,50);
  await ui.action('playall');await ui.queueFill();
  assert.equal(ui.calls[0].action,'queue');assert.equal(ui.calls[0].songs.length,50);
  const appended=ui.calls.filter(c=>c.action==='append');
  assert.deepEqual(appended.map(c=>c.songs.length),[100,20]);
  assert.equal(appended[0].songs[0].id,'1050');assert.equal(appended[1].songs.at(-1).id,'1169');
});
test('playing a song from a partly loaded playlist also queues the remaining songs',async()=>{
  const ui=setup({'/playlist/detail':()=>playlist(60),'/song/detail':detail});
  await ui.action('homecard','0');await ui.action('songplay','3');await ui.queueFill();
  assert.equal(ui.calls[0].index,3);
  assert.equal(ui.calls.filter(c=>c.action==='append').flatMap(c=>c.songs).length,10);
});
test('the queue never exceeds 1000 songs when filling a huge playlist',async()=>{
  const ui=setup({'/playlist/detail':()=>playlist(1500),'/song/detail':detail});
  await ui.action('homecard','0');await ui.action('playall');await ui.queueFill();
  const total=ui.calls[0].songs.length+ui.calls.filter(c=>c.action==='append').reduce((n,c)=>n+c.songs.length,0);
  assert.equal(total,1000);
});
test('starting another queue cancels a background fill',async()=>{
  let release;
  const ui=setup({'/playlist/detail':()=>playlist(120),'/song/detail':params=>params.ids.startsWith('1050')?new Promise(r=>release=()=>r(detail(params))):detail(params)});
  await ui.action('homecard','0');await ui.action('playall');
  await ui.action('recentplay','0');release();await ui.queueFill();
  assert.equal(ui.calls.filter(c=>c.action==='append').length,0);
  assert.equal(ui.calls.at(-1).songs[0].id,'3');
});
test('loading more of a playlist advances by requested ids even when some songs are unavailable',async()=>{
  const ui=setup({'/playlist/detail':()=>playlist(120),'/song/detail':params=>({songs:detail(params).songs.slice(1)})});
  await ui.action('homecard','0');assert.equal(ui.s.songs.length,49);
  await ui.action('more');assert.equal(ui.s.offset,100);assert.equal(ui.s.more,true);
  await ui.action('more');assert.equal(ui.s.offset,120);assert.equal(ui.s.more,false);
  assert.equal(ui.requests.filter(r=>r.route==='/song/detail').length,3);
});
test('refreshing a collection reloads it without changing navigation',async()=>{
  const ui=setup({'/playlist/detail':()=>playlist(3),'/song/detail':detail});
  await ui.action('homecard','0');const depth=ui.s.stack.length;
  await ui.action('refresh');
  assert.equal(ui.s.page,'collection');assert.equal(ui.s.stack.length,depth);
  assert.equal(ui.requests.filter(r=>r.route==='/playlist/detail').length,2);
  ui.back();assert.equal(ui.s.page,'home');
});
test('play next and clear queue send their own commands',async()=>{
  const ui=setup();await ui.action('song','0');
  assert.match(ui.songDetail(),/data-action="playnext"/);
  await ui.action('playnext');assert.equal(ui.calls[0].action,'playnext');assert.equal(ui.calls[0].song.id,'2');
  ui.s.sheet='queue';assert.match(ui.sheet(),/data-action="clearqueue"/);assert.match(ui.sheet(),/data-drag="1"/);
  await ui.action('clearqueue');assert.equal(ui.calls[1].action,'clear');
  assert.equal(ui.s.sheet,'');assert.equal(ui.s.player,false);
});
test('tap to play is opt-in and plays instead of opening details',async()=>{
  const ui=setup();assert.match(ui.settings(),/data-action="tapplay" role="switch" aria-checked="false"/);
  ui.s.settings.tapPlay=true;
  await ui.action('song','1');assert.equal(ui.s.page,'home');
  assert.equal(ui.calls[0].action,'queue');assert.equal(ui.calls[0].index,1);
  await ui.action('queuedetail','1');assert.equal(ui.calls[1].action,'jump');
});
test('search history and hot searches show before typing and start a search',async()=>{
  const ui=setup({'/search/hot/detail':()=>({data:[{searchWord:'晴天'},{searchWord:''}]})},{searches:()=>['旧关键词'],searchAdd:args=>[args.keyword,'旧关键词']});
  await ui.action('tab','search');
  assert.deepEqual(ui.s.hotSearches,['晴天']);assert.deepEqual(ui.s.searchHistory,['旧关键词']);
  assert.match(ui.search(),/data-action="searchhistory:0"/);assert.match(ui.search(),/data-action="hotsearch:0"/);
  await ui.action('hotsearch','0');
  assert.equal(ui.requests.at(-1).route,'/cloudsearch');assert.equal(ui.requests.at(-1).params.keywords,'晴天');
  assert.ok(ui.nativeCalls.some(c=>c.method==='searchAdd'&&c.keyword==='晴天'));
  await ui.action('clearsearches');assert.deepEqual([...ui.s.searchHistory],[]);
});
test('personal FM offers a dislike that targets the current song',async()=>{
  const ui=setup();ui.s.player=true;
  assert.doesNotMatch(ui.player(),/data-action="trash"/);
  ui.s.playback.fm=true;assert.match(ui.player(),/data-action="trash"/);
  await ui.action('trash');assert.equal(ui.calls[0].action,'trash');assert.equal(ui.calls[0].id,'1');
});
test('likes are shared with the notification and updated from it',async()=>{
  const ui=setup();await ui.action('likedetail');await ui.action('song','0');await ui.action('likedetail');
  assert.deepEqual([...ui.nativeCalls.filter(c=>c.method==='likes').at(-1).ids],['2']);
  ui.window.onLiked('4',true);assert.ok(ui.s.likes.has('4'));
  ui.window.onLiked('4',false);assert.ok(!ui.s.likes.has('4'));
});
test('playback updates without a queue keep the known queue and progress updates are merged',()=>{
  const ui=setup();
  ui.window.onPlayback({index:1,playing:false,position:0,duration:0,repeat:0,shuffle:false,error:'',sleep:0});
  assert.equal(ui.s.playback.queue.length,2);assert.equal(ui.s.playback.index,1);
  ui.window.onProgress({position:5000,duration:180000,buffering:false,sleep:30,sleepRemaining:720000});
  assert.equal(ui.s.playback.position,5000);
  ui.s.player=true;assert.match(ui.player(),/12:00 后停止/);
});
test('the mini player carries a progress bar that is updated in place',()=>{
  const ui=setup();assert.match(ui.mini(),/id="miniprogress"/);
  assert.doesNotMatch(ui.mini(),/style=/);
});
test('translated lyrics appear under their line',async()=>{
  const ui=setup({'/lyric':()=>({lrc:{lyric:'[00:01.00]Hello'},tlyric:{lyric:'[00:01.00]你好'}})});
  ui.s.player=true;await ui.action('lyrics');
  assert.equal(ui.s.lines[0].translation,'你好');assert.match(ui.player(),/Hello<small>你好<\/small>/);
});
test('changing quality reloads the current song',async()=>{
  const ui=setup();
  await ui.handlers.get('change')({target:{id:'quality',value:'lossless'}});
  assert.equal(ui.calls.at(-1).action,'reload');
});
test('logout clears search history with the account',async()=>{
  const ui=setup();ui.s.searchHistory=['关键词'];await ui.action('logout');
  assert.deepEqual([...ui.s.searchHistory],[]);assert.ok(ui.nativeCalls.some(c=>c.method==='logout'));
});
