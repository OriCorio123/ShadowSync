/* ====================================================================
 *  VR CHAT — Isolated Multiplayer Backend Logic
 *  
 *  This module is auto-loaded by server.js. It receives the Socket.io
 *  `io` object and creates a dedicated /vrchat namespace for multiplayer.
 *
 *  Protocol:
 *    - On connect: assign player ID, broadcast join
 *    - On 'playerMoved': relay landMarkCurrent to all other players
 *    - On disconnect: broadcast leave
 * ==================================================================== */

module.exports = function (io) {
  const vrChatRoom = io.of('/vrchat');

  // Track connected players
  const players = new Map();
  let playerCounter = 0;

  vrChatRoom.on('connection', (socket) => {
    playerCounter++;
    const playerId = `player_${playerCounter}`;
    const playerData = {
      id: playerId,
      socketId: socket.id,
      displayName: `Player ${playerCounter}`,
      joinedAt: Date.now(),
    };

    players.set(socket.id, playerData);

    console.log(`[VRChat] ${playerData.displayName} joined (${socket.id}). Total: ${players.size}`);

    // Send the new player their ID and current room state
    socket.emit('welcome', {
      playerId,
      displayName: playerData.displayName,
      players: Array.from(players.values()).map(p => ({
        id: p.id,
        displayName: p.displayName,
      })),
    });

    // Notify others that a new player joined
    socket.broadcast.emit('playerJoined', {
      id: playerId,
      displayName: playerData.displayName,
    });

    // -----------------------------------------------------------------
    // PLAYER MOVED — relay landmark data to all other players
    // -----------------------------------------------------------------
    socket.on('playerMoved', (data) => {
      // data should contain: { landMarkCurrent: [...33 landmarks...] }
      socket.broadcast.emit('playerMoved', {
        id: playerData.id,
        displayName: playerData.displayName,
        landMarkCurrent: data.landMarkCurrent,
      });
    });

    // -----------------------------------------------------------------
    // PLAYER UPDATE — handle display name changes, scene changes, etc.
    // -----------------------------------------------------------------
    socket.on('updateProfile', (data) => {
      if (data.displayName) {
        playerData.displayName = data.displayName;
        players.set(socket.id, playerData);
        vrChatRoom.emit('profileUpdated', {
          id: playerData.id,
          displayName: data.displayName,
        });
      }
    });

    // -----------------------------------------------------------------
    // SCENE CHANGE — notify all players of a scene switch
    // -----------------------------------------------------------------
    socket.on('changeScene', (data) => {
      vrChatRoom.emit('sceneChanged', {
        id: playerData.id,
        scene: data.scene,
      });
    });

    // -----------------------------------------------------------------
    // DISCONNECT
    // -----------------------------------------------------------------
    socket.on('disconnect', () => {
      players.delete(socket.id);
      console.log(`[VRChat] ${playerData.displayName} left. Total: ${players.size}`);

      socket.broadcast.emit('playerLeft', {
        id: playerData.id,
        displayName: playerData.displayName,
      });
    });
  });

  console.log('[VRChat] ✓ Namespace /vrchat ready');
};
