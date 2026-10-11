// Page templates. Every function returns markup for the current state and never changes it.
import {escape as e, time} from './model.js';
import {s, current, playbackDuration, entitySubscriptions, pendingEntities, pendingSubscriptions, entityKey, songArtists} from './state.js';
import {html, icon, button, art, loading, loadingInline, busySpinner, retryInline, empty, loadMore, rows, cards, durationLabel, sleepText} from './components.js';

const TABS = [['home', '发现', 'home'], ['search', '搜索', 'search'], ['library', '音乐库', 'library'], ['settings', '设置', 'settings']];
export const TOP_PAGES = TABS.map(([id]) => id);

export function header() {
  const sub = !TOP_PAGES.includes(s.page);
  return html`
    <header class="header">
      <div class="row">${sub ? button('back', 'back', '返回') : ''}<h1>${e(s.title)}</h1></div>
      ${['home', 'search'].includes(s.page) ? '' : button('search', 'tab:search', '搜索')}
    </header>`;
}

export function mainContent() {
  const pages = {songdetail: songDetail, artistpage: artistPage, favorites: favoritesPage, rankings: rankingsPage, comments: commentsPage};
  return `<main class="content">${(pages[s.page] || content)()}</main>`;
}

export function mini() {
  const song = current();
  if (!song) return '';
  const status = s.playback.error ? '播放失败，点播放重试' : s.playback.buffering ? '正在缓冲…' : song.artist;
  return html`
    <div class="mini">
      ${art(song.cover)}
      <button class="songtitle" data-action="player"><b>${e(song.name)}</b><small>${e(status)}</small></button>
      ${button(s.playback.playing ? 'pause' : 'play', 'toggle', s.playback.playing ? '暂停' : '播放')}
      ${button('queue', 'queue', '播放队列')}
      <span class="mini-progress" aria-hidden="true"><i id="miniprogress"></i></span>
    </div>`;
}

export function nav() {
  return html`<nav class="nav" aria-label="主导航">${TABS.map(([id, title, name]) =>
    `<button class="${s.page === id ? 'active' : ''}" data-action="tab:${id}">${icon(name)}${title}</button>`)}</nav>`;
}

export function suggestionMarkup() {
  if (s.suggestBusy) return '<div class="suggestion-status" role="status">正在查找建议…</div>';
  if (s.suggestError) return `<button class="suggestion-status" data-action="suggestretry">${e(s.suggestError)} · 重试</button>`;
  if (!s.suggestions.length) return '';
  return html`<div class="search-suggestions" role="group" aria-label="搜索建议">${s.suggestions.map((keyword, i) =>
    `<button data-action="suggestion:${i}">${icon('search')}<span>${e(keyword)}</span>${icon('next')}</button>`)}</div>`;
}

export function entitySubscriptionButton(kind, entity) {
  if (!entity?.id) return '';
  const key = entityKey(kind, entity.id), state = entitySubscriptions.get(key), pending = pendingEntities.has(key);
  const known = typeof state?.subscribed === 'boolean';
  const label = kind === 'artist' ? '歌手' : '专辑';
  const action = known || !s.settings.loggedIn ? 'entitysub' : 'entitystatus';
  const text = known ? (state.subscribed ? '取消收藏' : `收藏${label}`) : s.settings.loggedIn ? '查看收藏状态' : `收藏${label}`;
  return html`
    <button class="secondary playlist-subscribe ${state?.subscribed ? 'selected' : ''}" data-action="${action}:${kind}" aria-pressed="${Boolean(state?.subscribed)}" aria-busy="${pending}" ${pending ? 'disabled' : ''}>
      ${pending ? busySpinner() : icon('heart')}${text}
    </button>`;
}

function playlistSubscribeButton() {
  const c = s.collection;
  if (c?.kind !== 'playlist' || !c.detailsLoaded || (s.profile && String(c.creatorId) === String(s.profile.userId))) return '';
  const pending = pendingSubscriptions.has(String(c.id));
  return html`
    <button class="secondary playlist-subscribe ${c.subscribed ? 'selected' : ''}" data-action="subscribeplaylist" aria-pressed="${Boolean(c.subscribed)}" aria-busy="${pending}" ${pending ? 'disabled' : ''}>
      ${pending ? busySpinner() : icon('heart')}<span>${c.subscribed ? '取消收藏' : '收藏歌单'}</span>
    </button>`;
}

