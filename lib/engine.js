/* ====================================================================
 *  SHADOWSYNC ENGINE — MediaPipe Pose Tracking Module
 * ==================================================================== */

export const ShadowSyncEngine = (function () {
  'use strict';

  let videoEl = null;
  let socket = null;
  let callbacks = {};
  let poseLandmarker = null;
  let isRunning = false;
  let bodyDetected = false;

  let currentLandmarks = null;
  let rawNormalizedLandmarks = null;

  const BUFFER_SIZE = 35;
  const LAG1_OFFSET = 18;
  const LAG2_OFFSET = 30;
  const frameBuffer = [];

  let lastFrameTime = 0;
  let TARGET_FRAME_MS = 1000 / 60; // Default 60fps, can be overwritten on init

  const VISION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
  const MODEL_CDN = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

  function translateToFloorOrigin(worldLandmarks) {
    if (!worldLandmarks || worldLandmarks.length < 33) return null;
    const leftHeel = worldLandmarks[29];
    const rightHeel = worldLandmarks[30];
    const midX = (leftHeel.x + rightHeel.x) / 2;
    const midY = (leftHeel.y + rightHeel.y) / 2;
    const midZ = (leftHeel.z + rightHeel.z) / 2;

    const translated = [];
    for (let i = 0; i < 33; i++) {
      translated.push({
        // Invert X to create a mirror effect in the games
        x: -(worldLandmarks[i].x - midX),
        y: worldLandmarks[i].y - midY,
        z: worldLandmarks[i].z - midZ,
        visibility: worldLandmarks[i].visibility || 0,
      });
    }
    return translated;
  }

  function pushFrame(landmarks) {
    frameBuffer.push(landmarks);
    if (frameBuffer.length > BUFFER_SIZE) {
      frameBuffer.shift();
    }
  }

  function getLagFrame(offset) {
    const idx = frameBuffer.length - 1 - offset;
    if (idx >= 0 && idx < frameBuffer.length) {
      return frameBuffer[idx];
    }
    return frameBuffer[frameBuffer.length - 1] || null;
  }

  function broadcast() {
    if (!socket || !currentLandmarks) return;

    const lag1 = getLagFrame(LAG1_OFFSET);
    const lag2 = getLagFrame(LAG2_OFFSET);

    socket.emit('landMarkCurrent', currentLandmarks);
    if (lag1) socket.emit('landMarkLag1', lag1);
    if (lag2) socket.emit('landMarkLag2', lag2);

    socket.emit('trackingData', {
      landMarkCurrent: currentLandmarks,
      landMarkLag1: lag1 || currentLandmarks,
      landMarkLag2: lag2 || currentLandmarks,
    });
  }

  function processResults(result) {
    if (result.worldLandmarks && result.worldLandmarks.length > 0) {
      const raw = result.worldLandmarks[0];
      const translated = translateToFloorOrigin(raw);

      if (result.landmarks && result.landmarks.length > 0) {
        rawNormalizedLandmarks = result.landmarks[0];
      }

      if (translated) {
        currentLandmarks = translated;
        pushFrame(translated);
        broadcast();

        if (!bodyDetected) {
          bodyDetected = true;
          if (callbacks.onBodyDetected) callbacks.onBodyDetected(true);
        }
      }
    } else {
      rawNormalizedLandmarks = null;
      if (bodyDetected) {
        bodyDetected = false;
        if (callbacks.onBodyDetected) callbacks.onBodyDetected(false);
      }
    }
  }

  function trackingLoop(timestamp) {
    if (!isRunning) return;

    if (timestamp - lastFrameTime >= TARGET_FRAME_MS) {
      lastFrameTime = timestamp;

      if (poseLandmarker && videoEl && videoEl.readyState >= 2) {
        try {
          const result = poseLandmarker.detectForVideo(videoEl, performance.now());
          processResults(result);
        } catch (e) {
          // Ignore frame errors
        }
      }
    }

    requestAnimationFrame(trackingLoop);
  }

  async function loadPoseLandmarker() {
    const hardwareDelegate = callbacks.deviceType === 'mobile' ? 'CPU' : 'GPU';
    try {
      const module = await import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14');
      const { PoseLandmarker, FilesetResolver } = module;
      const fileset = await FilesetResolver.forVisionTasks(VISION_CDN);

      poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_CDN,
          delegate: hardwareDelegate,
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
      console.log('[Engine] ✓ PoseLandmarker loaded from CDN');
      return;
    } catch (cdnErr) {
      console.warn('[Engine] CDN load failed, trying local fallback...', cdnErr);
    }

    // Try local
    try {
      const module = await import(/* webpackIgnore: true */ '/tools/mediapipe/vision_bundle.mjs');
      const { PoseLandmarker, FilesetResolver } = module;
      const fileset = await FilesetResolver.forVisionTasks('/tools/mediapipe/wasm');

      poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: '/tools/mediapipe/pose_landmarker_lite.task',
          delegate: hardwareDelegate,
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
      console.log('[Engine] ✓ PoseLandmarker loaded from local fallback');
    } catch (localErr) {
      throw new Error('Failed to load MediaPipe from both CDN and local: ' + localErr.message);
    }
  }

  async function init(video, sock, cbs) {
    videoEl = video;
    socket = sock;
    callbacks = cbs || {};

    if (callbacks.deviceType === 'mobile') {
      TARGET_FRAME_MS = 1000 / 30;
      console.log('[Engine] Mobile mode: Targeting 30 FPS');
    } else {
      TARGET_FRAME_MS = 1000 / 60;
      console.log('[Engine] PC mode: Targeting 60 FPS');
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      videoEl.srcObject = stream;
      await videoEl.play();

      await loadPoseLandmarker();

      isRunning = true;
      if (callbacks.onReady) callbacks.onReady();
      requestAnimationFrame(trackingLoop);
    } catch (err) {
      console.error('[Engine] Init error:', err);
      if (callbacks.onError) callbacks.onError(err.message);
    }
  }

  return {
    init,
    getCurrentLandmarks() { return currentLandmarks; },
    getRawLandmarks() { return rawNormalizedLandmarks; },
    getFrameBuffer() { return frameBuffer; },
    isBodyDetected() { return bodyDetected; },
  };
})();
