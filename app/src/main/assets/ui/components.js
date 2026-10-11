// Small markup building blocks shared by every page.
import {escape as e, imageUrl, time} from './model.js';
import {s, current} from './state.js';

/** Markup template tag: drops line breaks and indentation between tags, so templates can be laid out readably. */
export function html(strings, ...values) {
  let out = '';
  strings.forEach((part, i) => {
    out += part.replace(/\n\s*/g, '');
    if (i < values.length) out += Array.isArray(values[i]) ? values[i].join('') : values[i] ?? '';
  });
  return out;
}

export const icons = {
  home: 'M3 10 12 3l9 7v10H3Z M9 20v-7h6v7',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  library: 'M4 4v16M9 4v16M14 4l6 16',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  play: 'm9 5 11 7-11 7Z',
  pause: 'M8 5v14M16 5v14',
  next: 'm9 5 7 7-7 7',
  skipnext: 'm5 5 10 7-10 7Z M19 5v14',
  previous: 'm19 5-10 7 10 7Z M5 5v14',
  queue: 'M3 5h18M3 11h18M3 17h12',
  playnext: 'M3 5h12M3 11h12M3 17h8M17 13v8m-4-4h8',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  dislike: 'M17 14V3H7.4a2 2 0 0 0-2 1.6l-1.3 7A2 2 0 0 0 6 14h4.5l-.8 4.2a2 2 0 0 0 3.6 1.5L17 14Zm0-11h3v11h-3',
  back: 'm15 5-7 7 7 7',
  down: 'm5 9 7 7 7-7',
  close: 'm6 6 12 12M6 18 18 6',
  drag: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  radio: 'M5 8a10 10 0 0 0 0 12M19 8a10 10 0 0 1 0 12M8 11a5 5 0 0 0 0 6M16 11a5 5 0 0 1 0 6M12 13v2',
  repeat: 'M4 8h15l-3-3M20 16H5l3 3M20 8v4M4 16v-4',
  shuffle: 'M3 5h3l12 14h3m-4-4 4 4-4 3M3 19h3l4-5m4-4 4-5h3m-4-3 4 3-4 4',
  cloud: 'M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13 0 5 5 0 0 1 0 10Z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2',
  music: 'M9 18V5l11-2v13M9 16c-7-3-7 6 0 3m11-5c-7-3-7 6 0 3',
  refresh: 'M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 14-2M19 16A8 8 0 0 1 5 18',
  chart: 'M4 20h16M6 16V9h4v7M14 16V4h4v12',
};

export const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${icons[name] || icons.music}"/></svg>`;

export const button = (name, action, label, extra = '') =>
  `<button class="icon ${extra}" data-action="${action}" aria-label="${e(label)}">${icon(name === 'next' && action === 'next' ? 'skipnext' : name)}</button>`;

const fallbackArt = () => '<svg class="art" viewBox="0 0 108 108" aria-hidden="true"><path d="M45 30 77 24V69C77 82 55 85 55 73C55 65 65 62 71 65V37L45 42V78C45 91 23 94 23 82C23 74 33 71 39 74V31Z"/></svg>';

export const art = url => {
  const src = imageUrl(url);
  return html`<div class="artbox">${src
    ? `<img loading="lazy" referrerpolicy="no-referrer" src="${e(src)}" alt=""><span class="art-fallback" hidden>${fallbackArt()}</span>`
    : fallbackArt()}</div>`;
};

const spinner = message => `<span class="spinner" aria-label="${e(message)}"><i></i><i></i><i></i></span>`;

export const loading = (message = '正在加载…') =>
  `<div class="empty loading-state" role="status">${spinner(message)}<span>${e(message)}</span></div>`;

export const loadingInline = (message = '正在更新…') =>
  `<div class="inline-status" role="status">${spinner(message)}<span>${e(message)}</span></div>`;

export const busySpinner = () => spinner('正在处理');

export const retryInline = (message, action, label = '重试') =>
  `<div class="inline-status error-inline" role="alert"><span>${e(message)}</span><button class="secondary" data-action="${e(action)}">${e(label)}</button></div>`;

export function empty(message, action, label = '重试') {
  return html`
    <div class="empty">
      <p>${e(message)}</p>
      ${action ? `<button class="primary" data-action="${action}">${e(label)}</button>` : ''}
    </div>`;
}

export const loadMore = () =>
  s.more ? `<button class="loadmore" data-action="more" ${s.busy ? 'disabled' : ''}>${s.busy ? '正在加载…' : '加载更多'}</button>` : '';

export function rows(list = s.songs, action = 'song') {
  return list.map((song, i) => html`
    <div class="song ${current()?.id === song.id ? 'active' : ''}">
      <button class="songcover" data-action="${action}:${i}" aria-label="查看 ${e(song.name)}">${art(song.cover)}</button>
      <button class="songtitle" data-action="${action}:${i}" aria-label="查看 ${e(song.name)}"><b>${e(song.name)}</b><small>${e(song.artist || song.album)}</small></button>
      ${button('play', `${action}play:${i}`, `播放 ${song.name}`)}
    </div>`).join('');
}

export function cards(list, kind = 'playlist') {
  return html`<div class="covers">${list.map((card, i) => html`
    <button class="coverbutton" data-action="${kind}:${i}">
      ${art(card.coverImgUrl || card.picUrl || card.img1v1Url || card.cover)}
      <b>${e(card.name)}</b>
      <small>${e(card.creator?.nickname || card.artist?.name || '')}</small>
    </button>`)}</div>`;
}

export const durationLabel = milliseconds => Number(milliseconds) > 0 ? time(milliseconds) : '--:--';

/** Sleep timer description; the player uses the longer form with a "定时" prefix. */
export function sleepText(player = false) {
  const {sleep, sleepRemaining} = s.playback;
  if (sleep === -1) return '播完当前歌曲';
  if (sleep > 0) return sleepRemaining > 0 ? `${time(sleepRemaining)} 后停止` : `${player ? '定时 ' : ''}${sleep} 分钟`;
  return player ? '定时' : '关闭';
}
