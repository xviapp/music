import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import * as model from '../app/src/main/assets/ui/model.js';

const source=readFileSync(new URL('../app/src/main/assets/ui/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');

for(const [mode,systemDark,expected] of [
  ['dark',false,'dark'],['light',true,'light'],['system',true,'dark'],['system',false,'light'],
])test(`cold start uses ${mode} theme (system dark: ${systemDark}) before revealing the homepage`,async()=>{
  const frames=[],calls=[];
  let resolveSettings;
  const settings=new Promise(resolve=>resolveSettings=resolve);
  const node={addEventListener(){},scrollTop:0};
  const context=createContext({...model,e:model.escape,isAndroid:true,
    document:{querySelector:()=>node,addEventListener(){},documentElement:{dataset:{}}},window:{},
    matchMedia:()=>({matches:systemDark,addEventListener(){}}),setTimeout:()=>0,clearTimeout(){},
    native:async(method,args)=>{
      calls.push({method,args});
      if(method==='init')return settings;
      if(method==='history')return [];
      return {};
    },api:()=>new Promise(()=>{}),control:async()=>{},frames});
  // Keep the real bootstrap and theme code; replace only the DOM renderer.
  const script=source.replace('  const focusedQuery=',
    '  frames.push(document.documentElement.dataset.theme);return;\n  const focusedQuery=');
  const startup=runInContext(`(async()=>{${script}})()`,context);
  context.window.onPlayback({queue:[],position:0,duration:0,repeat:0,shuffle:false});
  assert.equal(frames.length,0,'homepage must not paint with default light colors before saved settings arrive');
  resolveSettings({theme:mode,loggedIn:false});
  for(let i=0;i<12;i++)await Promise.resolve();
  assert.ok(frames.length>0,'the homepage shell should render without a network response');
  assert.equal(frames[0],expected,'the first homepage frame must match the native background');
  assert.ok(calls.some(call=>call.method==='uiReady'),'notify Android only after the themed shell is ready');
  // Network intentionally remains pending; it must not hold the first frame.
  void startup;
});
