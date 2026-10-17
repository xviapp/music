let sequence = 0;
const pending = new Map();
export const isAndroid = Boolean(window.MusicNative);
if (isAndroid) window.MusicNative.onmessage = event => {
  let result;
  try { result = JSON.parse(event.data); } catch { return; }
  const item = pending.get(result.id);
  if (!item) return;
  pending.delete(result.id); clearTimeout(item.timer);
  result.error ? item.reject(new Error(result.error)) : item.resolve(result.value);
};
export function native(method, args = {}) {
  if (!isAndroid) return Promise.reject(new Error('请在 Android 应用中使用此功能'));
  return new Promise((resolve,reject) => {
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('请求超时，请重试'));},45000);
    pending.set(id,{resolve,reject,timer});
    window.MusicNative.postMessage(JSON.stringify({id,method,args}));
  });
}
export const api = (route,params={}) => native('api',{route,params});
export const control = (action,args={}) => native('player',{action,...args});