export function artistLinks(song, source) {
  const list = songArtists(song);
  const lookup = name => `<button class="artist-link" data-action="songartist:${source}-lookup" aria-label="查看歌手${name ? ` ${e(name)}` : ''}">`;
  if (!list.length) return song.artist ? `${lookup('')}${e(song.artist)}</button>` : '';
  return list.map((a, i) => /^\d+$/.test(a.id) && Number(a.id) > 0
    ? `<button class="artist-link" data-action="songartist:${source}-${i}" aria-label="查看歌手 ${e(a.name)}">${e(a.name)}</button>`
    : `${lookup(a.name)}${e(a.name)}</button>`).join('<span class="artist-separator"> / </span>');
}

/** Shared states of a paged list: first load, first failure, refresh and refresh failure. */
function paged(has, body, {loadingText, busyText, retry}) {
  if (s.busy && !has) return loading(loadingText);
  if (s.error && !has) return empty(s.error, retry);
  return html`${body}${has && s.busy ? loadingInline(busyText) : ''}${has && s.error ? retryInline(s.error, retry) : ''}`;
}

function home() {
  const has = s.home.length;
  const body = has ? cards(s.home, 'homecard') : s.busy ? loading('正在准备推荐…') : s.error ? empty(s.error, 'refresh') : empty('还没有推荐内容', 'refresh');
  return html`
    <button class="searchbox" data-action="tab:search">${icon('search')}搜索歌曲、歌手、专辑</button>
    <button class="feature" data-action="daily">
      ${art('')}
      <p>每日推荐</p>
      <h2>今天，听点不一样</h2>
      <p>${s.settings.loggedIn ? '打开为你推荐的歌曲' : '登录后听每日推荐'}</p>
      <span class="playbadge">${icon('next')}</span>
    </button>
    <div class="quickgrid">
      <button class="quick compact" data-action="fm" ${s.fmBusy ? 'disabled' : ''}>${icon('radio')}<span><b>私人 FM</b><small>${s.fmBusy ? '正在打开…' : '遇见下一首喜欢'}</small></span></button>
      <button class="quick compact" data-action="new">${icon('music')}<span><b>新歌速递</b><small>最近的新声音</small></span></button>
      <button class="quick compact" data-action="rankings">${icon('chart')}<span><b>排行榜</b><small>每日更新</small></span></button>
    </div>
    ${s.fmBusy ? loadingInline('正在打开私人 FM…') : ''}
    ${s.fmError ? retryInline(s.fmError, 'fm') : ''}
    <div class="section"><h2>${s.settings.loggedIn ? '为你推荐' : '精选歌单'}</h2>${button('refresh', 'refresh', '刷新推荐')}</div>
    ${body}
    ${has && s.busy ? loadingInline('正在刷新推荐…') : ''}
    ${has && s.error ? retryInline(s.error, 'refresh') : ''}
    ${s.history.length ? html`
      <div class="section"><h2>最近播放</h2><button data-action="history">查看全部</button></div>
      ${rows(s.history.slice(0, 3), 'recent')}` : ''}`;
}

/** What the search page shows before a query: recent searches and the hot list. */
function searchStart() {
  const history = s.searchHistory.length ? html`
    <div class="section"><h2>搜索历史</h2><button data-action="clearsearches">清除</button></div>
    <div class="chips wrap">${s.searchHistory.map((keyword, i) => `<button class="chip" data-action="searchhistory:${i}">${e(keyword)}</button>`)}</div>` : '';
  const hot = s.hotSearches.length ? html`
    <div class="section"><h2>热门搜索</h2></div>
    <ol class="hot-searches">${s.hotSearches.map((keyword, i) =>
      `<li><button data-action="hotsearch:${i}"><b>${i + 1}</b><span>${e(keyword)}</span></button></li>`)}</ol>` : '';
  return history || hot ? history + hot : empty('输入关键词，找到想听的音乐');
}

