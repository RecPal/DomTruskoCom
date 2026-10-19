"use strict";

const $ = id => document.getElementById(id);
const readSaved = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const saveLocal = (key, value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing can disallow storage. */ } };
const state = { target: null, calibration: readSaved("plywood.pages.calibration.v1"), photo: null,
  result: null, seed: null, threshold: null, calibrationPhoto: null, corners: [], request: 0 };
const mode = () => document.querySelector('input[name="mode"]:checked').value;
const thickness = () => Number($("thickness").value === "custom" ? $("custom-thickness").value : $("thickness").value);
const message = (id, text = "") => { $(id).textContent = text; $(id).hidden = !text; };
const num = (v, places = 1) => Number(v).toLocaleString("en-US", { minimumFractionDigits: places, maximumFractionDigits: places, useGrouping: false });

let imageWorker = null, jobId = 0;
const jobs = new Map();
function workerCall(action, payload, transfer = []) {
  if (!imageWorker) {
    imageWorker = new Worker(new URL("./vision-worker.js", window.location.href));
    imageWorker.onmessage = ({data}) => {
      const job = jobs.get(data.id); if (!job) return;
      jobs.delete(data.id); clearTimeout(job.timeout);
      if(data.error){const error=new Error(data.error);error.code=data.code;job.reject(error);}else job.resolve(data.value);
    };
    imageWorker.onerror = event => {
      event.preventDefault();
      for (const job of jobs.values()) { clearTimeout(job.timeout); job.reject(new Error("The image engine could not load. Refresh the page after it finishes downloading, then try again.")); }
      jobs.clear(); imageWorker.terminate(); imageWorker = null;
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++jobId;
    const timeout = setTimeout(() => { jobs.delete(id); reject(new Error("Analysis took too long. Try a smaller photo or reload the page.")); }, 90000);
    jobs.set(id, {resolve, reject, timeout});
    imageWorker.postMessage({id, action, payload}, transfer);
  });
}
async function raster(source) {
  const image = new Image(); image.src = source; await image.decode();
  const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  canvas.getContext("2d").drawImage(image,0,0);
  return {width:canvas.width,height:canvas.height,buffer:canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data.buffer};
}
async function api(action, body) {
  if (action === "calibrate") return workerCall("calibrate", body);
  if (action === "inspect") {
    const {image,...options}=body, pixels=await raster(image);
    return workerCall("inspect",{...pixels,options},[pixels.buffer]);
  }
  if (action === "demo") {
    if (!["nominal","notch","undersized"].includes(body.case)) throw new Error("Unknown practice example.");
    const source=new URL(`./examples/${body.case}.jpg`,window.location.href).href;
    const [calibration,target,pixels]=await Promise.all([
      fetch("./examples/calibration.json").then(r=>{if(!r.ok)throw new Error("Practice setup could not load.");return r.json();}),
      fetch("./practice-target.json").then(r=>{if(!r.ok)throw new Error("Practice reference could not load.");return r.json();}),raster(source)]);
    const data=await workerCall("inspect",{...pixels,options:{mode:body.mode,thickness_mm:3.175,source_size:[pixels.width,pixels.height],setup_unchanged:true,calibration,target,tolerance_mm:body.tolerance_mm}},[pixels.buffer]);
    data.result.synthetic=true;data.result.demo_case=body.case;
    data.result.warnings.unshift("Synthetic example with a known simulated projection. This is a software demonstration, not evidence of real-world accuracy.");
    return {...data,image:source};
  }
  throw new Error("Unknown inspection action.");
}

function busy(value, text = "Finding and comparing the outline…") {
  $("busy").hidden = !value; $("busy-text").textContent = text;
  document.body.classList.toggle("is-busy", value);
  for (const id of ["take-photo", "choose-photo", "run-demo", "use-reference", "save-report"]) $(id).disabled = value;
}

function discardResult() {
  state.result = null; $("results").hidden = true;
  $("result-shortcut").hidden = true;
  if (state.photo?.image) drawPhoto();
  if (typeof renderBatch === "function") renderBatch();
}

function renderSetup() {
  const fixed = mode() === "fixed";
  $("fixed-settings").hidden = !fixed; $("handheld-note").hidden = fixed;
  $("custom-thickness-field").hidden = $("thickness").value !== "custom";
  const valid = state.calibration && Math.abs(state.calibration.thickness_mm - thickness()) < .01;
  $("calibration-status").textContent = !state.calibration ? "Mount needs calibration" : valid ? "Calibration saved on this browser" : "Thickness changed · recalibrate";
  $("open-calibration").textContent = state.calibration ? "Recalibrate →" : "Set up →";
  $("calibration-thickness").textContent = `Calibration plane: ${num(thickness(), 2)} mm plywood top face. Change thickness in Setup if needed.`;
  $("capture-help").textContent = fixed ? "Use the same mount, camera, orientation, resolution, and 1× zoom. Tap inside the plywood to select it." : "Hold the phone roughly parallel to the top face. Keep the whole part visible. Tap inside the plywood to select it.";
}

