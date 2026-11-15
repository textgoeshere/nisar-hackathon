import test from 'node:test';
import assert from 'node:assert/strict';
import {DURATION,FPS,SHOTS,frameAt,smooth} from '../site/js/about-timeline.mjs';

test('the authored cuts are contiguous and total exactly thirty seconds',()=>{
  assert.equal(DURATION,30);assert.equal(FPS,30);assert.equal(SHOTS[0].start,0);
  SHOTS.slice(1).forEach((s,i)=>assert.equal(s.start,SHOTS[i].end));
  assert.equal(SHOTS.at(-1).end,30);
  assert.equal(SHOTS.reduce((sum,s)=>sum+s.end-s.start,0),30);
});
test('all 900 output frames have a shot; approved running times are preserved',()=>{
  const counts={};for(let i=0;i<900;i++){const s=frameAt(i/30);counts[s.shot]=(counts[s.shot]??0)+1;assert.equal(s.frame,i);}
  assert.deepEqual(counts,{opening:120,passes:75,process:75,hero:120,story:150,grid:60,slip:180,finish:120});
});
test('cuts switch on their exact boundaries',()=>{
  for(const s of SHOTS){assert.equal(frameAt(s.start).shot,s.id);assert.equal(frameAt(s.end-.0001).caption,s.caption);}
  assert.equal(frameAt(22.999).caption,'One radar view measures one direction.');
  assert.equal(frameAt(23).caption,'Next: test radar-derived sideways motion.');
});
test('out-of-range and malformed times cannot produce an undefined frame',()=>{
  assert.equal(frameAt(-1).time,0);assert.equal(frameAt(99).time,30);
  for(const x of [NaN,Infinity,undefined,'bad'])assert.equal(frameAt(x).time,0);
  assert.equal(frameAt('13').shot,'story');assert.equal(frameAt(30).frame,899);
});
test('the final four-second CTA hold never loops automatically',()=>{
  for(const t of [26,27,28,29,30,31])assert.equal(frameAt(t).shot,'finish');
  assert.equal(frameAt(29.999).ended,false);assert.equal(frameAt(30).ended,true);
});
test('camera reveal is confined to 9–10 seconds',()=>{
  assert.equal(frameAt(9).reveal,0);assert.equal(frameAt(9.5).reveal,.5);
  for(const t of [10,13,17.999])assert.equal(frameAt(t).reveal,1);
});
test('slip holds before, moves monotonically, then holds after',()=>{
  assert.equal(frameAt(20).slip,0);assert.equal(frameAt(20.6).slip,0);
  let previous=0;for(let i=618;i<780;i++){const x=frameAt(i/30).slip;assert.ok(x>=previous&&x<=1);previous=x;}
  assert.equal(frameAt(24.8).slip,1);assert.equal(frameAt(25.99).slip,1);
  assert.equal(frameAt(19.99).slip,0);assert.equal(frameAt(26).slip,0);
});
test('ground survey and radar remain distinct, and radar is never drawn as uplift',()=>{
  for(let i=0;i<900;i++){const s=frameAt(i/30);assert.equal(s.losHeight,0);assert.equal(s.motionSource,s.shot==='slip'?'survey-gps-model':'nisar-line-of-sight');}
});
test('seeking is order-independent and keeps scientific values deterministic',()=>{
  const a=frameAt(22.1);frameAt(0);frameAt(30);assert.deepEqual(frameAt(22.1),a);
  assert.equal(frameAt(18,17).caption,'One pipeline. 17 events.');
  assert.equal(smooth(-4),0);assert.equal(smooth(4),1);
});
test('the main editorial captions stay under the seventy-word budget',()=>{
  const words=SHOTS.map(s=>s.caption).join(' ').trim().split(/\s+/).length+6;
  assert.ok(words<=70,'main captions including CTA: '+words);
});