export function search() {
  const has = s.type === 1 ? s.songs.length : s.cards.length;
  const kind = s.type === 100 ? 'artist' : s.type === 10 ? 'album' : 'playlist';
  const results = !s.query.trim() ? searchStart() : s.type === 1 ? rows() || empty('没有找到相关歌曲') : cards(s.cards, kind);
  const body = s.busy && !has && s.offset === 0 ? loading('正在搜索…') : s.error && !has ? empty(s.error, 'search') : results;
  const types = [[1, '单曲'], [1000, '歌单'], [100, '歌手'], [10, '专辑']];
  return html`
    <form id="searchform" class="searchbox">
      ${icon('search')}
      <input id="query" value="${e(s.query)}" placeholder="搜索歌曲、歌手、专辑" aria-label="搜索关键词" enterkeyhint="search">
      <button type="submit">搜索</button>
    </form>
    <div id="searchsuggestions">${suggestionMarkup()}</div>
    <div class="chips">${types.map(([id, title]) => `<button class="chip ${s.type === id ? 'active' : ''}" data-action="type:${id}">${title}</button>`)}</div>
    ${body}
    ${has && s.busy ? loadingInline('正在更新搜索结果…') : ''}
    ${has && s.error ? retryInline(s.error, 'search') : ''}
    ${loadMore()}`;
}

function library() {
  const has = s.library.length;
  const body = !s.settings.loggedIn ? empty('登录后查看收藏的歌单', 'account', '登录')
    : has ? cards(s.library, 'librarycard') : s.busy ? loading('正在加载歌单…') : s.error ? empty(s.error, 'refresh') : empty('还没有收藏的歌单');
  const entries = [['heart', '喜欢的音乐', 'likes'], ['clock', '最近播放', 'history'], ['cloud', '音乐云盘', 'cloud'], ['heart', '收藏的歌手', 'favoriteartists'], ['heart', '收藏的专辑', 'favoritealbums']];
  return html`
    <button class="account" data-action="account">
      <span>${icon('music')}</span>
      <span><h2>${e(s.profile?.nickname || '我的音乐')}</h2><small>${s.settings.loggedIn ? '网易云音乐' : '登录后同步你的音乐'}</small></span>
    </button>
    <div class="group">${entries.map(([name, title, action]) =>
      `<button class="setting" data-action="${action}"><span class="row">${icon(name)}${title}</span>${icon('next')}</button>`)}</div>
    <div class="section"><h2>我的歌单</h2></div>
    ${body}
    ${has && s.busy ? loadingInline('正在刷新歌单…') : ''}
    ${has && s.error ? retryInline(s.error, 'refresh') : ''}
    ${loadMore()}`;
}

const toggle = (action, title, detail, on) => html`
  <button class="setting" data-action="${action}" role="switch" aria-checked="${Boolean(on)}">
    <span>${title}<small>${detail}</small></span><span class="switch ${on ? 'on' : ''}" aria-hidden="true"></span>
  </button>`;

const select = (id, title, options, value) => html`
  <label class="setting">${title}<select id="${id}">${options.map(([v, t]) => `<option value="${v}" ${value === v ? 'selected' : ''}>${t}</option>`)}</select></label>`;

function settings() {
  return html`
    <div class="group">
      <button class="setting" data-action="account"><span>网易云音乐账号<small>${e(s.profile?.nickname || (s.settings.loggedIn ? '已登录' : '未登录'))}</small></span>${icon('next')}</button>
    </div>
    <h3>播放</h3>
    <div class="group">
      ${toggle('background', '后台播放', '离开应用后继续播放', s.settings.background)}
      ${toggle('tapplay', '点击歌曲直接播放', '关闭时先打开歌曲详情', s.settings.tapPlay)}
      ${select('quality', '播放音质', [['standard', '标准'], ['exhigh', '极高'], ['lossless', '无损'], ['hires', 'Hi-Res']], s.settings.quality)}
      <button class="setting" data-action="sleep"><span>定时关闭</span><small id="settingsleep">${sleepText()}</small></button>
    </div>
    <h3>通用</h3>
    <div class="group">
      ${select('theme', '外观', [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']], s.settings.theme)}
      <button class="setting" data-action="privacy">隐私说明 ${icon('next')}</button>
      <button class="setting" data-action="about">关于音乐 ${icon('next')}</button>
    </div>`;
}

