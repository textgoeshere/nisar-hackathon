import test from 'node:test';
import assert from 'node:assert/strict';
import {DURATION,FPS,SHOTS,EVENT_KINDS,frameAt,smooth} from '../site/js/about-timeline.mjs';

test('cuts remain contiguous and exactly thirty seconds',()=>{
  assert.equal(DURATION,30);assert.equal(FPS,30);assert.equal(SHOTS[0].start,0);
  SHOTS.slice(1).forEach((s,i)=>assert.equal(s.start,SHOTS[i].end));
  assert.equal(SHOTS.at(-1).end,30);assert.equal(SHOTS.reduce((n,s)=>n+s.end-s.start,0),30);
});
test('900 frames include the shortened method shots and continuous visual build',()=>{
  const counts={};for(let i=0;i<900;i++){const s=frameAt(i/30);counts[s.shot]=(counts[s.shot]??0)+1;assert.equal(s.frame,i);}
  assert.deepEqual(counts,{opening:120,passes:45,process:45,hero:225,grid:165,findings:180,finish:120});
});
test('cuts switch on exact boundaries',()=>{for(const s of SHOTS){assert.equal(frameAt(s.start).shot,s.id);assert.equal(frameAt(s.end-.0001).caption,s.caption);}});
test('malformed or out-of-range times remain safe',()=>{
  assert.equal(frameAt(-1).time,0);assert.equal(frameAt(99).time,30);
  for(const x of [NaN,Infinity,undefined,'bad'])assert.equal(frameAt(x).time,0);
  assert.equal(frameAt('13').shot,'hero');assert.equal(frameAt(30).frame,899);
});
test('the final four-second CTA holds without looping',()=>{
  for(const t of [26,27,28,29,30,31])assert.equal(frameAt(t).shot,'finish');
  assert.equal(frameAt(29.999).ended,false);assert.equal(frameAt(30).ended,true);
});
test('optical, story and radar overlays precede the camera tilt',()=>{
  assert.equal(frameAt(7.7).heroPhase,'optical');assert.equal(frameAt(7.7).reveal,0);
  assert.equal(frameAt(9).heroPhase,'stories');assert.equal(frameAt(9).stories,1);assert.equal(frameAt(9).radar,0);
  assert.equal(frameAt(11).heroPhase,'radar');assert.equal(frameAt(11).stories,0);assert.equal(frameAt(11).radarCards,1);assert.equal(frameAt(11).reveal,0);
  assert.equal(frameAt(13).heroPhase,'terrain');assert.ok(frameAt(13).reveal>0&&frameAt(13).reveal<1);assert.equal(frameAt(14.4).reveal,1);
});
test('all twelve terrains precede six quick type highlights and a final all-view',()=>{
  assert.equal(frameAt(15.9).galleryKind,null);
  EVENT_KINDS.forEach((kind,i)=>{const s=frameAt(16+i*.6+.25);assert.equal(s.galleryKind,kind);assert.equal(s.galleryBlend,1);});
  assert.equal(frameAt(19.9).galleryKind,null);assert.equal(frameAt(19.9).galleryBlend,1);
});
test('type fades are explicit and deterministic rather than CSS wall-clock animation',()=>{
  const s=frameAt(16.68);assert.equal(s.galleryKind,'volcano');assert.equal(s.galleryPreviousKind,'quake');assert.ok(Math.abs(s.galleryBlend-.5)<1e-10);
  const first=frameAt(16.08);assert.equal(first.galleryPreviousKind,null);assert.ok(first.galleryBlend>0&&first.galleryBlend<1);
});
test('slip stays inside the six-second findings/future split and holds its endpoint',()=>{
  assert.equal(frameAt(20).slip,0);assert.equal(frameAt(20.6).slip,0);
  let p=0;for(let i=618;i<780;i++){const x=frameAt(i/30).slip;assert.ok(x>=p&&x<=1);p=x;}
  assert.equal(frameAt(24.8).slip,1);assert.equal(frameAt(25.99).slip,1);assert.equal(frameAt(26).slip,0);
});
test('radar and ground-model sources remain distinct; LOS is never uplift',()=>{
  for(let i=0;i<900;i++){const s=frameAt(i/30);assert.equal(s.losHeight,0);assert.equal(s.motionSource,s.shot==='findings'?'survey-gps-model':'nisar-line-of-sight');}
});
test('seeking, event counts and animation state are order-independent',()=>{
  const a=frameAt(16.68);frameAt(30);frameAt(0);assert.deepEqual(frameAt(16.68),a);assert.equal(frameAt(18,17).eventCount,17);
  assert.equal(smooth(-4),0);assert.equal(smooth(4),1);
});
test('main editorial captions remain concise',()=>{
  const words=SHOTS.map(s=>s.caption).join(' ').trim().split(/\s+/).length+6;
  assert.ok(words<=70,'main captions including CTAs: '+words);assert.match(SHOTS[0].caption,/NISAR orbital radar/);
});
