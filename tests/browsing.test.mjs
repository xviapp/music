import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import * as model from '../app/src/main/assets/ui/model.js';

// Exercise the real action handlers without the Android bridge or DOM renderer.
const source=readFileSync(new URL('../app/src/main/assets/ui/app.js',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').split('\nrender();\nif(isAndroid)')[0];
const song=id=>model.track({id,name:`歌曲 ${id}`,ar:[{name:'歌手'}],al:{name:'专辑'},dt:180000});
function setup(){
  const calls=[],requests=[];
  const node={scrollTop:0,addEventListener(){}};
  const context=createContext({...model,e:model.escape,isAndroid:false,
    document:{querySelector:()=>node,addEventListener(){}},window:{},
    matchMedia:()=>({matches:false,addEventListener(){}}),setTimeout:()=>0,clearTimeout(){},
    native:async method=>method==='history'?[song(3)]:{},
    control:async (action,args={})=>{calls.push({action,...args});},
    api:async (route,params)=>{
      requests.push({route,params});
      if(route==='/playlist/detail')return {playlist:{name:'歌单',tracks:[song(2)]}};
      if(route==='/recommend/songs')return {data:{dailySongs:[song(2)]}};
      if(route==='/login/status')return {data:{profile:{userId:1}}};
      if(route==='/likelist')return {ids:['2']};
      if(route==='/song/detail')return {songs:[song(2)]};
      return {data:[song(2)]};
    }});
  const ui=runInContext(`${source}\nrender=()=>{};toast=()=>{};({s,action,back,rows,sheet,songDetail});`,context);
  ui.s.settings.loggedIn=true;
  ui.s.profile={userId:1};
  ui.s.playback={...ui.s.playback,queue:[song(1),song(4)],index:0,playing:true,position:12345};
  ui.s.songs=[song(2),song(3)];ui.s.history=[song(3)];ui.s.home=[{id:5,name:'歌单'}];
  return {...ui,calls,requests};
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
