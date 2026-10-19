const cases=[];
function test(name,run){cases.push({name,run});}
const assert=require('node:assert/strict');
const G=require('../vision-core.js');
const S=require('../segmentation.js');
const target=require('../practice-target.json');
const cv=require('../vendor/opencv.js');
const ready=new Promise(resolve=>{if(cv.Mat)resolve();else{const previous=cv.onRuntimeInitialized;cv.onRuntimeInitialized=()=>{if(previous)previous();resolve();};}});
const project=G.homography([[0,0],[1200,0],[1200,1000],[0,1000]],[[80,40],[1140,100],[1190,920],[60,980]]);
function calibration(){return{corners:[[250,200],[850,200],[850,700],[250,700]].map(p=>G.project(p,project).map((v,i)=>v/[1200,1000][i])),width_mm:150,height_mm:125,image_size:[1200,1000],source_size:[1200,1000],thickness_mm:3.175};}
function options(overrides={}){return{mode:'fixed',target,calibration:calibration(),source_size:[1200,1000],setup_unchanged:true,thickness_mm:3.175,...overrides};}
function outline(caseName='nominal'){
  let points=target.points.map(p=>p.slice());
  if(caseName==='notch'){points=points.map(([x,y],i)=>i>=1&&i<=49?[68+(x-68)*.5,y*.5]:[x,y]);}
  if(caseName==='undersized')points=points.map(p=>p.map(v=>v*.85));
  const angle=.2,c=Math.cos(angle),s=Math.sin(angle);
  return points.map(([x,y])=>[280+4*((x-76.2)*c-(y-76.2)*s+76.2),180+4*((x-76.2)*s+(y-76.2)*c+76.2)]).map(p=>G.project(p,project));
}
async function pixels(polygons,holes=[]){
  await ready;
  const image=new cv.Mat(1000,1200,cv.CV_8UC4,new cv.Scalar(25,25,25,255));
  try{
    for(const [points,color] of [...polygons.map(p=>[p,new cv.Scalar(220,200,170,255)]),...holes.map(p=>[p,new cv.Scalar(25,25,25,255)])]){
      const contour=cv.matFromArray(points.length,1,cv.CV_32SC2,points.flat().map(Math.round)),vector=new cv.MatVector();
      try{vector.push_back(contour);cv.fillPoly(image,vector,color);}finally{vector.delete();contour.delete();}
    }
    return{width:1200,height:1000,data:image.data.slice()};
  }finally{image.delete();}
}
async function inspect(caseName,overrides={}){const image=await pixels([outline(caseName)]),settings=options(overrides),part=S.findPart(cv,image,settings);return G.compare(part.points,[1200,1000],settings,part.quality);}

