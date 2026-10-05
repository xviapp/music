export function escape(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function imageUrl(value) {
  try {
    const url = new URL(String(value).replace(/^http:/, 'https:'));
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}
export function track(song) {
  const source = song.simpleSong || song;
  const album = source.al || source.album || {};
  const artists = source.ar || source.artists || [];
  return {
    id: String(song.songId || source.id), name: source.name || song.songName || '未知歌曲',
    artist: artists.map(a => a.name).join(' / ') || song.artist || '',
    album: album.name || (typeof song.album === 'string' ? song.album : ''),
    cover: imageUrl(album.picUrl || source.picUrl || song.cover),
    duration: source.dt || source.duration || 0,
  };
}
export function tracks(data) { return (data || []).map(track).filter(s => /^\d+$/.test(s.id) && Number(s.id) > 0); }
export function lyrics(text = '') {
  const result = [];
  for (const line of text.split('\n')) {
    const timestamps = [...line.matchAll(/\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    const value = line.replace(/\[[^\]]*\]/g, '').trim();
    if (!value) continue;
    for (const m of timestamps) result.push({time: Number(m[1])*60000 + Number(m[2])*1000 + Number((m[3] || '').padEnd(3,'0')), text: value});
  }
  return result.sort((a,b) => a.time-b.time);
}
export function lyricIndex(lines, position) {
  let index = -1;
  for (let i=0; i<lines.length && lines[i].time<=position; i++) index=i;
  return index;
}
export function time(ms) {
  const seconds = Math.floor(Math.max(0, Number(ms) || 0)/1000);
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
export function playbackKey(p) {
  return JSON.stringify([p.queue.map(s=>s.id),p.index,p.playing,p.buffering,p.repeat,p.shuffle,p.error,p.sleep]);
}
