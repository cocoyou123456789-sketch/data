import {FaceLandmarker,FilesetResolver,HandLandmarker} from './vendor/mediapipe/vision_bundle.mjs';
let detector,mode='hand';
self.onmessage=async ({data})=>{
  if(data.type==='init') {
    mode=data.mode==='face'?'face':'hand';
    try {
      const files=await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',import.meta.url).href,true);
      detector=mode==='face'
        ? await FaceLandmarker.createFromOptions(files,{
          baseOptions:{modelAssetPath:new URL('./vendor/mediapipe/face_landmarker.task',import.meta.url).href,delegate:'CPU'},
          runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.65,minFacePresenceConfidence:.65,minTrackingConfidence:.65,
        })
        : await HandLandmarker.createFromOptions(files,{
          baseOptions:{modelAssetPath:new URL('./vendor/mediapipe/hand_landmarker.task',import.meta.url).href,delegate:'CPU'},
          runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.65,minHandPresenceConfidence:.65,minTrackingConfidence:.65,
        });
      self.postMessage({type:'ready',mode});
    } catch(error){self.postMessage({type:'error',message:error.message});}
  } else if(data.type==='frame') {
    try {
      const result=detector.detectForVideo(data.bitmap,data.time);
      if(mode==='face') self.postMessage({type:'face',landmarks:result.faceLandmarks?.[0]||[],time:data.time});
      else self.postMessage({type:'hands',hands:result.landmarks,time:data.time});
    } catch(error){self.postMessage({type:'error',message:error.message});}
    finally{data.bitmap.close();}
  }
};
