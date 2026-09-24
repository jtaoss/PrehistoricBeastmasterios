const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function battleViewport(width,height,world,focus,{close=false}={}){
  const fit=Math.min(width/world.width,height/world.height);
  // Phone combat uses a tactical mid shot: closer than full overview but never
  // the old edge-to-edge crop that hid most of the battlefield behind HUD.
  const fill=Math.max(width/world.width,height/world.height);
  const scale=close?Math.min(fill,fit*1.35):fit;
  const offset=(size,extent,point)=>extent*scale<=size?(size-extent*scale)/2:clamp(size/2-point*scale,size-extent*scale,0);
  return {scale,ox:offset(width,world.width,focus.x),oy:offset(height,world.height,focus.y)};
}
