const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {GestureTracker}=require('../github-pages/photon-gesture-core.js');
function harness(camera){
  const handlers={},nodes={},workers=[],counts={stop:0,click:0,orbit:0,zoom:0};
  const classes=()=>({add(){},remove(){}});
  for(const id of ['gestureVideo','gestureCursor','gesturePreview','gestureStart','gestureManual','gestureStop','gesturePreviewToggle','gestureStatus','gestureSkeleton','sceneCanvas']) nodes[id]={hidden:false,disabled:false,style:{},dataset:{},attributes:{},classList:classes(),setAttribute(name,value){this.attributes[name]=value;},addEventListener(name,fn){handlers[id+':'+name]=fn;}};
  nodes.gestureSkeleton.getContext=()=>Object.fromEntries(['clearRect','beginPath','lineTo','moveTo','stroke','fill','arc'].map(n=>[n,()=>{}]));
  nodes.gestureVideo.play=async()=>{};
  const stream={getTracks:()=>[{stop(){counts.stop++;}}],getVideoTracks:()=>[{addEventListener(){}}]};
  const target={disabled:false,classList:classes(),closest(selector){return selector==='[inert]'?null:this;},click(){counts.click++;}};
  let hit=target;
  class Worker {
    constructor(){workers.push(this);}
    postMessage(){}
    terminate(){this.terminated=true;}
  }
  const scope={window:{isSecureContext:true,PhotonGestureCore:{GestureTracker},PhotonControls:{orbit(){counts.orbit++;},zoom(){counts.zoom++;}},addEventListener(name,fn){handlers['window:'+name]=fn;}},
    document:{documentElement:{lang:'en'},baseURI:'http://localhost/photon-lab.html',getElementById:id=>nodes[id],elementFromPoint:()=>hit,addEventListener(name,fn){handlers['document:'+name]=fn;}},
    navigator:{mediaDevices:{getUserMedia:camera||(()=>Promise.resolve(stream))}},Worker,URL,Event,console:{warn(){}},innerWidth:1000,innerHeight:600,requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){}};
  vm.runInNewContext(fs.readFileSync('github-pages/photon-gesture.js','utf8'),scope);
  function hand(pinch=false,x=.5){const h=Array.from({length:21},()=>({x,y:.4,z:0}));h[0].y=.6;h[9].y=.5;h[4].x=x+(pinch?.01:.08);return h;}
  return {handlers,nodes,workers,counts,stream,scope,hand,setHit(v){hit=v;},async start(){await handlers['gestureStart:click']();workers[0].onmessage({data:{type:'ready'}});},send(hands,time){workers[0].onmessage({data:{type:'hands',hands,time}});}};
}
test('a debounced pinch selects once; tracking loss cancels the next selection',async()=>{
  const h=harness();await h.start();
  h.send([h.hand()],0);h.send([h.hand()],100);h.send([h.hand(true)],150);h.send([h.hand(true)],250);h.send([h.hand()],300);h.send([h.hand()],400);
  assert.equal(h.counts.click,1);
  h.send([h.hand(true)],450);h.send([h.hand(true)],550);h.send([],600);h.send([h.hand()],650);h.send([h.hand()],750);
  assert.equal(h.counts.click,1);
  h.handlers['gestureStop:click']();assert.equal(h.counts.stop,1);assert.ok(h.workers[0].terminated);assert.equal(h.nodes.gestureVideo.srcObject,null);
});
test('manual mode stops web gestures and restores deliberate mouse control',async()=>{
  const h=harness();await h.start();assert.equal(h.nodes.gestureManual.attributes['aria-pressed'],'false');
  h.handlers['gestureManual:click']();assert.equal(h.counts.stop,1);assert.equal(h.nodes.gestureManual.attributes['aria-pressed'],'true');assert.equal(h.nodes.gestureStart.attributes['aria-pressed'],'false');
});
test('camera pinching can activate a regular button or checkbox',async()=>{
  for(const tagName of ['BUTTON','INPUT']){
    const h=harness();let click=0;
    const target={tagName,type:tagName==='INPUT'?'checkbox':undefined,disabled:false,classList:{add(){},remove(){}},closest:selector=>selector==='[inert]'||selector==='.half-list'?null:target,click(){click++;}};
    h.setHit(target);await h.start();h.send([h.hand()],0);h.send([h.hand()],100);h.send([h.hand(true)],150);h.send([h.hand(true)],250);h.send([h.hand()],300);h.send([h.hand()],400);assert.equal(click,1);
  }
});
test('pinch-dragging a slider updates its value without creating a click',async()=>{
  const h=harness(),events=[];let clicks=0;
  const range={tagName:'INPUT',type:'range',min:'0.5',max:'3',step:'0.1',value:'1.4',disabled:false,classList:{add(){},remove(){}},closest:selector=>selector==='[inert]'||selector==='.half-list'?null:range,getBoundingClientRect:()=>({left:0,width:1000}),dispatchEvent:event=>events.push(event.type),click(){clicks++;}};
  h.setHit(range);await h.start();h.send([h.hand()],0);h.send([h.hand()],100);h.send([h.hand(true)],150);h.send([h.hand(true)],250);
  const initial=Number(range.value);h.send([h.hand(true,.3)],300);assert.ok(Number(range.value)>initial);
  h.send([h.hand(false,.3)],350);h.send([h.hand(false,.3)],450);assert.equal(clicks,0);assert.equal(events.at(-1),'change');
});
test('dragging over model rotates without clicking, and two hands zoom',async()=>{
  const h=harness();await h.start();h.nodes.sceneCanvas.closest=()=>null;h.setHit(h.nodes.sceneCanvas);
  h.send([h.hand()],0);h.send([h.hand()],100);h.send([h.hand(true)],150);h.send([h.hand(true)],250);h.send([h.hand(true,.7)],300);
  assert.ok(h.counts.orbit>0);assert.equal(h.counts.click,0);
  h.send([h.hand(false,.3),h.hand(false,.7)],350);assert.equal(h.counts.zoom,1);
});
test('stop while waiting for camera permission releases a late stream',async()=>{
  let resolve;const camera=new Promise(r=>resolve=r);const h=harness(()=>camera);
  const pending=h.handlers['gestureStart:click']();h.handlers['gestureStop:click']();resolve(h.stream);await pending;
  assert.equal(h.counts.stop,1);assert.equal(h.workers.length,0);assert.equal(h.nodes.gestureStart.disabled,false);
});
test('permission denied restores retry button; hiding page closes active camera',async()=>{
  const denied=harness(()=>Promise.reject({name:'NotAllowedError'}));await denied.handlers['gestureStart:click']();
  assert.equal(denied.nodes.gestureStart.disabled,false);assert.match(denied.nodes.gestureStatus.textContent,/permission denied/);
  const h=harness();await h.start();h.scope.document.hidden=true;h.handlers['document:visibilitychange']();assert.equal(h.counts.stop,1);
});
test('a pinch on visible model geometry selects its beamline without clicking unrelated controls',async()=>{
  const h=harness(),selected=[];h.scope.window.PhotonControls.beamlineAt=()=> 'BL03';h.scope.window.PhotonControls.selectBeamline=id=>selected.push(id);
  await h.start();h.nodes.sceneCanvas.closest=()=>null;h.setHit(h.nodes.sceneCanvas);
  h.send([h.hand()],0);h.send([h.hand()],100);h.send([h.hand(true)],150);h.send([h.hand(true)],250);h.send([h.hand()],300);h.send([h.hand()],400);
  assert.deepEqual(selected,['BL03']);assert.equal(h.counts.click,0);
});
test('pointing at a list edge does not scroll until an intentional scroll gesture',async()=>{
  const h=harness();let scroll=0;
  const list={scrollHeight:600,clientHeight:200,scrollTop:100,getBoundingClientRect:()=>({top:100,bottom:225,height:125}),scrollBy:(x,y)=>scroll+=y};
  h.setHit({disabled:false,classList:{add(){},remove(){}},closest:selector=>selector==='.half-list'?list:null});
  await h.start();h.send([h.hand()],0);assert.equal(scroll,0);
});
test('two-finger scrolling stays anchored to the list and moves it up and down',async()=>{
  const h=harness();let top=200,pageScroll=0;
  const list={scrollBy:(x,y)=>top+=y};
  h.scope.window.scrollBy=()=>pageScroll++;
  h.setHit({closest:selector=>selector==='.half-list'?list:null});
  function pose(y){const p=h.hand();p.forEach(q=>q.y+=y-.4);p[6]={x:.5,y:y+.08,z:0};p[12]={x:.53,y,z:0};p[10]={x:.53,y:y+.08,z:0};p[16]={x:.56,y:y+.14,z:0};p[14]={x:.56,y:y+.08,z:0};p[20]={x:.6,y:y+.14,z:0};p[18]={x:.6,y:y+.08,z:0};return p;}
  await h.start();h.send([pose(.4)],0);assert.equal(top,200);
  const anchor=h.nodes.gestureCursor.style.top;
  h.send([pose(.44)],50);assert.ok(top>200);const lower=top;
  h.send([pose(.35)],100);assert.ok(top<lower);
  assert.equal(pageScroll,0);assert.equal(h.nodes.gestureCursor.style.top,anchor);assert.equal(h.counts.click,0);
});
