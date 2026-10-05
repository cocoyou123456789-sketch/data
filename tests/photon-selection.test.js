const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const C=require('../github-pages/photon-lab-core.js');
test('model picking follows visible triangle order and respects occlusion',()=>{
  const p=[[0,0,1],[10,0,1],[0,10,1]];
  assert.equal(C.pickBeamline([{points:p,beamlineId:'BL03'}],2,2),'BL03');
  assert.equal(C.pickBeamline([{points:p,beamlineId:'BL03'},{points:p,beamlineId:'BL08'}],2,2),'BL08');
  assert.equal(C.pickBeamline([{points:p,beamlineId:'BL03'},{points:p}],2,2),null);
  assert.equal(C.pickBeamline([{points:p,beamlineId:'BL03'}],20,20),null);
  assert.equal(C.pickBeamline([{points:[[0,0],[0,0],[0,0]],beamlineId:'BL03'}],0,0),null);
});
function harness(){
  let now=0,raf=null,id=0;const listeners={},selected=[],hovered=[];
  function button(id){return {dataset:{beamline:id},disabled:false,pressed:false,style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},getAttribute(){return String(this.pressed)},closest(selector){return selector==='button[data-beamline]'?this:null;}}}
  const a=button('BL01'),b=button('BL10'),canvas={closest:()=>null},setting={checked:true,addEventListener(n,fn){listeners[n]=fn}};
  let hit=a;
  const scope={window:{PhotonControls:{hoverBeamline:id=>hovered.push(id),selectBeamline:id=>selected.push(id),beamlineAt:()=> 'BL10'}},
    document:{hidden:false,elementFromPoint:()=>hit,getElementById:id=>id==='beamlineDwell'?setting:canvas,querySelector:()=>b,addEventListener(n,fn){listeners[n]=fn}},
    performance:{now:()=>now},requestAnimationFrame:fn=>{raf=fn;return ++id;},cancelAnimationFrame:()=>{raf=null}};
  vm.runInNewContext(fs.readFileSync('github-pages/photon-selection.js','utf8'),scope);
  return {scope,a,b,canvas,setting,selected,listeners,setHit:h=>hit=h,point(held=false,source='desktop'){scope.window.PhotonSelection.point(10,10,held,source);},tick(time){now=time;const fn=raf;raf=null;fn?.(time);}};
}
test('desktop/native gesture hover selects a card once after a stable second',()=>{
  const h=harness();h.point();h.tick(0);h.tick(999);assert.equal(h.selected.length,0);h.tick(1000);assert.deepEqual(h.selected,['BL01']);
});
test('moving to another card restarts dwell, and a held pinch blocks dwell',()=>{
  const h=harness();h.point();h.tick(0);h.tick(800);h.setHit(h.b);h.tick(900);h.tick(1000);assert.equal(h.selected.length,0);
  h.point(true);h.tick(1100);assert.equal(h.selected.length,0);
  h.point();h.tick(1200);h.tick(2200);assert.deepEqual(h.selected,['BL10']);
});
test('stale camera input, disabled hover selection and already selected cards cannot activate',()=>{
  const h=harness();h.point(false,'camera');h.tick(0);h.tick(400);assert.equal(h.selected.length,0);
  h.setting.checked=false;h.point();h.tick(500);h.tick(1600);assert.equal(h.selected.length,0);
  h.setting.checked=true;h.a.pressed=true;h.point();h.tick(1700);h.tick(2800);assert.equal(h.selected.length,0);
});
test('hover can select model geometry; loss of focus cancels pending selection',()=>{
  const h=harness();h.setHit(h.canvas);h.point();h.tick(0);h.tick(1000);assert.deepEqual(h.selected,['BL10']);
  const x=harness();x.point();x.tick(0);x.scope.document.hidden=true;x.tick(1000);assert.equal(x.selected.length,0);
});
