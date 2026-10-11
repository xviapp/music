// Controller: rendering, navigation, data loading and user actions.
import {imageUrl, tracks, lyrics, lyricIndex, time, playbackKey} from './model.js';
import {native, api, control, isAndroid} from './native.js';
import {s, current, playbackDuration, pendingSubscriptions, artistRefs, entitySubscriptions, pendingEntities, entityKey, songArtists} from './state.js';
import {durationLabel, sleepText} from './components.js';
import {TOP_PAGES, header, mainContent, mini, nav, suggestionMarkup, player, sheet} from './views.js';

const MAX_QUEUE = 1000;
const app = document.querySelector('#app');
app.addEventListener('error', event => {
  const image = event.target;
  if (image?.tagName !== 'IMG' || !image.closest?.('.artbox')) return;
  image.hidden = true;
  image.nextElementSibling?.removeAttribute('hidden');
}, true);

let qrTimer, toastTimer, pollGeneration = 0, lyricRequest = 0;
let initialized = !isAndroid;
let lyricAutoScrollUntil = 0;
let accountGeneration = 0;
let suggestTimer, suggestGeneration = 0, composingSearch = false, searchStartGeneration = 0;
/** Background loading of a long playlist into the queue; any new queue cancels it. */
let fillGeneration = 0, queueFill = Promise.resolve();
/** Queue row being dragged, if any. */
let drag = null;

// Search suggestions

function stopSuggestions() {
  clearTimeout(suggestTimer);
  suggestGeneration++;
  s.suggestions = [];
  s.suggestBusy = false;
  s.suggestError = '';
  renderSuggestions();
}
function renderSuggestions() {
  const node = document.querySelector('#searchsuggestions');
  if (node) node.innerHTML = suggestionMarkup();
}
function onSearchInput(value) {
  s.query = value;
  stopSuggestions();
  if (!composingSearch && s.page === 'search' && value.trim() && value.trim().length <= 200) suggestTimer = setTimeout(() => fetchSuggestions(), 250);
}
async function fetchSuggestions() {
  const query = s.query.trim();
  if (s.page !== 'search' || !query || query.length > 200) return;
  const generation = ++suggestGeneration;
  s.suggestBusy = true;
  s.suggestError = '';
  renderSuggestions();
  try {
    const data = await api('/search/suggest', {keywords: query});
    if (generation !== suggestGeneration || s.page !== 'search' || s.query.trim() !== query) return;
    s.suggestions = [...new Set((data.result?.allMatch || []).map(item => String(item.keyword || '').trim()).filter(Boolean))].slice(0, 8);
  } catch (error) {
    if (generation === suggestGeneration && s.page === 'search') s.suggestError = '搜索建议暂不可用';
  } finally {
    if (generation === suggestGeneration) {
      s.suggestBusy = false;
      renderSuggestions();
    }
  }
}
/** Recent searches (stored natively) and the service's hot list, shown before a query is typed. */
async function loadSearchStart() {
  const generation = ++searchStartGeneration;
  const [history, hot] = await Promise.all([
    native('searches').catch(() => null),
    s.hotSearches.length ? null : api('/search/hot/detail').catch(() => null),
  ]);
  if (generation !== searchStartGeneration) return;
  if (Array.isArray(history)) s.searchHistory = history;
  if (hot) s.hotSearches = (Array.isArray(hot.data) ? hot.data : []).map(item => String(item.searchWord || '').trim()).filter(Boolean).slice(0, 10);
  if (s.page === 'search') render();
}
async function searchKeyword(keyword) {
  if (!keyword) return;
  s.query = keyword;
  stopSuggestions();
  document.querySelector('#query')?.blur();
  render();
  await searchMore();
}

// Artist and album subscriptions

function rememberEntity(kind, card, subscribed) {
  const key = entityKey(kind, card.id), previous = entitySubscriptions.get(key);
  if (pendingEntities.has(key)) return;
  entitySubscriptions.set(key, {card: {...previous?.card, ...card}, subscribed: typeof subscribed === 'boolean' ? subscribed : previous?.subscribed});
}

// Rendering

const baseRegions = new Map();
let playerElement = null, playerStateKey = '', playerAnimation = null, playerTarget = false, playerOpener = null;

