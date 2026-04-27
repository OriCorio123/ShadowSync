const { io } = require('socket.io-client');
const { createCanvas } = require('canvas');

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to server');
  
  // Create dummy image frame
  const canvas = createCanvas(320, 240);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'blue';
  ctx.fillRect(0, 0, 320, 240);
  const base64Data = canvas.toDataURL('image/jpeg', 0.5);
  
  socket.emit('videoFrame', base64Data);
  console.log('Sent videoFrame');
});

socket.on('trackingData', (data) => {
  console.log('Received trackingData:', !!data.empty ? 'Empty' : 'Has data');
  process.exit(0);
});

socket.on('connect_error', (err) => {
  console.error('Connection error:', err.message);
  process.exit(1);
});
