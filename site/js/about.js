import {DURATION, frameAt, clamp} from './about-timeline.mjs';

const $=s=>document.querySelector(s), params=new URLSearchParams(location.search);
const film=$('#film'), viewport=$('#viewport'), player=$('#player');
const playButton=$('#play-film'), restartButton=$('#restart-film'), slider=$('#film-time');
const status=$('#load-status'), caption=$('#main-caption'), credit=$('#film-credit');
const terrain=$('#terrain'), annotations=$('#world-annotations'), pin=$('#school-pin');
const sections=[...document.querySelectorAll('.shot')];
let ready=false, playing=false, time=0, origin=0, lastShot='', lastCaption='', eventCount=12;
let viewer, slipData, meta, story, photo, THREE, point, gps, poses, controlsTimer;
const base='events/kumamoto-quake/';
const RADAR_CREDIT='NISAR: NASA/JPL-Caltech/ISRO · ASF DAAC | Sentinel-2: ESA / Copernicus | Terrain: Copernicus DEM';
const SLIP_CREDIT='GSJ field survey · GSI GEONET / Nevada Geodetic Laboratory · Copernicus imagery / terrain · model, not NISAR motion';
let photoCredit='Photo: Akai, Ota, Maruyama, Yoshimi, Azuma, Ninomiya / GSJ, AIST · cropped';

if(params.get('capture')==='1') document.body.classList.add('capture');
function resize(){ film.style.setProperty('--film-scale',viewport.clientWidth/1920); }
new ResizeObserver(resize).observe(viewport); resize();

function withTimeout(promise,ms,label){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(label+' timed out. Check your connection and reload.')),ms);
    promise.then(x=>{clearTimeout(timer);resolve(x);},e=>{clearTimeout(timer);reject(e);});
  });
}
async function json(url){
  const r=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(!r.ok) throw new Error('Could not load '+url+' (HTTP '+r.status+').');
  return r.json();
}
async function image(url){
  const im=new Image(); im.src=url;
  await withTimeout(im.decode(),30000,'Image '+url);
  if(!im.naturalWidth) throw new Error('Image unavailable: '+url);
  return im;
}
function revealControls(){
  document.body.classList.add('controls-on'); player.classList.add('controls-on');
  clearTimeout(controlsTimer); controlsTimer=setTimeout(hideControls,playing?1200:3500);
}
function hideControls(){
  clearTimeout(controlsTimer); document.body.classList.remove('controls-on'); player.classList.remove('controls-on');
}
player.addEventListener('pointermove',revealControls);
player.addEventListener('pointerleave',()=>{if(playing) hideControls();});
player.addEventListener('focusin',revealControls);

// Paint paused seeks once, then release the GPU instead of rendering a hidden scene forever.
function warmFrame(){
  if(!viewer) return;
  viewer.start();
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!playing)viewer.stop();}));
}
function updateButtons(){
  playButton.textContent=playing?'Pause':time>=DURATION?'Replay 30 s':'Play 30 s';
  playButton.setAttribute('aria-label',playing?'Pause presentation':time>=DURATION?'Replay presentation':'Play thirty-second presentation');
}
function setPlaying(on){
  if(!ready) return;
  if(on && time>=DURATION) time=0;
  if(!on && playing) time=clamp((performance.now()-origin)/1000,0,DURATION);
  playing=on; origin=performance.now()-time*1000; updateButtons();
  if(on){hideControls();status.textContent='Playing · silent · 30 seconds';}
  else status.textContent=time>=DURATION?'Finished. Explore or create—or replay.':'Paused. Press Play or Space to continue.';
  render(time);
  if(on) viewer.start(); else warmFrame();
}
function seek(value){
  if(!ready) return;
  playing=false; time=frameAt(value,eventCount).time; origin=performance.now()-time*1000;
  render(time); warmFrame(); updateButtons();
  status.textContent=time>=DURATION?'Finished. Explore or create—or replay.':'Paused at '+time.toFixed(1)+' seconds.';
}
playButton.addEventListener('click',()=>setPlaying(!playing));
restartButton.addEventListener('click',()=>{seek(0);setPlaying(true);});
slider.addEventListener('input',()=>seek(Number(slider.value)));
async function fullscreen(){
  try{
    if(document.fullscreenElement) await document.exitFullscreen();
    else if(player.requestFullscreen) await player.requestFullscreen();
    else {status.textContent='Fullscreen is unavailable here. Use clean capture view and rotate your screen.';return;}
    revealControls();
  }catch{status.textContent='Fullscreen was not available. Clean capture view still works.';}
}
$('#fullscreen-film').addEventListener('click',fullscreen);
document.addEventListener('fullscreenchange',()=>{resize();$('#fullscreen-film').textContent=document.fullscreenElement?'Exit fullscreen':'Fullscreen';});
document.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,textarea,select,button,a,[contenteditable]')) return;
  if(e.code==='Space'){e.preventDefault();setPlaying(!playing);}
  else if(e.key==='ArrowRight'){e.preventDefault();seek(time+1);revealControls();}
  else if(e.key==='ArrowLeft'){e.preventDefault();seek(time-1);revealControls();}
  else if(e.key.toLowerCase()==='r'){seek(0);setPlaying(true);}
  else if(e.key.toLowerCase()==='f') fullscreen();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)setPlaying(false);});

