(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const tracker=new window.PhotonGestureCore.GestureTracker();
  const video=$('gestureVideo'),cursor=$('gestureCursor'),preview=$('gesturePreview');
  const copy=(en,zh)=>document.documentElement.lang.startsWith('zh')?zh:en;
  const allowed='button,a[href],input:not([type="hidden"]),select,textarea';
  let worker=null,stream=null,active=false,generation=0,raf=0,busy=false,lastTime=0,lastVideo=-1,press=null,hover=null,watchdog=0,scrollAnchor=null,scrollTarget=null;
  const status=(en,zh)=>{const text=copy(en,zh);if($('gestureStatus').textContent!==text)$('gestureStatus').textContent=text;};
  function clearInteraction(){
    window.PhotonSelection?.clear();
    tracker.reset();press=null;cursor.hidden=true;
    scrollAnchor=null;scrollTarget=null;
    hover?.classList.remove('gesture-hover');hover=null;
  }
  function stop(){
    generation++;active=false;cancelAnimationFrame(raf);clearTimeout(watchdog);
    worker?.terminate();worker=null;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;
    busy=false;lastTime=0;lastVideo=-1;clearInteraction();preview.hidden=true;
    $('gestureStart').disabled=false;$('gestureStop').hidden=true;$('gesturePreviewToggle').hidden=true;
    $('gestureManual')?.setAttribute('aria-pressed','true');$('gestureStart').setAttribute('aria-pressed','false');
    status('Camera off','摄像头已关闭');
  }
  function fail(error){
    stop();
    const name=error?.name;
    if(name==='NotAllowedError') status('Camera permission denied. Allow camera access in your browser and retry.','摄像头权限未允许，请在浏览器中允许访问后重试。');
    else if(name==='NotFoundError') status('No camera found. Connect a webcam and retry.','未找到摄像头，请连接摄像头后重试。');
    else if(name==='NotReadableError') status('Camera is busy. Close other camera apps and retry.','摄像头被占用，请关闭其他使用摄像头的应用后重试。');
    else status('Could not start hand tracking. Check the connection and retry.','手势识别启动失败，请检查连接后重试。');
    console.warn('PHOTON hand tracking:',error?.message||error);
  }
  function drawHands(hands){
    const canvas=$('gestureSkeleton'),ctx=canvas.getContext('2d');
    const height=Math.round(320*(video.videoHeight||480)/(video.videoWidth||640));
    if(canvas.height!==height)canvas.height=height;
    canvas.style.aspectRatio=`320 / ${height}`;
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#8affd7';ctx.fillStyle='#fff';ctx.lineWidth=2;
    const edges=[[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]];
    for(const hand of hands){
      for(const chain of edges){ctx.beginPath();chain.forEach((i,k)=>{const x=(1-hand[i].x)*canvas.width,y=hand[i].y*canvas.height;k?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}
      hand.forEach(p=>{ctx.beginPath();ctx.arc((1-p.x)*canvas.width,p.y*canvas.height,2,0,Math.PI*2);ctx.fill();});
    }
  }
  function handle(hands,time){
    drawHands(hands);
    const action=tracker.update(hands,time);
    if(action.kind==='lost'){clearInteraction();status('Show one hand to point','举起一只手以移动光标');return;}
    if(action.kind==='zoom'){
      window.PhotonSelection?.clear();
      press=null;cursor.hidden=true;hover?.classList.remove('gesture-hover');hover=null;
      window.PhotonControls.zoom(action.scale);status('Two hands · zoom','双手 · 缩放');return;
    }
    if(action.kind==='scroll'){
      window.PhotonSelection?.clear();press=null;hover?.classList.remove('gesture-hover');hover=null;
      if(action.start || !scrollAnchor){
        scrollAnchor={x:action.point.x*innerWidth,y:action.point.y*innerHeight};
        const under=document.elementFromPoint(scrollAnchor.x,scrollAnchor.y);
        scrollTarget=under?.closest('.half-list')||under?.closest('.element-grid')||under?.closest('#messages');
      }
      cursor.hidden=false;cursor.dataset.down='false';cursor.dataset.mode='scroll';
      cursor.style.left=`${scrollAnchor.x}px`;cursor.style.top=`${scrollAnchor.y}px`;
      const speed=Number($('gestureScrollSpeed')?.value||1.4);
      const pixels=Math.abs(action.delta)<.0008?0:Math.max(-120,Math.min(120,action.delta*innerHeight*speed*2));
      if(pixels){if(scrollTarget)scrollTarget.scrollBy(0,pixels);else window.scrollBy(0,pixels);}
      status('Two fingers · scroll up / down','双指上下移动 · 滚动中');return;
    }
    scrollAnchor=null;scrollTarget=null;cursor.dataset.mode='pointer';
    const x=action.point.x*innerWidth,y=action.point.y*innerHeight;
    cursor.hidden=false;cursor.style.left=`${x}px`;cursor.style.top=`${y}px`;cursor.dataset.down=String(action.down);
    const under=document.elementFromPoint(x,y),target=under?.closest(allowed)||under?.closest('label')?.control;
    const enabled=target&&!target.disabled&&!target.closest('[inert]')?target:null;
    window.PhotonSelection?.point(x,y,action.down);
    if(hover!==enabled){hover?.classList.remove('gesture-hover');hover=enabled;hover?.classList.add('gesture-hover');}
    if(action.phase==='down'){
      press={x,y,target:enabled,drag:false,range:enabled?.tagName==='INPUT' && enabled.type==='range'?enabled:null,scene:under===$('sceneCanvas'),beamline:under===$('sceneCanvas')?window.PhotonControls.beamlineAt?.(x,y):null};
    }
    if(press && action.down){
      if(press.range){
        const input=press.range,r=input.getBoundingClientRect();
        if(r.width>0){
          const min=Number(input.min||0),max=Number(input.max||100),step=Number(input.step||1);
          const fraction=Math.max(0,Math.min(1,(x-r.left)/r.width)),raw=min+fraction*(max-min);
          const value=Number.isFinite(step)&&step>0?min+Math.round((raw-min)/step)*step:raw;
          input.value=String(Math.max(min,Math.min(max,value)));
          input.dispatchEvent(new Event('input',{bubbles:true}));
        }
        press.drag=true;
      }
      if(Math.hypot(x-press.x,y-press.y)>18) press.drag=true;
      if(press.drag && press.scene) window.PhotonControls.orbit(action.delta.x*innerWidth,action.delta.y*innerHeight);
    }
    if(action.phase==='up'){
      const range=press?.range;
      const clicked=press && !press.drag && press.target===enabled?enabled:null;
      const beamline=press && !press.drag && press.scene && press.beamline===window.PhotonControls.beamlineAt?.(x,y)?press.beamline:null;
      press=null;
      clicked?.focus?.({preventScroll:true});clicked?.click();
      if(range)range.dispatchEvent(new Event('change',{bubbles:true}));
      if(beamline)window.PhotonControls.selectBeamline(beamline);
      if(!active)return;
    }
    status(action.down?'Pinch held · drag the model':'Point · pinch and release to select',action.down?'捏合中 · 拖动模型':'指向 · 捏合后松开以选择');
  }
  async function frame(time){
    if(!active) return;
    raf=requestAnimationFrame(frame);
    if(busy || time-lastTime<65 || video.readyState<2 || video.currentTime===lastVideo) return;
    lastTime=time;lastVideo=video.currentTime;busy=true;
    const token=generation;
    try{
      const bitmap=await createImageBitmap(video);
      if(token!==generation || !active){bitmap.close();return;}
      worker.postMessage({type:'frame',bitmap,time},[bitmap]);
      watchdog=setTimeout(()=>{if(token===generation)fail(new Error('Hand tracker stopped responding'));},6000);
    }catch(error){if(token===generation)fail(error);}
  }
  async function start(){
    if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia){status('Open the HTTPS website to use the camera.','请打开 HTTPS 网站使用摄像头。');return;}
    $('gestureStart').disabled=true;$('gestureStop').hidden=false;
    const token=++generation;
    status('Allow camera access in the browser…','请在浏览器提示中允许摄像头访问…');
    try{
      const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:20,max:30}}});
      if(token!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
      stream=acquired;stream.getVideoTracks().forEach(t=>t.addEventListener('ended',()=>{if(token===generation)stop();}));
      video.srcObject=stream;await video.play();
      if(token!==generation)return;
      preview.hidden=false;$('gesturePreviewToggle').hidden=false;
      status('Loading hand tracker…','正在加载手部识别…');
      worker=new Worker(new URL('./photon-gesture-worker.js',document.baseURI),{type:'module'});
      worker.onerror=event=>{if(token===generation)fail(new Error(event.message));};
      worker.onmessage=({data})=>{
        if(token!==generation)return;
        if(data.type==='ready'){clearTimeout(watchdog);active=true;clearInteraction();$('gestureManual')?.setAttribute('aria-pressed','false');$('gestureStart').setAttribute('aria-pressed','true');raf=requestAnimationFrame(frame);status('Show one hand to point','举起一只手以移动光标');}
        else if(data.type==='hands'){clearTimeout(watchdog);busy=false;handle(data.hands,data.time);}
        else if(data.type==='error')fail(new Error(data.message));
      };
      watchdog=setTimeout(()=>{if(token===generation)fail(new Error('Hand tracker initialization timed out'));},30000);
      worker.postMessage({type:'init'});
    }catch(error){if(token===generation)fail(error);}
  }
  $('gestureStart').addEventListener('click',start);
  $('gestureManual')?.addEventListener('click',stop);
  $('gestureStop').addEventListener('click',stop);
  $('gesturePreviewToggle').addEventListener('click',()=>{preview.hidden=!preview.hidden;});
  window.addEventListener('keydown',e=>{if(e.key==='Escape' && (active||stream||$('gestureStart').disabled))stop();});
  window.addEventListener('pagehide',stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden && (active||stream||$('gestureStart').disabled))stop();});
})();
