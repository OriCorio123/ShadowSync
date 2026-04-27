/* ====================================================================
 *  SHADOWSYNC — Next.js Custom Server
 *  Express + Socket.io + Next.js hub that:
 *    1. Serves the Next.js App
 *    2. Relays MediaPipe tracking data via Socket.io
 *    3. Loads modular game backends ([name]Server.js) automatically
 * ==================================================================== */

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');
const fs      = require('fs');
const next    = require('next');

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const nextHandler = nextApp.getRequestHandler();

const PORT      = process.env.PORT || 3000;
const GAMES_DIR = path.join(__dirname, 'public', 'games');

// =====================================================================
// MODULAR BACKEND ROUTING
// =====================================================================
function loadGameBackends(io) {
  try {
    if (!fs.existsSync(GAMES_DIR)) return;
    const entries = fs.readdirSync(GAMES_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const folderName = entry.name;
      const folderPath = path.join(GAMES_DIR, folderName);

      const filesInFolder = fs.readdirSync(folderPath);
      const serverFiles = filesInFolder.filter(f => f.endsWith('Server.js'));

      for (const serverFile of serverFiles) {
        const serverFilePath = path.join(folderPath, serverFile);
        try {
          const gameModule = require(serverFilePath);
          if (typeof gameModule === 'function') {
            gameModule(io);
            console.log(`[ShadowSync] ✓ Loaded backend: ${folderName}/${serverFile}`);
          }
        } catch (err) {
          console.error(`[ShadowSync] ✗ Failed to load ${serverFile}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('[ShadowSync] Error loading game backends:', err);
  }
}

// =====================================================================
// INIT NEXT.JS & SOCKET.IO
// =====================================================================
nextApp.prepare().then(() => {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*' },
    maxHttpBufferSize: 1e6,
  });

  // Global Tracking Data Relay
  io.on('connection', (socket) => {
    console.log(`[ShadowSync] Client connected: ${socket.id}`);

    socket.on('landMarkCurrent', (data) => socket.broadcast.emit('landMarkCurrent', data));
    socket.on('landMarkLag1', (data) => socket.broadcast.emit('landMarkLag1', data));
    socket.on('landMarkLag2', (data) => socket.broadcast.emit('landMarkLag2', data));
    socket.on('trackingData', (data) => socket.broadcast.emit('trackingData', data));

    socket.on('disconnect', () => {
      console.log(`[ShadowSync] Client disconnected: ${socket.id}`);
    });
  });

  // Load game backends
  loadGameBackends(io);

  // Next.js Catch-all
  app.all('*', (req, res) => {
    return nextHandler(req, res);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║     SHADOWSYNC NEXT.JS — RUNNING         ║');
    console.log(`  ║     http://localhost:${PORT}                 ║`);
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
  });
});
