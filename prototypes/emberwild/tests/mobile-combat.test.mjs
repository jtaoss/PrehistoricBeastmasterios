import test from 'node:test';
import assert from 'node:assert/strict';
import {battleViewport} from '../battle-viewport.mjs';
import {controlLabel,touchControls} from '../control-hints.mjs';
const world={width:720,height:820};
test('touch input never advertises desktop hotkeys, including iPad keyboards',()=>{
  assert.equal(touchControls({navigator:{maxTouchPoints:5},matchMedia:()=>({matches:false})}),true);
  assert.equal(touchControls({navigator:{maxTouchPoints:0},matchMedia:()=>({matches:true})}),true);
  assert.equal(touchControls({navigator:{maxTouchPoints:0},matchMedia:()=>({matches:false})}),false);
  assert.equal(controlLabel('互動','E',true),'互動');
  assert.equal(controlLabel('互動','E',false),'互動 · E');
});
test('phone tactical view keeps more map visible without exceeding fill scale',()=>{
  for(const [w,h] of [[320,568],[375,734],[390,760],[430,839],[768,1024]]){
    for(const x of [0,125,360,620,720])for(const y of [0,110,410,700,820]){
      const c=battleViewport(w,h,world,{x,y},{close:true});
      const fit=Math.min(w/world.width,h/world.height),fill=Math.max(w/world.width,h/world.height);
      assert.ok(c.scale>=fit);
      assert.ok(c.scale<=fill);
      assert.ok(c.scale<=fit*1.35+.0001);
      const sx=c.ox+x*c.scale,sy=c.oy+y*c.scale;
      assert.ok(Math.abs((sx-c.ox)/c.scale-x)<.0001);
      assert.ok(Math.abs((sy-c.oy)/c.scale-y)<.0001);
    }
  }
});
test('overview preserves the full map and desktop scale',()=>{
  const c=battleViewport(375,812,world,{x:10,y:700});
  assert.equal(c.scale,375/720);assert.equal(c.ox,0);assert.ok(c.oy>0);
  assert.deepEqual(c,battleViewport(375,812,world,{x:700,y:0},{close:false}));
});
