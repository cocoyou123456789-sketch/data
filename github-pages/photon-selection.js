/* Beamline selection shared by native mouse events and the web hand cursor. */
(function(){
  'use strict';
  const controls=window.PhotonControls,setting=document.getElementById('beamlineDwell');
  let point=null,candidate=null,since=0,raf=0,marker=null,blocked=false,source='desktop',sampleTime=0;
  function clearProgress(){
    marker?.removeAttribute('data-dwell');marker?.style.removeProperty('--dwell-progress');marker?.classList.remove('beamline-hover');marker=null;
    candidate=null;since=0;
  }
  function clear(){cancelAnimationFrame(raf);raf=0;point=null;clearProgress();controls.hoverBeamline(null);}
  function resolve(){
    if(!point)return null;
    const under=document.elementFromPoint(point.x,point.y);
    const button=under?.closest('button[data-beamline]');
    if(button && !button.disabled && !button.closest('[inert]'))return {id:button.dataset.beamline,button};
    if(under===document.getElementById('sceneCanvas')){
      const id=controls.beamlineAt(point.x,point.y);
      if(id)return {id,button:document.querySelector(`.half-pin[data-beamline="${id}"]`)};
    }
    return null;
  }
  function tick(now){
    raf=0;
    if(document.hidden || source==='camera' && now-sampleTime>300){clear();return;}
    const hit=resolve();controls.hoverBeamline(hit?.id||null);
    if(!hit || blocked || !setting.checked){clearProgress();return;}
    if(candidate!==hit.id || marker!==hit.button){clearProgress();candidate=hit.id;since=now;marker=hit.button;marker?.classList.add('beamline-hover');}
    if(hit.button?.getAttribute('aria-pressed')==='true'){clearProgress();return;}
    const progress=Math.min(1,(now-since)/1000);
    marker?.setAttribute('data-dwell','');marker?.style.setProperty('--dwell-progress',String(progress));
    if(progress===1){const id=hit.id;clearProgress();controls.selectBeamline(id);return;}
    raf=requestAnimationFrame(tick);
  }
  function update(x,y,held=false,kind='camera'){
    point={x,y};blocked=held;source=kind;sampleTime=performance.now();
    if(!raf)raf=requestAnimationFrame(tick);
  }
  document.addEventListener('pointermove',event=>update(event.clientX,event.clientY,event.buttons!==0,'desktop'),{passive:true});
  document.addEventListener('pointerdown',()=>{blocked=true;clearProgress();},{passive:true});
  document.addEventListener('pointerup',event=>update(event.clientX,event.clientY,false,'desktop'),{passive:true});
  document.addEventListener('pointercancel',clear);
  document.addEventListener('wheel',clear,{passive:true});
  document.addEventListener('pointerleave',clear);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
  setting.addEventListener('change',clear);
  window.PhotonSelection={point:update,clear};
})();