function pose(p){
  viewer.controls.target.set(p.x,p.y,p.z);
  viewer.camera.position.set(p.x,p.y+p.d*Math.cos(p.tilt),p.z+p.d*Math.sin(p.tilt));
  viewer.camera.lookAt(viewer.controls.target); viewer.camera.updateMatrixWorld();
}
function screen(u,v,y){
  point.set(u-.5,y,(v-.5)*viewer.aspect).project(viewer.camera);
  if(point.z>1||Math.abs(point.x)>1||Math.abs(point.y)>1) return null;
  return {x:(point.x+1)*960,y:(1-point.y)*540};
}
function updateAnnotations(state){
  annotations.toggleAttribute('hidden',!state.world);
  const p=state.world?viewer.project([story.nisar.u,story.nisar.v],.002):null;
  pin.hidden=!p;
  if(p){pin.style.left=p.x+'px';pin.style.top=p.y+'px';}
  const connector=$('#story-connector');
  connector.setAttribute('d',state.shot==='story'&&p?'M'+p.x+','+p.y+' L1116,455 L1154,455':'');
  const arrow=$('#gps-arrow'); arrow.style.display=state.shot==='slip'?'':'none';
  if(state.shot!=='slip') return;
  const y=viewer.heightAt(gps.u,gps.v)+.002, k=slipData.k0*state.slip/100;
  const a=screen(gps.u,gps.v,y), b=screen(gps.u+gps.east_cm*k/slipData.W,gps.v-gps.north_cm*k/slipData.H,y);
  if(!a||!b){arrow.style.display='none';return;}
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),ux=dx/(len||1),uy=dy/(len||1);
  const head=Math.min(22,len*.55),hx=b.x-ux*head,hy=b.y-uy*head;
  const path=len>5?'M'+a.x+','+a.y+'L'+hx+','+hy:'';
  arrow.children[0].setAttribute('d',path);arrow.children[1].setAttribute('d',path);
  arrow.children[2].setAttribute('d',len>5?'M'+b.x+','+b.y+'L'+(hx-uy*head*.55)+','+(hy+ux*head*.55)+'L'+(hx+uy*head*.55)+','+(hy-ux*head*.55)+'Z':'');
  arrow.children[3].setAttribute('cx',a.x);arrow.children[3].setAttribute('cy',a.y);
  const tx=arrow.children[4];tx.setAttribute('x',b.x+20);tx.setAttribute('y',b.y-17);tx.style.opacity=len>18?'1':'0';
  $('#model-progress-fill').style.width=(state.slip*100)+'%';
}
function render(seconds){
  const s=frameAt(seconds,eventCount);time=s.time;
  if(s.shot!==lastShot){
    sections.forEach(el=>{el.hidden=el.id!=='shot-'+s.shot;});
    film.dataset.shot=s.shot; terrain.style.visibility=s.world?'visible':'hidden';
    $('#map-shade').hidden=!s.world;
    caption.hidden=s.shot==='finish';credit.hidden=s.shot==='finish';
    credit.textContent=s.shot==='opening'?photoCredit:s.shot==='story'?photoCredit+' | NISAR: NASA/JPL-Caltech/ISRO, ASF DAAC · Copernicus imagery / terrain':s.shot==='slip'?SLIP_CREDIT:RADAR_CREDIT;
    lastShot=s.shot;
  }
  if(s.caption!==lastCaption){caption.textContent=s.caption;$('#current-caption').textContent=s.caption;lastCaption=s.caption;}
  slider.value=String(time); $('#timecode').textContent='00:'+String(Math.floor(time)).padStart(2,'0')+' / 00:30';
  slider.setAttribute('aria-valuetext',time.toFixed(1)+' of 30 seconds');
  if(viewer){
    const u=slipData.viewer.uniforms, isSlip=s.shot==='slip';
    u.uSlipShow.value=isSlip?1:0;u.uSlipK.value=isSlip?slipData.k0:0;
    viewer.setLosExag(0);viewer.setFringe(!isSlip&&s.reveal>.38);
    // A flat optical frame tilts once; full radar values appear together, never as fabricated uplift.
    viewer.setT(isSlip?s.slip:s.reveal>.38?1:0);
    const p=isSlip?poses.slip:{...poses.hero,d:poses.flat.d+(poses.hero.d-poses.flat.d)*s.reveal,tilt:.001+(poses.hero.tilt-.001)*s.reveal};
    pose(p); updateAnnotations(s);
  }
  if(s.ended&&playing){playing=false;viewer?.stop();updateButtons();status.textContent='Finished. Explore or create—or replay.';}
}
function fail(error){
  playing=false;ready=false;viewer?.stop();document.body.classList.remove('ready','capture');player.classList.remove('ready');
  playButton.disabled=true;restartButton.disabled=true;slider.disabled=true;playButton.textContent='Unavailable';
  status.textContent='Presentation could not load. '+(error.message||String(error))+' The text and links below still work.';
  $('#retry-film').hidden=false;revealControls();console.error('About presentation:',error);
}