export function artistPage() {
  const a = s.artistInfo;
  if (!a) return s.busy ? loading() : empty(s.error || '歌手信息不可用', 'artistrefresh');
  const count = [a.musicSize != null ? `${a.musicSize} 首歌曲` : '', a.albumSize != null ? `${a.albumSize} 张专辑` : ''].filter(Boolean).join(' · ');
  let body = '';
  if (s.artistTab === 'bio') {
    const bio = s.artistBio;
    body = bio ? html`
      ${bio.briefDesc ? `<p class="description">${e(bio.briefDesc)}</p>` : ''}
      ${(bio.introduction || []).map(section => html`
        <section class="artist-biography"><h2>${e(section.ti || '')}</h2><p class="description">${e(section.txt || '')}</p></section>`)}` || empty('暂无歌手简介') : '';
  } else if (s.artistTab === 'albums') {
    body = s.cards.length ? cards(s.cards, 'album') : !s.busy ? empty('暂无专辑') : '';
  } else {
    body = s.songs.length ? html`
      <div class="section"><h2>${s.artistTab === 'hot' ? '热门歌曲' : '全部歌曲'}</h2><button class="primary" data-action="playall">${icon('play')}播放全部</button></div>
      ${rows()}` : !s.busy ? empty('暂无歌曲') : '';
  }
  const has = s.artistTab === 'albums' ? s.cards.length : s.artistTab === 'bio' ? Boolean(s.artistBio) : s.songs.length;
  const tabs = [['hot', '热门歌曲'], ['songs', '全部歌曲'], ['albums', '专辑'], ['bio', '简介']];
  return html`
    <div class="albumhead artist-head">
      ${art(a.cover)}
      <h1>${e(a.name)}</h1>
      ${count ? `<small>${e(count)}</small>` : ''}
      <div class="row collection-actions">${entitySubscriptionButton('artist', a)}</div>
    </div>
    <div class="chips artist-tabs" aria-label="歌手内容">${tabs.map(([key, label]) =>
      `<button class="chip ${s.artistTab === key ? 'active' : ''}" data-action="artisttab:${key}" aria-pressed="${s.artistTab === key}">${label}</button>`)}</div>
    ${paged(has, body, {loadingText: '正在加载歌手内容…', busyText: '正在更新歌手内容…', retry: 'artistrefresh'})}
    ${s.more && !s.error ? '<button class="loadmore" data-action="more">加载更多</button>' : ''}`;
}

export function collection() {
  const has = s.songs.length, c = s.collection;
  const head = c ? html`
    <div class="albumhead collection-head">
      <div class="collection-art">${art(c.cover)}</div>
      <div class="collection-info">
        <h1>${e(c.name)}</h1>
        <small>${e(c.subtitle || `${s.songs.length} 首歌曲`)}</small>
        <div class="row collection-actions">
          <button class="primary" data-action="playall" ${!s.songs.length ? 'disabled' : ''}>${icon('play')} 播放全部</button>
          ${playlistSubscribeButton()}
          ${c.kind === 'album' ? entitySubscriptionButton('album', c) : ''}
          ${button('queue', 'queue', '播放队列')}
        </div>
      </div>
    </div>` : '';
  return html`
    ${head}
    ${paged(has, has ? rows() : empty('这里还没有歌曲'), {loadingText: '正在加载歌曲…', busyText: '正在更新歌曲…', retry: 'refresh'})}
    ${loadMore()}`;
}

