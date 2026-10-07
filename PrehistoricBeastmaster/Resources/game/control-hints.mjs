// A narrow preview uses the same copy as a phone. Real touch devices keep it
// even with a hardware keyboard attached; keyboard shortcuts still work.
const query='(pointer: coarse), (max-width: 1024px)';
const deviceMedia=globalThis.matchMedia?.(query);
export function touchControls(host=globalThis){
  const media=host===globalThis?deviceMedia:host.matchMedia?.(query);
  return (host.navigator?.maxTouchPoints||0)>0 || !!media?.matches;
}
export function controlLabel(label,key,touch=touchControls()){
  return touch ? label : `${label} · ${key}`;
}