async function boot(){
  const loaded=await withTimeout(Promise.all([
    json(base+'meta.json'),json(base+'stories.json'),json('events/index.json'),json('about/photo-source.json'),
    import('./viewer.js'),import('./slip.js'),import('three'),document.fonts.ready,
  ]),35000,'Presentation assets');
  meta=loaded[0];story=loaded[1].items.find(s=>s.id==='kumamoto-01');const slugs=loaded[2];photo=loaded[3];
  if(!story?.nisar?.inside||!story.nisar.measured||!story.show_image||story.status==='rejected') throw new Error('The verified schoolyard story is unavailable.');
  if(!Array.isArray(slugs)||!slugs.length) throw new Error('The event catalogue is empty.');
  THREE=loaded[6];point=new THREE.Vector3();eventCount=slugs.length;
  document.querySelectorAll('.event-count').forEach(el=>{el.textContent=String(eventCount);});
  $('#photo-full-credit').textContent=photo.credit;$('#photo-source-link').href=photo.sourceUrl;$('#photo-terms').href=photo.termsUrl;
  const date=d=>new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  $('#pass-before').textContent=date(meta.nisar.pair[0]);$('#pass-after').textContent=date(meta.nisar.pair[1]);
  status.textContent='Loading twelve event views and the survey/GPS model…';
  const imageUrls=['about/'+photo.file,base+'optical-before.jpg',base+meta.ground];
  const metas=await Promise.all(slugs.map(slug=>json('events/'+slug+'/meta.json')));
  for(const m of metas){
    const files=(m.images??[]).map(i=>i.file);
    const name=['flood','fire'].includes(m.kind)?'change.png':m.kind==='landslide'?'coherence.png':'interferogram.png';
    if(!files.includes(name)) throw new Error('Missing radar preview for '+m.slug);
    const url='events/'+m.slug+'/'+name; imageUrls.push(url);
    const tile=document.createElement('div');tile.className='event-tile';tile.title=m.name;
    const im=document.createElement('img');im.src=url;im.alt=m.name+' — radar layer';tile.append(im);
    const label=document.createElement('span');label.textContent=m.name.split(',')[0];tile.append(label);$('#event-grid').append(tile);
    const mini=im.cloneNode();mini.alt='';$('#finish-grid').append(mini);
  }
  const results=await withTimeout(Promise.all([loaded[5].load(base,meta),Promise.all(imageUrls.map(image))]),35000,'Map and image preloading');
  slipData=results[0];if(!slipData) throw new Error('The survey/GPS prototype is unavailable.');
  // Keep the source photo local and full resolution, never the pipeline's pixelated news preview.
  document.querySelectorAll('.opening-photo,.ground-card img').forEach(el=>{el.src='about/'+photo.file;});
  gps=slipData.doc.gps.reduce((a,b)=>Math.hypot(a.east_cm,a.north_cm)>Math.hypot(b.east_cm,b.north_cm)?a:b);
  $('#gps-arrow text').textContent='GPS · '+Math.round(Math.hypot(gps.east_cm,gps.north_cm))+' cm';
  $('#slip-exaggeration').textContent='Exaggerated ×'+slipData.k0.toLocaleString('en-GB');
  status.textContent='Preparing the terrain and checking the first frame…';
  viewer=await withTimeout(loaded[4].createViewer(terrain,base,meta,{segments:512,pixelRatio:1,autoStart:false,groundBefore:'optical-before.jpg',slip:slipData.viewer}),35000,'3D viewer');
  viewer.controls.enabled=false;viewer.controls.enableDamping=false;viewer.setLosExag(0);
  const hu=.43,hv=.67,hy=viewer.smoothHeightAt(hu,hv);
  const high=slipData.doc.line.points.filter(p=>p[3]>=Math.max(...slipData.doc.line.points.map(q=>q[3]))*.5);
  high.push([gps.u,gps.v]);
  const us=high.map(p=>p[0]),vs=high.map(p=>p[1]),minU=Math.min(...us),maxU=Math.max(...us),minV=Math.min(...vs),maxV=Math.max(...vs);
  const cu=(minU+maxU)/2,cv=(minV+maxV)/2;
  const f=Math.tan(viewer.camera.fov*Math.PI/360);
  const d=Math.max((maxV-minV)*viewer.aspect*.95/f,(maxU-minU)*.95/(f*(1920/1080)),.27);
  poses={flat:{d:.58},hero:{x:hu-.5,y:hy,z:(hv-.5)*viewer.aspect,d:.83,tilt:42*Math.PI/180},slip:{x:cu-.5,y:viewer.smoothHeightAt(cu,cv),z:(cv-.5)*viewer.aspect,d,tilt:12*Math.PI/180}};
  viewer.onFrame(()=>render(playing?(performance.now()-origin)/1000:time));
  render(params.has('t')?Number(params.get('t')):0);viewer.start();
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const canvas=terrain.querySelector('canvas');
  canvas.addEventListener('webglcontextlost',()=>{setPlaying(false);ready=false;document.body.classList.remove('ready');player.classList.remove('ready');playButton.disabled=true;restartButton.disabled=true;slider.disabled=true;status.textContent='Graphics paused by the browser. Waiting for recovery; text and links still work.';revealControls();});
  canvas.addEventListener('webglcontextrestored',()=>{ready=true;document.body.classList.add('ready');player.classList.add('ready');playButton.disabled=false;restartButton.disabled=false;slider.disabled=false;status.textContent='Graphics restored. Press Play to continue.';updateButtons();warmFrame();});
  ready=true;document.body.classList.add('ready');player.classList.add('ready');playButton.disabled=false;restartButton.disabled=false;slider.disabled=false;
  viewer.stop();updateButtons();status.textContent='Ready · 30 seconds · silent · all assets loaded';revealControls();
  if(params.get('autoplay')==='1'&&!params.has('t')) setPlaying(true);
}

// Small, explicit capture/test surface. seek() is deterministic and always pauses.
window.about=Object.freeze({get ready(){return ready;},duration:DURATION,play:()=>setPlaying(true),pause:()=>setPlaying(false),seek,
  state:()=>({...frameAt(time,eventCount),ready,playing,eventCount,exaggeration:slipData?.k0??null,photoWidth:document.querySelector('.opening-photo').naturalWidth,canvas:terrain.querySelector('canvas')?{width:terrain.querySelector('canvas').width,height:terrain.querySelector('canvas').height}:null}),
});
boot().catch(fail);
