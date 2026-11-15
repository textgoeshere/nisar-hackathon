// Deterministic editorial clock: animation, seeking and capture share this source of truth.
export const DURATION = 30;
export const FPS = 30;
export const EVENT_KINDS = Object.freeze(['quake','volcano','fire','flood','landslide','subsidence']);
export const SHOTS = Object.freeze([
  {id:'opening',start:0,end:4,caption:'Using NISAR orbital radar\nto understand human stories\non the ground.'},
  {id:'passes',start:4,end:5.5,caption:'Repeated passes. Different signals. Ground evidence.'},
  {id:'process',start:5.5,end:7,caption:'Find. Process. Contextualize. Visualize.'},
  {id:'hero',start:7,end:14.5,caption:'Bring it together to visualize.'},
  {id:'grid',start:14.5,end:20,caption:'One repeatable pipeline. Many kinds of change.'},
  {id:'findings',start:20,end:26,caption:''},
  {id:'finish',start:26,end:30,caption:''},
].map(Object.freeze));
export const clamp = (x,lo=0,hi=1)=>Math.max(lo,Math.min(hi,x));
export function smooth(x){const t=clamp(x);return t*t*(3-2*t);}
export function frameAt(seconds,eventCount=12){
  const n=Number(seconds),time=clamp(Number.isFinite(n)?n:0,0,DURATION);
  const shot=SHOTS.find(s=>time<s.end)??SHOTS.at(-1),elapsed=time-shot.start;
  const galleryTime=time-14.5,kindIndex=Math.floor((galleryTime-1.5+1e-8)/.6);
  return {
    time,frame:Math.min(DURATION*FPS-1,Math.floor(time*FPS+1e-7)),shot:shot.id,
    elapsed,progress:clamp(elapsed/(shot.end-shot.start)),caption:shot.caption,
    world:['hero','findings'].includes(shot.id),eventCount,
    heroPhase:time<8.1?'optical':time<10.1?'stories':time<12.1?'radar':'terrain',
    stories:shot.id==='hero'?smooth((time-8.1)/.3)*(1-smooth((time-9.85)/.25)):0,
    radar:shot.id==='hero'?smooth((time-10.1)/.3):0,
    radarCards:shot.id==='hero'?smooth((time-10.1)/.3)*(1-smooth((time-12.1)/.35)):0,
    reveal:smooth((time-12.1)/2.2),
    galleryKind:shot.id==='grid'&&kindIndex>=0&&kindIndex<EVENT_KINDS.length?EVENT_KINDS[kindIndex]:null,
    galleryPreviousKind:shot.id==='grid'&&kindIndex>0?EVENT_KINDS[Math.min(EVENT_KINDS.length-1,kindIndex-1)]:null,
    galleryBlend:kindIndex<0?1:smooth((galleryTime-1.5-Math.min(kindIndex,EVENT_KINDS.length)*.6)/.16),
    slip:shot.id==='findings'?smooth((time-20.6)/4.2):0,
    losHeight:0,motionSource:shot.id==='findings'?'survey-gps-model':'nisar-line-of-sight',
    ended:time===DURATION,
  };
}
