/* Geometry shared by the browser worker and the Node verification suite.
 * Fixed mode never fits scale; handheld mode explicitly normalizes it.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PlywoodGeometry = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";
  const fail = text => { throw new Error(text); };
  const round = (v, places = 3) => Number(v.toFixed(places));
  const dist2 = (a,b) => (a[0]-b[0])**2+(a[1]-b[1])**2;
  const area = points => points.reduce((sum,p,i) => {const q=points[(i+1)%points.length];return sum+p[0]*q[1]-p[1]*q[0];},0)/2;
  const number = (value,label,low,high) => {
    if(value===null || value==="" || typeof value==="boolean") fail(`${label} must be a number.`);
    const n=Number(value);if(!Number.isFinite(n)||n<low||n>high)fail(`${label} must be between ${low} and ${high}.`);return n;
  };
  function validateTarget(target) {
    if(!target||!["mm","normalized"].includes(target.units))fail('Reference must declare units as "mm" or "normalized".');
    let points=target.points;
    if(!Array.isArray(points)||points.length<3||points.length>5000||points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=="number"||!Number.isFinite(v)||Math.abs(v)>100000)))fail("Reference needs 3–5,000 finite [x, y] points.");
    points=points.map(p=>p.slice());
    if(dist2(points[0],points[points.length-1])<1e-18)points.pop();
    if(points.length<3||Math.abs(area(points))<1e-7)fail("The reference outline must enclose an area.");
    if(points.some((p,i)=>dist2(p,points[(i+1)%points.length])<1e-18))fail("Reference contains repeated consecutive points.");
    return points;
  }
  function solve(matrix, rhs) {
    const a=matrix.map((row,i)=>[...row,rhs[i]]), n=rhs.length;
    for(let column=0;column<n;column++) {
      let pivot=column;for(let row=column+1;row<n;row++)if(Math.abs(a[row][column])>Math.abs(a[pivot][column]))pivot=row;
      if(Math.abs(a[pivot][column])<1e-12)fail("Those corners do not define a usable calibration.");
      [a[column],a[pivot]]=[a[pivot],a[column]];
      const divisor=a[column][column];for(let j=column;j<=n;j++)a[column][j]/=divisor;
      for(let row=0;row<n;row++){if(row===column)continue;const factor=a[row][column];for(let j=column;j<=n;j++)a[row][j]-=factor*a[column][j];}
    }
    return a.map(row=>row[n]);
  }
  function homography(from,to) {
    const matrix=[],rhs=[];
    from.forEach(([x,y],i)=>{const [u,v]=to[i];matrix.push([x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]);rhs.push(u,v);});
    return [...solve(matrix,rhs),1];
  }
  function project(point,h) {
    const [x,y]=point,d=h[6]*x+h[7]*y+h[8];
    if(Math.abs(d)<1e-9)fail("The part is outside the usable calibration plane.");
    return[(h[0]*x+h[1]*y+h[2])/d,(h[3]*x+h[4]*y+h[5])/d];
  }
  function calibrate(value) {
    if(!value||typeof value!=="object")fail("Calibrate your fixed camera first.");
    const width=number(value.width_mm,"Rectangle width",10,1500),height=number(value.height_mm,"Rectangle height",10,1500),thickness=number(value.thickness_mm,"Calibration thickness",.1,100);
    const corners=value.corners,size=value.image_size,source=value.source_size;
    if(!Array.isArray(corners)||corners.length!==4||corners.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1))||!Array.isArray(size)||size.length!==2||size.some(v=>!Number.isInteger(v)||v<200||v>1800)||!Array.isArray(source)||source.length!==2||source.some(v=>!Number.isInteger(v)||v<200||v>30000))fail("Calibration corners or photo dimensions are invalid.");
    const pixels=corners.map(([x,y])=>[x*size[0],y*size[1]]);
    const crosses=pixels.map((p,i)=>{const q=pixels[(i+1)%4],r=pixels[(i+2)%4];return(q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0]);});
    if(crosses.some(v=>v<=0))fail("Tap the corners in order: top left, top right, bottom right, bottom left.");
    if(area(pixels)/(size[0]*size[1])<.035)fail("The calibration rectangle is too small in the photo. Use a larger rectangle.");
    const edges=pixels.map((p,i)=>Math.sqrt(dist2(p,pixels[(i+1)%4])));
    if(Math.min(...edges)<60||Math.max(...edges)/Math.min(...edges)>12)fail("Calibration is too compressed. Move closer to an overhead view.");
    const world=[[0,0],[width,0],[width,height],[0,height]];
    return {calibration:{version:1,corners:corners.map(p=>p.slice()),width_mm:width,height_mm:height,thickness_mm:thickness,image_size:[...size],source_size:[...source]},matrix:homography(pixels,world),inverse:homography(world,pixels)};
  }
  function sample(points,count=480) {
    const lengths=points.map((p,i)=>Math.sqrt(dist2(p,points[(i+1)%points.length]))),total=lengths.reduce((a,b)=>a+b,0);
    if(points.length<3||total<1e-6)fail("Outline is too small or incomplete.");
    let edge=0,start=0;const result=[];
    for(let i=0;i<count;i++){const position=i*total/count;while(edge<lengths.length-1&&(position>=start+lengths[edge]||lengths[edge]<1e-12)){start+=lengths[edge++];}const mix=(position-start)/Math.max(lengths[edge],1e-12),a=points[edge],b=points[(edge+1)%points.length];result.push([a[0]+mix*(b[0]-a[0]),a[1]+mix*(b[1]-a[1])]);}
    return result;
  }
  function normalize(points) {
    const center=points.reduce((s,p)=>[s[0]+p[0]/points.length,s[1]+p[1]/points.length],[0,0]);
    const radius=Math.sqrt(points.reduce((s,p)=>s+dist2(p,center)/points.length,0));
    if(radius<1e-10)fail("Outline is too small.");
    return{points:points.map(p=>[(p[0]-center[0])/radius,(p[1]-center[1])/radius]),center,radius};
  }
  function tree(points,indices=points.map((_,i)=>i),depth=0) {
    if(!indices.length)return null;const axis=depth%2;indices.sort((a,b)=>points[a][axis]-points[b][axis]);const middle=indices.length>>1;
    return{index:indices[middle],axis,left:tree(points,indices.slice(0,middle),depth+1),right:tree(points,indices.slice(middle+1),depth+1)};
  }
  function nearest(query,points,node,best={index:0,distance:Infinity}) {
    if(!node)return best;const p=points[node.index],distance=dist2(query,p);
    if(distance<best.distance){best.distance=distance;best.index=node.index;}
    const delta=query[node.axis]-p[node.axis],first=delta<0?node.left:node.right,second=delta<0?node.right:node.left;
    nearest(query,points,first,best);if(delta*delta<best.distance)nearest(query,points,second,best);return best;
  }
  const move=(p,t)=>[t.c*p[0]-t.s*p[1]+t.x,t.s*p[0]+t.c*p[1]+t.y];
  const unmove=(p,t)=>[(p[0]-t.x)*t.c+(p[1]-t.y)*t.s,-(p[0]-t.x)*t.s+(p[1]-t.y)*t.c];
  function fit(from,to) {
    let sx=0,sy=0,dx=0,dy=0;const n=from.length;
    for(let i=0;i<n;i++){sx+=from[i][0];sy+=from[i][1];dx+=to[i][0];dy+=to[i][1];}sx/=n;sy/=n;dx/=n;dy/=n;
    let dot=0,cross=0;for(let i=0;i<n;i++){const x=from[i][0]-sx,y=from[i][1]-sy,u=to[i][0]-dx,v=to[i][1]-dy;dot+=x*u+y*v;cross+=x*v-y*u;}
    const angle=Math.atan2(cross,dot),c=Math.cos(angle),s=Math.sin(angle);return{c,s,x:dx-c*sx+s*sy,y:dy-s*sx-c*sy};
  }
  function boundaryDistances(query,outline) {
    const segments=outline.map((p,i)=>{const q=outline[(i+1)%outline.length],x=q[0]-p[0],y=q[1]-p[1];return{x:p[0],y:p[1],dx:x,dy:y,squared:Math.max(x*x+y*y,1e-15)};});
    return query.map(p=>{let best=Infinity;for(const e of segments){const t=Math.min(1,Math.max(0,((p[0]-e.x)*e.dx+(p[1]-e.y)*e.dy)/e.squared)),x=p[0]-e.x-t*e.dx,y=p[1]-e.y-t*e.dy;const d=x*x+y*y;if(d<best)best=d;}return Math.sqrt(best);});
  }
  function align(target,observed) {
    const targetTree=tree(target),observedTree=tree(observed),tc=normalize(target).center,oc=normalize(observed).center;
    let bestScore=Infinity,best;
    for(let seed=0;seed<24;seed++){
      const angle=seed*2*Math.PI/24,c=Math.cos(angle),s=Math.sin(angle);let transform={c,s,x:oc[0]-c*tc[0]+s*tc[1],y:oc[1]-s*tc[0]-c*tc[1]};
      for(let iteration=0;iteration<35;iteration++){
        const from=target.slice(),to=target.map(p=>observed[nearest(move(p,transform),observed,observedTree).index]);
        for(const p of observed){from.push(target[nearest(unmove(p,transform),target,targetTree).index]);to.push(p);}
        const next=fit(from,to),delta=Math.max(Math.abs(next.c-transform.c),Math.abs(next.s-transform.s),Math.abs(next.x-transform.x),Math.abs(next.y-transform.y));transform=next;if(delta<1e-7)break;
      }
      const moved=target.map(p=>move(p,transform));
      const forward=boundaryDistances(moved,observed),reverse=boundaryDistances(observed,moved),score=[...forward,...reverse].reduce((sum,v)=>sum+v*v,0);
      if(score<bestScore){bestScore=score;best={moved,transform,forward,reverse};}
    }
    return best;
  }
  function outerSpans(points) {
    const sorted=points.map(p=>p.slice()).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const lower=[],upper=[];for(const p of sorted){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}for(const p of sorted.slice().reverse()){while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}const hull=[...lower.slice(0,-1),...upper.slice(0,-1)];
    let best=Infinity,result=[0,0];
    for(let i=0;i<hull.length;i++){const p=hull[i],q=hull[(i+1)%hull.length],length=Math.sqrt(dist2(p,q));if(length<1e-10)continue;const c=(q[0]-p[0])/length,s=(q[1]-p[1])/length;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const r of hull){const x=r[0]*c+r[1]*s,y=-r[0]*s+r[1]*c;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}const w=maxX-minX,h=maxY-minY;if(w*h<best){best=w*h;result=[w,h].sort((a,b)=>b-a);}}
    return result;
  }
  function percentile(values,fraction) {const sorted=[...values].sort((a,b)=>a-b),position=(sorted.length-1)*fraction,low=Math.floor(position);return sorted[low]+(sorted[Math.min(low+1,sorted.length-1)]-sorted[low])*(position-low);}
  function compare(pixelContour,imageSize,options,quality={}) {
    const targetInfo=options.target,targetRaw=validateTarget(targetInfo),mode=options.mode||"handheld",thickness=number(options.thickness_mm??3.175,"Plywood thickness",.1,100),warnings=[...(quality.warnings||[])];
    const [width,height]=imageSize;let observedRaw=pixelContour,observed,target,mapping=null,normalization=null,divisor=1,units="mm";
    if(mode==="fixed"){
      mapping=calibrate(options.calibration);const cal=mapping.calibration;
      if(options.setup_unchanged!==true)fail("Confirm that the camera, lens/zoom, work plane, and mount are unchanged before using calibration.");
      if(cal.image_size[0]!==width||cal.image_size[1]!==height||JSON.stringify(cal.source_size)!==JSON.stringify(options.source_size))fail("Photo dimensions changed since calibration. Use the same camera settings and recalibrate.");
      if(Math.abs(cal.thickness_mm-thickness)>.01)fail("Thickness differs from calibration. Recalibrate at this part’s top-face height.");
      if(targetInfo.units!=="mm")fail("Fixed-camera comparison needs a reference in millimeters. Capture a calibrated reference or import a metric outline.");
      observedRaw=pixelContour.map(p=>project(p,mapping.matrix));
      if(observedRaw.some(p=>p.some(v=>!Number.isFinite(v)||Math.abs(v)>20000)))fail("The part is outside the usable calibration plane. Recalibrate near the inspection area.");
      observed=sample(observedRaw);target=sample(targetRaw);
      warnings.push("Dimensions are estimates: lens distortion, corner selection, shadows, and edge roughness are not yet calibrated or validated.","Best-fit alignment uses translation and rotation only. Feature datums and grading rules are not implemented.");
    }else if(mode==="handheld"){
      normalization=normalize(sample(pixelContour));observed=normalization.points;target=normalize(sample(targetRaw)).points;
      divisor=(Math.max(...target.map(p=>p[0]))-Math.min(...target.map(p=>p[0])))/100;units="% of reference width";
      warnings.push("Absolute size is not inspected. Uniformly smaller or larger parts can match after size normalization.","Camera tilt is not corrected. Hold the phone roughly parallel to the top face; oblique views can mimic shape defects.");
    }else fail("Choose fixed-camera or handheld mode.");
    const aligned=align(target,observed),distances=[...aligned.forward,...aligned.reverse].map(v=>v/divisor);
    const tolerance=mode==="fixed"&&options.tolerance_mm!==null&&options.tolerance_mm!==undefined&&options.tolerance_mm!==""?number(options.tolerance_mm,"Edge tolerance",.05,50):null;
    let actualPixels,expectedPixels,measurement=null,reference;
    if(mapping){
      actualPixels=observed.map(p=>project(p,mapping.inverse));expectedPixels=aligned.moved.map(p=>project(p,mapping.inverse));
      const spans=outerSpans(observedRaw),referenceSpans=outerSpans(targetRaw);
      measurement={width_mm:round(spans[0],2),height_mm:round(spans[1],2),area_mm2:round(Math.abs(area(observedRaw)),1),reference_width_mm:round(referenceSpans[0],2),reference_height_mm:round(referenceSpans[1],2),reference_area_mm2:round(Math.abs(area(targetRaw)),1),dimensions_basis:"minimum-area outer rectangle: long span, short span"};
      reference={version:1,name:"Photo reference · verify manually",units:"mm",source:"unvalidated-calibrated-photo",points:sample(observedRaw)};
    }else{
      const back=p=>[p[0]*normalization.radius+normalization.center[0],p[1]*normalization.radius+normalization.center[1]];
      actualPixels=observed.map(back);expectedPixels=aligned.moved.map(back);
      reference={version:1,name:"Photo reference · proportions only",units:"normalized",source:"unvalidated-handheld-photo",points:observed};
    }
    const {warnings:discard,...indicators}=quality;
    return{version:1,engine:"browser-opencv-4.13.0",status:"review_required",automatic_grading:false,mode,thickness_mm:thickness,units,target_name:String(targetInfo.name||"Imported reference").slice(0,120),target_source:String(targetInfo.source||"imported-outline").slice(0,120),size_inspected:mode==="fixed",measurement,comparison:{edge_p95:round(percentile(distances,.95)),edge_max:round(Math.max(...distances)),tolerance_mm:tolerance,boundary_fraction_over_tolerance:tolerance===null?null:round(distances.filter(v=>v>tolerance).length/distances.length),alignment:mode==="fixed"?"translation + rotation":"size normalization + translation + rotation"},overlay:{actual:actualPixels.map(([x,y])=>[x/width,y/height]),expected:expectedPixels.map(([x,y])=>[x/width,y/height]),edge_distances:aligned.reverse.map(v=>v/divisor)},quality:indicators,warnings,uninspected:["thickness","underside","bevels","edge squareness","interior openings","feature-specific dimensions"],reference_outline:reference};
  }
  return{number,area,validateTarget,homography,project,calibrate,sample,normalize,align,boundaryDistances,outerSpans,compare};
});