function renderTarget() {
  $("target-name").textContent = state.target.name || "Imported reference";
  $("target-note").textContent = state.target.source === "synthetic-practice" ? "Practice only. Replace with your actual design or a manually verified sample." : state.target.units === "mm" ? "Metric outline. Verify the source and dimensions manually before using it as a reference." : "Proportions only. This reference cannot be used for dimensional comparison.";
}

async function preparePhoto(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Choose a photo file (JPEG, PNG, or WebP).");
  if (file.size > 35_000_000) throw new Error("Choose a photo smaller than 35 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const sourceSize = [image.naturalWidth, image.naturalHeight];
    if (Math.min(...sourceSize) < 200) throw new Error("Use a photo at least 200 pixels on each side.");
    const factor = Math.min(1, 1600 / Math.max(...sourceSize));
    const canvas = document.createElement("canvas"); canvas.width = Math.round(sourceSize[0] * factor); canvas.height = Math.round(sourceSize[1] * factor);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", .94);
    const preview = new Image(); preview.src = dataUrl; await preview.decode();
    return { dataUrl, image: preview, imageSize: [canvas.width, canvas.height], sourceSize };
  } finally { URL.revokeObjectURL(url); }
}

function drawPath(ctx, points, color, dashed = false) {
  if (!points?.length) return;
  ctx.beginPath(); points.forEach(([x,y], i) => i ? ctx.lineTo(x * ctx.canvas.width, y * ctx.canvas.height) : ctx.moveTo(x * ctx.canvas.width, y * ctx.canvas.height)); ctx.closePath();
  ctx.strokeStyle = color; ctx.setLineDash(dashed ? [12, 8] : []); ctx.stroke(); ctx.setLineDash([]);
}

function drawPhoto() {
  if (!state.photo?.image) return;
  const canvas = $("photo-canvas"), ctx = canvas.getContext("2d");
  canvas.width = state.photo.image.naturalWidth; canvas.height = state.photo.image.naturalHeight;
  ctx.drawImage(state.photo.image, 0, 0); ctx.lineWidth = Math.max(2, canvas.width / 430);
  const result = state.result;
  if (result) {
    drawPath(ctx, result.overlay.expected, "#f6b16c", true);
    drawPath(ctx, result.overlay.actual, "#8bf3df");
    const distances = result.overlay.edge_distances;
    const threshold = result.comparison.tolerance_mm ?? Math.max(result.comparison.edge_max * .6, result.mode === "fixed" ? .7 : .4);
    ctx.lineWidth *= 1.5; ctx.strokeStyle = "#ff7295";
    for (let i = 0; i < distances.length; i++) {
      if (distances[i] <= threshold) continue;
      const a = result.overlay.actual[i], b = result.overlay.actual[(i + 1) % distances.length];
      ctx.beginPath(); ctx.moveTo(a[0]*canvas.width,a[1]*canvas.height); ctx.lineTo(b[0]*canvas.width,b[1]*canvas.height); ctx.stroke();
    }
  }
  if (state.seed) { ctx.beginPath(); ctx.arc(state.seed[0]*canvas.width,state.seed[1]*canvas.height,canvas.width/130,0,Math.PI*2); ctx.strokeStyle="white";ctx.lineWidth=2;ctx.stroke(); }
  canvas.hidden = false; $("empty-stage").hidden = true;
}

function addMetric(label, value, note) {
  const box = document.createElement("div"); box.className = "metric";
  for (const [tag, text, cls] of [["p",label,"metric-label"],["strong",value,""],["small",note,""]]) {
    const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;box.append(node);
  }
  $("metrics").append(box);
}