test('nominal photo: calibrated perspective, millimeter spans, no automatic grade',async()=>{
  const result=await inspect('nominal');
  assert.equal(result.status,'review_required');assert.equal(result.automatic_grading,false);assert.equal(result.size_inspected,true);
  assert.ok(Math.abs(result.measurement.width_mm-152.4)<1);assert.ok(result.comparison.edge_p95<.8);assert.equal(result.comparison.alignment,'translation + rotation');
});
test('radius vs diameter error is local, rather than hidden by alignment',async()=>{
  const result=await inspect('notch',{tolerance_mm:1});
  assert.ok(result.comparison.edge_max>4);assert.ok(result.comparison.edge_p95<1.5);assert.ok(result.comparison.boundary_fraction_over_tolerance>0);
});
test('metric mode keeps a uniformly undersized part undersized',async()=>{
  const result=await inspect('undersized');assert.ok(result.comparison.edge_p95>8);assert.ok(result.measurement.width_mm<140);
});
test('handheld comparison returns no dimensional measurements',async()=>{
  const result=await inspect('undersized',{mode:'handheld'});assert.equal(result.measurement,null);assert.equal(result.size_inspected,false);assert.ok(result.warnings.some(v=>v.includes('Absolute size is not inspected')));assert.ok(result.warnings.some(v=>v.includes('Camera tilt is not corrected')));
});
test('uniform scale is removed only for an explicitly normalized comparison',()=>{
  const a=G.sample(target.points),b=a.map(([x,y])=>[x*.7+10,y*.7-20]);
  const metric=G.align(a,b),shape=G.align(G.normalize(a).points,G.normalize(b).points);
  assert.ok(Math.max(...metric.forward)>10);assert.ok(Math.max(...shape.forward)<1e-8);
});
test('thickness, photo dimensions, setup confirmation, and metric units are checked',()=>{
  const points=outline();
  assert.throws(()=>G.compare(points,[1200,1000],options({thickness_mm:6.35})),/Thickness differs/);
  assert.throws(()=>G.compare(points,[1200,1000],options({source_size:[4000,3000]})),/Photo dimensions changed/);
  assert.throws(()=>G.compare(points,[1200,1000],options({setup_unchanged:false})),/Confirm that/);
  assert.throws(()=>G.compare(points,[1200,1000],options({target:{...target,units:'normalized'}})),/reference in millimeters/);
});
test('bad, reversed, crossing, and tiny calibration selections are rejected',()=>{
  const cal=calibration();
  assert.throws(()=>G.calibrate({...cal,corners:[cal.corners[0],cal.corners[2],cal.corners[1],cal.corners[3]]}),/corners in order/);
  assert.throws(()=>G.calibrate({...cal,corners:[...cal.corners].reverse()}),/corners in order/);
  assert.throws(()=>G.calibrate({...cal,corners:[[.4,.4],[.401,.4],[.401,.401],[.4,.401]]}),/too small/);
  assert.throws(()=>G.calibrate({...cal,width_mm:NaN}),/Rectangle width/);
});
test('multiple objects need a selection; selected part cannot touch image edge',async()=>{
  const left=[[70,100],[390,100],[390,500],[70,500]],right=[[600,100],[900,100],[900,500],[600,500]],image=await pixels([left,right]);
  assert.throws(()=>S.findPart(cv,image),/Several bright objects/);
  assert.ok(S.findPart(cv,image,{seed:[.2,.3]}).points.length>3);
  const clipped=await pixels([[[0,100],[390,100],[390,500],[0,500]]]);assert.throws(()=>S.findPart(cv,clipped),/reaches the photo edge/);
});
test('interior openings remain explicitly uninspected',async()=>{
  const image=await pixels([[[100,100],[800,100],[800,700],[100,700]]],[[[300,250],[400,250],[400,350],[300,350]]]);
  const part=S.findPart(cv,image);assert.equal(part.quality.interior_openings_uninspected,1);assert.ok(part.quality.warnings.some(v=>v.includes('outside boundary only')));
});
test('calibration round trip and outer spans are rotation independent',()=>{
  const mapping=G.calibrate(calibration()),point=[523,412],back=G.project(G.project(point,mapping.matrix),mapping.inverse);assert.ok(Math.hypot(back[0]-point[0],back[1]-point[1])<1e-7);
  const angle=.8,c=Math.cos(angle),s=Math.sin(angle),rect=[[0,0],[120,0],[120,75],[0,75]].map(([x,y])=>[x*c-y*s+5,x*s+y*c+15]);
  const spans=G.outerSpans(rect);assert.ok(Math.abs(spans[0]-120)<1e-8);assert.ok(Math.abs(spans[1]-75)<1e-8);
});
test('invalid reference coordinates cannot produce a result',()=>{
  assert.throws(()=>G.validateTarget({...target,points:[[0,0],[1,NaN],[1,1]]}),/finite/);
  assert.throws(()=>G.validateTarget({units:'mm',points:[[0,0],[1,1],[2,2]]}),/enclose an area/);
});
test('fixed reference cutoff distinguishes an empty surface from an uncertain tiny object',async()=>{
  const blank=await pixels([]);
  assert.throws(()=>S.findPart(cv,blank,{threshold:100}),error=>error.code==='NO_PART');
  const tiny=await pixels([[[400,400],[480,400],[480,480],[400,480]]]);
  assert.throws(()=>S.findPart(cv,tiny,{threshold:100}),error=>error.code==='UNCERTAIN_OUTLINE');
});

(async()=>{await ready;let passed=0;for(const item of cases){await item.run();passed++;console.log(`PASS ${item.name}`);}console.log(`${passed} browser-engine checks passed.`);})().catch(error=>{console.error(error);process.exitCode=1;});
