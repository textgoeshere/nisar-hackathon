import {DURATION,frameAt,clamp,smooth} from './about-timeline.mjs?v=5';

const $=s=>document.querySelector(s),params=new URLSearchParams(location.search);
const film=$('#film'),viewport=$('#viewport'),player=$('#player');
const playButton=$('#play-film'),headerPlay=$('#header-play'),restartButton=$('#restart-film'),slider=$('#film-time');
const status=$('#load-status'),caption=$('#main-caption'),credit=$('#film-credit');
const terrain=$('#terrain'),annotations=$('#world-annotations'),pin=$('#school-pin'),shrinePin=$('#shrine-pin');
const sections=[...document.querySelectorAll('.shot')],processColumns=[...document.querySelectorAll('.process-column')];
const kindChips=[...document.querySelectorAll('.type-filter span')],layerChips=[...document.querySelectorAll('.layer-switch span')];
let ready=false,playing=false,time=0,origin=0,lastShot='',lastCaption='',eventCount=12,raf=0;
let viewer,gallery,slipData,meta,story,shrine,photo,THREE,point,gps,poses,controlsTimer;
const base='events/kumamoto-quake/';
const RADAR_CREDIT='NISAR: NASA/JPL-Caltech/ISRO · ASF DAAC | Sentinel-2: ESA / Copernicus | Terrain: Copernicus DEM';
const PHOTO_CREDIT='Field photos: Akai, Ota, Maruyama, Yoshimi, Azuma, Ninomiya / GSJ, AIST · reframed · full sources below';
const GRID_CREDIT='NISAR / NASA–ISRO · ASF DAAC | Copernicus imagery + DEM · relief ×1–5 · radar colour is not vertical uplift';
const FINDINGS_CREDIT='NISAR / NASA–ISRO · ASF DAAC | Prototype: GSJ survey + GSI GEONET / NGL · Copernicus imagery + terrain';