function account() {
  if (s.settings.loggedIn) return html`
    <div class="account">${icon('music')}<div><h2>${e(s.profile?.nickname || '已登录')}</h2><small>网易云音乐</small></div></div>
    <div class="group"><button class="setting" data-action="logoutconfirm">退出登录 ${icon('next')}</button></div>`;
  return html`
    <div class="qr-login">
      <h2>登录网易云音乐</h2>
      <p class="description">打开官方页面登录，完成后返回即可。</p>
      <button class="primary wide" data-action="official-login">打开官方登录</button>
      <div class="login-divider"><span>或</span></div>
      ${s.busy ? loading() : s.qr ? `<img class="qr" src="${e(s.qr)}" alt="网易云音乐登录二维码">` : ''}
      <div class="empty qr-actions">
        <p id="qrstatus">${e(s.qrStatus || s.error || '')}</p>
        <button class="secondary wide" data-action="qr">${s.qr ? '刷新二维码' : '使用扫码登录'}</button>
      </div>
    </div>`;
}

export function songDetail() {
  const song = s.detailSong;
  if (!song) return empty('歌曲信息不可用');
  const liked = s.likes.has(song.id);
  return html`
    <div class="albumhead song-detail">
      ${art(song.cover)}
      <h1>${e(song.name)}</h1>
      <div class="description artist-links">${artistLinks(song, 'detail')}</div>
      ${song.album ? `<small>${e(song.album)}</small>` : ''}
      ${song.duration ? `<small class="song-duration">${time(song.duration)}</small>` : ''}
      <div class="song-detail-actions">
        <button class="primary wide" data-action="playdetail">${icon('play')}播放这首歌</button>
        <button class="secondary wide" data-action="playnext">${icon('playnext')}下一首播放</button>
        <button class="secondary wide" data-action="queueadd">${icon('queue')}加入播放队列</button>
        <button class="secondary wide ${liked ? 'selected' : ''}" data-action="likedetail" aria-pressed="${liked}">${icon('heart')}${liked ? '取消喜欢' : '喜欢这首歌'}</button>
        <button class="secondary wide" data-action="comments:detail">歌曲评论</button>
      </div>
    </div>`;
}

export function favoritesPage() {
  const has = s.cards.length;
  const body = has ? cards(s.cards, s.favoriteKind === 'artist' ? 'artist' : 'album') : empty('还没有收藏');
  return html`${paged(has, body, {loadingText: '正在加载收藏…', busyText: '正在更新收藏…', retry: 'favoritesrefresh'})}${loadMore()}`;
}

export function rankingsPage() {
  const has = s.cards.length;
  const list = has ? html`<div class="rankings">${s.cards.map((card, i) => html`
    <button class="ranking-entry" data-action="ranking:${i}">
      ${art(card.coverImgUrl)}
      <span class="ranking-title"><b>${e(card.name)}</b><small>${e(card.updateFrequency || '')}</small></span>
      ${icon('next')}
    </button>`)}</div>` : empty('暂无排行榜');
  return paged(has, list, {loadingText: '正在加载排行榜…', busyText: '正在刷新排行榜…', retry: 'rankingsrefresh'});
}

function commentRows(list) {
  return list.map(c => {
    const date = new Date(Number(c.time));
    const when = Number(c.time) > 0 && Number.isFinite(date.getTime()) ? date.toLocaleDateString('zh-CN') : '';
    const reply = c.beReplied?.[0];
    return html`
      <article class="comment-entry">
        <div class="comment-avatar">${art(c.user?.avatarUrl)}</div>
        <div class="comment-body">
          <div class="comment-meta"><b>${e(c.user?.nickname || '网易云用户')}</b><small>${e(when)}</small></div>
          <p>${e(c.content || '')}</p>
          ${reply ? `<blockquote>${e(reply.user?.nickname || '网易云用户')}：${e(reply.content || '该评论已删除')}</blockquote>` : ''}
          <small class="comment-likes">赞 ${Math.max(0, Number(c.likedCount) || 0)}</small>
        </div>
      </article>`;
  }).join('');
}

