import {FilesetResolver,HandLandmarker} from './vendor/mediapipe/vision_bundle.mjs';
let detector;
self.onmessage=async ({data})=>{
  if(data.type==='init') {
    try {
      const files=await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',import.meta.url).href,true);
      detector=await HandLandmarker.createFromOptions(files,{
        baseOptions:{modelAssetPath:new URL('./vendor/mediapipe/hand_landmarker.task',import.meta.url).href,delegate:'CPU'},
        runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.65,minHandPresenceConfidence:.65,minTrackingConfidence:.65,
      });
      self.postMessage({type:'ready'});
    } catch(error){self.postMessage({type:'error',message:error.message});}
  } else if(data.type==='frame') {
    try {
      const result=detector.detectForVideo(data.bitmap,data.time);
      self.postMessage({type:'hands',hands:result.landmarks,time:data.time});
    } catch(error){self.postMessage({type:'error',message:error.message});}
    finally{data.bitmap.close();}
  }
};
