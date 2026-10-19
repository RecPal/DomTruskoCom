/* OpenCV photo segmentation, usable in a worker without DOM or camera APIs. */
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.PlywoodSegmentation=api;})(typeof self!=="undefined"?self:globalThis,function(){
  "use strict";
  function contains(points,x,y){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
  function findPart(cv,pixels,options={}){
    const {width,height}=pixels;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<200||height<200||width>1800||height>1800||pixels.data.length!==width*height*4)throw new Error("Use a photo between 200 and 1,800 pixels per side after resizing.");
    const src=cv.matFromImageData(pixels),gray=new cv.Mat(),smooth=new cv.Mat(),mask=new cv.Mat(),contours=new cv.MatVector(),hierarchy=new cv.Mat();
    try{
      cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,smooth,new cv.Size(5,5),0,0,cv.BORDER_DEFAULT);
      let threshold=options.threshold;
      if(threshold===null||threshold===undefined)threshold=cv.threshold(smooth,mask,0,255,cv.THRESH_BINARY+cv.THRESH_OTSU);
      else{threshold=Number(threshold);if(!Number.isFinite(threshold)||threshold<1||threshold>254)throw new Error("Edge threshold must be between 1 and 254.");cv.threshold(smooth,mask,threshold,255,cv.THRESH_BINARY);}
      cv.findContours(mask,contours,hierarchy,cv.RETR_CCOMP,cv.CHAIN_APPROX_NONE);
      const minimum=width*height*.008,candidates=[];
      for(let i=0;i<contours.size();i++){
        if(hierarchy.data32S[i*4+3]!==-1)continue;
        const contour=contours.get(i);
        try{const area=cv.contourArea(contour);if(area<=minimum)continue;const points=[];for(let j=0;j<contour.data32S.length;j+=2)points.push([contour.data32S[j],contour.data32S[j+1]]);candidates.push({index:i,area,points,rect:cv.boundingRect(contour)});}finally{contour.delete();}
      }
      candidates.sort((a,b)=>b.area-a.area);
      let eligible=candidates;
      if(options.seed!==null&&options.seed!==undefined){const p=options.seed;if(!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1))throw new Error("Tap inside the part to select it.");eligible=candidates.filter(c=>contains(c.points,p[0]*width,p[1]*height));}
      if(!eligible.length){const error=new Error("No complete bright part found. Use a dark matte background, improve the light, or tap inside the part.");error.code=cv.countNonZero(mask)/(width*height)<.003?"NO_PART":"UNCERTAIN_OUTLINE";throw error;}
      if(eligible.length>1&&!options.seed&&eligible[1].area>minimum*2)throw new Error("Several bright objects were found. Tap inside the plywood to select it.");
      const part=eligible[0],rect=part.rect;
      if(rect.x<5||rect.y<5||rect.x+rect.width>width-5||rect.y+rect.height>height-5)throw new Error("The selected outline reaches the photo edge. Keep the whole part in view with a dark border around it.");
      if(part.area>width*height*.85)throw new Error("The background is being selected. Use light plywood on a dark matte surface.");
      const warnings=[];
      if(Math.min(rect.width,rect.height)<250)warnings.push("The part occupies few pixels. Move closer while keeping the full outline visible.");
      let count=0,sum=0,sumSquared=0;const g=gray.data;
      for(let y=1;y<height-1;y+=2)for(let x=1;x<width-1;x+=2){const i=y*width+x,v=g[i-width]+g[i+width]+g[i-1]+g[i+1]-4*g[i];count++;sum+=v;sumSquared+=v*v;}
      const sharpness=Math.max(0,sumSquared/count-(sum/count)**2);
      if(sharpness<65)warnings.push("This photo may be soft. Retake with better lighting and a steady phone.");
      let child=hierarchy.data32S[part.index*4+2],holes=0;
      while(child!==-1){const opening=contours.get(child);try{if(cv.contourArea(opening)>20)holes++;}finally{opening.delete();}child=hierarchy.data32S[child*4];}
      if(holes)warnings.push(`Detected ${holes} interior opening(s). This prototype compares the outside boundary only.`);
      return{points:part.points,quality:{threshold:Number(threshold.toFixed(1)),sharpness_indicator:Number(sharpness.toFixed(1)),part_pixels:[rect.width,rect.height],interior_openings_uninspected:holes,warnings}};
    }finally{src.delete();gray.delete();smooth.delete();mask.delete();contours.delete();hierarchy.delete();}
  }
  return{findPart};
});
