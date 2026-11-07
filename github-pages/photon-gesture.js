(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const tracker=new window.PhotonGestureCore.GestureTracker();
  const video=$('gestureVideo'),cursor=$('gestureCursor'),preview=$('gesturePreview');
  const copy=(en,zh)=>document.documentElement.lang.startsWith('zh')?zh:en;
  const allowed='button,a[href],input:not([type="hidden"]),select,textarea';
  let worker=null,stream=null,active=false,generation=0,raf=0,busy=false,lastTime=0,lastVideo=-1,press=null,hover=null,watchdog=0,scrollAnchor=null,scrollTarget=null;
  const status=(en,zh)=>{const text=copy(en,zh);if($('gestureStatus').textContent!==text)$('gestureStatus').textContent=text;};
  let gaze=null;
  const inputMode=()=>$('gestureModeEye')?.getAttribute('aria-pressed')==='true'?'eye':'hand';
  function refreshCameraNote(){
    const note=$('gestureCameraNote'); if(!note) return;
    if(inputMode()!=='eye'){note.hidden=true;return;}
    note.hidden=false;
    if(!window.WebsiteGaze?.cameraStatus){note.textContent=copy('Eye control failed to load. Reload the page.','眼球控制没有加载，请刷新页面。');return;}
    const raw=$('websiteGestureWidget')?.dataset.cameras ?? note.dataset.cameras;
    const report=window.WebsiteGaze.cameraStatus(raw);
    note.textContent=copy(report.en,report.zh);
  }
  function publishCameras(){
    if(!navigator.mediaDevices?.enumerateDevices) return Promise.resolve();
    return navigator.mediaDevices.enumerateDevices().then(list=>{
      const found=Math.max(list.filter(device=>device.kind==='videoinput').length, stream?.getVideoTracks().length||0);
      const widget=$('websiteGestureWidget');
      if(widget) widget.dataset.cameras=String(found);
      const note=$('gestureCameraNote');
      if(note) note.dataset.cameras=String(found);
      refreshCameraNote();
    }).catch(()=>{});
  }
  function applyModeChrome(){
    const eye=inputMode()==='eye';
    const actions=$('gazeActions'); if(actions) actions.hidden=!eye;
    const handHelp=$('gestureHandHelp'); if(handHelp) handHelp.hidden=eye;
    const eyeHelp=$('gestureEyeHelp'); if(eyeHelp) eyeHelp.hidden=!eye;
    const labSpeed=$('gestureScrollSpeedLabel'); if(labSpeed) labSpeed.hidden=eye;
    const beamlineDwell=$('beamlineDwellLabel'); if(beamlineDwell) beamlineDwell.hidden=eye;
    const start=$('gestureStart');
    if(start?.hasAttribute?.('data-en') && !start.disabled && start.getAttribute('aria-pressed')!=='true'){
      start.dataset.en=eye?'Start eye calibration':'Enable camera gestures';
      start.dataset.zh=eye?'开始眼球校准':'开启摄像头手势';
      start.textContent=copy(start.dataset.en,start.dataset.zh);
    }
    refreshCameraNote();
  }
  function syncGaze(result){
    const overlay=$('gazeCalibration'),dot=$('gazeDot'),text=$('gazeCalibrationText'),enable=$('gazeEnable');
    if(!overlay) return;
    overlay.hidden=result?.kind!=='calibrating';
    if(dot){
      dot.hidden=!result?.target;
      if(result?.target){dot.style.left=`${result.target.x*innerWidth}px`;dot.style.top=`${result.target.y*innerHeight}px`;}
    }
    if(text && result?.en) text.textContent=copy(result.en,result.zh);
    if(enable) enable.disabled=!result?.ready;
  }
  function clearInteraction(){
    window.PhotonGestureAdapter?.cancel();
    window.PhotonSelection?.clear();
    tracker.reset();press=null;cursor.hidden=true;
    scrollAnchor=null;scrollTarget=null;
    hover?.classList.remove('gesture-hover');hover=null;
  }
  function stop(){
    generation++;active=false;cancelAnimationFrame(raf);clearTimeout(watchdog);
    worker?.terminate();worker=null;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;
    busy=false;lastTime=0;lastVideo=-1;gaze=null;clearInteraction();preview.hidden=true;syncGaze(null);
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
    else status(inputMode()==='eye'?'Could not start eye tracking. Check the connection and retry.':'Could not start hand tracking. Check the connection and retry.',inputMode()==='eye'?'眼球控制启动失败，请检查连接后重试。':'手势识别启动失败，请检查连接后重试。');
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
  function drive(action){
    if(window.PhotonGestureAdapter){
      const message=window.PhotonGestureAdapter.handle(action);
      if(message && active)status(...message);
      return;
    }
    if(action.kind==='calibrating'){clearInteraction();status(action.en||'Look at the calibration dot. Calibration does not select.',action.zh||'请看校准圆点。校准期间不会选择。');return;}
    if(action.kind==='lost'){clearInteraction();status(action.en||'Show one hand to point',action.zh||'举起一只手以移动光标');return;}
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
    scrollAnchor=null;scrollTarget=null;
    cursor.dataset.mode=typeof action.dwell==='number'?'gaze':'pointer';
    if(typeof action.dwell==='number') cursor.style.setProperty('--dwell',String(action.dwell));
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
    if(typeof action.dwell==='number'){
      status(action.en||'Eye control: hold a steady gaze for 1.2 seconds to select. Blinking does not select.',action.zh||'眼球控制：稳定注视 1.2 秒确认选择。眨眼不确认。');
      return;
    }
    status(action.down?'Pinch held · drag the model':'Point · pinch and release to select',action.down?'捏合中 · 拖动模型':'指向 · 捏合后松开以选择');
  }
  function handle(hands,time){
    drawHands(hands);
    drive(tracker.update(hands,time));
  }
  function drawFace(landmarks){
    const canvas=$('gestureSkeleton'),ctx=canvas.getContext('2d');
    const height=Math.round(320*(video.videoHeight||480)/(video.videoWidth||640));
    if(canvas.height!==height)canvas.height=height;
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#8affd7';
    for(const index of [468,473]){
      const point=landmarks?.[index]; if(!point) continue;
      ctx.beginPath();ctx.arc((1-point.x)*canvas.width,point.y*canvas.height,4,0,Math.PI*2);ctx.fill();
    }
  }
  function handleEyes(landmarks,time){
    drawFace(landmarks);
    if(!gaze || !window.WebsiteGaze) return;
    const result=gaze.update(window.WebsiteGaze.eyeFrameFromLandmarks(landmarks),time/1000,{width:innerWidth,height:innerHeight});
    syncGaze(result);
    drive(result);
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
    if(inputMode()==='eye' && !window.WebsiteGaze){status('Eye control failed to load. Reload the page.','眼球控制没有加载，请刷新页面。');return;}
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
      preview.hidden=false;$('gesturePreviewToggle').hidden=false;await publishCameras();
      status(inputMode()==='eye'?'Loading eye tracker…':'Loading hand tracker…',inputMode()==='eye'?'正在加载眼球识别…':'正在加载手部识别…');
      worker=new Worker(new URL('./photon-gesture-worker.js',document.baseURI),{type:'module'});
      worker.onerror=event=>{if(token===generation)fail(new Error(event.message));};
      worker.onmessage=({data})=>{
        if(token!==generation)return;
        if(data.type==='ready'){
          clearTimeout(watchdog);active=true;clearInteraction();$('gestureManual')?.setAttribute('aria-pressed','false');$('gestureStart').setAttribute('aria-pressed','true');raf=requestAnimationFrame(frame);
          if(inputMode()==='eye'){gaze=new window.WebsiteGaze.GazeController();gaze.begin({width:innerWidth,height:innerHeight});handleEyes([],data.time||performance.now());}
          else status('Show one hand to point','举起一只手以移动光标');
        }
        else if(data.type==='hands'){clearTimeout(watchdog);busy=false;handle(data.hands,data.time);}
        else if(data.type==='face'){clearTimeout(watchdog);busy=false;handleEyes(data.landmarks,data.time);}
        else if(data.type==='error')fail(new Error(data.message));
      };
      watchdog=setTimeout(()=>{if(token===generation)fail(new Error('Hand tracker initialization timed out'));},30000);
      worker.postMessage({type:'init',mode:inputMode()==='eye'?'face':'hand'});
    }catch(error){if(token===generation)fail(error);}
  }
  $('gestureStart').addEventListener('click',start);
  $('gestureManual')?.addEventListener('click',stop);
  $('gestureStop').addEventListener('click',stop);
  $('gesturePreviewToggle').addEventListener('click',()=>{preview.hidden=!preview.hidden;});
  $('gazeEnable')?.addEventListener('click',()=>{
    if(!gaze?.enable()) return;
    syncGaze(null);
    status('Eye control on. Hold a steady gaze for 1.2 seconds to select. Blinking does not select.','眼球控制已启用。稳定注视 1.2 秒确认选择，眨眼不确认。');
  });
  $('gazeRetry')?.addEventListener('click',()=>{
    if(!active || inputMode()!=='eye' || !window.WebsiteGaze) return;
    gaze=new window.WebsiteGaze.GazeController();
    gaze.begin({width:innerWidth,height:innerHeight});
    handleEyes([],performance.now());
  });
  window.addEventListener('website-gesture-mode',()=>{if(active||stream||$('gestureStart').disabled)stop();});
  window.addEventListener('keydown',e=>{if(e.key==='Escape' && (active||stream||$('gestureStart').disabled))stop();});
  window.addEventListener('pagehide',stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden && (active||stream||$('gestureStart').disabled))stop();});
  $('gestureModeHand')?.addEventListener('click',()=>{
    $('gestureModeHand').setAttribute('aria-pressed','true');
    $('gestureModeEye')?.setAttribute('aria-pressed','false');
    applyModeChrome();
    publishCameras();
    if(active||stream||$('gestureStart').disabled) stop();
  });
  $('gestureModeEye')?.addEventListener('click',()=>{
    $('gestureModeEye').setAttribute('aria-pressed','true');
    $('gestureModeHand')?.setAttribute('aria-pressed','false');
    applyModeChrome();
    publishCameras();
    if(active||stream||$('gestureStart').disabled) stop();
  });
  applyModeChrome();
})();
