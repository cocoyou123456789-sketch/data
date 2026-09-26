const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const lines = require('../github-pages/half-beamlines.js');
const lab = require('../github-pages/photon-lab-core.js');
test('HALF phase I has ten unique beamlines with slide 4 energy ranges',()=>{
  assert.deepEqual(lines.map(b=>b.id),Array.from({length:10},(_,i)=>`BL${String(i+1).padStart(2,'0')}`));
  assert.deepEqual(lines.map(b=>[b.min,b.max]),[[5,20],[6,135],[80,1000],[250,2000],[180,2500],[250,2500],[250,4000],[770,10000],[2100,6500],[250,2000]]);
  for(const b of lines){assert.ok(b.zh && b.en && b.methods.zh.length);assert.equal(b.methods.zh.length,b.methods.en.length);assert.ok([...b.start,...b.end].every(Number.isFinite));}
});
test('each station has tagged exportable geometry whose path connects source and endpoint',()=>{
  const scene=lab.scene('ring');
  for(const b of lines){
    const parts=scene.filter(p=>p.beamlineId===b.id);assert.equal(parts.length,3);
    const path=parts[0]; const center=path.vertices.reduce((a,v)=>a.map((n,i)=>n+v[i]/8),[0,0,0]);
    assert.ok(Math.abs(center[0]-(b.start[0]+b.end[0])/2)<1e-9);
    assert.ok(Math.abs(center[2]-(b.start[2]+b.end[2])/2)<1e-9);
  }
});
test('PHOTON entry belongs to left NSRL catalog, not materials workbench',()=>{
  const home=fs.readFileSync('github-pages/index.html','utf8');
  const catalog=fs.readFileSync('github-pages/nsrl-catalog.js','utf8');
  assert.ok(!home.includes('href="./photon-lab.html"'));
  assert.ok(catalog.includes('href="./photon-lab.html?lang=${lang}"'));
});
