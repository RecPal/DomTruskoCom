"use strict";
// The pinned OpenCV bundle includes its WebAssembly; no CDN or server API is used.
importScripts("./vision-core.js","./segmentation.js","./vendor/opencv.js");
const runtime=new Promise((resolve,reject)=>{
  const library=self.cv;
  const ready=()=>resolve({cv:library}); // Legacy cv is self-thenable: wrap it.
  if(library.Mat)ready();
  else{
    const previous=library.onRuntimeInitialized;
    library.onRuntimeInitialized=()=>{if(previous)previous();ready();};
    library.onAbort=()=>reject(new Error("The image engine could not start. Reload the page and try again."));
  }
});
self.onmessage=async event=>{
  const {id,action,payload}=event.data;
  try{
    if(action==="calibrate")return self.postMessage({id,value:{calibration:self.PlywoodGeometry.calibrate(payload).calibration}});
    if(action!=="inspect")throw new Error("Unknown inspection action.");
    const {cv}=await runtime;
    const {width,height,buffer,options}=payload,pixels={width,height,data:new Uint8ClampedArray(buffer)};
    const part=self.PlywoodSegmentation.findPart(cv,pixels,options);
    const result=self.PlywoodGeometry.compare(part.points,[width,height],options,part.quality);
    self.postMessage({id,value:{result}});
  }catch(error){self.postMessage({id,error:error.message||"The photo could not be analyzed. Please try another photo.",code:error.code||"INSPECTION_ERROR"});}
};