function renderResults() {
  const result = state.result, fixed = result.mode === "fixed", cmp = result.comparison;
  $("results").hidden = false; $("metrics").replaceChildren();
  $("result-shortcut").hidden = false;
  $("result-shortcut-text").textContent = `Review required · largest shift ${num(cmp.edge_max, fixed ? 1 : 2)}${fixed ? " mm" : "%"}`;
  $("photo-badge").textContent = result.synthetic ? "SYNTHETIC EXAMPLE" : fixed ? "FIXED CAMERA" : "HANDHELD";
  $("result-title").textContent = result.synthetic ? "Practice result · review required" : "Review required";
  $("result-description").textContent = result.synthetic ? `Synthetic ${result.demo_case === "notch" ? "radius vs. diameter mistake" : result.demo_case === "undersized" ? "part made 15% undersized" : "matching part"}. ${fixed ? "Simulated metric calibration; real-world accuracy remains untested." : "Size has been normalized; a uniformly smaller part can match."}` : `Compared with ${result.target_name}. ${fixed ? "Scale was preserved during alignment." : "Size was normalized for a proportions-only comparison."}`;
  if (fixed) {
    const m = result.measurement;
    addMetric("Estimated long outer span", `≈ ${num(m.width_mm)} mm`, `Reference ${num(m.reference_width_mm)} mm`);
    addMetric("Estimated short outer span", `≈ ${num(m.height_mm)} mm`, `Reference ${num(m.reference_height_mm)} mm`);
    addMetric("95% of edge shifts within", `${num(cmp.edge_p95)} mm`, "Symmetric boundary comparison");
    addMetric("Largest edge shift", `${num(cmp.edge_max)} mm`, cmp.tolerance_mm === null ? "No grading tolerance supplied" : `${Math.round(cmp.boundary_fraction_over_tolerance*100)}% of boundary samples > ${cmp.tolerance_mm} mm`);
  } else {
    addMetric("Absolute size", "Not checked", "A smaller copy can match");
    addMetric("95% of edge shifts within", `${num(cmp.edge_p95,2)}%`, "Percent of reference width");
    addMetric("Largest edge shift", `${num(cmp.edge_max,2)}%`, "Percent of reference width");
    addMetric("Perspective", "Not corrected", "Keep phone parallel to top face");
  }
  $("warnings").replaceChildren();
  const warnings = [...result.warnings];
  if (result.target_source === "synthetic-practice") warnings.unshift("This is a practice design, not your actual grading reference.");
  if (!result.synthetic) warnings.push("Inspect the detected edge for shadows, visible sidewalls, and missed or splintered edges before interpreting the comparison.");
  for (const text of warnings) { const li=document.createElement("li");li.textContent=text;$("warnings").append(li); }
  $("comparison-scope").textContent = fixed ? "A calibrated top-face outline, aligned by translation and rotation. The part is never resized to fit. Outer spans come from a minimum-area enclosing rectangle, not feature datums. Pink shows potential tolerance exceedances when supplied; otherwise it marks the largest shifts." : "Outside-edge proportions after uniform size normalization, translation, and rotation. Pink marks the largest local shifts for review. Absolute dimensions are unavailable.";
  $("use-reference").disabled = !!result.synthetic;
  drawPhoto();
  renderBatch();
}

async function analyze() {
  if (!state.photo) return;
  const request = ++state.request;
  discardResult(); message("error"); busy(true);
  try {
    let data;
    if (state.photo.demoCase) {
      data = await api("demo", { case: state.photo.demoCase, mode: mode(), tolerance_mm: $("tolerance").value || null });
      const image = new Image(); image.src=data.image; await image.decode();
      if (request !== state.request) return;
      state.photo = { image, dataUrl:data.image, imageSize:[image.naturalWidth,image.naturalHeight], sourceSize:[image.naturalWidth,image.naturalHeight], demoCase:state.photo.demoCase };
    } else {
      if (mode() === "fixed" && !state.calibration) throw new Error("Calibrate the mount first, or switch to Handheld for an outline-only comparison.");
      data = await api("inspect", { image:state.photo.dataUrl, source_size:state.photo.sourceSize,
        mode:mode(), thickness_mm:thickness(), target:state.target, calibration:state.calibration,
        setup_unchanged:$("setup-unchanged").checked, tolerance_mm:$("tolerance").value || null,
        seed:state.seed, threshold:state.threshold });
    }
    if (request !== state.request) return;
    state.result=data.result; renderResults();
  } catch(error) { if(request===state.request)message("error",error.message); }
  finally { if(request===state.request){busy(false);if(state.result?.synthetic)$("use-reference").disabled=true;renderBatch();} }
}

async function receivePhoto(input) {
  const file=input.files[0];input.value="";if(!file)return;
  try {
    state.photo=await preparePhoto(file);state.seed=null;state.threshold=null;$("threshold-label").textContent="Auto";
    $("photo-badge").textContent="NEW PHOTO";discardResult();drawPhoto();await analyze();
  } catch(error){message("error",error.message);}
}

function pointAt(event,canvas) {
  const rect=canvas.getBoundingClientRect();return [(event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height];
}

function download(name,value) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));
  const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}