export function commentsPage() {
  const song = s.commentSong;
  const has = s.comments.length || s.hotComments.length;
  const error = s.error ? (has ? retryInline(s.error, s.comments.length ? 'commentsmore' : 'commentsrefresh') : empty(s.error, 'commentsrefresh')) : '';
  return html`
    ${song ? `<div class="comments-song">${art(song.cover)}<div><h2>${e(song.name)}</h2><small>${e(song.artist)}</small></div></div>` : ''}
    ${s.hotComments.length ? `<div class="section"><h2>热门评论</h2></div>${commentRows(s.hotComments)}` : ''}
    <div class="section"><h2>最新评论${s.commentTotal ? ` · ${s.commentTotal}` : ''}</h2></div>
    ${s.comments.length ? commentRows(s.comments) : !s.busy && !s.error ? empty('还没有评论') : ''}
    ${error}
    ${s.busy ? (has ? loadingInline('正在加载评论…') : loading('正在加载评论…')) : ''}
    ${s.more && !s.error ? `<button class="loadmore" data-action="more" ${s.busy ? 'disabled' : ''}>加载更多</button>` : ''}`;
}

const PRIVACY = [
  '搜索、推荐、账号和播放请求由设备直接发送至网易云音乐。专辑封面与音频从接口返回的地址加载，不经过另设的音乐代理服务器。',
  '登录凭证使用 Android Keystore 加密后保存在本机，不交给界面脚本。最近播放、搜索历史、播放队列及设置保存在本机；听过的音频会在本机缓存最多 512 MB，以便再次播放时少用流量，系统空间不足时可能被清理。退出登录会清除账号、登录网页的 Cookie、播放队列、搜索历史与最近播放。',
  '应用不上传通讯录或本地文件，不集成广告与统计 SDK。播放权限由音乐服务与账号决定。',
];

const LICENSE = 'NeteaseCloudMusicApiEnhanced\nCopyright (c) 2013-2022 Binaryify\n\nThe MIT License (MIT)\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.';

function content() {
  switch (s.page) {
    case 'home': return home();
    case 'search': return search();
    case 'library': return library();
    case 'settings': return settings();
    case 'collection': return collection();
    case 'account': return account();
    case 'privacy': return `<h2>隐私说明</h2>${PRIVACY.map(text => `<p class="description">${text}</p>`).join('')}`;
    case 'about': return html`
      <h2>音乐 0.1.0</h2>
      <p class="description">Android 音乐播放器</p>
      <p class="description">接口实现参考 NeteaseCloudMusicApiEnhanced（MIT），功能组织参考 YesPlayMusic。音频播放使用 AndroidX Media3；二维码由 ZXing 生成。</p>
      <button class="primary" data-action="license">开源许可</button>`;
    case 'license': return `<p class="description">${e(LICENSE)}</p>`;
    default: return '';
  }
}

