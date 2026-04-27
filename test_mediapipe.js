const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.location = dom.window.location;

const { PoseLandmarker, FilesetResolver } = require('@mediapipe/tasks-vision');
const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');

async function main() {
  try {
    const wasmFileset = await FilesetResolver.forVisionTasks(
      path.join(__dirname, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
    );
    
    const poseLandmarker = await PoseLandmarker.createFromOptions(wasmFileset, {
      baseOptions: {
        modelAssetPath: path.join(__dirname, 'tools', 'mediapipe', 'pose_landmarker_lite.task'),
        delegate: 'CPU'
      },
      runningMode: 'IMAGE',
      numPoses: 1
    });

    console.log('PoseLandmarker initialized successfully!');
    
    // Test with a dummy canvas
    const canvas = createCanvas(640, 480);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'blue';
    ctx.fillRect(0, 0, 640, 480);
    
    // @mediapipe/tasks-vision in Node expects an ImageData or an image element.
    // Node-canvas provides ImageData via ctx.getImageData.
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const results = poseLandmarker.detect(imgData);
    console.log('Detection results length:', results.landmarks ? results.landmarks.length : 0);

  } catch (err) {
    console.error('Error:', err);
  }
}

main();
