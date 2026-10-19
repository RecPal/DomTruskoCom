# Plywood Inspector — unlisted GitHub Pages tool

This folder is a self-contained static application. No Python server, build
step, phone app install, CDN, account, or shared Wi-Fi is required. Photos are
processed in a Web Worker on the device; they are never uploaded. OpenCV.js
4.13.0 and its embedded WebAssembly are bundled in `vendor/`.

The folder is intended for the root of the Personal Website repository. After
the user pushes/deploys that repository, open:

**https://www.domtrusko.com/plywood-inspector/**

The page is excluded from site navigation and has `noindex, nofollow,
noarchive` metadata. It is unlisted, not access-controlled. No public site
navigation, existing pages, or deployment configuration were changed.

## Firefox on Android

The app uses standard file inputs, Canvas, Web Workers, WebAssembly,
`getUserMedia`, and Web Audio. Firefox Android supports these APIs, including
rear-camera file capture. Live camera access requires HTTPS and camera
permission. Audio is unlocked by the Start batch or Test beep user gesture;
turn up media volume. Camera, sound, and measurement reliability still need
testing on the actual Pixel with Firefox. A Choose photo fallback is included.

Calibration/session data is stored locally in this browser. Firefox private
browsing or clearing site data can discard it; download the CSV when done.

## Single part

1. Use light plywood against a dark matte surface; keep the full outline in
   view. Select the actual thickness (default 1/8 inch).
2. For dimensions, fix the camera near overhead at 1×. Calibrate using four
   corners of a large, accurately measured rectangle whose surface is at the
   **same height as the part's top face**. Then remove the rectangle.
3. Keep camera, lens/zoom, crop/resolution, orientation, focus behavior, work
   surface, and top-face height unchanged. Recalibrate when any changes.
4. Import a metric SVG/JSON outline or capture a manually verified good part
   and choose **Use this outline as reference**. Inspect the detected boundary
   for sidewalls, shadows, or missed edges before interpreting measurements.

Fixed-camera alignment preserves scale. Handheld mode compares proportions,
normalizes size, and does not recover perspective or absolute dimensions.

## Batch session: measure, beep, swap

1. Open **Batch session** and press **Start live camera**. Mount it securely.
2. Use **Calibrate from live frame** and calibrate at top-face height. A
   still-photo calibration is rejected for live batch capture because crop,
   resolution, and camera processing can differ.
3. Remove the rectangle. Confirm the setup is unchanged. Place a known-good
   test part, press **Inspect live frame**, verify its edge, then choose
   **Use this outline as reference**. Its brightness cutoff is saved for
   consistent segmentation of both parts and an empty dark surface. Keep
   lighting consistent. With an imported metric reference, set a suitable
   brightness cutoff manually after checking a live frame.
4. Enter a session name and optional part label prefix. Default stability
   settings are three readings with at most 0.5 mm spread, at least 1.2 s
   dwell, area spread at most 1%, and stable edge residuals. This is a
   repeatability gate, **not a grading tolerance or accuracy claim**.
5. Press **Start batch**. Remove the reference part and hands. Wait for three
   clear empty frames and the Ready message, then place the first part.
6. The app logs one median reading, beeps, and requires sustained removal
   before accepting the next part. An identical next part is allowed after
   removal. Movement, soft images, ambiguous outlines, and setup mismatches
   prevent a stable capture. The page pauses/stops the camera when hidden.
7. Pause when needed and choose **Download session CSV** at the end. Rows
   survive reloads in normal browser storage. New session preserves the last
   session for restoration. Export before changing references/calibration.

**The beep means captured, not passed.** Every row is review required, even
when the outline appears close or a tolerance is supplied. The app does not
automatically grade students. If live capture is unavailable, use the photo
picker and **Log reviewed photo**. The same photo cannot be logged twice.

CSV is a single comparison table containing sequential part IDs, timestamps,
reference name/dimensions, thickness, measured long/short outer spans and
area, signed differences from the reference, percentage span differences,
95th-percentile and maximum boundary deviations, optional threshold
information, capture method, and review notes. Negative numeric differences
remain numbers; user text is escaped to avoid spreadsheet formulas.

Outer spans are the long/short sides of the minimum-area enclosing rectangle.
They are **not individual rubric dimensions**. Notch diameters/radii, other
feature-specific dimensions, holes, thickness, underside, bevels, and
squareness are not measured yet. Actual target drawing and grading rubric
are still needed. Accuracy and uncertainty are not established.

## Verification

No build is needed for publication. Optional checks, with Node installed:

```bash
node checks/vision.test.cjs
node checks/batch.test.cjs
node --check app.js
```

The suites test the actual bundled OpenCV engine, perspective/scale,
localized notch and uniform size errors, rejection cases, stable capture,
empty-surface gating, duplicates, signed CSV deltas, and CSV escaping.
Generated examples test code behavior, not real measurement accuracy.

Desktop browser QA verified the static worker, calibration, photo-reference
capture, separate part comparison, manual session logging, duplicate
prevention, and actual CSV download/parse. Physical live-camera capture and
speaker output on the user's Pixel/Firefox remain pending.

Sources: [OpenCV.js](https://docs.opencv.org/4.x/d0/d84/tutorial_js_usage.html),
[camera secure-context requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia),
[Firefox Android capture support](https://github.com/mdn/browser-compat-data/blob/main/html/elements/input.json),
[Web Audio interaction requirements](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices).
