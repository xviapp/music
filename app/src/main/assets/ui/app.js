import {escape as e,imageUrl,tracks,lyrics,lyricIndex,time,playbackKey} from './model.js';
import {native,api,control,isAndroid} from './native.js';

const icons={home:'M3 10 12 3l9 7v10H3Z M9 20v-7h6v7',search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',library:'M4 4v16M9 4v16M14 4l6 16',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',play:'m9 5 11 7-11 7Z',pause:'M8 5v14M16 5v14',next:'m5 5 10 7-10 7Z M19 5v14',previous:'m19 5-10 7 10 7Z M5 5v14',queue:'M3 5h18M3 11h18M3 17h12',heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',back:'m15 5-7 7 7 7',down:'m5 9 7 7 7-7',close:'m6 6 12 12M6 18 18 6',radio:'M5 8a10 10 0 0 0 0 12M19 8a10 10 0 0 1 0 12M8 11a5 5 0 0 0 0 6M16 11a5 5 0 0 1 0 6M12 13v2',repeat:'M4 8h15l-3-3M20 16H5l3 3M20 8v4M4 16v-4',shuffle:'M3 5h3l12 14h3m-4-4 4 4-4 3M3 19h3l4-5m4-4 4-5h3m-4-3 4 3-4 4',cloud:'M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13 0 5 5 0 0 1 0 10Z',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2',music:'M9 18V5l11-2v13M9 16c-7-3-7 6 0 3m11-5c-7-3-7 6 0 3',refresh:'M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 14-2M19 16A8 8 0 0 1 5 18'};
const icon=name=>`<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${icons[name]||icons.music}"/></svg>`;
icons.next='m9 5 7 7-7 7';icons.skipnext='m5 5 10 7-10 7Z M19 5v14';
icons.chart='M4 20h16M6 16V9h4v7M14 16V4h4v12';
const button=(name,action,label,extra='')=>`<button class="icon ${extra}" data-action="${action}" aria-label="${e(label)}">${icon(name==='next'&&action==='next'?'skipnext':name)}</button>`;
const art=url=>`<div class="artbox">${imageUrl(url)?`<img loading="lazy" referrerpolicy="no-referrer" src="${e(imageUrl(url))}" alt="">`:`<svg class="art" viewBox="0 0 108 108" aria-hidden="true"><path d="M45 30 77 24V69C77 82 55 85 55 73C55 65 65 62 71 65V37L45 42V78C45 91 23 94 23 82C23 74 33 71 39 74V31Z"/></svg>`}</div>`;
const loading=()=>'<div class="empty" role="status"><span class="spinner" aria-label="正在加载"><i></i><i></i><i></i></span></div>';
const app=document.querySelector('#app');
const s={page:'home',title:'音乐',stack:[],scroll:0,settings:{theme:'system',quality:'exhigh',background:true,loggedIn:false},profile:null,
  home:[],history:[],library:[],songs:[],cards:[],collection:null,detailSong:null,detailQueue:[],detailIndex:0,detailSource:'',artistInfo:null,artistTab:'hot',artistBio:null,favoriteKind:'artist',commentSong:null,comments:[],hotComments:[],commentTotal:0,suggestions:[],suggestBusy:false,suggestError:'',query:'',type:1,offset:0,more:false,trackIds:[],busy:false,error:'',
  player:false,sheet:'',lyric:false,lines:[],lyricId:'',lyricError:'',likes:new Set(),qr:'',qrStatus:'',qrKey:'',request:0,
  playback:{queue:[],index:0,playing:false,position:0,duration:0,repeat:0,shuffle:false,error:'',sleep:0}};