function drawCalibration() {
  if(!state.calibrationPhoto)return;
  const canvas=$("calibration-canvas"),ctx=canvas.getContext("2d");const image=state.calibrationPhoto.image;
  canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;ctx.drawImage(image,0,0);
  ctx.lineWidth=Math.max(3,canvas.width/400);
  if(state.corners.length>1){ctx.beginPath();state.corners.forEach(([x,y],i)=>i?ctx.lineTo(x*canvas.width,y*canvas.height):ctx.moveTo(x*canvas.width,y*canvas.height));if(state.corners.length===4)ctx.closePath();ctx.strokeStyle="#8bf3df";ctx.stroke();}
  state.corners.forEach(([x,y],i)=>{ctx.beginPath();ctx.arc(x*canvas.width,y*canvas.height,canvas.width/60,0,Math.PI*2);ctx.fillStyle="#f6aa68";ctx.fill();ctx.fillStyle="#172b31";ctx.textAlign="center";ctx.textBaseline="middle";ctx.font=`bold ${canvas.width/48}px system-ui`;ctx.fillText(String(i+1),x*canvas.width,y*canvas.height);});
  canvas.hidden=false;$("calibration-empty").hidden=true;
  $("corner-progress").textContent=state.corners.length===4?"Four corners selected. Enter the measured rectangle dimensions, then save.":`Next: tap ${["top left","top right","bottom right","bottom left"][state.corners.length]} (${state.corners.length}/4 selected).`;
}

async function receiveCalibration(input) {
  const file=input.files[0];input.value="";if(!file)return;
  try{state.calibrationPhoto=await preparePhoto(file);state.corners=[];$("plane-confirmed").checked=false;message("calibration-error");drawCalibration();}
  catch(error){message("calibration-error",error.message);}
}

async function saveCalibration() {
  message("calibration-error");
  try {
    if(!state.calibrationPhoto||state.corners.length!==4)throw new Error("Choose a setup photo and tap all four corners first.");
    if(!$("plane-confirmed").checked)throw new Error("Confirm the measured rectangle is at the plywood’s top-face height.");
    const factor=$("calibration-unit").value==="in"?25.4:1;
    const data=await api("calibrate",{corners:state.corners,width_mm:Number($("rectangle-width").value)*factor,height_mm:Number($("rectangle-height").value)*factor,thickness_mm:thickness(),image_size:state.calibrationPhoto.imageSize,source_size:state.calibrationPhoto.sourceSize});
    state.calibration={...data.calibration,capture_source:state.calibrationPhoto.captureSource||"photo"};saveLocal("plywood.pages.calibration.v1",state.calibration);
    $("setup-unchanged").checked=false;renderSetup();discardResult();$("calibration-panel").hidden=true;
    message("error","Calibration saved. Remove the rectangle, capture a part, and confirm the setup is unchanged.");
    $("take-photo").focus();
  }catch(error){message("calibration-error",error.message);}
}

function svgTarget(text,name) {
  const doc=new DOMParser().parseFromString(text,"image/svg+xml");
  if(doc.querySelector("parsererror")||doc.documentElement.localName!=="svg")throw new Error("That file is not a readable SVG.");
  const shapes=[...doc.querySelectorAll("path,polygon,polyline,rect,circle,ellipse,line,use,text,image")];
  if(shapes.length!==1||!['path','polygon'].includes(shapes[0].localName))throw new Error("SVG import supports one closed path or polygon. Export only the outside outline, with text and extra objects removed.");
  const source=shapes[0];
  for(let node=source;node&&node.nodeType===1;node=node.parentElement){if(node.hasAttribute("transform"))throw new Error("Flatten SVG transforms before importing. A JSON outline also works.");}
  const safe=document.createElementNS("http://www.w3.org/2000/svg",source.localName);
  const attribute=source.localName==="path"?"d":"points";safe.setAttribute(attribute,source.getAttribute(attribute)||"");
  if(attribute==="d"&&!/[zZ]\s*$/.test(safe.getAttribute("d")))throw new Error("The SVG path must be closed with Z.");
  if(attribute==="d"&&((source.getAttribute("d")||"").match(/[mM]/g)||[]).length!==1)throw new Error("Import a single outside path; holes and separate subpaths are not supported.");
  // Some browsers require attached, rendered geometry for length sampling.
  // Attach only a fresh geometry element with d/points; never the input SVG.
  const helper=document.createElementNS("http://www.w3.org/2000/svg","svg");
  helper.classList.add("geometry-helper");helper.setAttribute("aria-hidden","true");helper.append(safe);document.body.append(helper);
  let points;
  try{const length=safe.getTotalLength();if(!Number.isFinite(length)||length<=0)throw new Error("The SVG outline is empty.");
    points=Array.from({length:600},(_,i)=>{const p=safe.getPointAtLength(i*length/600);return[p.x,p.y];});
  }finally{helper.remove();}
  const root=doc.documentElement,widthValue=root.getAttribute("width")||"",viewBox=(root.getAttribute("viewBox")||"").trim().split(/[\s,]+/).map(Number);
  const match=widthValue.match(/^([\d.]+)(mm|cm|in)$/);let units="normalized",factor=1;
  if(match&&viewBox.length===4&&viewBox[2]>0){factor=Number(match[1])*({mm:1,cm:10,in:25.4}[match[2]])/viewBox[2];units="mm";
    const heightValue=root.getAttribute("height")||"",hm=heightValue.match(/^([\d.]+)(mm|cm|in)$/);
    if(hm&&viewBox[3]>0){const fy=Number(hm[1])*({mm:1,cm:10,in:25.4}[hm[2]])/viewBox[3];if(Math.abs(fy/factor-1)>.001)throw new Error("SVG uses different horizontal and vertical scales. Export with matching units.");}
  }
  return{version:1,name:name.replace(/\.svg$/i,""),units,source:"imported-svg-verify-units",points:points.map(p=>p.map(v=>v*factor))};
}

