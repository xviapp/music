import {test} from 'node:test';
import assert from 'node:assert/strict';
import {track,tracks,escape,imageUrl,lyrics,lyricIndex,time,playbackKey} from '../app/src/main/assets/ui/model.js';
test('normalizes modern tracks and cloud records',()=>{
  assert.deepEqual(track({id:1,name:'歌',ar:[{id:10,name:'甲'},{id:11,name:'乙'}],al:{id:20,name:'专辑',picUrl:'http://example.com/a'},dt:1200}),{id:'1',name:'歌',artist:'甲 / 乙',artists:[{id:'10',name:'甲'},{id:'11',name:'乙'}],album:'专辑',albumId:'20',cover:'https://example.com/a',duration:1200});
  assert.equal(track({songId:2,simpleSong:{id:3,name:'云盘'}}).id,'2');
  assert.equal(tracks([{id:null},{id:'bad'},{id:2}]).length,1);
});
test('preserves artist identities when re-normalizing persisted songs',()=>{
  const song=track({id:1,name:'歌',ar:[{id:10,name:'甲'}],al:{id:20,name:'专辑'}});
  assert.deepEqual(track(song),song);
  assert.deepEqual(track({id:2,artist:'旧数据歌手'}).artists,[]);
});
test('escapes untrusted metadata and rejects unsafe images',()=>{
  assert.equal(escape('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
  assert.equal(imageUrl('javascript:alert(1)'),'');assert.equal(imageUrl('file:///data/private'),'');
});
test('parses timestamps and repeated LRC lines',()=>{
  const l=lyrics('[ar:test]\n[00:02.01][01:03.123]你好\n[00:01]开始');
  assert.deepEqual(l.map(x=>x.time),[1000,2010,63123]);
  assert.equal(lyricIndex(l,0),-1);assert.equal(lyricIndex(l,2010),1);assert.equal(lyricIndex(l,999999),2);
});
test('formats invalid and long positions',()=>{assert.equal(time(-1),'0:00');assert.equal(time(63100),'1:03');assert.equal(time(NaN),'0:00');});
test('playback structure excludes ticks but includes errors',()=>{
  const p={queue:[{id:'1'}],index:0,playing:false,position:0};
  assert.equal(playbackKey(p),playbackKey({...p,position:1000}));assert.notEqual(playbackKey(p),playbackKey({...p,error:'failed'}));
});
test('pairs translated lyrics by timestamp and skips identical or missing lines',()=>{
  const l=lyrics('[00:01.00]Hello\n[00:02.00]World\n[00:03.00]纯音乐','[00:01.00]你好\n[00:03.00]纯音乐');
  assert.equal(l[0].translation,'你好');assert.equal(l[1].translation,undefined);assert.equal(l[2].translation,undefined);
});
