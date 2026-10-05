const test=require('node:test');
const assert=require('node:assert/strict');
const {GestureTracker}=require('../github-pages/photon-gesture-core.js');
function hand({x=.5,y=.4,pinch=false,scale=1}={}){
  const h=Array.from({length:21},()=>({x,y,z:0}));
  h[0]={x,y:y+.2*scale,z:0};h[9]={x,y:y+.1*scale,z:0};
  h[4]={x:x+(pinch?.01:.08)*scale,y,z:0};return h;
}
test('pinch needs opening and debounce; noisy threshold cannot click repeatedly',()=>{
  const t=new GestureTracker();
  t.update([hand({pinch:true})],0);
  assert.equal(t.update([hand({pinch:true})],100).down,false);
  t.update([hand()],150);t.update([hand()],250);
  t.update([hand({pinch:true})],300);
  assert.equal(t.update([hand({pinch:true})],400).phase,'down');
  assert.equal(t.update([hand({pinch:true})],450).phase,'move');
  const noise=hand({pinch:true});noise[4].x=.54;
  assert.equal(t.update([noise],500).down,true);
  t.update([hand()],550);assert.equal(t.update([hand()],650).phase,'up');
  assert.equal(t.update([hand()],700).phase,'move');
});
test('losing tracking cancels a held pinch and never generates a release click',()=>{
  const t=new GestureTracker();t.update([hand()],0);t.update([hand()],100);
  t.update([hand({pinch:true})],150);t.update([hand({pinch:true})],250);
  assert.deepEqual(t.update([],300),{kind:'lost',cancelled:true});
  assert.equal(t.update([hand({pinch:true})],350).down,false);
});
test('mirrored motion is smoothed and scale independent',()=>{
  for(const scale of [1,2]){
    const t=new GestureTracker();const a=t.update([hand({x:.3,scale})],0);
    const b=t.update([hand({x:.4,scale})],50);
    assert.ok(a.point.x>b.point.x);assert.ok(b.point.x>(1-.4-.12)/.76);
  }
});
test('two hands change zoom continuously, cancel pinch and require rearming',()=>{
  const t=new GestureTracker();
  assert.equal(t.update([hand({x:.25}),hand({x:.75})],0).scale,1);
  assert.ok(t.update([hand({x:.2}),hand({x:.8})],50).scale>1);
  assert.ok(t.update([hand({x:.25}),hand({x:.75})],100).scale<1);
  assert.equal(t.update([hand({pinch:true})],150).down,false);
});
test('invalid points, tiny background hands and stale frames do not control the scene',()=>{
  const t=new GestureTracker();assert.equal(t.update([hand({scale:.1})],0).kind,'lost');
  const invalid=hand();invalid[8].x=NaN;assert.equal(t.update([invalid],50).kind,'lost');
  t.update([hand()],100);assert.equal(t.update([hand()],500).kind,'lost');
});