function validateTargetClient(target){
  if(!target||!["mm","normalized"].includes(target.units)||!Array.isArray(target.points)||target.points.length<3||target.points.length>5000||target.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=="number"||!Number.isFinite(v))))throw new Error('Reference must contain units ("mm" or "normalized") and 3–5,000 [x, y] points.');
  return target;
}

$("take-photo").onclick=()=>$("camera-input").click();$("choose-photo").onclick=()=>$("photo-input").click();
$("jump-results").onclick=()=>$("results").scrollIntoView({behavior:"smooth",block:"start"});
$("camera-input").onchange=()=>receivePhoto($("camera-input"));$("photo-input").onchange=()=>receivePhoto($("photo-input"));
$("photo-canvas").onclick=event=>{if(batch.running||!state.photo||state.photo.demoCase)return;state.seed=pointAt(event,$("photo-canvas"));analyze();};
$("run-demo").onclick=async()=>{state.photo={demoCase:$("demo-case").value};state.seed=null;state.threshold=null;await analyze();};
for(const radio of document.querySelectorAll('input[name="mode"]'))radio.onchange=()=>{renderSetup();analyze();};
for(const id of ["thickness","custom-thickness"])$(id).onchange=()=>{$("setup-unchanged").checked=false;renderSetup();if(state.photo)analyze();};
$("setup-unchanged").onchange=()=>analyze();$("tolerance").onchange=()=>analyze();
$("edge-threshold").oninput=()=>{$("threshold-label").textContent=$("edge-threshold").value;};
$("edge-threshold").onchange=()=>{state.threshold=Number($("edge-threshold").value);analyze();};
$("reset-threshold").onclick=()=>{state.threshold=null;$("threshold-label").textContent="Auto";analyze();};
$("open-calibration").onclick=()=>{$("calibration-panel").hidden=false;renderSetup();$("calibration-panel").scrollIntoView({behavior:"smooth",block:"start"});};
$("close-calibration").onclick=()=>{$("calibration-panel").hidden=true;};
$("calibration-camera").onclick=()=>$("calibration-camera-input").click();$("calibration-upload").onclick=()=>$("calibration-file-input").click();
$("calibration-camera-input").onchange=()=>receiveCalibration($("calibration-camera-input"));$("calibration-file-input").onchange=()=>receiveCalibration($("calibration-file-input"));
$("calibration-canvas").onclick=event=>{if(state.corners.length>=4)return;state.corners.push(pointAt(event,$("calibration-canvas")));drawCalibration();};
$("clear-corners").onclick=()=>{state.corners=[];drawCalibration();};$("save-calibration").onclick=saveCalibration;
$("forget-calibration").onclick=()=>{state.calibration=null;saveLocal("plywood.pages.calibration.v1",null);$("setup-unchanged").checked=false;renderSetup();discardResult();message("calibration-error","Saved calibration removed.");};
$("import-target").onclick=()=>$("target-input").click();
$("target-input").onchange=async()=>{const file=$("target-input").files[0];$("target-input").value="";if(!file)return;try{if(file.size>1_000_000)throw new Error("Reference file must be smaller than 1 MB.");const text=await file.text();state.target=validateTargetClient(/\.svg$/i.test(file.name)?svgTarget(text,file.name):JSON.parse(text));saveLocal("plywood.pages.target.v1",state.target);renderTarget();message("error");if(state.photo&&!state.photo.demoCase)analyze();else discardResult();}catch(error){message("error",`Could not import reference: ${error.message}`);}};
$("reset-target").onclick=async()=>{state.target=await(await fetch("./practice-target.json")).json();saveLocal("plywood.pages.target.v1",null);renderTarget();analyze();};
$("use-reference").onclick=()=>{if(!state.result||state.result.synthetic)return;state.target={...state.result.reference_outline,thickness_mm:thickness(),segmentation_threshold:state.result.quality.threshold};saveLocal("plywood.pages.target.v1",state.target);renderTarget();message("error","Reference saved in this browser. Verify this sample manually; a photo reference can carry its own defects and capture errors.");discardResult();};
$("download-reference").onclick=()=>download("plywood-reference.json",state.target);
$("save-report").onclick=()=>{if(state.result){const {overlay,reference_outline,...report}=state.result;download("plywood-inspection.json",{...report,created_at:new Date().toISOString(),reference:state.result.synthetic?"synthetic-practice":state.target,calibration:state.result.synthetic?"synthetic-projection":mode()==="fixed"?state.calibration:null});}};