if(params.get('capture')==='1')document.body.classList.add('capture');
function resize(){film.style.setProperty('--film-scale',viewport.clientWidth/1920);if(ready&&!playing)render(time);}
new ResizeObserver(resize).observe(viewport);resize();
function withTimeout(promise,ms,label){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(label+' timed out. Check your connection and reload.')),ms);promise.then(x=>{clearTimeout(timer);resolve(x);},e=>{clearTimeout(timer);reject(e);});});}
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('Could not load '+url+' (HTTP '+r.status+').');return r.json();}
async function image(url){const im=new Image();im.referrerPolicy='no-referrer';im.src=url;await withTimeout(im.decode(),30000,'Image '+url);if(!im.naturalWidth)throw new Error('Image unavailable: '+url);return im;}
function revealControls(){document.body.classList.add('controls-on');player.classList.add('controls-on');clearTimeout(controlsTimer);controlsTimer=setTimeout(hideControls,playing?1200:3500);}
function hideControls(){clearTimeout(controlsTimer);document.body.classList.remove('controls-on');player.classList.remove('controls-on');}
player.addEventListener('pointermove',revealControls);player.addEventListener('pointerleave',()=>{if(playing)hideControls();});player.addEventListener('focusin',revealControls);
function updateButtons(){playButton.textContent=playing?'Pause':time>=DURATION?'Replay 30 s':'Play 30 s';playButton.setAttribute('aria-label',playing?'Pause presentation':time>=DURATION?'Replay presentation':'Play thirty-second presentation');}
function tick(now){if(!playing)return;try{render((now-origin)/1000);}catch(error){fail(error);return;}if(playing)raf=requestAnimationFrame(tick);}
function setPlaying(on){
  if(!ready)return;
  cancelAnimationFrame(raf);
  if(on&&time>=DURATION)time=0;
  if(!on&&playing)time=clamp((performance.now()-origin)/1000,0,DURATION);
  playing=on;origin=performance.now()-time*1000;updateButtons();
  if(on){hideControls();status.textContent='Playing · silent · 30 seconds';}else status.textContent=time>=DURATION?'Finished. Explore or create—or replay.':'Paused. Press Play or Space to continue.';
  render(time);if(on&&playing)raf=requestAnimationFrame(tick);
}
function seek(value){if(!ready)return;cancelAnimationFrame(raf);playing=false;time=frameAt(value,eventCount).time;origin=performance.now()-time*1000;render(time);updateButtons();status.textContent=time>=DURATION?'Finished. Explore or create—or replay.':'Paused at '+time.toFixed(1)+' seconds.';}
playButton.addEventListener('click',()=>setPlaying(!playing));restartButton.addEventListener('click',()=>{seek(0);setPlaying(true);});
headerPlay.addEventListener('click',()=>{seek(0);player.scrollIntoView({block:'start',behavior:'auto'});setPlaying(true);});
slider.addEventListener('input',()=>seek(Number(slider.value)));
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(player.requestFullscreen)await player.requestFullscreen();else{status.textContent='Fullscreen is unavailable here. Use clean capture view and rotate your screen.';return;}revealControls();}catch{status.textContent='Fullscreen was not available. Clean capture view still works.';}}
$('#fullscreen-film').addEventListener('click',fullscreen);document.addEventListener('fullscreenchange',()=>{resize();$('#fullscreen-film').textContent=document.fullscreenElement?'Exit fullscreen':'Fullscreen';});
document.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,textarea,select,button,a,[contenteditable]'))return;if(e.code==='Space'){e.preventDefault();setPlaying(!playing);}else if(e.key==='ArrowRight'){e.preventDefault();seek(time+1);revealControls();}else if(e.key==='ArrowLeft'){e.preventDefault();seek(time-1);revealControls();}else if(e.key.toLowerCase()==='r'){seek(0);setPlaying(true);}else if(e.key.toLowerCase()==='f')fullscreen();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)setPlaying(false);});
function appear(el,p,{x=0,y=0,rotate=0}={}){el.style.opacity=String(clamp(p));el.style.transform='translate('+((1-p)*x)+'px,'+((1-p)*y)+'px) rotate('+rotate+'deg)';}
function pose(p){viewer.controls.target.set(p.x,p.y,p.z);viewer.camera.position.set(p.x+Math.sin(p.yaw??0)*p.d*Math.sin(p.tilt),p.y+p.d*Math.cos(p.tilt),p.z+Math.cos(p.yaw??0)*p.d*Math.sin(p.tilt));viewer.camera.lookAt(viewer.controls.target);viewer.camera.updateMatrixWorld();}
function screen(u,v,y){point.set(u-.5,y,(v-.5)*viewer.aspect).project(viewer.camera);if(point.z>1||Math.abs(point.x)>1||Math.abs(point.y)>1)return null;return{x:terrain.offsetLeft+(point.x+1)*terrain.clientWidth/2,y:terrain.offsetTop+(1-point.y)*terrain.clientHeight/2};}
function placed(s){const p=viewer.project([s.nisar.u,s.nisar.v],.002);return p?{x:p.x+terrain.offsetLeft,y:p.y+terrain.offsetTop}:null;}
function updateAnnotations(s){
  annotations.toggleAttribute('hidden',!s.world);pin.hidden=true;shrinePin.hidden=true;
  const connector=$('#story-connector'),shrineConnector=$('#shrine-connector');connector.setAttribute('d','');shrineConnector.setAttribute('d','');
  const arrow=$('#gps-arrow');arrow.style.display=s.shot==='findings'?'':'none';
  if(s.shot==='hero'){
    const p=placed(story),q=placed(shrine),show=s.stories>.01||s.heroPhase==='terrain';
    if(p&&show){pin.hidden=false;pin.style.left=p.x+'px';pin.style.top=p.y+'px';}
    if(q&&s.stories>.01){shrinePin.hidden=false;shrinePin.style.left=q.x+'px';shrinePin.style.top=q.y+'px';}
    if(s.stories>.01&&p)connector.setAttribute('d','M'+p.x+','+p.y+' L1216,535 L1252,535');
    if(s.stories>.01&&q)shrineConnector.setAttribute('d','M'+q.x+','+q.y+' L648,565 L608,565');
    connector.style.opacity=String(s.stories*.8);shrineConnector.style.opacity=String(s.stories*.8);
  }
  if(s.shot!=='findings')return;
  const y=viewer.heightAt(gps.u,gps.v)+.002,k=slipData.k0*s.slip/100;
  const a=screen(gps.u,gps.v,y),b=screen(gps.u+gps.east_cm*k/slipData.W,gps.v-gps.north_cm*k/slipData.H,y);
  if(!a||!b){arrow.style.display='none';return;}
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),ux=dx/(len||1),uy=dy/(len||1),head=Math.min(17,len*.55),hx=b.x-ux*head,hy=b.y-uy*head;
  const path=len>5?'M'+a.x+','+a.y+'L'+hx+','+hy:'';
  arrow.children[0].setAttribute('d',path);arrow.children[1].setAttribute('d',path);arrow.children[2].setAttribute('d',len>5?'M'+b.x+','+b.y+'L'+(hx-uy*head*.55)+','+(hy+ux*head*.55)+'L'+(hx+uy*head*.55)+','+(hy-ux*head*.55)+'Z':'');
  arrow.children[3].setAttribute('cx',a.x);arrow.children[3].setAttribute('cy',a.y);
  const tx=arrow.children[4];tx.setAttribute('x',clamp(b.x+18,terrain.offsetLeft+18,terrain.offsetLeft+terrain.clientWidth-210));tx.setAttribute('y',Math.max(terrain.offsetTop+38,b.y-18));tx.style.opacity=len>14?'1':'0';
}
function animateDOM(s){
  if(s.shot==='opening'){
    $('.opening-photo').style.transform='translateX('+(-s.elapsed*7)+'px) scale('+(1.04+s.elapsed*.012)+')';
    appear($('.montage-shrine'),smooth((s.elapsed-.45)/.65),{x:270,y:50,rotate:4-s.progress*2});
    appear($('.montage-bridge'),smooth((s.elapsed-1.35)/.7),{x:340,y:45,rotate:-4+s.progress});
  }else if(s.shot==='passes'){
    document.querySelectorAll('.pass').forEach((el,i)=>appear(el,smooth((s.elapsed-i*.14)/.35),{x:i?-70:70,y:20}));
    document.querySelectorAll('.beam').forEach(el=>{el.style.strokeDashoffset=String(-s.elapsed*80);});
    $('.echo-before').style.transform='translateX('+(-s.elapsed*65)+'px)';$('.echo-after').style.transform='translateX('+(25-s.elapsed*65)+'px)';
    document.querySelectorAll('.signal-strip>div').forEach((el,i)=>appear(el,smooth((s.elapsed-.1-i*.16)/.3),{y:40}));
  }else if(s.shot==='process'){
    processColumns.forEach((el,i)=>{appear(el.querySelector('.process-card'),smooth((s.elapsed-i*.055)/.23),{y:32});el.querySelectorAll('li').forEach((li,j)=>appear(li,smooth((s.elapsed-.17-i*.04-j*.14)/.2),{x:22,y:10}));});
  }else if(s.shot==='hero'){
    appear($('#story-overlays'),s.stories,{y:36});appear($('#radar-overlays'),s.radarCards,{y:30});$('.radar-key').style.opacity=String(s.radar);
    layerChips.forEach(el=>el.classList.toggle('active',el.dataset.layer===s.heroPhase));
  }else if(s.shot==='grid'){
    kindChips.forEach(el=>el.classList.toggle('active',el.dataset.kind===s.galleryKind));gallery?.render(s.elapsed,s.galleryKind,s.galleryPreviousKind,s.galleryBlend);
  }else if(s.shot==='findings'){
    document.querySelectorAll('.finding-card').forEach((el,i)=>appear(el,smooth((s.elapsed-i*.12)/.32),{y:22}));$('#model-progress-fill').style.width=(s.slip*100)+'%';
  }
}
function render(seconds){
  const s=frameAt(seconds,eventCount);time=s.time;
  const changed=s.shot!==lastShot;
  if(changed){
    sections.forEach(el=>{el.hidden=el.id!=='shot-'+s.shot;});film.dataset.shot=s.shot;terrain.style.visibility=s.world?'visible':'hidden';$('#map-shade').hidden=s.shot!=='hero';
    caption.hidden=['finish','findings'].includes(s.shot);credit.hidden=s.shot==='finish';
    credit.textContent=s.shot==='opening'?PHOTO_CREDIT:s.shot==='hero'?RADAR_CREDIT+' | Field photos: GSJ / AIST':s.shot==='grid'?GRID_CREDIT:s.shot==='findings'?FINDINGS_CREDIT:RADAR_CREDIT;
    if(s.world)viewer?.resize();if(s.shot==='grid')gallery?.resize();lastShot=s.shot;
  }
  if(s.caption!==lastCaption){caption.textContent=s.caption;$('#current-caption').textContent=s.caption;lastCaption=s.caption;}
  slider.value=String(time);$('#timecode').textContent='00:'+String(Math.floor(time)).padStart(2,'0')+' / 00:30';slider.setAttribute('aria-valuetext',time.toFixed(1)+' of 30 seconds');
  if(viewer&&s.world){
    const u=slipData.viewer.uniforms,isSlip=s.shot==='findings';u.uSlipShow.value=isSlip?1:0;u.uSlipK.value=isSlip?slipData.k0:0;
    viewer.setLosExag(0);viewer.setFringe(!isSlip&&s.radar>.05);viewer.setT(isSlip?s.slip:s.radar>.05?1:0);
    const p=isSlip?poses.slip:{...poses.hero,d:poses.flat.d+(poses.hero.d-poses.flat.d)*s.reveal,tilt:.001+(poses.hero.tilt-.001)*s.reveal,yaw:.14*s.reveal};
    pose(p);viewer.renderOnce();
  }
  if(viewer)updateAnnotations(s);animateDOM(s);
  if(s.ended&&playing){playing=false;cancelAnimationFrame(raf);updateButtons();status.textContent='Finished. Explore or create—or replay.';}
}
function enableControls(enabled){[playButton,headerPlay,restartButton,slider].forEach(el=>{el.disabled=!enabled;});}
function fail(error){cancelAnimationFrame(raf);playing=false;ready=false;viewer?.stop();document.body.classList.remove('ready','capture');player.classList.remove('ready');enableControls(false);playButton.textContent='Unavailable';status.textContent='Presentation could not load. '+(error?.message||String(error))+' The text and links below still work.';$('#retry-film').hidden=false;revealControls();console.error('About presentation:',error);}
$('#event-grid').addEventListener('galleryerror',event=>fail(event.detail??new Error('The event gallery lost its graphics context.')));
async function boot(){
  const loaded=await withTimeout(Promise.all([json(base+'meta.json'),json(base+'stories.json'),json('events/index.json'),json('about/photo-source.json'),import('./viewer.js?v=5'),import('./slip.js'),import('three'),import('./about-gallery.js?v=6'),document.fonts.ready]),35000,'Presentation assets');
  meta=loaded[0];story=loaded[1].items.find(s=>s.id==='kumamoto-01');shrine=loaded[1].items.find(s=>s.id==='kumamoto-02');const slugs=loaded[2];photo=loaded[3];
  if(!story?.nisar?.inside||!story.nisar.measured||!story.show_image||story.status==='rejected'||!shrine?.nisar?.inside)throw new Error('The sourced school and shrine stories are unavailable.');
  if(!Array.isArray(slugs)||!slugs.length)throw new Error('The event catalogue is empty.');
  THREE=loaded[6];point=new THREE.Vector3();eventCount=slugs.length;document.querySelectorAll('.event-count').forEach(el=>{el.textContent=String(eventCount);});
  $('#photo-full-credit').textContent=photo.credit;$('#photo-source-link').href=photo.sourceUrl;$('#photo-terms').href=photo.termsUrl;
  const date=d=>new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});$('#pass-before').textContent=date(meta.nisar.pair[0]);$('#pass-after').textContent=date(meta.nisar.pair[1]);
  $('#event-spread').textContent=String(meta.stats.motion_range_cm);$('#baseline-spread').textContent=String(meta.stats.baseline_range_cm);$('#measured-share').textContent=String(meta.stats.measured_pct);
  status.textContent='Loading twelve real terrains, field photographs and the survey/GPS model…';
  const metas=await Promise.all(slugs.map(slug=>json('events/'+slug+'/meta.json')));
  const etna=metas.find(m=>m.slug==='etna-eruption'),anak=metas.find(m=>m.slug==='anak-krakatau');
  if(!Number.isFinite(etna?.stats?.footprint_km2)||!Number.isFinite(anak?.stats?.new_land_ha))throw new Error('The sourced findings metadata is missing.');
  $('#etna-area').textContent=etna.stats.footprint_km2.toFixed(1);$('#new-land-area').textContent=anak.stats.new_land_ha.toFixed(1);
  for(const m of metas){const files=(m.images??[]).map(i=>i.file);const name=['fire','flood'].includes(m.kind)?'change.png':m.still||m.kind==='landslide'?'coherence.png':'interferogram.png';if(!files.includes(name))throw new Error('Missing preview for '+m.slug);const im=document.createElement('img');im.src='events/'+m.slug+'/'+name;im.alt='';$('#finish-grid').append(im);}
  const imageURLs=[...new Set([...document.images].map(im=>im.getAttribute('src')).concat(base+'optical-before.jpg',base+meta.ground))];
  const results=await withTimeout(Promise.all([loaded[5].load(base,meta),Promise.all(imageURLs.map(image)),loaded[7].createGallery($('#event-grid'),metas)]),45000,'Terrain and image preloading');
  slipData=results[0];gallery=results[2];if(!slipData)throw new Error('The survey/GPS prototype is unavailable.');
  gps=slipData.doc.gps.reduce((a,b)=>Math.hypot(a.east_cm,a.north_cm)>Math.hypot(b.east_cm,b.north_cm)?a:b);$('#gps-arrow text').textContent='GPS · '+Math.round(Math.hypot(gps.east_cm,gps.north_cm))+' cm';$('#slip-exaggeration').textContent='Exaggerated ×'+slipData.k0.toLocaleString('en-GB')+' · not radar-derived';
  status.textContent='Preparing the shared terrain view…';
  viewer=await withTimeout(loaded[4].createViewer(terrain,base,meta,{segments:384,pixelRatio:1,autoStart:false,groundBefore:'optical-before.jpg',slip:slipData.viewer}),35000,'3D viewer');viewer.controls.enabled=false;viewer.controls.enableDamping=false;viewer.setLosExag(0);
  const hu=.43,hv=.70,hy=viewer.smoothHeightAt(hu,hv),maxOffset=Math.max(...slipData.doc.line.points.map(p=>p[3]));
  const high=slipData.doc.line.points.filter(p=>p[3]>=maxOffset*.5);high.push([gps.u,gps.v]);const us=high.map(p=>p[0]),vs=high.map(p=>p[1]),minU=Math.min(...us),maxU=Math.max(...us),minV=Math.min(...vs),maxV=Math.max(...vs),cu=(minU+maxU)/2,cv=(minV+maxV)/2;
  const f=Math.tan(viewer.camera.fov*Math.PI/360),d=Math.max((maxV-minV)*viewer.aspect*1.05/f,(maxU-minU)*1.05/(f*(842/400)),.27);
  poses={flat:{d:.70},hero:{x:hu-.5,y:hy,z:(hv-.5)*viewer.aspect,d:.86,tilt:48*Math.PI/180},slip:{x:cu-.5,y:viewer.smoothHeightAt(cu,cv),z:(cv-.5)*viewer.aspect,d,tilt:17*Math.PI/180}};
  const canvas=terrain.querySelector('canvas');canvas.addEventListener('webglcontextlost',()=>{setPlaying(false);ready=false;document.body.classList.remove('ready');player.classList.remove('ready');enableControls(false);status.textContent='Graphics paused by the browser. Waiting for recovery; text and links still work.';revealControls();});
  canvas.addEventListener('webglcontextrestored',()=>{ready=true;document.body.classList.add('ready');player.classList.add('ready');enableControls(true);status.textContent='Graphics restored. Press Play to continue.';updateButtons();render(time);});
  ready=true;document.body.classList.add('ready');player.classList.add('ready');enableControls(true);render(params.has('t')?Number(params.get('t')):0);updateButtons();status.textContent='Ready · 30 seconds · silent · 12 real 3D terrains';revealControls();
  if(params.get('autoplay')==='1'&&!params.has('t'))setPlaying(true);
}
window.about=Object.freeze({get ready(){return ready;},duration:DURATION,play:()=>setPlaying(true),pause:()=>setPlaying(false),seek,state:()=>({...frameAt(time,eventCount),ready,playing,eventCount,galleryCount:gallery?.count??0,exaggeration:slipData?.k0??null,photoWidth:$('.opening-photo').naturalWidth,canvas:terrain.querySelector('canvas')?{width:terrain.querySelector('canvas').width,height:terrain.querySelector('canvas').height}:null})});
boot().catch(fail);