let qrTimer,toastTimer,pollGeneration=0,lyricRequest=0;
const pendingSubscriptions=new Set();
const artistRefs=new Map();
const entitySubscriptions=new Map(),pendingEntities=new Set();
let accountGeneration=0;
let suggestTimer,suggestGeneration=0,composingSearch=false;
function stopSuggestions(){clearTimeout(suggestTimer);suggestGeneration++;s.suggestions=[];s.suggestBusy=false;s.suggestError='';renderSuggestions();}
function suggestionMarkup(){
  if(s.suggestBusy)return '<div class="suggestion-status" role="status">正在查找建议…</div>';
  if(s.suggestError)return `<button class="suggestion-status" data-action="suggestretry">${e(s.suggestError)} · 重试</button>`;
  return s.suggestions.length?`<div class="search-suggestions" role="group" aria-label="搜索建议">${s.suggestions.map((keyword,i)=>`<button data-action="suggestion:${i}">${icon('search')}<span>${e(keyword)}</span>${icon('next')}</button>`).join('')}</div>`:'';
}
function renderSuggestions(){const node=document.querySelector('#searchsuggestions');if(node)node.innerHTML=suggestionMarkup();}
function onSearchInput(value){
  s.query=value;stopSuggestions();
  if(!composingSearch&&s.page==='search'&&value.trim()&&value.trim().length<=200)suggestTimer=setTimeout(()=>fetchSuggestions(),250);
}
async function fetchSuggestions(){
  const query=s.query.trim();if(s.page!=='search'||!query||query.length>200)return;
  const generation=++suggestGeneration;s.suggestBusy=true;s.suggestError='';renderSuggestions();
  try{
    const data=await api('/search/suggest',{keywords:query});
    if(generation!==suggestGeneration||s.page!=='search'||s.query.trim()!==query)return;
    s.suggestions=[...new Set((data.result?.allMatch||[]).map(item=>String(item.keyword||'').trim()).filter(Boolean))].slice(0,8);
  }catch(error){if(generation===suggestGeneration&&s.page==='search')s.suggestError='搜索建议暂不可用';}
  finally{if(generation===suggestGeneration){s.suggestBusy=false;renderSuggestions();}}
}
function entityKey(kind,id){return `${kind}:${id}`;}
function rememberEntity(kind,card,subscribed){
  const key=entityKey(kind,card.id),previous=entitySubscriptions.get(key);
  if(pendingEntities.has(key))return;
  entitySubscriptions.set(key,{card:{...previous?.card,...card},subscribed:typeof subscribed==='boolean'?subscribed:previous?.subscribed});
}
function entitySubscriptionButton(kind,entity){
  if(!entity?.id)return '';
  const key=entityKey(kind,entity.id),state=entitySubscriptions.get(key),pending=pendingEntities.has(key),known=typeof state?.subscribed==='boolean';
  const label=kind==='artist'?'歌手':'专辑';
  const action=known||!s.settings.loggedIn?'entitysub':'entitystatus';
  return `<button class="secondary playlist-subscribe ${state?.subscribed?'selected':''}" data-action="${action}:${kind}" aria-pressed="${Boolean(state?.subscribed)}" aria-busy="${pending}" ${pending?'disabled':''}>${pending?'<span class="spinner" aria-label="正在处理"><i></i><i></i><i></i></span>':icon('heart')}${known?(state.subscribed?'取消收藏':`收藏${label}`):s.settings.loggedIn?'查看收藏状态':`收藏${label}`}</button>`;
}
const baseRegions=new Map();
let playerElement=null,playerStateKey='',playerAnimation=null,playerTarget=false,playerOpener=null;
const current=()=>s.playback.queue[s.playback.index];
function toast(message){const box=document.querySelector('#toast');box.textContent=message;box.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.hidden=true,4500);}
function theme(){const dark=s.settings.theme==='dark'||(s.settings.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';if(isAndroid)native('appearance',{dark}).catch(()=>{});}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',theme);
function rows(list=s.songs,action='song'){return list.map((song,i)=>`<div class="song ${current()?.id===song.id?'active':''}"><button class="songcover" data-action="${action}:${i}" aria-label="查看 ${e(song.name)}">${art(song.cover)}</button><button class="songtitle" data-action="${action}:${i}" aria-label="查看 ${e(song.name)}"><b>${e(song.name)}</b><small>${e(song.artist||song.album)}</small></button>${button('play',`${action}play:${i}`,`播放 ${song.name}`)}</div>`).join('');}
function cards(list,kind='playlist'){return `<div class="covers">${list.map((card,i)=>`<button class="coverbutton" data-action="${kind}:${i}">${art(card.coverImgUrl||card.picUrl||card.img1v1Url||card.cover)}<b>${e(card.name)}</b><small>${e(card.creator?.nickname||card.artist?.name||'')}</small></button>`).join('')}</div>`;}
function empty(message,action,label='重试'){return `<div class="empty"><p>${e(message)}</p>${action?`<button class="primary" data-action="${action}">${label}</button>`:''}</div>`;}
function home(){return `<button class="searchbox" data-action="tab:search">${icon('search')}搜索歌曲、歌手、专辑</button><button class="feature" data-action="daily">${art('')}<p>每日推荐</p><h2>今天，听点不一样</h2><p>${s.settings.loggedIn?'打开为你推荐的歌曲':'登录后听每日推荐'}</p><span class="playbadge">${icon('next')}</span></button><div class="twocol"><button class="quick" data-action="fm">${icon('radio')}<span><b>私人 FM</b><small>遇见下一首喜欢</small></span></button><button class="quick" data-action="new">${icon('music')}<span><b>新歌速递</b><small>最近的新声音</small></span></button></div><button class="setting ranking-shortcut" data-action="rankings"><span class="row">${icon('chart')}排行榜</span>${icon('next')}</button><div class="section"><h2>${s.settings.loggedIn?'为你推荐':'精选歌单'}</h2>${button('refresh','refresh','刷新推荐')}</div>${s.busy?loading():s.error?empty(s.error,'refresh'):cards(s.home,'homecard')}${s.history.length?`<div class="section"><h2>最近播放</h2><button data-action="history">查看全部</button></div>${rows(s.history.slice(0,3),'recent')}`:''}`;}
function search(){return `<form id="searchform" class="searchbox">${icon('search')}<input id="query" value="${e(s.query)}" placeholder="搜索歌曲、歌手、专辑" aria-label="搜索关键词" enterkeyhint="search"><button type="submit">搜索</button></form><div id="searchsuggestions">${suggestionMarkup()}</div><div class="chips">${[[1,'单曲'],[1000,'歌单'],[100,'歌手'],[10,'专辑']].map(([id,title])=>`<button class="chip ${s.type===id?'active':''}" data-action="type:${id}">${title}</button>`).join('')}</div>${s.busy&&s.offset===0?loading():s.error?empty(s.error,'search'):!s.query.trim()?empty('输入关键词，找到想听的音乐'):s.type===1?rows()||empty('没有找到相关歌曲'):cards(s.cards,s.type===100?'artist':s.type===10?'album':'playlist')}${s.more?`<button class="loadmore" data-action="more" ${s.busy?'disabled':''}>${s.busy?'正在加载…':'加载更多'}</button>`:''}`;}
function library(){return `<button class="account" data-action="account"><span>${icon('music')}</span><span><h2>${e(s.profile?.nickname||'我的音乐')}</h2><small>${s.settings.loggedIn?'网易云音乐':'登录后同步你的音乐'}</small></span></button><div class="group">${[['heart','喜欢的音乐','likes'],['clock','最近播放','history'],['cloud','音乐云盘','cloud'],['heart','收藏的歌手','favoriteartists'],['heart','收藏的专辑','favoritealbums']].map(([i,t,a])=>`<button class="setting" data-action="${a}"><span class="row">${icon(i)}${t}</span>${icon('next')}</button>`).join('')}</div><div class="section"><h2>我的歌单</h2></div>${!s.settings.loggedIn?empty('登录后查看收藏的歌单','account','登录'):s.busy?loading():s.error?empty(s.error,'refresh'):cards(s.library,'librarycard')}${s.more?'<button class="loadmore" data-action="more">加载更多</button>':''}`;}
function settings(){return `<div class="group"><button class="setting" data-action="account"><span>网易云音乐账号<small>${e(s.profile?.nickname||(s.settings.loggedIn?'已登录':'未登录'))}</small></span>${icon('next')}</button></div><h3>播放</h3><div class="group"><button class="setting" data-action="background"><span>后台播放<small>离开应用后继续播放</small></span><span class="switch ${s.settings.background?'on':''}" role="switch" aria-checked="${s.settings.background}"></span></button><label class="setting">播放音质<select id="quality">${[['standard','标准'],['exhigh','极高'],['lossless','无损'],['hires','Hi-Res']].map(([v,t])=>`<option value="${v}" ${s.settings.quality===v?'selected':''}>${t}</option>`).join('')}</select></label><button class="setting" data-action="sleep"><span>定时关闭</span><small>${sleepLabel()}</small></button></div><h3>通用</h3><div class="group"><label class="setting">外观<select id="theme">${[['system','跟随系统'],['light','浅色'],['dark','深色']].map(([v,t])=>`<option value="${v}" ${s.settings.theme===v?'selected':''}>${t}</option>`).join('')}</select></label><button class="setting" data-action="privacy">隐私说明 ${icon('next')}</button><button class="setting" data-action="about">关于音乐 ${icon('next')}</button></div>`;}
function sleepLabel(){return s.playback.sleep===-1?'播完当前歌曲':s.playback.sleep>0?`${s.playback.sleep} 分钟`:'关闭';}
function playlistSubscribeButton(){const c=s.collection;if(c?.kind!=='playlist'||!c.detailsLoaded||(s.profile&&String(c.creatorId)===String(s.profile.userId)))return '';const pending=pendingSubscriptions.has(String(c.id));return `<button class="secondary playlist-subscribe ${c.subscribed?'selected':''}" data-action="subscribeplaylist" aria-pressed="${Boolean(c.subscribed)}" aria-busy="${pending}" ${pending?'disabled':''}>${pending?'<span class="spinner" aria-label="正在处理"><i></i><i></i><i></i></span>':icon('heart')}<span>${c.subscribed?'取消收藏':'收藏歌单'}</span></button>`;}
function songArtists(song){return artistRefs.get(song.id)||song.artists||[];}
function artistLinks(song,source){
  const list=songArtists(song);
  if(!list.length)return song.artist?`<button class="artist-link" data-action="songartist:${source}-lookup" aria-label="查看歌手">${e(song.artist)}</button>`:'';
  return list.map((a,i)=>/^\d+$/.test(a.id)&&Number(a.id)>0?`<button class="artist-link" data-action="songartist:${source}-${i}" aria-label="查看歌手 ${e(a.name)}">${e(a.name)}</button>`:`<button class="artist-link" data-action="songartist:${source}-lookup" aria-label="查看歌手 ${e(a.name)}">${e(a.name)}</button>`).join('<span class="artist-separator"> / </span>');
}
function artistPage(){
  const a=s.artistInfo;if(!a)return s.busy?loading():empty(s.error||'歌手信息不可用','artistrefresh');
  const count=[a.musicSize!=null?`${a.musicSize} 首歌曲`:'',a.albumSize!=null?`${a.albumSize} 张专辑`:''].filter(Boolean).join(' · ');
  let body='';
  if(s.artistTab==='bio'){
    const bio=s.artistBio;
    body=bio?`${bio.briefDesc?`<p class="description">${e(bio.briefDesc)}</p>`:''}${(bio.introduction||[]).map(section=>`<section class="artist-biography"><h2>${e(section.ti||'')}</h2><p class="description">${e(section.txt||'')}</p></section>`).join('')}`||empty('暂无歌手简介'):'';
  }else if(s.artistTab==='albums')body=s.cards.length?cards(s.cards,'album'):!s.busy?empty('暂无专辑'):'';
  else body=`${s.songs.length?`<div class="section"><h2>${s.artistTab==='hot'?'热门歌曲':'全部歌曲'}</h2><button class="primary" data-action="playall">${icon('play')}播放全部</button></div>${rows()}`:!s.busy?empty('暂无歌曲'):''}`;
  return `<div class="albumhead artist-head">${art(a.cover)}<h1>${e(a.name)}</h1>${count?`<small>${e(count)}</small>`:''}<div class="row collection-actions">${entitySubscriptionButton('artist',a)}</div></div><div class="chips artist-tabs" aria-label="歌手内容">${[['hot','热门歌曲'],['songs','全部歌曲'],['albums','专辑'],['bio','简介']].map(([key,label])=>`<button class="chip ${s.artistTab===key?'active':''}" data-action="artisttab:${key}" aria-pressed="${s.artistTab===key}">${label}</button>`).join('')}</div>${s.error?empty(s.error,'artistrefresh'):body}${s.busy?loading():''}${s.more&&!s.error?'<button class="loadmore" data-action="more">加载更多</button>':''}`;
}
function collection(){return `${s.collection?`<div class="albumhead">${art(s.collection.cover)}<h1>${e(s.collection.name)}</h1><small>${e(s.collection.subtitle||`${s.songs.length} 首歌曲`)}</small><div class="row collection-actions"><button class="primary" data-action="playall" ${!s.songs.length?'disabled':''}>${icon('play')} 播放全部</button>${playlistSubscribeButton()}${s.collection.kind==='album'?entitySubscriptionButton('album',s.collection):''}${button('queue','queue','播放队列')}</div></div>`:''}${s.error?empty(s.error,'refresh'):s.busy&&!s.songs.length?loading():rows()||empty('这里还没有歌曲')}${s.more?`<button class="loadmore" data-action="more" ${s.busy?'disabled':''}>${s.busy?'正在加载…':'加载更多'}</button>`:''}`;}
function account(){return s.settings.loggedIn?`<div class="account">${icon('music')}<div><h2>${e(s.profile?.nickname||'已登录')}</h2><small>网易云音乐</small></div></div><div class="group"><button class="setting" data-action="logoutconfirm">退出登录 ${icon('next')}</button></div>`:`<div class="qr-login"><h2>登录网易云音乐</h2><p class="description">打开官方页面登录，完成后返回即可。</p><button class="primary wide" data-action="official-login">打开官方登录</button><div class="login-divider"><span>或</span></div>${s.busy?loading():s.qr?`<img class="qr" src="${e(s.qr)}" alt="网易云音乐登录二维码">`:''}<div class="empty qr-actions"><p id="qrstatus">${e(s.qrStatus||s.error||'')}</p><button class="secondary wide" data-action="qr">${s.qr?'刷新二维码':'使用扫码登录'}</button></div></div>`;}
function songDetail(){const song=s.detailSong;if(!song)return empty('歌曲信息不可用');return `<div class="albumhead song-detail">${art(song.cover)}<h1>${e(song.name)}</h1><div class="description artist-links">${artistLinks(song,'detail')}</div>${song.album?`<small>${e(song.album)}</small>`:''}${song.duration?`<small class="song-duration">${time(song.duration)}</small>`:''}<div class="song-detail-actions"><button class="primary wide" data-action="playdetail">${icon('play')}播放这首歌</button><button class="secondary wide" data-action="queueadd">${icon('queue')}加入播放队列</button><button class="secondary wide ${s.likes.has(song.id)?'selected':''}" data-action="likedetail" aria-pressed="${s.likes.has(song.id)}">${icon('heart')}${s.likes.has(song.id)?'取消喜欢':'喜欢这首歌'}</button><button class="secondary wide" data-action="comments:detail">歌曲评论</button></div></div>`;}
function content(){switch(s.page){case'home':return home();case'search':return search();case'library':return library();case'settings':return settings();case'collection':return collection();case'account':return account();case'privacy':return '<h2>隐私说明</h2><p class="description">搜索、推荐、账号和播放请求由设备直接发送至网易云音乐。专辑封面与音频从接口返回的地址加载，不经过另设的音乐代理服务器。</p><p class="description">登录凭证使用 Android Keystore 加密后保存在本机，不交给界面脚本。最近播放、播放队列及设置保存在本机；退出登录会清除账号、播放队列与最近播放。</p><p class="description">应用不上传通讯录或本地文件，不集成广告与统计 SDK。播放权限由音乐服务与账号决定。</p>';case'about':return '<h2>音乐 0.1.0</h2><p class="description">Android 音乐播放器</p><p class="description">接口实现参考 NeteaseCloudMusicApiEnhanced（MIT），功能组织参考 YesPlayMusic。音频播放使用 AndroidX Media3；二维码由 ZXing 生成。</p><button class="primary" data-action="license">开源许可</button>';case'license':return `<p class="description">${e('NeteaseCloudMusicApiEnhanced\nCopyright (c) 2013-2022 Binaryify\n\nThe MIT License (MIT)\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.')}</p>`;default:return '';}}
function player(){const song=current();if(!song)return '';return `<section class="overlay" aria-label="正在播放"><header class="header">${button('down','closeplayer','收起播放器')}<small>正在播放</small>${button('queue','queue','播放队列')}</header><div class="content">${s.lyric?`<div class="lyrics" id="lyrics">${s.lines.length?s.lines.map((l,i)=>`<button data-action="lyricseek:${i}" data-line="${i}">${e(l.text)}</button>`).join(''):empty(s.lyricError||'暂无歌词')}</div>`:`<div class="playercover">${art(song.cover)}</div>`}<div class="nowtitle"><div><h1>${e(song.name)}</h1><div class="artist-links">${artistLinks(song,'current')}</div></div>${button('heart','like',s.likes.has(song.id)?'取消喜欢':'喜欢',s.likes.has(song.id)?'liked':'')}</div><input id="seek" class="progress" type="range" min="0" max="${Math.max(1,s.playback.duration)}" value="${s.playback.position}" aria-label="播放进度"><div class="times"><span id="elapsed">${time(s.playback.position)}</span><span id="duration">${time(s.playback.duration)}</span></div>${s.playback.error?`<p class="description error" role="alert">${e(s.playback.error)}</p>`:''}<div class="controls">${button('repeat','repeat',['顺序播放','单曲循环','列表循环'][s.playback.repeat])}${button('previous','previous','上一首')}<button class="bigplay" data-action="toggle" aria-label="${s.playback.playing?'暂停':'播放'}">${s.playback.buffering?'<span class="spinner"><i></i><i></i><i></i></span>':icon(s.playback.playing?'pause':'play')}</button>${button('next','next','下一首')}${button('shuffle','shuffle','随机播放',s.playback.shuffle?'liked':'')}</div><div class="row between"><button data-action="lyrics">${s.lyric?'封面':'歌词'}</button><button data-action="comments:current">评论</button><button data-action="sleep">定时</button></div></div></section>`;}
function sheet(){return `<div class="scrim" data-dismiss="sheet"><section class="sheet" role="dialog" aria-modal="true" aria-label="${s.sheet==='queue'?'播放队列':s.sheet==='sleep'?'定时关闭':'退出登录'}"><div class="handle"></div><div class="section"><h2>${s.sheet==='queue'?`播放队列 · ${s.playback.queue.length} 首`:s.sheet==='sleep'?'定时关闭':'退出登录'}</h2>${button('close','closesheet','关闭')}</div>${s.sheet==='queue'?s.playback.queue.map((song,i)=>`<div class="song ${i===s.playback.index?'active':''}"><button class="songtitle" data-action="queuedetail:${i}" aria-label="查看 ${e(song.name)}"><b>${e(song.name)}</b><small>${e(song.artist)}</small></button>${button('play',`jump:${i}`,`播放 ${song.name}`)}${button('close',`remove:${i}`,`移除 ${song.name}`)}</div>`).join('')||empty('播放队列为空'):s.sheet==='sleep'?[0,15,30,60,-1].map(n=>`<button class="setting" data-action="sleepvalue:${n}">${n===0?'关闭':n===-1?'播完当前歌曲':`${n} 分钟`}</button>`).join(''):'<p class="description">退出后清除本机账号、播放队列与最近播放。</p><button class="primary" data-action="logout">退出登录</button>'}</section></div>`;}
function render(){
  const focusedQuery=s.page==='search'&&document.activeElement?.id==='query'?{start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}:null;
  const oldScroll=document.querySelector('main.content')?.scrollTop||0;
  const sub=!['home','search','library','settings'].includes(s.page);const song=current();
  app.dataset.subpage=String(sub);
  const markup={
    header:`<header class="header"><div class="row">${sub?button('back','back','返回'):''}<h1>${e(s.title)}</h1></div>${s.page==='search'?'':button('search','tab:search','搜索')}</header>`,
    content:`<main class="content">${s.page==='songdetail'?songDetail():s.page==='artistpage'?artistPage():s.page==='favorites'?favoritesPage():s.page==='rankings'?rankingsPage():s.page==='comments'?commentsPage():content()}</main>`,
    mini:song?`<div class="mini">${art(song.cover)}<button class="songtitle" data-action="player"><b>${e(song.name)}</b><small>${e(s.playback.error?'播放失败，点此重试':s.playback.buffering?'正在缓冲…':song.artist)}</small></button>${button(s.playback.playing?'pause':'play','toggle',s.playback.playing?'暂停':'播放')}${button('queue','queue','播放队列')}</div>`:'',
    nav:`<nav class="nav" aria-label="主导航">${[['home','发现','home'],['search','搜索','search'],['library','音乐库','library'],['settings','设置','settings']].map(([id,t,i])=>`<button class="${s.page===id?'active':''}" data-action="tab:${id}">${icon(i)}${t}</button>`).join('')}</nav>`,
  };
  if(!baseRegions.size)app.replaceChildren();
  for(const [name,html] of Object.entries(markup)){
    const previous=baseRegions.get(name);
    if(previous?.html===html)continue;
    const node=html?elementFrom(html):null;
    if(previous?.node)previous.node.remove();
    baseRegions.set(name,{html,node});
    if(node){const following=Object.keys(markup).slice(Object.keys(markup).indexOf(name)+1).map(key=>baseRegions.get(key)?.node).find(element=>element?.isConnected);app.insertBefore(node,following||playerElement||app.querySelector('.scrim'));}
  }
  document.querySelector('main.content').scrollTop=oldScroll;
  renderPlayer();
  const oldSheet=app.querySelector('.scrim');
  const sheetScroll=oldSheet?.querySelector('.sheet')?.scrollTop||0;
  const sheetHTML=s.sheet?sheet():'';
  if(oldSheet?.dataset.markup!==sheetHTML){oldSheet?.remove();if(sheetHTML){const node=elementFrom(sheetHTML);node.dataset.markup=sheetHTML;app.append(node);node.querySelector('.sheet').scrollTop=sheetScroll;}}
  lockBackground();
  if(focusedQuery){const query=document.querySelector('#query');if(query&&!query.inert){query.focus({preventScroll:true});query.setSelectionRange(focusedQuery.start,focusedQuery.end);}}
  updatePosition(false);
}
function elementFrom(html){const template=document.createElement('template');template.innerHTML=html;return template.content.firstElementChild;}
function lockBackground(){for(const {node} of baseRegions.values())if(node)node.inert=Boolean(playerElement||s.sheet);if(playerElement)playerElement.inert=Boolean(s.sheet||!s.player);}
function renderPlayer(){
  if(!s.player||!current()){if(playerElement&&playerTarget)transitionPlayer(false);return;}
  if(!playerElement){
    playerOpener=document.activeElement;
    playerElement=elementFrom(player());playerElement.setAttribute('role','dialog');playerElement.setAttribute('aria-modal','true');playerElement.tabIndex=-1;
    playerElement.style.transform='translateY(100%)';app.insertBefore(playerElement,app.querySelector('.scrim'));playerStateKey='';
  }
  const key=JSON.stringify([playbackKey(s.playback),current(),songArtists(current()),s.lyric,s.lines,s.lyricError,s.likes.has(current().id)]);
  if(key!==playerStateKey){
    const scroll=playerElement.querySelector('.content')?.scrollTop||0;
    const lyricScroll=playerElement.querySelector('#lyrics')?.scrollTop||0;
    const cover=playerElement.querySelector('.playercover');
    const next=elementFrom(player());const nextCover=next.querySelector('.playercover');
    if(cover&&nextCover&&cover.innerHTML===nextCover.innerHTML)nextCover.replaceWith(cover);
    playerElement.replaceChildren(...next.childNodes);playerStateKey=key;
    playerElement.querySelector('.content').scrollTop=scroll;
    const lyricBox=playerElement.querySelector('#lyrics');if(lyricBox)lyricBox.scrollTop=lyricScroll;
  }
  if(!playerTarget)transitionPlayer(true);
}
function transitionPlayer(open){
  const node=playerElement;if(!node)return;
  const from=getComputedStyle(node).transform;
  playerAnimation?.cancel();playerAnimation=null;playerTarget=open;
  node.style.transform=from;node.classList.add('player-transition');
  const finish=()=>{
    if(node!==playerElement||playerTarget!==open)return;
    node.classList.remove('player-transition');node.style.transform=open?'translateY(0)':'translateY(100%)';
    if(open){if(!node.contains(document.activeElement))node.querySelector('[data-action="closeplayer"]')?.focus({preventScroll:true});}
    else{node.remove();playerElement=null;playerStateKey='';lockBackground();if(!s.sheet){const opener=playerOpener?.isConnected?playerOpener:app.querySelector('[data-action="player"]');opener?.focus({preventScroll:true});}playerOpener=null;}
  };
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||typeof node.animate!=='function'){finish();return;}
  const animation=node.animate([{transform:from},{transform:open?'translateY(0)':'translateY(100%)'}],{duration:open?280:220,easing:open?'cubic-bezier(.2,.8,.2,1)':'cubic-bezier(.4,0,.8,.2)',fill:'both'});
  playerAnimation=animation;
  animation.finished.then(()=>{if(playerAnimation!==animation)return;playerAnimation=null;finish();animation.cancel();}).catch(()=>{});
}
function updatePosition(scroll=true){const seek=document.querySelector('#seek');if(seek&&document.activeElement!==seek){seek.max=Math.max(1,s.playback.duration);seek.value=s.playback.position;}const elapsed=document.querySelector('#elapsed');if(elapsed)elapsed.textContent=time(s.playback.position);const duration=document.querySelector('#duration');if(duration)duration.textContent=time(s.playback.duration);const active=lyricIndex(s.lines,s.playback.position);const old=document.querySelector('#lyrics .active');const next=document.querySelector(`[data-line="${active}"]`);if(old!==next){old?.classList.remove('active');next?.classList.add('active');if(scroll&&next){const box=document.querySelector('#lyrics');box.scrollTo({top:next.offsetTop-box.offsetTop-box.clientHeight/2+next.clientHeight/2,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}}}
window.onPlayback=p=>{const changed=playbackKey(p)!==playbackKey(s.playback);const before=current()?.id;s.playback=p;if(!current())s.player=false;if(changed)render();else updatePosition();if(before!==current()?.id&&s.lyric)loadLyrics();};
window.onNativeError=toast;
window.onOfficialLogin=async state=>{if(!state?.loggedIn)return;s.settings=state;s.qr='';s.qrStatus='';s.error='';stopQr();try{await session();toast('登录成功');}catch(error){toast(error.message);}render();};
function stopQr(){clearTimeout(qrTimer);pollGeneration++;}
function navigate(page,title){stopQr();stopSuggestions();composingSearch=false;s.stack.push({page:s.page,title:s.title,songs:s.songs,cards:s.cards,collection:s.collection,detailSong:s.detailSong,detailQueue:s.detailQueue,detailIndex:s.detailIndex,detailSource:s.detailSource,artistInfo:s.artistInfo,artistTab:s.artistTab,artistBio:s.artistBio,favoriteKind:s.favoriteKind,commentSong:s.commentSong,comments:s.comments,hotComments:s.hotComments,commentTotal:s.commentTotal,offset:s.offset,more:s.more,trackIds:s.trackIds,scroll:document.querySelector('main.content')?.scrollTop||0});s.page=page;s.title=title;s.error='';s.busy=false;s.request++;s.more=false;s.offset=0;s.songs=[];s.cards=[];s.trackIds=[];s.collection=null;s.artistInfo=null;s.artistTab='hot';s.artistBio=null;render();document.querySelector('main.content').scrollTop=0;}
function back(){stopSuggestions();composingSearch=false;if(s.sheet){s.sheet='';render();return true;}if(s.player||playerElement){s.player=false;render();return true;}if(s.stack.length){stopQr();s.request++;Object.assign(s,s.stack.pop(),{busy:false,error:''});render();document.querySelector('main.content').scrollTop=s.scroll;return true;}if(s.page!=='home'){tab('home');return true;}return false;}
window.musicBack=back;
async function load(job){const request=++s.request;s.busy=true;s.error='';render();try{const update=await job();if(request===s.request&&update)Object.assign(s,update);}catch(error){if(request===s.request)s.error=error.message;}finally{if(request===s.request){s.busy=false;render();}}}
async function loadHome(){await load(async()=>{const [data,history]=await Promise.all([api(s.settings.loggedIn?'/recommend/resource':'/top/playlist',{limit:18}),native('history')]);return {home:data.recommend||data.playlists||[],history};});}
async function session(){if(!s.settings.loggedIn)return;const data=await api('/login/status');s.profile=data.data?.profile||null;if(!s.profile){s.settings.loggedIn=false;return;}const likes=await api('/likelist',{uid:s.profile.userId});s.likes=new Set((likes.ids||[]).map(String));}
async function loadLibrary(more=false){if(!s.settings.loggedIn){render();return;}await load(async()=>{if(!s.profile)await session();if(!s.profile)throw new Error('登录已过期，请重新登录');const offset=more?s.offset+30:0;const data=await api('/user/playlist',{uid:s.profile.userId,offset,limit:30});return {library:more?[...s.library,...(data.playlist||[])]:data.playlist||[],offset,more:data.more===true};});}
async function tab(page){stopQr();stopSuggestions();composingSearch=false;s.stack=[];s.request++;s.page=page;s.title={home:'音乐',search:'搜索',library:'音乐库',settings:'设置'}[page];s.error='';s.busy=false;s.more=false;s.offset=0;s.songs=[];s.cards=[];s.artistInfo=null;s.artistBio=null;render();document.querySelector('main.content').scrollTop=0;if(page==='home')await loadHome();if(page==='library')await loadLibrary();}
async function searchMore(more=false){stopSuggestions();if(!s.query.trim())return;await load(async()=>{const offset=more?s.offset+30:0;const data=await api('/cloudsearch',{keywords:s.query.trim(),type:s.type,limit:30,offset});const result=data.result||{};const list=s.type===1?tracks(result.songs):s.type===1000?result.playlists||[]:s.type===100?result.artists||[]:result.albums||[];return {songs:s.type===1?(more?[...s.songs,...list]:list):[],cards:s.type===1?[]:(more?[...s.cards,...list]:list),offset,more:offset+list.length<(result.songCount||result.playlistCount||result.artistCount||result.albumCount||0)};});}
async function openPlaylist(card){navigate('collection','歌单');const collection={id:card.id,name:card.name,cover:imageUrl(card.coverImgUrl||card.picUrl),kind:'playlist'};s.collection=collection;await load(async()=>{const result=await api('/playlist/detail',{id:card.id});const playlist=result.playlist;const ids=(playlist.trackIds||[]).map(x=>String(x.id));const first=ids.slice(0,50);const songs=first.length?tracks((await api('/song/detail',{ids:first.join(',')})).songs):tracks(playlist.tracks);return {trackIds:ids,songs,offset:0,more:ids.length>songs.length,collection:{...collection,name:playlist.name||collection.name,cover:imageUrl(playlist.coverImgUrl)||collection.cover,subtitle:`${playlist.trackCount||ids.length} 首歌曲`,subscribed:playlist.subscribed===true,creatorId:playlist.creator?.userId,detailsLoaded:true,card:{id:card.id,name:playlist.name||card.name,coverImgUrl:playlist.coverImgUrl||card.coverImgUrl,creator:playlist.creator,subscribed:playlist.subscribed===true}}};});}
async function togglePlaylistSubscription(){
  const collection=s.collection;
  if(collection?.kind!=='playlist'||!collection.detailsLoaded||pendingSubscriptions.has(String(collection.id)))return;
  if(!requireLogin())return;
  const id=String(collection.id);pendingSubscriptions.add(id);render();
  try{
    if(!s.profile)await session();
    if(!s.settings.loggedIn||!s.profile)throw new Error('登录已过期，请重新登录');
    if(String(collection.creatorId)===String(s.profile.userId))return;
    const subscribed=!collection.subscribed;
    await api('/playlist/subscribe',{id:collection.id,t:subscribed?1:2});
    const update=c=>c?.kind==='playlist'&&String(c.id)===id?{...c,subscribed,card:{...c.card,subscribed}}:c;
    s.collection=update(s.collection);
    for(const entry of s.stack)entry.collection=update(entry.collection);
    for(const list of [s.home,s.cards,s.library])for(const card of list)if(String(card.id)===id)card.subscribed=subscribed;
    if(subscribed){if(!s.library.some(card=>String(card.id)===id))s.library.unshift({...collection.card,subscribed:true});}
    else s.library=s.library.filter(card=>String(card.id)!==id);
    toast(subscribed?'已收藏歌单':'已取消收藏');
  }finally{pendingSubscriptions.delete(id);render();}
}
async function simpleCollection(name,kind,route,params={}){navigate('collection',name);s.collection={name,kind,route,params};await load(async()=>{const data=await api(route,params);const raw=kind==='daily'?data.data?.dailySongs:kind==='artist'?data.hotSongs:kind==='album'?data.songs:data.data;const songs=tracks(raw);return {songs,more:kind==='cloud'&&(data.hasMore===true||data.count>songs.length),collection:{...s.collection,cover:songs[0]?.cover}};});}
async function openArtist(artist){
  if(!artist||!/^\d+$/.test(String(artist.id))||Number(artist.id)<=0)throw new Error('歌手信息不可用');
  s.player=false;s.sheet='';navigate('artistpage','歌手');
  s.artistInfo={id:String(artist.id),name:artist.name||'歌手',cover:imageUrl(artist.picUrl||artist.img1v1Url)};
  await loadArtistPane();
}
async function openAlbum(card){
  if(!card)return;
  navigate('collection','专辑');const album={id:String(card.id),name:card.name,kind:'album',cover:imageUrl(card.picUrl||card.cover),route:'/album',params:{id:card.id}};s.collection=album;
  const generation=accountGeneration,key=entityKey('album',card.id),statusBefore=entitySubscriptions.get(key);
  await load(async()=>{
    const data=await api('/album',{id:card.id}),info=data.album||card;
    const collection={...album,name:info.name||album.name,cover:imageUrl(info.picUrl)||album.cover,card:{...info,id:album.id}};
    if(generation===accountGeneration&&entitySubscriptions.get(key)===statusBefore)rememberEntity('album',collection.card,undefined);
    return {songs:tracks(data.songs),collection};
  });
  if(s.page==='collection'&&s.collection?.kind==='album'&&s.collection.id===album.id&&s.settings.loggedIn)await refreshEntityStatus('album',false);
}
async function refreshEntityStatus(kind,showError=true){
  const entity=kind==='artist'?s.artistInfo:s.collection;if(!entity?.id||!requireLogin())return;
  const key=entityKey(kind,entity.id);if(pendingEntities.has(key))return;
  pendingEntities.add(key);render();const generation=accountGeneration;
  try{
    const data=await api(kind==='artist'?'/artists':'/album/detail/dynamic',{id:entity.id});
    const status=kind==='artist'?data.artist?.followed:data.isSub;
    if(typeof status!=='boolean')throw new Error('未取得收藏状态，请重试');
    if(generation===accountGeneration)entitySubscriptions.set(key,{card:kind==='artist'?{...entity,...data.artist}:entity.card||entity,subscribed:status});
  }catch(error){if(showError)throw error;}
  finally{pendingEntities.delete(key);render();}
}
async function toggleEntitySubscription(kind){
  const entity=kind==='artist'?s.artistInfo:s.collection;if(!entity?.id||!requireLogin())return;
  const key=entityKey(kind,entity.id),state=entitySubscriptions.get(key);if(pendingEntities.has(key))return;
  if(typeof state?.subscribed!=='boolean'){await refreshEntityStatus(kind);return;}
  pendingEntities.add(key);render();const generation=accountGeneration,subscribed=!state.subscribed;
  try{
    await api(`/${kind}/sub`,{id:entity.id,t:subscribed?1:2});
    if(generation!==accountGeneration)return;
    entitySubscriptions.set(key,{...state,subscribed});
    const update=entry=>{
      if(entry.page!=='favorites'||entry.favoriteKind!==kind)return;
      entry.cards=entry.cards.filter(card=>String(card.id)!==String(entity.id));
      if(subscribed)entry.cards.unshift({...state.card,id:entity.id});
    };
    update(s);for(const entry of s.stack)update(entry);
    toast(subscribed?'已收藏':'已取消收藏');
  }finally{pendingEntities.delete(key);render();}
}
async function openFavorites(kind){if(!requireLogin())return;navigate('favorites',kind==='artist'?'收藏的歌手':'收藏的专辑');s.favoriteKind=kind;await loadFavorites();}
async function loadFavorites(append=false){
  const kind=s.favoriteKind,offset=append?s.offset+30:0,previous=append?[...s.cards]:[],generation=accountGeneration;
  const statusesBefore=new Map(entitySubscriptions);
  await load(async()=>{
    const data=await api(`/${kind}/sublist`,{limit:30,offset}),list=Array.isArray(data.data)?data.data:[];
    if(generation!==accountGeneration)return;
    for(const card of list){const key=entityKey(kind,card.id);if(entitySubscriptions.get(key)===statusesBefore.get(key))rememberEntity(kind,card,true);}
    return {cards:[...previous,...list],offset,more:typeof data.hasMore==='boolean'?data.hasMore:typeof data.more==='boolean'?data.more:list.length===30};
  });
}
function favoritesPage(){return s.error?empty(s.error,'favoritesrefresh'):s.busy&&!s.cards.length?loading():`${s.cards.length?cards(s.cards,s.favoriteKind==='artist'?'artist':'album'):empty('还没有收藏')} ${s.busy&&s.cards.length?loading():''}${s.more?`<button class="loadmore" data-action="more" ${s.busy?'disabled':''}>加载更多</button>`:''}`;}
async function openRankings(){navigate('rankings','排行榜');await loadRankings();}
async function loadRankings(){await load(async()=>{const data=await api('/toplist');return {cards:Array.isArray(data.list)?data.list:[]};});}
function rankingsPage(){return s.busy?loading():s.error?empty(s.error,'rankingsrefresh'):s.cards.length?`<div class="rankings">${s.cards.map((card,i)=>`<button class="ranking-entry" data-action="ranking:${i}">${art(card.coverImgUrl)}<span class="ranking-title"><b>${e(card.name)}</b><small>${e(card.updateFrequency||'')}</small></span>${icon('next')}</button>`).join('')}</div>`:empty('暂无排行榜');}
async function openComments(source){
  const song=source==='current'?current():s.detailSong;if(!song)return;
  s.player=false;s.sheet='';navigate('comments','歌曲评论');s.commentSong={...song};s.comments=[];s.hotComments=[];s.commentTotal=0;
  await loadComments();
}
async function loadComments(append=false){
  const song=s.commentSong;if(!song)return;
  const offset=append?s.offset+20:0,previous=append?[...s.comments]:[],hot=append?s.hotComments:[];
  const cursor=offset>=5000?Number(previous.at(-1)?.time)||0:0;
  await load(async()=>{
    const data=await api('/comment/music',{id:song.id,limit:20,offset:cursor?0:offset,before:cursor});
    const next=Array.isArray(data.comments)?data.comments:[],seen=new Set(previous.map(c=>String(c.commentId)));
    const unique=next.filter(c=>{const id=String(c.commentId);if(seen.has(id))return false;seen.add(id);return true;});
    return {comments:[...previous,...unique],hotComments:append?hot:Array.isArray(data.hotComments)?data.hotComments:[],commentTotal:Math.max(0,Number(data.total)||0),offset,more:next.length>0&&(typeof data.more==='boolean'?data.more:offset+next.length<Number(data.total))};
  });
}
function commentRows(list){return list.map(c=>{
  const date=new Date(Number(c.time)),when=Number(c.time)>0&&Number.isFinite(date.getTime())?date.toLocaleDateString('zh-CN'):'';
  const reply=c.beReplied?.[0];
  return `<article class="comment-entry"><div class="comment-avatar">${art(c.user?.avatarUrl)}</div><div class="comment-body"><div class="comment-meta"><b>${e(c.user?.nickname||'网易云用户')}</b><small>${e(when)}</small></div><p>${e(c.content||'')}</p>${reply?`<blockquote>${e(reply.user?.nickname||'网易云用户')}：${e(reply.content||'该评论已删除')}</blockquote>`:''}<small class="comment-likes">赞 ${Math.max(0,Number(c.likedCount)||0)}</small></div></article>`;
}).join('');}
function commentsPage(){
  const song=s.commentSong;
  return `${song?`<div class="comments-song">${art(song.cover)}<div><h2>${e(song.name)}</h2><small>${e(song.artist)}</small></div></div>`:''}${s.hotComments.length?`<div class="section"><h2>热门评论</h2></div>${commentRows(s.hotComments)}`:''}<div class="section"><h2>最新评论${s.commentTotal?` · ${s.commentTotal}`:''}</h2></div>${s.comments.length?commentRows(s.comments):!s.busy&&!s.error?empty('还没有评论'):''}${s.error?empty(s.error,s.comments.length?'commentsmore':'commentsrefresh'):''}${s.busy?loading():''}${s.more&&!s.error?`<button class="loadmore" data-action="more" ${s.busy?'disabled':''}>加载更多</button>`:''}`;
}
async function loadArtistPane(append=false){
  const artist=s.artistInfo,tab=s.artistTab;if(!artist)return;
  const generation=accountGeneration,key=entityKey('artist',artist.id),statusBefore=entitySubscriptions.get(key);
  const offset=append?s.offset+30:0,oldSongs=append?[...s.songs]:[],oldCards=append?[...s.cards]:[];
  if(!append){s.songs=[];s.cards=[];s.more=false;s.offset=0;}
  await load(async()=>{
    if(tab==='hot'){
      const data=await api('/artists',{id:artist.id}),info=data.artist||{};
      if(generation===accountGeneration&&entitySubscriptions.get(key)===statusBefore)rememberEntity('artist',{...artist,...info,id:artist.id},info.followed);
      return {songs:tracks(data.hotSongs),more:false,artistInfo:{...artist,...info,id:artist.id,cover:imageUrl(info.picUrl||info.img1v1Url)||artist.cover}};
    }
    if(tab==='bio'){
      const data=await api('/artist/desc',{id:artist.id});
      return {artistBio:{briefDesc:data.briefDesc||artist.briefDesc||'',introduction:Array.isArray(data.introduction)?data.introduction:[]},more:false};
    }
    const data=await api(tab==='albums'?'/artist/album':'/artist/songs',{id:artist.id,limit:30,offset});
    const list=tab==='albums'?data.hotAlbums||[]:tracks(data.songs);
    return {songs:tab==='songs'?[...oldSongs,...list]:[],cards:tab==='albums'?[...oldCards,...list]:[],offset,more:typeof data.more==='boolean'?data.more:list.length===30};
  });
}
async function openSongArtist(value){
  const [source,index]=value.split('-'),song=source==='current'?current():s.detailSong;
  if(!song)return;
  if(index!=='lookup'){const artist=songArtists(song)[Number(index)];if(artist)await openArtist(artist);return;}
  const request=s.request,id=song.id;
  const data=await api('/song/detail',{ids:id}),detail=tracks(data.songs).find(item=>item.id===id);
  if(request!==s.request||(source==='current'?(!s.player||current()?.id!==id):(s.page!=='songdetail'||s.detailSong?.id!==id)))return;
  const artists=(detail?.artists||[]).filter(a=>/^\d+$/.test(a.id)&&Number(a.id)>0);
  if(!artists.length)throw new Error('暂无歌手信息');
  artistRefs.set(id,artists);render();
  if(artists.length===1)await openArtist(artists[0]);
}
async function more(){if(s.busy)return;if(s.page==='comments'){await loadComments(true);return;}if(s.page==='favorites'){await loadFavorites(true);return;}if(s.page==='artistpage'){await loadArtistPane(true);return;}if(s.page==='search'){await searchMore(true);return;}if(s.page==='library'){await loadLibrary(true);return;}await load(async()=>{if(s.collection?.kind==='cloud'){const offset=s.offset+30;const data=await api('/user/cloud',{limit:30,offset});const next=tracks(data.data);return {songs:[...s.songs,...next],offset,more:data.hasMore===true||data.count>offset+next.length};}const offset=s.songs.length;const ids=s.trackIds.slice(offset,offset+50);if(!ids.length)return {more:false};const next=tracks((await api('/song/detail',{ids:ids.join(',')})).songs);return {songs:[...s.songs,...next],more:offset+ids.length<s.trackIds.length};});}
function requireLogin(){if(s.settings.loggedIn)return true;s.player=false;navigate('account','账号');return false;}
async function start(list,index=0,fm=false){if(!list.length)return;await control('queue',{songs:list,index,fm});s.player=true;render();}
function viewSong(list,index,source=''){const song=list[index];if(!song)return;const queue=[...list];s.sheet='';s.player=false;navigate('songdetail','歌曲');s.detailSong=song;s.detailQueue=queue;s.detailIndex=index;s.detailSource=source;render();}
async function likeSong(song){if(!song||!requireLogin())return;const like=!s.likes.has(song.id);await api('/like',{id:song.id,like});like?s.likes.add(song.id):s.likes.delete(song.id);render();toast(like?'已加入喜欢':'已取消喜欢');}
async function loadLyrics(){const id=current()?.id;if(!id||s.lyricId===id)return;const token=++lyricRequest;s.lyricId=id;s.lines=[];s.lyricError='正在加载歌词…';render();try{const data=await api('/lyric',{id});if(token!==lyricRequest)return;s.lines=lyrics(data.lrc?.lyric||'');s.lyricError='暂无歌词';}catch(error){if(token!==lyricRequest)return;s.lyricError=error.message;s.lyricId='';}render();updatePosition();}
async function qr(){stopQr();const generation=pollGeneration;s.qr='';s.qrStatus='';await load(async()=>{const result=await api('/login/qr/key');const key=result.data?.unikey;if(!key)throw new Error('未取得登录二维码，请重试');const image=await native('qr',{key});if(generation!==pollGeneration)return {};s.qrKey=key;return {qr:image.image,qrStatus:'等待扫码'};});if(generation!==pollGeneration||!s.qr)return;const expires=Date.now()+150000;const poll=async()=>{if(generation!==pollGeneration||s.page!=='account')return;if(Date.now()>expires){s.qrStatus='二维码已过期，请刷新';render();return;}try{const result=await api('/login/qr/check',{key:s.qrKey});if(generation!==pollGeneration)return;if(result.code===803){s.settings=await native('init');await session();stopQr();s.qr='';toast('登录成功');render();return;}s.qrStatus={800:'二维码已过期，请刷新',801:'等待扫码',802:'已扫码，请在网易云音乐中确认'}[result.code]||'等待确认';const status=document.querySelector('#qrstatus');if(status)status.textContent=s.qrStatus;if(result.code===800)return;}catch(error){s.qrStatus=error.message;const status=document.querySelector('#qrstatus');if(status)status.textContent=s.qrStatus;}qrTimer=setTimeout(poll,2500);};qrTimer=setTimeout(poll,2500);}
async function action(name,value){
  switch(name){
    case'tab':await tab(value);break;
    case'back':back();break;
    case'refresh':if(s.page==='home')await loadHome();else if(s.page==='library')await loadLibrary();else if(s.page==='collection'){const c=s.collection;back();if(c.kind==='playlist')await openPlaylist({id:c.id,name:c.name,coverImgUrl:c.cover});else if(c.kind==='album')await openAlbum({id:c.id,name:c.name,picUrl:c.cover});else if(c.kind==='likes')await action('likes');else await simpleCollection(c.name,c.kind,c.route,c.params);}break;
    case'homecard':await openPlaylist(s.home[Number(value)]);break;
    case'librarycard':await openPlaylist(s.library[Number(value)]);break;
    case'playlist':await openPlaylist(s.cards[Number(value)]);break;
    case'subscribeplaylist':await togglePlaylistSubscription();break;
    case'entitysub':if(['artist','album'].includes(value))await toggleEntitySubscription(value);break;
    case'entitystatus':if(['artist','album'].includes(value))await refreshEntityStatus(value);break;
    case'favoriteartists':await openFavorites('artist');break;
    case'favoritealbums':await openFavorites('album');break;
    case'favoritesrefresh':await loadFavorites();break;
    case'rankings':await openRankings();break;
    case'rankingsrefresh':await loadRankings();break;
    case'ranking':await openPlaylist(s.cards[Number(value)]);break;
    case'comments':await openComments(value);break;
    case'commentsrefresh':await loadComments();break;
    case'commentsmore':await loadComments(true);break;
    case'artist':await openArtist(s.cards[Number(value)]);break;
    case'album':await openAlbum(s.cards[Number(value)]);break;
    case'songartist':await openSongArtist(value);break;
    case'artisttab':if(['hot','songs','albums','bio'].includes(value)&&s.artistInfo){s.artistTab=value;await loadArtistPane();document.querySelector('main.content').scrollTop=0;}break;
    case'artistrefresh':await loadArtistPane();break;
    case'daily':if(requireLogin())await simpleCollection('每日推荐','daily','/recommend/songs');break;
    case'new':await simpleCollection('新歌速递','new','/top/song');break;
    case'fm':if(requireLogin())await simpleCollection('私人 FM','fm','/personal_fm');break;
    case'cloud':if(requireLogin())await simpleCollection('音乐云盘','cloud','/user/cloud',{limit:30});break;
    case'likes':if(requireLogin()){navigate('collection','喜欢的音乐');s.collection={name:'喜欢的音乐',kind:'likes'};await load(async()=>{await session();const ids=[...s.likes];return {trackIds:ids,songs:ids.length?tracks((await api('/song/detail',{ids:ids.slice(0,50).join(',')})).songs):[],more:ids.length>50};});}break;
    case'history':navigate('collection','最近播放');s.collection={name:'最近播放',kind:'history'};await load(async()=>({songs:await native('history')}));break;
    case'search':await searchMore();break;
    case'suggestretry':await fetchSuggestions();break;
    case'suggestion':{const keyword=s.suggestions[Number(value)];if(keyword){s.query=keyword;stopSuggestions();document.querySelector('#query')?.blur();render();await searchMore();}break;}
    case'type':s.type=Number(value);s.songs=[];s.cards=[];render();await searchMore();break;
    case'more':await more();break;
    case'song':viewSong(s.songs,Number(value),s.collection?.kind==='fm'?'fm':'');break;
    case'recent':viewSong(s.history,Number(value));break;
    case'queuedetail':viewSong(s.playback.queue,Number(value),'queue');break;
    case'songplay':await start(s.songs,Number(value),s.collection?.kind==='fm');break;
    case'recentplay':await start(s.history,Number(value));break;
    case'playdetail':{if(!s.detailSong)break;const index=s.playback.queue.findIndex(song=>song.id===s.detailSong.id);if(s.detailSource==='queue'&&index>=0){await control('jump',{index});s.player=true;render();}else await start(s.detailQueue,s.detailIndex,s.detailSource==='fm');break;}
    case'queueadd':if(s.detailSong){await control('append',{songs:[s.detailSong]});toast('已加入播放队列');}break;
    case'likedetail':await likeSong(s.detailSong);break;
    case'playall':await start(s.songs,0,s.collection?.kind==='fm');break;
    case'player':s.player=true;render();break;
    case'closeplayer':s.player=false;render();break;
    case'toggle':await control(s.playback.playing?'pause':'play');break;
    case'next':case'previous':case'repeat':case'shuffle':await control(name);break;
    case'jump':case'remove':await control(name,{index:Number(value)});break;
    case'queue':case'sleep':s.sheet=name;render();break;
    case'sleepvalue':await control('sleep',{minutes:Number(value)});s.playback.sleep=Number(value);s.sheet='';render();break;
    case'closesheet':s.sheet='';render();break;
    case'lyrics':s.lyric=!s.lyric;render();if(s.lyric)await loadLyrics();break;
    case'lyricseek':await control('seek',{position:s.lines[Number(value)].time});break;
    case'like':await likeSong(current());break;
    case'account':s.player=false;navigate('account','账号');break;
    case'official-login':stopQr();s.qr='';render();await native('officialLogin');break;
    case'qr':await qr();break;
    case'background':s.settings=await native('settings',{background:!s.settings.background});render();break;
    case'logoutconfirm':s.sheet='logout';render();break;
    case'logout':stopQr();stopSuggestions();await native('logout');accountGeneration++;s.request++;entitySubscriptions.clear();s.stack=[];s.cards=[];s.artistInfo=null;s.artistBio=null;s.settings=await native('init');s.profile=null;s.history=[];s.library=[];s.likes.clear();s.sheet='';s.player=false;render();break;
    case'privacy':navigate('privacy','隐私说明');break;
    case'about':navigate('about','关于');break;
    case'license':navigate('license','开源许可');break;
  }
}
app.addEventListener('click',async event=>{if(event.target.dataset.dismiss==='sheet'){s.sheet='';render();return;}const target=event.target.closest('[data-action]');if(!target||target.disabled)return;const [name,value]=target.dataset.action.split(':');target.disabled=true;try{await action(name,value);}catch(error){toast(error.message);}finally{target.disabled=false;}});
app.addEventListener('submit',event=>{if(event.target.id==='searchform'){event.preventDefault();document.querySelector('#query')?.blur();searchMore();}});
app.addEventListener('compositionstart',event=>{if(event.target.id==='query'){composingSearch=true;stopSuggestions();}});
app.addEventListener('compositionend',event=>{if(event.target.id==='query'){composingSearch=false;onSearchInput(event.target.value);}});
app.addEventListener('input',event=>{if(event.target.id==='query'&&!event.isComposing)onSearchInput(event.target.value);else if(event.target.id==='query')s.query=event.target.value;if(event.target.id==='seek'){const elapsed=document.querySelector('#elapsed');if(elapsed)elapsed.textContent=time(Number(event.target.value));}});
app.addEventListener('change',async event=>{try{if(event.target.id==='seek')await control('seek',{position:Number(event.target.value)});if(['quality','theme'].includes(event.target.id)){s.settings=await native('settings',{[event.target.id]:event.target.value});theme();render();if(event.target.id==='quality')toast('将在下次加载音频时使用');}}catch(error){toast(error.message);}});
document.addEventListener('keydown',event=>{if(event.key==='Escape')back();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopQr();else if(s.page==='account'&&!s.settings.loggedIn&&s.qr){s.qrStatus='请刷新二维码后继续登录';render();}});
render();
if(isAndroid){try{s.settings=await native('init');theme();try{await session();}catch(error){toast(error.message);}await loadHome();}catch(error){s.error=error.message;render();}}
else{s.error='请安装 Android 应用使用音乐服务';render();}
