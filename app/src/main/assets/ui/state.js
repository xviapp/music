// Shared UI state. Views only read it; app.js owns every change.

export const s = {
  page: 'home', title: '音乐', stack: [], scroll: 0,
  settings: {theme: 'system', quality: 'exhigh', background: true, tapPlay: false, loggedIn: false},
  profile: null,
  home: [], history: [], library: [], songs: [], cards: [], collection: null,
  detailSong: null, detailQueue: [], detailIndex: 0, detailSource: '',
  artistInfo: null, artistTab: 'hot', artistBio: null, favoriteKind: 'artist',
  commentSong: null, comments: [], hotComments: [], commentTotal: 0,
  suggestions: [], suggestBusy: false, suggestError: '', searchHistory: [], hotSearches: [],
  query: '', type: 1, offset: 0, more: false, trackIds: [], busy: false, error: '',
  player: false, sheet: '', lyric: false, lyricFollow: true, lines: [], lyricId: '', lyricError: '',
  likes: new Set(), qr: '', qrStatus: '', qrKey: '', request: 0,
  playback: {queue: [], index: 0, playing: false, position: 0, duration: 0, repeat: 0, shuffle: false, error: '', sleep: 0, sleepRemaining: 0, fm: false},
  tabMemory: {}, fmBusy: false, fmError: '',
};

export const pendingSubscriptions = new Set();
export const artistRefs = new Map();
export const entitySubscriptions = new Map();
export const pendingEntities = new Set();

export const current = () => s.playback.queue[s.playback.index];
export const playbackDuration = () => Math.max(0, Number(s.playback.duration) || 0, Number(current()?.duration) || 0);
export const entityKey = (kind, id) => `${kind}:${id}`;
export const songArtists = song => artistRefs.get(song.id) || song.artists || [];