(async()=>{try{const saved=readSaved("plywood.pages.target.v1");state.target=saved?validateTargetClient(saved):await(await fetch("./practice-target.json")).json();renderTarget();renderSetup();}catch(error){message("error",`Setup could not load: ${error.message}`);}})();

const savedBatch=readSaved("plywood.batch.v1");
const batch={stream:null,running:false,timer:null,epoch:0,recorder:null,audio:null,lastManualPhoto:null,threshold:null,
  session:savedBatch?.version===1&&Array.isArray(savedBatch.rows)?savedBatch:null,
  message:"Start the camera, calibrate its live feed, and set a good reference part.",state:"idle",storageWarning:false};

function persistSession(){
  try{if(batch.session)localStorage.setItem("plywood.batch.v1",JSON.stringify(batch.session));else localStorage.removeItem("plywood.batch.v1");batch.storageWarning=false;}
  catch{batch.storageWarning=true;message("batch-error","Session is in memory, but browser storage is full or disabled. Download the CSV before leaving this page.");}
}
function signature(){return JSON.stringify({calibration:state.calibration,target:state.target,thickness:thickness()});}
function ensureSession(){
  if(mode()!=="fixed"||!state.calibration)throw new Error("Use fixed-camera mode and calibrate first.");
  if(!$("setup-unchanged").checked)throw new Error("Confirm the camera, lens/zoom, and top-face height are unchanged.");
  if(!state.target||state.target.source==="synthetic-practice"||state.target.units!=="mm")throw new Error("Use your actual metric drawing or a manually verified test part as the reference. Practice examples cannot enter the session log.");
  const key=signature();
  if(batch.session?.rows.length&&batch.session.signature!==key)throw new Error("The reference or calibration differs from this session. Download its CSV and choose New session before continuing.");
  if(!batch.session||batch.session.signature!==key)batch.session={version:1,id:new Date().toISOString(),name:$("session-name").value.trim()||"Workshop session",prefix:$("part-prefix").value.trim()||"Part",signature:key,rows:[]};
  persistSession();return batch.session;
}
function renderBatch(){
  const rows=batch.session?.rows||[],processing=document.body.classList.contains("is-busy"),locked=batch.running;
  $("batch-count").textContent=`${rows.length} LOGGED`;
  $("batch-state").textContent=batch.message;$("batch-state").className=`batch-state ${batch.state==="captured"?"captured":batch.state==="waiting_clear"?"waiting":""}`;
  $("start-live").disabled=!!batch.stream;$("stop-live").disabled=!batch.stream;
  $("start-batch").disabled=!batch.stream||locked||processing;$("pause-batch").disabled=!locked;
  $("live-calibrate").disabled=!batch.stream||locked||processing;$("live-snapshot").disabled=!batch.stream||locked||processing;
  $("export-csv").disabled=!rows.length;$("new-session").disabled=locked;
  $("log-photo").disabled=locked||processing||!PlywoodBatch.isReading(state.result)||batch.lastManualPhoto===state.photo;
  for(const id of ["session-name","part-prefix"])$(id).disabled=locked||rows.length>0;
  for(const id of ["stable-readings","reading-spread","thickness","custom-thickness","setup-unchanged","tolerance","edge-threshold","reset-threshold"])$(id).disabled=locked;
  for(const element of document.querySelectorAll('.mode-picker input'))element.disabled=locked;
  for(const id of ["take-photo","choose-photo","run-demo","import-target","reset-target","open-calibration","save-calibration"])$(id).disabled=locked||processing;
  $("use-reference").disabled=locked||processing||!state.result||!!state.result.synthetic;
  $("batch-rows").replaceChildren();
  $("batch-table-caption").textContent=rows.length?`Latest ${Math.min(10,rows.length)} of ${rows.length} captured parts · all rows are in the CSV.`:"No parts logged yet.";
  for(const row of rows.slice(-10).reverse()){
    const tr=document.createElement("tr");
    for(const text of [row.part_id,num(row.long_span_mm,2),num(row.delta_long_mm,2),num(row.short_span_mm,2),num(row.delta_short_mm,2),"Required"]){const td=document.createElement("td");td.textContent=text;tr.append(td);}
    $("batch-rows").append(tr);
  }
}
async function unlockSound(){
  if(!$("beep-enabled").checked)return;
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio){message("batch-error","Sound is unavailable in this browser. Captures will still show a green visual cue.");return;}
  if(!batch.audio)batch.audio=new Audio();
  if(batch.audio.state==="suspended")await batch.audio.resume();
}
function beep(){
  if(!$("beep-enabled").checked||!batch.audio||batch.audio.state!=="running")return;
  const oscillator=batch.audio.createOscillator(),gain=batch.audio.createGain(),time=batch.audio.currentTime;
  oscillator.type="sine";oscillator.frequency.value=1000;gain.gain.setValueAtTime(.001,time);gain.gain.exponentialRampToValueAtTime(.15,time+.015);gain.gain.exponentialRampToValueAtTime(.001,time+.18);
  oscillator.connect(gain);gain.connect(batch.audio.destination);oscillator.start(time);oscillator.stop(time+.2);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
}
function pauseBatch(text="Paused · session rows are saved. Resume with an empty surface."){
  batch.running=false;batch.epoch++;clearTimeout(batch.timer);batch.timer=null;batch.recorder?.resetGate();batch.message=text;batch.state="paused";renderBatch();
}
async function startLive(){
  message("batch-error");
  try{
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error("Live camera access needs your HTTPS website (or localhost for desktop testing). Use the published GitHub Pages URL on your phone.");
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}}});
    batch.stream=stream;const video=$("live-video");video.srcObject=stream;video.hidden=false;$("live-empty").hidden=true;
    await video.play();
    if(!video.videoWidth)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("The camera did not produce a frame. Stop and restart it.")),10000);video.addEventListener("loadedmetadata",()=>{clearTimeout(timer);resolve();},{once:true});});
    $("live-info").textContent=`Live feed: ${video.videoWidth} × ${video.videoHeight}. Calibrate using a frame from this feed; keep the mount and camera settings unchanged.`;
    $("setup-unchanged").checked=false;
    for(const track of stream.getVideoTracks())track.addEventListener("ended",()=>stopLive(),{once:true});
    batch.message="Camera ready. Calibrate from a live frame, then inspect and save your test part as the reference.";renderBatch();
  }catch(error){if(batch.stream)stopLive();message("batch-error",error.name==="NotAllowedError"?"Camera permission was denied. Allow the camera in Firefox’s site settings, or use the photo picker and Log reviewed photo.":error.message);}
}
function stopLive(){
  pauseBatch("Camera stopped · logged rows are saved.");
  const stream=batch.stream;batch.stream=null;stream?.getTracks().forEach(track=>track.stop());
  $("live-video").srcObject=null;$("live-video").hidden=true;$("live-empty").hidden=false;$("setup-unchanged").checked=false;renderBatch();
}
async function liveFrame(){
  const video=$("live-video");
  if(!batch.stream||!video.videoWidth||video.readyState<2)throw new Error("Start the live camera and wait for a clear frame first.");
  const sourceSize=[video.videoWidth,video.videoHeight],scale=Math.min(1,1600/Math.max(...sourceSize)),canvas=document.createElement("canvas");
  canvas.width=Math.round(sourceSize[0]*scale);canvas.height=Math.round(sourceSize[1]*scale);canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);
  const dataUrl=canvas.toDataURL("image/jpeg",.94),image=new Image();image.src=dataUrl;await image.decode();
  return{dataUrl,image,imageSize:[canvas.width,canvas.height],sourceSize,captureSource:"live-video"};
}
async function calibrateLive(){
  message("batch-error");
  try{state.calibrationPhoto=await liveFrame();state.corners=[];$("plane-confirmed").checked=false;message("calibration-error");$("calibration-panel").hidden=false;renderSetup();drawCalibration();$("calibration-panel").scrollIntoView({behavior:"smooth",block:"start"});}
  catch(error){message("batch-error",error.message);}
}
async function snapshotLive(){
  message("batch-error");
  try{state.photo=await liveFrame();state.seed=null;state.threshold=null;$("threshold-label").textContent="Auto";discardResult();drawPhoto();await analyze();}
  catch(error){message("batch-error",error.message);}
}
function appendRow(result,method,samples){
  const session=ensureSession();
  const row=PlywoodBatch.row(result,{sessionId:session.id,sessionName:session.name,prefix:session.prefix,index:session.rows.length+1,method,samples});
  session.rows.push(row);persistSession();beep();batch.message=`Captured ${row.part_id} · remove this part before placing the next one.`;batch.state="captured";renderBatch();return row;
}
async function batchTick(epoch){
  if(!batch.running||epoch!==batch.epoch)return;
  try{
    const photo=await liveFrame();
    const response=await api("inspect",{image:photo.dataUrl,source_size:photo.sourceSize,mode:"fixed",thickness_mm:thickness(),target:state.target,calibration:state.calibration,setup_unchanged:$("setup-unchanged").checked,tolerance_mm:$("tolerance").value||null,seed:null,threshold:batch.threshold});
    if(!batch.running||epoch!==batch.epoch)return;
    const outcome=batch.recorder.observe({kind:"reading",result:response.result},performance.now());
    batch.message=outcome.message;batch.state=outcome.state;
    if(outcome.result){state.photo=photo;state.result=outcome.result;renderResults();appendRow(outcome.result,"stable_live",outcome.samples);}
  }catch(error){
    if(!batch.running||epoch!==batch.epoch)return;
    if(/dimensions changed|Thickness differs|Confirm that|calibrat|engine could not|took too long/i.test(error.message)){pauseBatch("Paused · check the setup before resuming.");message("batch-error",error.message);return;}
    const outcome=batch.recorder.observe(error.code==="NO_PART"?{kind:"empty"}:{kind:"invalid",message:error.message},performance.now());batch.message=outcome.message;batch.state=outcome.state;
  }
  renderBatch();if(batch.running&&epoch===batch.epoch)batch.timer=setTimeout(()=>batchTick(epoch),750);
}
async function startBatch(){
  message("batch-error");
  try{
    if(!batch.stream)throw new Error("Start the live camera first.");
    if(state.calibration?.capture_source!=="live-video")throw new Error("Calibrate using a live frame first. The still-photo camera can have a different crop and resolution.");
    ensureSession();
    batch.threshold=state.threshold??state.target.segmentation_threshold;
    if(!Number.isFinite(batch.threshold)||batch.threshold<1||batch.threshold>254)throw new Error("Inspect the live test part and use its outline as reference first, or set the brightness cutoff manually. Batch capture needs a fixed cutoff to recognize an empty dark surface.");
    batch.recorder=new PlywoodBatch.Recorder({samples:Number($("stable-readings").value),spreadMm:Number($("reading-spread").value)});
    await unlockSound();batch.running=true;batch.epoch++;batch.state="waiting_clear";batch.message="Remove the reference part and your hands. Checking for an empty surface…";renderBatch();batchTick(batch.epoch);
  }catch(error){message("batch-error",error.message);renderBatch();}
}
function downloadCsv(){
  if(!batch.session?.rows.length)return;
  const blob=new Blob([PlywoodBatch.csv(batch.session.rows)],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download=`plywood-session-${batch.session.id.slice(0,10)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
$("open-batch").onclick=()=>$("batch-panel").scrollIntoView({behavior:"smooth",block:"start"});
$("start-live").onclick=startLive;$("stop-live").onclick=stopLive;$("live-calibrate").onclick=calibrateLive;$("live-snapshot").onclick=snapshotLive;
$("start-batch").onclick=startBatch;$("pause-batch").onclick=()=>pauseBatch();$("export-csv").onclick=downloadCsv;
$("test-beep").onclick=async()=>{try{await unlockSound();beep();}catch(error){message("batch-error",error.message);}};
$("log-photo").onclick=async()=>{try{await unlockSound();if(batch.lastManualPhoto===state.photo)throw new Error("Capture the next part before logging another row.");appendRow(state.result,"manual_photo",1);batch.lastManualPhoto=state.photo;renderBatch();}catch(error){message("batch-error",error.message);}};
$("new-session").onclick=()=>{pauseBatch();if(batch.session?.rows.length){saveLocal("plywood.batch.previous.v1",batch.session);$("undo-session").hidden=false;}batch.session=null;batch.lastManualPhoto=null;persistSession();message("batch-error");batch.message="New session ready. The previous session can be restored using the button below.";renderBatch();};
$("undo-session").onclick=()=>{const previous=readSaved("plywood.batch.previous.v1");if(previous?.rows?.length){pauseBatch();if(batch.session?.rows.length)saveLocal("plywood.batch.previous.v1",batch.session);batch.session=previous;persistSession();$("session-name").value=previous.name;$("part-prefix").value=previous.prefix;batch.message="Previous session restored. Download its CSV or resume with the same setup.";renderBatch();}};
document.addEventListener("visibilitychange",()=>{if(document.hidden&&batch.stream)stopLive();});
window.addEventListener("pagehide",()=>{if(batch.stream)stopLive();});
if(batch.session){$("session-name").value=batch.session.name;$("part-prefix").value=batch.session.prefix;batch.message=`Restored ${batch.session.rows.length} saved rows. Download the CSV or resume with the same setup.`;}
$("undo-session").hidden=!readSaved("plywood.batch.previous.v1")?.rows?.length;
renderBatch();
