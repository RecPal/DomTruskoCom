/* Stable-reading gate and CSV export. A capture is never an automatic grade. */
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.PlywoodBatch=api;})(typeof self!=="undefined"?self:globalThis,function(){
  "use strict";
  const median=values=>{const a=[...values].sort((x,y)=>x-y),i=a.length>>1;return a.length%2?a[i]:(a[i-1]+a[i])/2;};
  const spread=values=>Math.max(...values)-Math.min(...values);
  const round=(v,p=3)=>Number(v.toFixed(p));
  function isReading(result){return result?.mode==="fixed"&&result.size_inspected===true&&!result.synthetic&&result.measurement&&[result.measurement.width_mm,result.measurement.height_mm,result.measurement.area_mm2,result.comparison.edge_p95,result.comparison.edge_max].every(Number.isFinite);}
  class Recorder{
    constructor({samples=3,spreadMm=.5,emptyFrames=3,minDwellMs=1200}={}){if(!Number.isInteger(samples)||samples<3||samples>10||!Number.isFinite(spreadMm)||spreadMm<.05||spreadMm>5)throw new Error("Use 3–10 stable readings and a spread of 0.05–5 mm.");this.samples=samples;this.spreadMm=spreadMm;this.emptyFrames=emptyFrames;this.minDwellMs=minDwellMs;this.phase="waiting_clear";this.window=[];this.emptyCount=0;}
    resetGate(){this.phase="waiting_clear";this.window=[];this.emptyCount=0;}
    observe(observation,now){
      if(observation.kind==="empty"){
        this.window=[];this.emptyCount++;
        if(this.emptyCount>=this.emptyFrames){this.phase="ready";return{state:"ready",message:"Ready · place the next part."};}
        return{state:this.phase,message:`Checking for an empty surface · ${this.emptyCount}/${this.emptyFrames}.`};
      }
      this.emptyCount=0;
      if(this.phase==="waiting_clear")return{state:"waiting_clear",message:"Remove the part and your hands before placing the next one."};
      const result=observation.result;
      if(observation.kind!=="reading"||!isReading(result)||!Number.isFinite(result.quality?.sharpness_indicator)||result.quality.sharpness_indicator<65){this.window=[];return{state:"ready",message:observation.message||"Waiting for a clear, sharp outline. Keep your hands out of view."};}
      this.window.push({result,now});if(this.window.length>this.samples)this.window.shift();
      if(this.window.length<this.samples)return{state:"settling",message:`Hold still · ${this.window.length}/${this.samples} readings.`};
      const readings=this.window.map(v=>v.result),measure=key=>readings.map(v=>v.measurement[key]);
      const stable=spread(measure("width_mm"))<=this.spreadMm&&spread(measure("height_mm"))<=this.spreadMm&&spread(measure("area_mm2"))/Math.max(1,median(measure("area_mm2")))<=.01&&spread(readings.map(v=>v.comparison.edge_p95))<=this.spreadMm&&spread(readings.map(v=>v.comparison.edge_max))<=this.spreadMm;
      if(!stable)return{state:"settling",message:"Reading is changing. Leave the part still and check lighting."};
      if(now-this.window[0].now<this.minDwellMs)return{state:"settling",message:"Reading looks steady · checking once more."};
      const captured={...result,measurement:{...result.measurement,width_mm:round(median(measure("width_mm"))),height_mm:round(median(measure("height_mm"))),area_mm2:round(median(measure("area_mm2")))},comparison:{...result.comparison,edge_p95:round(median(readings.map(v=>v.comparison.edge_p95))),edge_max:round(median(readings.map(v=>v.comparison.edge_max)))}};
      this.resetGate();return{state:"captured",message:"Captured · remove this part before placing the next one.",result:captured,samples:this.samples};
    }
  }
  function row(result,{sessionId,sessionName,prefix="Part",index,method="stable_live",samples=1,time=new Date().toISOString()}={}){
    if(!isReading(result))throw new Error("Log a real, calibrated result. Synthetic and handheld results cannot enter the grading log.");
    const m=result.measurement,c=result.comparison;
    if(![m.reference_width_mm,m.reference_height_mm,m.reference_area_mm2].every(v=>Number.isFinite(v)&&v>0))throw new Error("Reference dimensions are missing. Capture a measured reference first.");
    return{session_id:sessionId,session_name:sessionName,part_id:`${prefix} ${String(index).padStart(3,"0")}`,captured_at_utc:time,reference_name:result.target_name,reference_source:result.target_source,thickness_mm:result.thickness_mm,reference_long_span_mm:m.reference_width_mm,reference_short_span_mm:m.reference_height_mm,reference_area_mm2:m.reference_area_mm2,long_span_mm:m.width_mm,short_span_mm:m.height_mm,area_mm2:m.area_mm2,delta_long_mm:round(m.width_mm-m.reference_width_mm),delta_short_mm:round(m.height_mm-m.reference_height_mm),delta_area_mm2:round(m.area_mm2-m.reference_area_mm2),delta_long_percent:round((m.width_mm/m.reference_width_mm-1)*100),delta_short_percent:round((m.height_mm/m.reference_height_mm-1)*100),edge_p95_mm:c.edge_p95,edge_max_mm:c.edge_max,edge_tolerance_mm:c.tolerance_mm??"",boundary_fraction_over_tolerance:c.boundary_fraction_over_tolerance??"",reading_method:method,stable_samples:samples,status:"review_required",automatic_grade:false,sharpness_indicator:result.quality?.sharpness_indicator??"",notes:result.warnings.join(" | "),uninspected:result.uninspected.join("; ")};
  }
  const columns=["session_id","session_name","part_id","captured_at_utc","reference_name","reference_source","thickness_mm","reference_long_span_mm","reference_short_span_mm","reference_area_mm2","long_span_mm","short_span_mm","area_mm2","delta_long_mm","delta_short_mm","delta_area_mm2","delta_long_percent","delta_short_percent","edge_p95_mm","edge_max_mm","edge_tolerance_mm","boundary_fraction_over_tolerance","reading_method","stable_samples","status","automatic_grade","sharpness_indicator","notes","uninspected"];
  function cell(value){if(typeof value==="number")return Number.isFinite(value)?String(value):"";let text=String(value??"");if(/^[\s]*[=+\-@]/.test(text)||/^[\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
  function csv(rows){return "\uFEFF"+[columns.join(","),...rows.map(r=>columns.map(key=>cell(r[key])).join(","))].join("\r\n")+"\r\n";}
  return{Recorder,isReading,row,csv,columns};
});