function toast(message) {
  const box = document.querySelector('#toast');
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.hidden = true, 4500);
}
function theme() {
  const dark = s.settings.theme === 'dark' || (s.settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  if (isAndroid) native('appearance', {dark}).catch(() => {});
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);

function render() {
  if (!initialized) return;
  const focusedQuery = s.page === 'search' && document.activeElement?.id === 'query' ? {start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd} : null;
  const oldScroll = document.querySelector('main.content')?.scrollTop || 0;
  app.dataset.subpage = String(!TOP_PAGES.includes(s.page));
  const markup = {header: header(), content: mainContent(), mini: mini(), nav: nav()};
  if (!baseRegions.size) app.replaceChildren();
  for (const [name, html] of Object.entries(markup)) {
    const previous = baseRegions.get(name);
    if (previous?.html === html) continue;
    const node = html ? elementFrom(html) : null;
    if (previous?.node) previous.node.remove();
    baseRegions.set(name, {html, node});
    if (node) {
      const names = Object.keys(markup);
      const following = names.slice(names.indexOf(name) + 1).map(key => baseRegions.get(key)?.node).find(element => element?.isConnected);
      app.insertBefore(node, following || playerElement || app.querySelector('.scrim'));
    }
  }
  document.querySelector('main.content').scrollTop = oldScroll;
  renderPlayer();
  if (!drag) renderSheet();
  lockBackground();
  if (focusedQuery) {
    const query = document.querySelector('#query');
    if (query && !query.inert) {
      query.focus({preventScroll: true});
      query.setSelectionRange(focusedQuery.start, focusedQuery.end);
    }
  }
  updatePosition(false);
}
function renderSheet() {
  const oldSheet = app.querySelector('.scrim');
  const sheetScroll = oldSheet?.querySelector('.sheet')?.scrollTop || 0;
  const sheetHTML = s.sheet ? sheet() : '';
  if (oldSheet?.dataset.markup === sheetHTML) return;
  oldSheet?.remove();
  if (!sheetHTML) return;
  const node = elementFrom(sheetHTML);
  node.dataset.markup = sheetHTML;
  app.append(node);
  node.querySelector('.sheet').scrollTop = sheetScroll;
  if (!oldSheet && s.sheet === 'queue') node.querySelector('.song.active')?.scrollIntoView?.({block: 'center'});
}
function elementFrom(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content.firstElementChild;
}
function lockBackground() {
  for (const {node} of baseRegions.values()) if (node) node.inert = Boolean(playerElement || s.sheet);
  if (playerElement) playerElement.inert = Boolean(s.sheet || !s.player);
}
function bindLyricScroll() {
  const box = playerElement?.querySelector('#lyrics');
  if (!box || box.dataset.bound) return;
  box.dataset.bound = 'true';
  box.addEventListener('scroll', () => {
    if (Date.now() < lyricAutoScrollUntil || !s.lyricFollow) return;
    s.lyricFollow = false;
    render();
  }, {passive: true});
}
function renderPlayer() {
  if (!s.player || !current()) {
    if (playerElement && playerTarget) transitionPlayer(false);
    return;
  }
  if (!playerElement) {
    playerOpener = document.activeElement;
    playerElement = elementFrom(player());
    playerElement.setAttribute('role', 'dialog');
    playerElement.setAttribute('aria-modal', 'true');
    playerElement.tabIndex = -1;
    playerElement.style.transform = 'translateY(100%)';
    app.insertBefore(playerElement, app.querySelector('.scrim'));
    playerStateKey = '';
  }
  const key = JSON.stringify([playbackKey(s.playback), current(), songArtists(current()), s.lyric, s.lines, s.lyricError, s.lyricFollow, s.likes.has(current().id)]);
  if (key !== playerStateKey) {
    const scroll = playerElement.querySelector('.content')?.scrollTop || 0;
    const lyricScroll = playerElement.querySelector('#lyrics')?.scrollTop || 0;
    const cover = playerElement.querySelector('.playercover');
    const next = elementFrom(player());
    const nextCover = next.querySelector('.playercover');
    // Keep the loaded artwork element so the cover does not flash on every state change.
    if (cover && nextCover && cover.innerHTML === nextCover.innerHTML) nextCover.replaceWith(cover);
    playerElement.replaceChildren(...next.childNodes);
    playerStateKey = key;
    playerElement.querySelector('.content').scrollTop = scroll;
    const lyricBox = playerElement.querySelector('#lyrics');
    if (lyricBox) lyricBox.scrollTop = lyricScroll;
    bindLyricScroll();
  }
  if (!playerTarget) transitionPlayer(true);
}
function transitionPlayer(open) {
  const node = playerElement;
  if (!node) return;
  const from = getComputedStyle(node).transform;
  playerAnimation?.cancel();
  playerAnimation = null;
  playerTarget = open;
  node.style.transform = from;
  node.classList.add('player-transition');
  const finish = () => {
    if (node !== playerElement || playerTarget !== open) return;
    node.classList.remove('player-transition');
    node.style.transform = open ? 'translateY(0)' : 'translateY(100%)';
    if (open) {
      if (!node.contains(document.activeElement)) node.querySelector('[data-action="closeplayer"]')?.focus({preventScroll: true});
      return;
    }
    node.remove();
    playerElement = null;
    playerStateKey = '';
    lockBackground();
    if (!s.sheet) {
      const opener = playerOpener?.isConnected ? playerOpener : app.querySelector('[data-action="player"]');
      opener?.focus({preventScroll: true});
    }
    playerOpener = null;
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || typeof node.animate !== 'function') {
    finish();
    return;
  }
  const animation = node.animate([{transform: from}, {transform: open ? 'translateY(0)' : 'translateY(100%)'}], {
    duration: open ? 280 : 220,
    easing: open ? 'cubic-bezier(.2,.8,.2,1)' : 'cubic-bezier(.4,0,.8,.2)',
    fill: 'both',
  });
  playerAnimation = animation;
  animation.finished.then(() => {
    if (playerAnimation !== animation) return;
    playerAnimation = null;
    finish();
    animation.cancel();
  }).catch(() => {});
}
/** Updates the frequently changing parts in place: progress, times, sleep countdown and the active lyric. */
function updatePosition(scroll = true) {
  const duration = playbackDuration(), position = Math.max(0, Number(s.playback.position) || 0);
  const seek = document.querySelector('#seek');
  if (seek && document.activeElement !== seek) {
    seek.max = Math.max(1, duration);
    seek.value = duration ? Math.min(position, duration) : 0;
    seek.disabled = !duration;
  }
  const elapsed = document.querySelector('#elapsed');
  if (elapsed) elapsed.textContent = durationLabel(position);
  const durationNode = document.querySelector('#duration');
  if (durationNode) durationNode.textContent = durationLabel(duration);
  const miniProgress = document.querySelector('#miniprogress');
  if (miniProgress?.style) miniProgress.style.transform = `scaleX(${duration ? Math.min(1, position / duration) : 0})`;
  const playerSleep = document.querySelector('#sleeplabel');
  if (playerSleep) playerSleep.textContent = sleepText(true);
  const settingSleep = document.querySelector('#settingsleep');
  if (settingSleep) settingSleep.textContent = sleepText();
  const active = lyricIndex(s.lines, position);
  const old = document.querySelector('#lyrics .active');
  const next = document.querySelector(`[data-line="${active}"]`);
  if (old === next) return;
  old?.classList.remove('active');
  next?.classList.add('active');
  if (scroll && next && s.lyricFollow) {
    const box = document.querySelector('#lyrics');
    lyricAutoScrollUntil = Date.now() + 180;
    box.scrollTo({top: next.offsetTop - box.offsetTop - box.clientHeight / 2 + next.clientHeight / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }
}

// Native callbacks

/** Playback structure from Android; the queue is omitted when it has not changed. */
window.onPlayback = p => {
  const next = {...s.playback, ...p, queue: p.queue || s.playback.queue};
  const changed = playbackKey(next) !== playbackKey(s.playback);
  const before = current()?.id;
  s.playback = next;
  if (!current()) s.player = false;
  if (changed) render();
  else updatePosition();
  if (before !== current()?.id && s.lyric) loadLyrics();
};
/** Position, buffering and sleep countdown, sent several times a second while playing. */
window.onProgress = p => {
  const before = playbackKey(s.playback);
  Object.assign(s.playback, p);
  if (playbackKey(s.playback) !== before) render();
  else updatePosition();
};
window.onLiked = (id, like) => {
  like ? s.likes.add(id) : s.likes.delete(id);
  render();
};
window.onNativeError = toast;
window.onOfficialLogin = async state => {
  if (!state?.loggedIn) return;
  s.settings = state;
  s.qr = '';
  s.qrStatus = '';
  s.error = '';
  stopQr();
  try {
    await session();
    toast('登录成功');
  } catch (error) {
    toast(error.message);
  }
  render();
};

// Navigation

function stopQr() {
  clearTimeout(qrTimer);
  pollGeneration++;
}
const PAGE_FIELDS = ['page', 'title', 'songs', 'cards', 'collection', 'detailSong', 'detailQueue', 'detailIndex', 'detailSource', 'artistInfo', 'artistTab', 'artistBio',
  'favoriteKind', 'commentSong', 'comments', 'hotComments', 'commentTotal', 'offset', 'more', 'trackIds'];
function navigate(page, title) {
  stopQr();
  stopSuggestions();
  composingSearch = false;
  const entry = Object.fromEntries(PAGE_FIELDS.map(field => [field, s[field]]));
  s.stack.push({...entry, scroll: document.querySelector('main.content')?.scrollTop || 0});
  Object.assign(s, {page, title, error: '', busy: false, more: false, offset: 0, songs: [], cards: [], trackIds: [], collection: null, artistInfo: null, artistTab: 'hot', artistBio: null});
  s.request++;
  render();
  document.querySelector('main.content').scrollTop = 0;
}
function back() {
  stopSuggestions();
  composingSearch = false;
  if (s.sheet) {
    s.sheet = '';
    render();
    return true;
  }
  if (s.player || playerElement) {
    s.player = false;
    render();
    return true;
  }
  if (s.stack.length) {
    stopQr();
    s.request++;
    Object.assign(s, s.stack.pop(), {busy: false, error: ''});
    render();
    document.querySelector('main.content').scrollTop = s.scroll;
    return true;
  }
  if (s.page !== 'home') {
    tab('home');
    return true;
  }
  return false;
}
window.musicBack = back;

/** Runs a page request; late results from a page the user already left are dropped. */
async function load(job) {
  const request = ++s.request;
  s.busy = true;
  s.error = '';
  render();
  try {
    const update = await job();
    if (request === s.request && update) Object.assign(s, update);
  } catch (error) {
    if (request === s.request) s.error = error.message;
  } finally {
    if (request === s.request) {
      s.busy = false;
      render();
    }
  }
}
function rememberTab(page) {
  if (!TOP_PAGES.includes(page)) return;
  const scroll = document.querySelector('main.content')?.scrollTop || 0;
  if (page === 'search') s.tabMemory.search = {query: s.query, type: s.type, songs: [...s.songs], cards: [...s.cards], offset: s.offset, more: s.more, error: s.error, scroll};
  else if (page === 'library') s.tabMemory.library = {offset: s.offset, more: s.more, error: s.error, scroll};
  else s.tabMemory[page] = {error: s.error, scroll};
}
function restoreTab(page) {
  const saved = s.tabMemory[page];
  Object.assign(s, {error: saved?.error || '', busy: false, more: false, offset: 0, songs: [], cards: []});
  if (page === 'search') {
    Object.assign(s, {query: saved?.query || '', type: saved?.type || 1, songs: saved?.songs || [], cards: saved?.cards || [], offset: saved?.offset || 0, more: Boolean(saved?.more)});
  } else if (page === 'library') {
    Object.assign(s, {offset: saved?.offset || 0, more: Boolean(saved?.more)});
  }
  return saved?.scroll || 0;
}
async function tab(page) {
  rememberTab(s.page);
  stopQr();
  stopSuggestions();
  composingSearch = false;
  s.stack = [];
  s.request++;
  s.page = page;
  s.title = {home: '音乐', search: '搜索', library: '音乐库', settings: '设置'}[page];
  const scroll = restoreTab(page);
  s.artistInfo = null;
  s.artistBio = null;
  render();
  const main = document.querySelector('main.content');
  if (main) main.scrollTop = scroll;
  if (page === 'home') await loadHome();
  if (page === 'library') await loadLibrary();
  if (page === 'search') await loadSearchStart();
}
function requireLogin() {
  if (s.settings.loggedIn) return true;
  s.player = false;
  navigate('account', '账号');
  return false;
}

// Loading pages

async function loadHome() {
  await load(async () => {
    const [data, history] = await Promise.all([api(s.settings.loggedIn ? '/recommend/resource' : '/top/playlist', {limit: 18}), native('history')]);
    return {home: data.recommend || data.playlists || [], history};
  });
}
async function session() {
  if (!s.settings.loggedIn) return;
  const data = await api('/login/status');
  s.profile = data.data?.profile || null;
  if (!s.profile) {
    s.settings.loggedIn = false;
    return;
  }
  const likes = await api('/likelist', {uid: s.profile.userId});
  s.likes = new Set((likes.ids || []).map(String));
  syncLikes();
}
/** Lets the notification's like button reflect the same likes as the app. */
function syncLikes() { native('likes', {ids: [...s.likes]}).catch(() => {}); }
async function loadLibrary(more = false) {
  if (!s.settings.loggedIn) {
    render();
    return;
  }
  await load(async () => {
    if (!s.profile) await session();
    if (!s.profile) throw new Error('登录已过期，请重新登录');
    const offset = more ? s.offset + 30 : 0;
    const data = await api('/user/playlist', {uid: s.profile.userId, offset, limit: 30});
    return {library: more ? [...s.library, ...(data.playlist || [])] : data.playlist || [], offset, more: data.more === true};
  });
}
async function searchMore(more = false) {
  stopSuggestions();
  const keywords = s.query.trim();
  if (!keywords) return;
  if (!more) native('searchAdd', {keyword: keywords}).then(list => { if (Array.isArray(list)) s.searchHistory = list; }).catch(() => {});
  await load(async () => {
    const offset = more ? s.offset + 30 : 0;
    const data = await api('/cloudsearch', {keywords, type: s.type, limit: 30, offset});
    const result = data.result || {};
    const list = s.type === 1 ? tracks(result.songs) : s.type === 1000 ? result.playlists || [] : s.type === 100 ? result.artists || [] : result.albums || [];
    const total = result.songCount || result.playlistCount || result.artistCount || result.albumCount || 0;
    return {
      songs: s.type === 1 ? (more ? [...s.songs, ...list] : list) : [],
      cards: s.type === 1 ? [] : (more ? [...s.cards, ...list] : list),
      offset,
      more: offset + list.length < total,
    };
  });
}
async function openPlaylist(card) {
  navigate('collection', '歌单');
  s.collection = {id: card.id, name: card.name, cover: imageUrl(card.coverImgUrl || card.picUrl), kind: 'playlist'};
  await loadPlaylist(card);
}
/** Loads a playlist's track ids and the first 50 songs; `offset` counts how many ids are loaded. */
async function loadPlaylist(card) {
  const base = {id: card.id, name: card.name, cover: imageUrl(card.coverImgUrl || card.picUrl), kind: 'playlist'};
  await load(async () => {
    const playlist = (await api('/playlist/detail', {id: card.id})).playlist;
    const ids = (playlist.trackIds || []).map(x => String(x.id));
    const first = ids.slice(0, 50);
    const songs = first.length ? tracks((await api('/song/detail', {ids: first.join(',')})).songs) : tracks(playlist.tracks);
    const subscribed = playlist.subscribed === true;
    return {
      trackIds: ids, songs, offset: first.length, more: ids.length > first.length,
      collection: {
        ...base, name: playlist.name || base.name, cover: imageUrl(playlist.coverImgUrl) || base.cover,
        subtitle: `${playlist.trackCount || ids.length} 首歌曲`, subscribed, creatorId: playlist.creator?.userId, detailsLoaded: true,
        card: {id: card.id, name: playlist.name || card.name, coverImgUrl: playlist.coverImgUrl || card.coverImgUrl, creator: playlist.creator, subscribed},
      },
    };
  });
}
async function togglePlaylistSubscription() {
  const collection = s.collection;
  if (collection?.kind !== 'playlist' || !collection.detailsLoaded || pendingSubscriptions.has(String(collection.id))) return;
  if (!requireLogin()) return;
  const id = String(collection.id);
  pendingSubscriptions.add(id);
  render();
  try {
    if (!s.profile) await session();
    if (!s.settings.loggedIn || !s.profile) throw new Error('登录已过期，请重新登录');
    if (String(collection.creatorId) === String(s.profile.userId)) return;
    const subscribed = !collection.subscribed;
    await api('/playlist/subscribe', {id: collection.id, t: subscribed ? 1 : 2});
    const update = c => c?.kind === 'playlist' && String(c.id) === id ? {...c, subscribed, card: {...c.card, subscribed}} : c;
    s.collection = update(s.collection);
    for (const entry of s.stack) entry.collection = update(entry.collection);
    for (const list of [s.home, s.cards, s.library]) for (const card of list) if (String(card.id) === id) card.subscribed = subscribed;
    if (subscribed) {
      if (!s.library.some(card => String(card.id) === id)) s.library.unshift({...collection.card, subscribed: true});
    } else {
      s.library = s.library.filter(card => String(card.id) !== id);
    }
    toast(subscribed ? '已收藏歌单' : '已取消收藏');
  } finally {
    pendingSubscriptions.delete(id);
    render();
  }
}
async function simpleCollection(name, kind, route, params = {}) {
  navigate('collection', name);
  s.collection = {name, kind, route, params};
  await loadSimpleCollection();
}
async function loadSimpleCollection() {
  const {kind, route, params} = s.collection;
  await load(async () => {
    const data = await api(route, params);
    const raw = kind === 'daily' ? data.data?.dailySongs : kind === 'artist' ? data.hotSongs : kind === 'album' ? data.songs : data.data;
    const songs = tracks(raw);
    return {songs, offset: 0, more: kind === 'cloud' && (data.hasMore === true || data.count > songs.length), collection: {...s.collection, cover: songs[0]?.cover}};
  });
}
async function openLikes() {
  navigate('collection', '喜欢的音乐');
  s.collection = {name: '喜欢的音乐', kind: 'likes'};
  await loadLikes();
}
async function loadLikes() {
  await load(async () => {
    await session();
    const ids = [...s.likes], first = ids.slice(0, 50);
    return {trackIds: ids, songs: first.length ? tracks((await api('/song/detail', {ids: first.join(',')})).songs) : [], offset: first.length, more: ids.length > first.length};
  });
}
async function openHistory() {
  navigate('collection', '最近播放');
  s.collection = {name: '最近播放', kind: 'history'};
  await loadHistory();
}
async function loadHistory() { await load(async () => ({songs: await native('history')})); }
/** Refreshes the open collection in place, keeping the navigation stack. */
async function reloadCollection() {
  const c = s.collection;
  if (!c) return;
  if (c.kind === 'playlist') await loadPlaylist(c.card || {id: c.id, name: c.name, coverImgUrl: c.cover});
  else if (c.kind === 'album') await loadAlbum({id: c.id, name: c.name, picUrl: c.cover});
  else if (c.kind === 'likes') await loadLikes();
  else if (c.kind === 'history') await loadHistory();
  else await loadSimpleCollection();
}
async function openFm() {
  if (!requireLogin() || s.fmBusy) return;
  const request = ++s.request;
  s.fmBusy = true;
  s.fmError = '';
  render();
  try {
    const songs = tracks((await api('/personal_fm')).data);
    if (request !== s.request) return;
    if (!songs.length) throw new Error('暂时没有私人 FM 推荐，请稍后重试');
    await start(songs, 0, true);
  } catch (error) {
    if (request === s.request) s.fmError = error.message;
  } finally {
    if (request === s.request) {
      s.fmBusy = false;
      render();
    }
  }
}
async function openArtist(artist) {
  if (!artist || !/^\d+$/.test(String(artist.id)) || Number(artist.id) <= 0) throw new Error('歌手信息不可用');
  s.player = false;
  s.sheet = '';
  navigate('artistpage', '歌手');
  s.artistInfo = {id: String(artist.id), name: artist.name || '歌手', cover: imageUrl(artist.picUrl || artist.img1v1Url)};
  await loadArtistPane();
}
async function openAlbum(card) {
  if (!card) return;
  navigate('collection', '专辑');
  s.collection = {id: String(card.id), name: card.name, kind: 'album', cover: imageUrl(card.picUrl || card.cover), route: '/album', params: {id: card.id}};
  await loadAlbum(card);
}
async function loadAlbum(card) {
  const album = {id: String(card.id), name: card.name, kind: 'album', cover: imageUrl(card.picUrl || card.cover), route: '/album', params: {id: card.id}};
  const generation = accountGeneration, key = entityKey('album', card.id), statusBefore = entitySubscriptions.get(key);
  await load(async () => {
    const data = await api('/album', {id: card.id}), info = data.album || card;
    const collection = {...album, name: info.name || album.name, cover: imageUrl(info.picUrl) || album.cover, card: {...info, id: album.id}};
    if (generation === accountGeneration && entitySubscriptions.get(key) === statusBefore) rememberEntity('album', collection.card, undefined);
    return {songs: tracks(data.songs), collection};
  });
  if (s.page === 'collection' && s.collection?.kind === 'album' && s.collection.id === album.id && s.settings.loggedIn) await refreshEntityStatus('album', false);
}
async function refreshEntityStatus(kind, showError = true) {
  const entity = kind === 'artist' ? s.artistInfo : s.collection;
  if (!entity?.id || !requireLogin()) return;
  const key = entityKey(kind, entity.id);
  if (pendingEntities.has(key)) return;
  pendingEntities.add(key);
  render();
  const generation = accountGeneration;
  try {
    const data = await api(kind === 'artist' ? '/artists' : '/album/detail/dynamic', {id: entity.id});
    const status = kind === 'artist' ? data.artist?.followed : data.isSub;
    if (typeof status !== 'boolean') throw new Error('未取得收藏状态，请重试');
    if (generation === accountGeneration) entitySubscriptions.set(key, {card: kind === 'artist' ? {...entity, ...data.artist} : entity.card || entity, subscribed: status});
  } catch (error) {
    if (showError) throw error;
  } finally {
    pendingEntities.delete(key);
    render();
  }
}
async function toggleEntitySubscription(kind) {
  const entity = kind === 'artist' ? s.artistInfo : s.collection;
  if (!entity?.id || !requireLogin()) return;
  const key = entityKey(kind, entity.id), state = entitySubscriptions.get(key);
  if (pendingEntities.has(key)) return;
  if (typeof state?.subscribed !== 'boolean') {
    await refreshEntityStatus(kind);
    return;
  }
  pendingEntities.add(key);
  render();
  const generation = accountGeneration, subscribed = !state.subscribed;
  try {
    await api(`/${kind}/sub`, {id: entity.id, t: subscribed ? 1 : 2});
    if (generation !== accountGeneration) return;
    entitySubscriptions.set(key, {...state, subscribed});
    const update = entry => {
      if (entry.page !== 'favorites' || entry.favoriteKind !== kind) return;
      entry.cards = entry.cards.filter(card => String(card.id) !== String(entity.id));
      if (subscribed) entry.cards.unshift({...state.card, id: entity.id});
    };
    update(s);
    for (const entry of s.stack) update(entry);
    toast(subscribed ? '已收藏' : '已取消收藏');
  } finally {
    pendingEntities.delete(key);
    render();
  }
}
async function openFavorites(kind) {
  if (!requireLogin()) return;
  navigate('favorites', kind === 'artist' ? '收藏的歌手' : '收藏的专辑');
  s.favoriteKind = kind;
  await loadFavorites();
}
async function loadFavorites(append = false) {
  const kind = s.favoriteKind, offset = append ? s.offset + 30 : 0, previous = append ? [...s.cards] : [], generation = accountGeneration;
  const statusesBefore = new Map(entitySubscriptions);
  await load(async () => {
    const data = await api(`/${kind}/sublist`, {limit: 30, offset}), list = Array.isArray(data.data) ? data.data : [];
    if (generation !== accountGeneration) return;
    for (const card of list) {
      const key = entityKey(kind, card.id);
      if (entitySubscriptions.get(key) === statusesBefore.get(key)) rememberEntity(kind, card, true);
    }
    const more = typeof data.hasMore === 'boolean' ? data.hasMore : typeof data.more === 'boolean' ? data.more : list.length === 30;
    return {cards: [...previous, ...list], offset, more};
  });
}
async function openRankings() {
  navigate('rankings', '排行榜');
  await loadRankings();
}
async function loadRankings() {
  await load(async () => {
    const data = await api('/toplist');
    return {cards: Array.isArray(data.list) ? data.list : []};
  });
}
async function openComments(source) {
  const song = source === 'current' ? current() : s.detailSong;
  if (!song) return;
  s.player = false;
  s.sheet = '';
  navigate('comments', '歌曲评论');
  Object.assign(s, {commentSong: {...song}, comments: [], hotComments: [], commentTotal: 0});
  await loadComments();
}
async function loadComments(append = false) {
  const song = s.commentSong;
  if (!song) return;
  const offset = append ? s.offset + 20 : 0, previous = append ? [...s.comments] : [], hot = append ? s.hotComments : [];
  // The service only pages by offset up to 5000; beyond that it pages by the last comment's time.
  const cursor = offset >= 5000 ? Number(previous.at(-1)?.time) || 0 : 0;
  await load(async () => {
    const data = await api('/comment/music', {id: song.id, limit: 20, offset: cursor ? 0 : offset, before: cursor});
    const next = Array.isArray(data.comments) ? data.comments : [], seen = new Set(previous.map(c => String(c.commentId)));
    const unique = next.filter(c => {
      const id = String(c.commentId);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return {
      comments: [...previous, ...unique],
      hotComments: append ? hot : Array.isArray(data.hotComments) ? data.hotComments : [],
      commentTotal: Math.max(0, Number(data.total) || 0),
      offset,
      more: next.length > 0 && (typeof data.more === 'boolean' ? data.more : offset + next.length < Number(data.total)),
    };
  });
}
async function loadArtistPane(append = false) {
  const artist = s.artistInfo, tab = s.artistTab;
  if (!artist) return;
  const generation = accountGeneration, key = entityKey('artist', artist.id), statusBefore = entitySubscriptions.get(key);
  const offset = append ? s.offset + 30 : 0, oldSongs = append ? [...s.songs] : [], oldCards = append ? [...s.cards] : [];
  if (!append) Object.assign(s, {songs: [], cards: [], more: false, offset: 0});
  await load(async () => {
    if (tab === 'hot') {
      const data = await api('/artists', {id: artist.id}), info = data.artist || {};
      if (generation === accountGeneration && entitySubscriptions.get(key) === statusBefore) rememberEntity('artist', {...artist, ...info, id: artist.id}, info.followed);
      return {songs: tracks(data.hotSongs), more: false, artistInfo: {...artist, ...info, id: artist.id, cover: imageUrl(info.picUrl || info.img1v1Url) || artist.cover}};
    }
    if (tab === 'bio') {
      const data = await api('/artist/desc', {id: artist.id});
      return {artistBio: {briefDesc: data.briefDesc || artist.briefDesc || '', introduction: Array.isArray(data.introduction) ? data.introduction : []}, more: false};
    }
    const data = await api(tab === 'albums' ? '/artist/album' : '/artist/songs', {id: artist.id, limit: 30, offset});
    const list = tab === 'albums' ? data.hotAlbums || [] : tracks(data.songs);
    return {
      songs: tab === 'songs' ? [...oldSongs, ...list] : [],
      cards: tab === 'albums' ? [...oldCards, ...list] : [],
      offset,
      more: typeof data.more === 'boolean' ? data.more : list.length === 30,
    };
  });
}
async function openSongArtist(value) {
  const [source, index] = value.split('-'), song = source === 'current' ? current() : s.detailSong;
  if (!song) return;
  if (index !== 'lookup') {
    const artist = songArtists(song)[Number(index)];
    if (artist) await openArtist(artist);
    return;
  }
  // Older queue entries may lack artist ids; look them up without touching playback.
  const request = s.request, id = song.id;
  const data = await api('/song/detail', {ids: id}), detail = tracks(data.songs).find(item => item.id === id);
  const stale = source === 'current' ? !s.player || current()?.id !== id : s.page !== 'songdetail' || s.detailSong?.id !== id;
  if (request !== s.request || stale) return;
  const artists = (detail?.artists || []).filter(a => /^\d+$/.test(a.id) && Number(a.id) > 0);
  if (!artists.length) throw new Error('暂无歌手信息');
  artistRefs.set(id, artists);
  render();
  if (artists.length === 1) await openArtist(artists[0]);
}
async function more() {
  if (s.busy) return;
  if (s.page === 'comments') return loadComments(true);
  if (s.page === 'favorites') return loadFavorites(true);
  if (s.page === 'artistpage') return loadArtistPane(true);
  if (s.page === 'search') return searchMore(true);
  if (s.page === 'library') return loadLibrary(true);
  await load(async () => {
    if (s.collection?.kind === 'cloud') {
      const offset = s.offset + 30;
      const data = await api('/user/cloud', {limit: 30, offset});
      const next = tracks(data.data);
      return {songs: [...s.songs, ...next], offset, more: data.hasMore === true || data.count > offset + next.length};
    }
    const ids = s.trackIds.slice(s.offset, s.offset + 50);
    if (!ids.length) return {more: false};
    const next = tracks((await api('/song/detail', {ids: ids.join(',')})).songs);
    const offset = s.offset + ids.length;
    return {songs: [...s.songs, ...next], offset, more: offset < s.trackIds.length};
  });
}

// Playback

async function start(list, index = 0, fm = false) {
  if (!list.length) return;
  fillGeneration++;
  // The queue holds at most MAX_QUEUE songs; keep a window around the chosen one.
  const from = Math.max(0, Math.min(index, list.length - MAX_QUEUE));
  await control('queue', {songs: list.slice(from, from + MAX_QUEUE), index: index - from, fm});
  s.player = true;
  render();
}
/** Plays the open list; songs of a long playlist that are not loaded yet are appended in the background. */
async function playCollection(index = 0) {
  const loaded = s.songs, have = new Set(loaded.map(song => song.id));
  const pending = s.trackIds.slice(s.offset).filter(id => !have.has(id)).slice(0, Math.max(0, MAX_QUEUE - loaded.length));
  await start(loaded, index);
  if (!pending.length) return;
  const generation = fillGeneration;
  queueFill = fillQueue(pending, generation).catch(() => {
    if (generation === fillGeneration) toast('部分歌曲未能加入播放队列');
  });
}
async function fillQueue(ids, generation) {
  for (let i = 0; i < ids.length; i += 100) {
    const batch = tracks((await api('/song/detail', {ids: ids.slice(i, i + 100).join(',')})).songs);
    if (generation !== fillGeneration) return;
    if (batch.length) await control('append', {songs: batch});
  }
}
function viewSong(list, index, source = '') {
  const song = list[index];
  if (!song) return;
  s.sheet = '';
  s.player = false;
  navigate('songdetail', '歌曲');
  Object.assign(s, {detailSong: song, detailQueue: [...list], detailIndex: index, detailSource: source});
  render();
}
async function likeSong(song) {
  if (!song || !requireLogin()) return;
  const like = !s.likes.has(song.id);
  await api('/like', {id: song.id, like});
  like ? s.likes.add(song.id) : s.likes.delete(song.id);
  syncLikes();
  render();
  toast(like ? '已加入喜欢' : '已取消喜欢');
}
async function loadLyrics() {
  const id = current()?.id;
  if (!id || s.lyricId === id) return;
  const token = ++lyricRequest;
  s.lyricId = id;
  s.lines = [];
  s.lyricError = '正在加载歌词…';
  render();
  try {
    const data = await api('/lyric', {id});
    if (token !== lyricRequest) return;
    s.lines = lyrics(data.lrc?.lyric || '', data.tlyric?.lyric || '');
    s.lyricError = '暂无歌词';
  } catch (error) {
    if (token !== lyricRequest) return;
    s.lyricError = error.message;
    s.lyricId = '';
  }
  render();
  updatePosition();
}
async function changeSetting(name, value) {
  s.settings = await native('settings', {[name]: value});
  if (name === 'theme') theme();
  render();
  if (name !== 'quality') return;
  if (current()) {
    await control('reload');
    toast('已切换音质，正在重新加载当前歌曲');
  } else {
    toast('新音质将在播放时使用');
  }
}

// Login

async function qr() {
  stopQr();
  const generation = pollGeneration;
  s.qr = '';
  s.qrStatus = '';
  await load(async () => {
    const key = (await api('/login/qr/key')).data?.unikey;
    if (!key) throw new Error('未取得登录二维码，请重试');
    const image = await native('qr', {key});
    if (generation !== pollGeneration) return {};
    s.qrKey = key;
    return {qr: image.image, qrStatus: '等待扫码'};
  });
  if (generation !== pollGeneration || !s.qr) return;
  const expires = Date.now() + 150000;
  const showStatus = () => {
    const status = document.querySelector('#qrstatus');
    if (status) status.textContent = s.qrStatus;
  };
  const poll = async () => {
    if (generation !== pollGeneration || s.page !== 'account') return;
    if (Date.now() > expires) {
      s.qrStatus = '二维码已过期，请刷新';
      render();
      return;
    }
    try {
      const result = await api('/login/qr/check', {key: s.qrKey});
      if (generation !== pollGeneration) return;
      if (result.code === 803) {
        s.settings = await native('init');
        await session();
        stopQr();
        s.qr = '';
        toast('登录成功');
        render();
        return;
      }
      s.qrStatus = {800: '二维码已过期，请刷新', 801: '等待扫码', 802: '已扫码，请在网易云音乐中确认'}[result.code] || '等待确认';
      showStatus();
      if (result.code === 800) return;
    } catch (error) {
      s.qrStatus = error.message;
      showStatus();
    }
    qrTimer = setTimeout(poll, 2500);
  };
  qrTimer = setTimeout(poll, 2500);
}
async function logout() {
  stopQr();
  stopSuggestions();
  fillGeneration++;
  await native('logout');
  accountGeneration++;
  s.request++;
  entitySubscriptions.clear();
  Object.assign(s, {stack: [], cards: [], artistInfo: null, artistBio: null, profile: null, history: [], library: [], searchHistory: [], sheet: '', player: false});
  s.settings = await native('init');
  s.likes.clear();
  render();
}

// Actions

async function action(name, value) {
  const index = Number(value);
  switch (name) {
    case 'tab': await tab(value); break;
    case 'back': back(); break;
    case 'refresh':
      if (s.page === 'home') await loadHome();
      else if (s.page === 'library') await loadLibrary();
      else if (s.page === 'collection') await reloadCollection();
      break;
    case 'homecard': await openPlaylist(s.home[index]); break;
    case 'librarycard': await openPlaylist(s.library[index]); break;
    case 'playlist': await openPlaylist(s.cards[index]); break;
    case 'subscribeplaylist': await togglePlaylistSubscription(); break;
    case 'entitysub': if (['artist', 'album'].includes(value)) await toggleEntitySubscription(value); break;
    case 'entitystatus': if (['artist', 'album'].includes(value)) await refreshEntityStatus(value); break;
    case 'favoriteartists': await openFavorites('artist'); break;
    case 'favoritealbums': await openFavorites('album'); break;
    case 'favoritesrefresh': await loadFavorites(); break;
    case 'rankings': await openRankings(); break;
    case 'rankingsrefresh': await loadRankings(); break;
    case 'ranking': await openPlaylist(s.cards[index]); break;
    case 'comments': await openComments(value); break;
    case 'commentsrefresh': await loadComments(); break;
    case 'commentsmore': await loadComments(true); break;
    case 'artist': await openArtist(s.cards[index]); break;
    case 'album': await openAlbum(s.cards[index]); break;
    case 'songartist': await openSongArtist(value); break;
    case 'artisttab':
      if (['hot', 'songs', 'albums', 'bio'].includes(value) && s.artistInfo) {
        s.artistTab = value;
        await loadArtistPane();
        document.querySelector('main.content').scrollTop = 0;
      }
      break;
    case 'artistrefresh': await loadArtistPane(); break;
    case 'daily': if (requireLogin()) await simpleCollection('每日推荐', 'daily', '/recommend/songs'); break;
    case 'new': await simpleCollection('新歌速递', 'new', '/top/song'); break;
    case 'fm': await openFm(); break;
    case 'cloud': if (requireLogin()) await simpleCollection('音乐云盘', 'cloud', '/user/cloud', {limit: 30}); break;
    case 'likes': if (requireLogin()) await openLikes(); break;
    case 'history': await openHistory(); break;
    case 'search': await searchMore(); break;
    case 'suggestretry': await fetchSuggestions(); break;
    case 'suggestion': await searchKeyword(s.suggestions[index]); break;
    case 'searchhistory': await searchKeyword(s.searchHistory[index]); break;
    case 'hotsearch': await searchKeyword(s.hotSearches[index]); break;
    case 'clearsearches':
      await native('searchClear');
      s.searchHistory = [];
      render();
      break;
    case 'type':
      Object.assign(s, {type: index, songs: [], cards: [], busy: true, error: ''});
      render();
      await searchMore();
      break;
    case 'more': await more(); break;
    case 'song':
      if (s.settings.tapPlay) await playCollection(index);
      else viewSong(s.songs, index);
      break;
    case 'recent':
      if (s.settings.tapPlay) await start(s.history, index);
      else viewSong(s.history, index);
      break;
    case 'queuedetail':
      if (s.settings.tapPlay) await control('jump', {index});
      else viewSong(s.playback.queue, index, 'queue');
      break;
    case 'songplay': await playCollection(index); break;
    case 'recentplay': await start(s.history, index); break;
    case 'playdetail': {
      if (!s.detailSong) break;
      const queued = s.playback.queue.findIndex(song => song.id === s.detailSong.id);
      if (s.detailSource === 'queue' && queued >= 0) {
        await control('jump', {index: queued});
        s.player = true;
        render();
      } else {
        await start(s.detailQueue, s.detailIndex);
      }
      break;
    }
    case 'playnext':
      if (s.detailSong) {
        await control('playnext', {song: s.detailSong});
        toast('将在下一首播放');
      }
      break;
    case 'queueadd':
      if (s.detailSong) {
        await control('append', {songs: [s.detailSong]});
        toast('已加入播放队列');
      }
      break;
    case 'likedetail': await likeSong(s.detailSong); break;
    case 'playall': await playCollection(0); break;
    case 'player': s.player = true; render(); break;
    case 'closeplayer': s.player = false; render(); break;
    case 'toggle': await control(s.playback.playing ? 'pause' : 'play'); break;
    case 'next': case 'previous': case 'repeat': case 'shuffle': await control(name); break;
    case 'jump': case 'remove': await control(name, {index}); break;
    case 'clearqueue':
      fillGeneration++;
      await control('clear');
      Object.assign(s, {sheet: '', player: false});
      render();
      toast('已清空播放队列');
      break;
    case 'trash':
      if (current() && requireLogin()) await control('trash', {id: current().id});
      break;
    case 'queue': case 'sleep': s.sheet = name; render(); break;
    case 'sleepvalue':
      await control('sleep', {minutes: index});
      Object.assign(s.playback, {sleep: index, sleepRemaining: index > 0 ? index * 60000 : 0});
      s.sheet = '';
      render();
      break;
    case 'closesheet': s.sheet = ''; render(); break;
    case 'lyrics':
      s.lyric = !s.lyric;
      s.lyricFollow = true;
      render();
      if (s.lyric) await loadLyrics();
      break;
    case 'lyricsretry': s.lyricId = ''; await loadLyrics(); break;
    case 'followlyrics': s.lyricFollow = true; render(); updatePosition(); break;
    case 'lyricseek': await control('seek', {position: s.lines[index].time}); break;
    case 'like': await likeSong(current()); break;
    case 'account': s.player = false; navigate('account', '账号'); break;
    case 'official-login': stopQr(); s.qr = ''; render(); await native('officialLogin'); break;
    case 'qr': await qr(); break;
    case 'background': await changeSetting('background', !s.settings.background); break;
    case 'tapplay': await changeSetting('tapPlay', !s.settings.tapPlay); break;
    case 'logoutconfirm': s.sheet = 'logout'; render(); break;
    case 'logout': await logout(); break;
    case 'privacy': navigate('privacy', '隐私说明'); break;
    case 'about': navigate('about', '关于'); break;
    case 'license': navigate('license', '开源许可'); break;
  }
}

// Events

app.addEventListener('click', async event => {
  if (event.target.dataset.dismiss === 'sheet') {
    s.sheet = '';
    render();
    return;
  }
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const [name, value] = target.dataset.action.split(':');
  target.disabled = true;
  try {
    await action(name, value);
  } catch (error) {
    toast(error.message);
  } finally {
    target.disabled = false;
  }
});
app.addEventListener('submit', event => {
  if (event.target.id !== 'searchform') return;
  event.preventDefault();
  document.querySelector('#query')?.blur();
  searchMore();
});
app.addEventListener('compositionstart', event => {
  if (event.target.id !== 'query') return;
  composingSearch = true;
  stopSuggestions();
});
app.addEventListener('compositionend', event => {
  if (event.target.id !== 'query') return;
  composingSearch = false;
  onSearchInput(event.target.value);
});
app.addEventListener('input', event => {
  if (event.target.id === 'query') {
    if (!event.isComposing) onSearchInput(event.target.value);
    else s.query = event.target.value;
  }
  if (event.target.id === 'seek') {
    const elapsed = document.querySelector('#elapsed');
    if (elapsed) elapsed.textContent = time(Number(event.target.value));
  }
});
app.addEventListener('change', async event => {
  try {
    if (event.target.id === 'seek') await control('seek', {position: Number(event.target.value)});
    if (['quality', 'theme'].includes(event.target.id)) await changeSetting(event.target.id, event.target.value);
  } catch (error) {
    toast(error.message);
  }
});

// Queue reordering: drag a row by its handle; other rows shift to show where it will land.
app.addEventListener('pointerdown', event => {
  const handle = event.target.closest?.('[data-drag]');
  if (!handle) return;
  const row = handle.closest('.queue-row'), list = [...row.parentElement.querySelectorAll('.queue-row')];
  const from = Number(handle.dataset.drag);
  drag = {from, to: from, list, startY: event.clientY, height: row.getBoundingClientRect().height};
  row.classList.add('dragging');
  handle.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});
app.addEventListener('pointermove', event => {
  if (!drag) return;
  const {from, height, list} = drag, dy = event.clientY - drag.startY;
  const to = Math.max(0, Math.min(list.length - 1, from + Math.round(dy / height)));
  drag.to = to;
  list.forEach((row, i) => {
    if (i === from) {
      row.style.transform = `translateY(${dy}px)`;
      return;
    }
    const shift = from < to && i > from && i <= to ? -height : from > to && i < from && i >= to ? height : 0;
    row.style.transform = shift ? `translateY(${shift}px)` : '';
  });
});
async function endDrag(event) {
  if (!drag) return;
  const {from, to, list} = drag;
  drag = null;
  list.forEach(row => {
    row.style.transform = '';
    row.classList.remove('dragging');
  });
  if (event.type === 'pointerup' && from !== to) {
    try {
      await control('move', {from, to});
    } catch (error) {
      toast(error.message);
    }
  }
  render();
}
app.addEventListener('pointerup', endDrag);
app.addEventListener('pointercancel', endDrag);

document.addEventListener('keydown', event => { if (event.key === 'Escape') back(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopQr();
  else if (s.page === 'account' && !s.settings.loggedIn && s.qr) {
    s.qrStatus = '请刷新二维码后继续登录';
    render();
  }
});
// Startup
render();
if (isAndroid) {
  try {
    s.settings = await native('init');
    theme();
    initialized = true;
    s.busy = true;
    render();
    await native('uiReady');
    try {
      await session();
    } catch (error) {
      toast(error.message);
    }
    await loadHome();
  } catch (error) {
    initialized = true;
    s.busy = false;
    s.error = error.message;
    render();
    try { await native('uiReady'); } catch {}
  }
} else {
  s.error = '请安装 Android 应用使用音乐服务';
  render();
}
