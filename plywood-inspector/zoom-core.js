/* Camera zoom capability handling and calibration-safe crop geometry. */
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.PlywoodZoom=api;})(typeof self!=="undefined"?self:globalThis,function(){
  "use strict";
  const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Math.max(1e-4,Math.abs(a)*1e-5);
  function descriptor(track,width,height,preferredMode){
    let capabilities={},settings={};try{capabilities=track.getCapabilities?.()||{};}catch{}try{settings=track.getSettings?.()||{};}catch{}
    const zoom=capabilities.zoom;
    if(preferredMode!=="crop"&&zoom&&Number.isFinite(zoom.min)&&Number.isFinite(zoom.max)&&zoom.min>0&&zoom.max>zoom.min&&Number.isFinite(settings.zoom)&&typeof track.applyConstraints==="function")return{mode:"camera",min:zoom.min,max:zoom.max,step:Number.isFinite(zoom.step)&&zoom.step>0?zoom.step:.1,value:settings.zoom};
    return{mode:"crop",min:1,max:Math.max(1,Math.min(8,Math.floor(Math.min(width,height)/200*10)/10)),step:.1,value:1};
  }
  function valueWithin(value,range){const n=Number(value);if(!Number.isFinite(n)||n<range.min-1e-6||n>range.max+1e-6)throw new Error("Choose a zoom within the camera’s available range.");return n;}
  async function apply(track,range,value){
    const chosen=valueWithin(value,range);
    if(range.mode==="crop")return chosen;
    const constraints={...(track.getConstraints?.()||{})};
    const advanced=(constraints.advanced||[]).map(item=>{const copy={...item};delete copy.zoom;return copy;}).filter(item=>Object.keys(item).length);
    delete constraints.zoom;
    await track.applyConstraints({...constraints,advanced:[...advanced,{zoom:chosen}]});
    const actual=track.getSettings?.().zoom;
    if(!close(actual,chosen))throw new Error("The browser did not confirm the requested camera zoom. Unlock the setup and try another zoom or camera.");
    return actual;
  }
  function snapshot(track,range,width,height){
    const settings=track.getSettings?.()||{};
    const value=range.mode==="camera"?settings.zoom:range.value;
    valueWithin(value,range);
    return{version:1,mode:range.mode,value,device_id:settings.deviceId||null,frame_width:width,frame_height:height,camera_zoom:Number.isFinite(settings.zoom)?settings.zoom:null};
  }
  function assertSame(saved,current){
    if(!saved)throw new Error("Recalibrate the live feed to save its zoom setting before measuring.");
    if(saved.mode!==current.mode||!close(saved.value,current.value)||saved.frame_width!==current.frame_width||saved.frame_height!==current.frame_height||(saved.device_id&&current.device_id&&saved.device_id!==current.device_id)||(saved.camera_zoom!==null&&current.camera_zoom!==null&&!close(saved.camera_zoom,current.camera_zoom)))throw new Error("Camera or zoom changed. Unlock zoom, recalibrate, and capture a new reference before measuring.");
    return true;
  }
  function crop(width,height,value){
    if(!Number.isFinite(value)||value<1)throw new Error("Software zoom must be at least 1×.");
    const w=Math.floor(width/value),h=Math.floor(height/value);
    if(w<200||h<200)throw new Error("This software zoom leaves too few source pixels. Reduce zoom or use a closer camera/lens.");
    return{x:Math.floor((width-w)/2),y:Math.floor((height-h)/2),width:w,height:h};
  }
  return{descriptor,valueWithin,apply,snapshot,assertSame,crop};
});
