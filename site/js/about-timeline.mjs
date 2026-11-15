// The editorial clock is independent of rendering and can be tested without a browser.
export const DURATION = 30;
export const FPS = 30;
export const SHOTS = Object.freeze([
  {id:'opening', start:0, end:4, caption:'What does ground change mean for everyday places?'},
  {id:'passes', start:4, end:6.5, caption:'Two NISAR passes reveal ground motion.'},
  {id:'process', start:6.5, end:9, caption:'We filter, map, and connect ground accounts.'},
  {id:'hero', start:9, end:13, caption:'From orbit: the wider movement pattern.'},
  {id:'story', start:13, end:18, caption:'Field survey: the schoolyard was offset 94 cm.'},
  {id:'grid', start:18, end:20, caption:'One pipeline. Twelve events.'},
  {id:'slip', start:20, end:23, caption:'One radar view measures one direction.'},
  {id:'slip', start:23, end:26, caption:'Next: test radar-derived sideways motion.'},
  {id:'finish', start:26, end:30, caption:''},
].map(Object.freeze));
export const clamp = (x, lo=0, hi=1) => Math.max(lo, Math.min(hi, x));
export function smooth(x) { const t=clamp(x); return t*t*(3-2*t); }
export function frameAt(seconds, eventCount=12) {
  const n=Number(seconds), time=clamp(Number.isFinite(n) ? n : 0,0,DURATION);
  const shot=SHOTS.find(s=>time<s.end) ?? SHOTS[SHOTS.length-1];
  return {
    time, frame:Math.min(DURATION*FPS-1,Math.floor(time*FPS+1e-7)), shot:shot.id,
    caption:shot.id==='grid' && eventCount!==12 ? 'One pipeline. '+eventCount+' events.' : shot.caption,
    world:['hero','story','slip'].includes(shot.id),
    reveal:smooth(time-9), slip:shot.id==='slip' ? smooth((time-20.6)/4.2) : 0,
    losHeight:0, motionSource:shot.id==='slip' ? 'survey-gps-model' : 'nisar-line-of-sight',
    ended:time===DURATION,
  };
}
