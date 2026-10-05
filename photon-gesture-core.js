/* Camera-independent gesture state machine. Coordinates are mirrored to match a selfie preview. */
(function(root) {
  'use strict';
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const clamp=x=>Math.max(0,Math.min(1,x));
  class GestureTracker {
    constructor(){this.reset();}
    reset(){this.point=null;this.palm=null;this.down=false;this.candidate=null;this.since=0;this.armed=false;this.span=null;this.time=null;}
    update(hands,time) {
      const valid=(hands||[]).filter(h=>h.length===21 && h.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)) && distance(h[0],h[9])>.05);
      if (!valid.length || (this.time!==null && time-this.time>300)) {
        const cancelled=this.down;this.reset();this.time=time;
        return {kind:'lost',cancelled};
      }
      const dt=this.time===null?50:Math.min(100,time-this.time);this.time=time;
      if(valid.length===2) {
        const span=distance(valid[0][9],valid[1][9]);
        const scale=this.span?Math.max(.9,Math.min(1.1,span/this.span)):1;
        const cancelled=this.down;
        this.down=false;this.armed=false;this.candidate=null;this.point=null;this.palm=null;this.span=span;
        return {kind:'zoom',scale,cancelled};
      }
      this.span=null;
      const hand=this.palm?valid.reduce((a,b)=>distance(a[9],this.palm)<distance(b[9],this.palm)?a:b):valid[0];
      if(this.palm && distance(hand[9],this.palm)>.25){const cancelled=this.down;this.reset();this.time=time;return {kind:'lost',cancelled};}
      this.palm=hand[9];
      const point={x:clamp((1-hand[8].x-.12)/.76),y:clamp((hand[8].y-.12)/.76)};
      const alpha=1-Math.exp(-dt/65);
      const previous=this.point;
      this.point=previous?{x:previous.x+alpha*(point.x-previous.x),y:previous.y+alpha*(point.y-previous.y)}:point;
      const ratio=distance(hand[4],hand[8])/distance(hand[0],hand[9]);
      // Separate close/open thresholds avoid flicker. Re-arm only with an open hand.
      const desired=this.down?ratio<.55:ratio<.32;
      if(desired!==this.candidate){this.candidate=desired;this.since=time;}
      let phase='move';
      if(!desired && time-this.since>=90){
        if(this.down){this.down=false;phase='up';}
        this.armed=true;
      }else if(desired && this.armed && !this.down && time-this.since>=90){this.down=true;this.armed=false;phase='down';}
      return {kind:'pointer',phase,down:this.down,point:this.point,delta:previous?{x:this.point.x-previous.x,y:this.point.y-previous.y}:{x:0,y:0}};
    }
  }
  if(typeof module!=='undefined' && module.exports) module.exports={GestureTracker};
  else root.PhotonGestureCore={GestureTracker};
})(typeof window!=='undefined'?window:globalThis);