export function player() {
  const song = current();
  if (!song) return '';
  const duration = playbackDuration();
  const position = Math.min(Math.max(0, Number(s.playback.position) || 0), duration || Number.MAX_SAFE_INTEGER);
  const repeatLabels = ['顺序播放', '单曲循环', '列表循环'];
  const repeatLabel = repeatLabels[s.playback.repeat] || repeatLabels[0];
  const repeatGlyph = s.playback.repeat === 1 ? `<span class="repeat-glyph">${icon('repeat')}<b>1</b></span>` : icon('repeat');
  const liked = s.likes.has(song.id);
  const lyricsView = html`
    <div class="lyrics" id="lyrics">
      ${s.lines.length
        ? s.lines.map((line, i) => `<button data-action="lyricseek:${i}" data-line="${i}">${e(line.text)}${line.translation ? `<small>${e(line.translation)}</small>` : ''}</button>`).join('')
        : empty(s.lyricError || '暂无歌词', 'lyricsretry', '重试')}
      ${s.lines.length && !s.lyricFollow ? '<button class="lyrics-follow" data-action="followlyrics">回到当前歌词</button>' : ''}
    </div>`;
  return html`
    <section class="overlay" aria-label="正在播放">
      <header class="header">${button('down', 'closeplayer', '收起播放器')}<small>正在播放</small>${button('queue', 'queue', '播放队列')}</header>
      <div class="content">
        ${s.lyric ? lyricsView : `<div class="playercover">${art(song.cover)}</div>`}
        <div class="nowtitle">
          <div><h1>${e(song.name)}</h1><div class="artist-links">${artistLinks(song, 'current')}</div></div>
          ${button('heart', 'like', liked ? '取消喜欢' : '喜欢', liked ? 'liked' : '')}
        </div>
        <input id="seek" class="progress" type="range" min="0" max="${duration || 1}" value="${duration ? position : 0}" aria-label="播放进度" ${duration ? '' : 'disabled'}>
        <div class="times"><span id="elapsed">${durationLabel(position)}</span><span id="duration">${durationLabel(duration)}</span></div>
        ${s.playback.error ? `<p class="description error" role="alert">${e(s.playback.error)}</p>` : ''}
        <div class="controls">
          <button class="icon ${s.playback.repeat > 0 ? 'mode-active' : ''}" data-action="repeat" aria-label="${repeatLabel}">${repeatGlyph}</button>
          ${button('previous', 'previous', '上一首')}
          <button class="bigplay" data-action="toggle" aria-label="${s.playback.playing ? '暂停' : '播放'}">${s.playback.buffering ? '<span class="spinner"><i></i><i></i><i></i></span>' : icon(s.playback.playing ? 'pause' : 'play')}</button>
          ${button('next', 'next', '下一首')}
          ${button('shuffle', 'shuffle', '随机播放', s.playback.shuffle ? 'liked' : '')}
        </div>
        <div class="row between ${s.playback.fm ? 'four' : ''}">
          <button data-action="lyrics">${s.lyric ? '封面' : '歌词'}</button>
          <button data-action="comments:current">评论</button>
          ${s.playback.fm ? `<button data-action="trash" aria-label="不喜欢，减少类似推荐">${icon('dislike')}不喜欢</button>` : ''}
          <button class="${s.playback.sleep !== 0 ? 'mode-active' : ''}" data-action="sleep" id="sleeplabel">${sleepText(true)}</button>
        </div>
      </div>
    </section>`;
}

const SLEEP_OPTIONS = [0, 15, 30, 45, 60, 90, -1];

export function sheet() {
  const titles = {queue: '播放队列', sleep: '定时关闭', logout: '退出登录'};
  const queue = s.playback.queue;
  let heading = `<h2>${titles[s.sheet] || ''}</h2>${button('close', 'closesheet', '关闭')}`, body;
  if (s.sheet === 'queue') {
    heading = html`
      <h2>播放队列 · ${queue.length} 首</h2>
      <div class="row">${queue.length ? '<button class="text-action" data-action="clearqueue">清空</button>' : ''}${button('close', 'closesheet', '关闭')}</div>`;
    body = queue.map((song, i) => html`
      <div class="song queue-row ${i === s.playback.index ? 'active' : ''}" ${i === s.playback.index ? 'aria-current="true"' : ''}>
        <span class="drag" data-drag="${i}" aria-hidden="true">${icon('drag')}</span>
        <button class="songtitle" data-action="queuedetail:${i}" aria-label="查看 ${e(song.name)}"><b>${e(song.name)}</b><small>${e(song.artist)}</small></button>
        ${button('play', `jump:${i}`, `播放 ${song.name}`)}
        ${button('close', `remove:${i}`, `移除 ${song.name}`)}
      </div>`).join('') || empty('播放队列为空');
  } else if (s.sheet === 'sleep') {
    body = SLEEP_OPTIONS.map(n => html`
      <button class="setting ${s.playback.sleep === n ? 'selected' : ''}" data-action="sleepvalue:${n}" aria-pressed="${s.playback.sleep === n}">${n === 0 ? '关闭' : n === -1 ? '播完当前歌曲' : `${n} 分钟`}</button>`).join('');
  } else {
    body = '<p class="description">退出后清除本机账号、播放队列、搜索历史与最近播放。</p><button class="primary" data-action="logout">退出登录</button>';
  }
  return html`
    <div class="scrim" data-dismiss="sheet">
      <section class="sheet" role="dialog" aria-modal="true" aria-label="${titles[s.sheet] || ''}">
        <div class="handle"></div>
        <div class="section">${heading}</div>
        ${body}
      </section>
    </div>`;
}

