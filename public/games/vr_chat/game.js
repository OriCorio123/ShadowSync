/* ====================================================================
 *  SHADOWSYNC — VR CHAT CLONE (Babylon.js + Socket.io /vrchat)
 *  
 *  Features:
 *    - Loads Chisa.glb avatar with Mixamo bone name mapping
 *    - Maps 33 MediaPipe landmarks to skeleton bones
 *    - Renders other players' avatars in real-time
 *    - Scene switching (Classroom / Winter)
 * ==================================================================== */

(function () {
  'use strict';

  // =====================================================================
  // SOCKET — connect to /vrchat namespace
  // =====================================================================
  const socket = io('/vrchat');
  let myPlayerId = null;
  let myDisplayName = 'Player';

  // =====================================================================
  // MIXAMO BONE NAME MAPPING
  // Maps MediaPipe landmark indices to Mixamo skeleton bone names
  // =====================================================================
  const LANDMARK_TO_MIXAMO = {
    0:  'mixamorig:Head',
    11: 'mixamorig:LeftShoulder',
    12: 'mixamorig:RightShoulder',
    13: 'mixamorig:LeftArm',
    14: 'mixamorig:RightArm',
    15: 'mixamorig:LeftForeArm',
    16: 'mixamorig:RightForeArm',
    17: 'mixamorig:LeftHand',
    18: 'mixamorig:RightHand',
    23: 'mixamorig:LeftUpLeg',
    24: 'mixamorig:RightUpLeg',
    25: 'mixamorig:LeftLeg',
    26: 'mixamorig:RightLeg',
    27: 'mixamorig:LeftFoot',
    28: 'mixamorig:RightFoot',
  };

  // Skeleton connection pairs for procedural fallback
  const SKELETON_CONNECTIONS = [
    [11,13],[13,15],[15,17],[12,14],[14,16],[16,18],  // Arms
    [11,12],[11,23],[12,24],[23,24],                   // Torso
    [23,25],[25,27],[27,29],[24,26],[26,28],[28,30],   // Legs
    [0,11],[0,12],                                      // Head-shoulders
  ];

  // =====================================================================
  // BABYLON SCENE SETUP
  // =====================================================================
  const canvas = document.getElementById('renderCanvas');
  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  let scene, camera, shadowGenerator;
  let myAvatar = null;
  let myAvatarBones = {};
  let useProcedural = false; // fallback if bone mapping fails
  let otherPlayers = new Map(); // socketId → { avatar, bones, lines }
  let currentScene = 'classroom';

  // Tracking data from hub
  let currentLandmarks = null;

  // =====================================================================
  // CREATE SCENE
  // =====================================================================
  async function createScene() {
    scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.06, 1);
    scene.ambientColor = new BABYLON.Color3(0.15, 0.15, 0.2);

    // Camera
    camera = new BABYLON.ArcRotateCamera('cam', Math.PI / 2, Math.PI / 3, 5, new BABYLON.Vector3(0, 1, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 2;
    camera.upperRadiusLimit = 15;
    camera.wheelPrecision = 30;

    // Lighting
    const hemiLight = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
    hemiLight.intensity = 0.6;
    hemiLight.diffuse = new BABYLON.Color3(0.7, 0.8, 1.0);

    const dirLight = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-1, -2, 1), scene);
    dirLight.intensity = 0.8;
    dirLight.position = new BABYLON.Vector3(5, 10, -5);

    // Shadows
    shadowGenerator = new BABYLON.ShadowGenerator(1024, dirLight);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 16;

    // Ground (fallback if scene loading fails)
    const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 20, height: 20 }, scene);
    const groundMat = new BABYLON.PBRMaterial('groundMat', scene);
    groundMat.albedoColor = new BABYLON.Color3(0.08, 0.08, 0.12);
    groundMat.metallic = 0.1;
    groundMat.roughness = 0.9;
    ground.material = groundMat;
    ground.receiveShadows = true;

    // Load environment scene
    await loadEnvironment(currentScene);

    // Load player avatar
    await loadMyAvatar();

    // Fog for atmosphere
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.015;
    scene.fogColor = new BABYLON.Color3(0.02, 0.02, 0.06);

    return scene;
  }

  // =====================================================================
  // ENVIRONMENT LOADING
  // =====================================================================
  async function loadEnvironment(sceneName) {
    // Remove existing environment meshes
    scene.meshes.filter(m => m.metadata && m.metadata.isEnvironment).forEach(m => m.dispose());

    try {
      let result;
      if (sceneName === 'classroom') {
        result = await BABYLON.SceneLoader.ImportMeshAsync('', 'Scenes/Classroom/', 'ClassroomScene.gltf', scene);
      } else if (sceneName === 'winter') {
        result = await BABYLON.SceneLoader.ImportMeshAsync('', 'Scenes/Winter/', 'winterScene.glb', scene);
      }

      if (result && result.meshes) {
        result.meshes.forEach(mesh => {
          mesh.metadata = { isEnvironment: true };
          mesh.receiveShadows = true;
          // Scale if needed
          if (sceneName === 'winter') {
            mesh.scaling = new BABYLON.Vector3(0.01, 0.01, 0.01);
          }
        });
      }
      console.log(`[VRChat] ✓ Loaded ${sceneName} environment`);
    } catch (err) {
      console.warn(`[VRChat] Failed to load ${sceneName} scene:`, err);
    }
  }

  // =====================================================================
  // AVATAR LOADING — Chisa.glb with Mixamo bone mapping
  // =====================================================================
  async function loadMyAvatar() {
    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync('', '3Davatars/', 'Chisa.glb', scene);

      if (result.meshes.length > 0) {
        myAvatar = result.meshes[0];
        myAvatar.position = new BABYLON.Vector3(0, 0, 0);
        myAvatar.scaling = new BABYLON.Vector3(1, 1, 1);

        // Add shadows
        result.meshes.forEach(m => {
          shadowGenerator.addShadowCaster(m);
          m.receiveShadows = true;
        });

        // Try to find Mixamo bones in the skeleton
        if (result.skeletons && result.skeletons.length > 0) {
          const skeleton = result.skeletons[0];
          const bones = skeleton.bones;

          console.log('[VRChat] Avatar bones:', bones.map(b => b.name));

          // Map bones by name
          for (const [lmIdx, boneName] of Object.entries(LANDMARK_TO_MIXAMO)) {
            const bone = bones.find(b => b.name === boneName || b.name.includes(boneName.split(':')[1]));
            if (bone) {
              myAvatarBones[lmIdx] = bone;
            }
          }

          const mappedCount = Object.keys(myAvatarBones).length;
          console.log(`[VRChat] Mapped ${mappedCount}/${Object.keys(LANDMARK_TO_MIXAMO).length} bones`);

          if (mappedCount < 5) {
            console.warn('[VRChat] Not enough bones mapped — using procedural skeleton');
            useProcedural = true;
          }

          // Stop all animations
          scene.stopAllAnimations();
          if (result.animationGroups) {
            result.animationGroups.forEach(ag => ag.stop());
          }
        } else {
          console.warn('[VRChat] No skeleton found — using procedural skeleton');
          useProcedural = true;
        }
      }
    } catch (err) {
      console.warn('[VRChat] Failed to load avatar, using procedural:', err);
      useProcedural = true;
      createProceduralAvatar();
    }
  }

  // =====================================================================
  // PROCEDURAL AVATAR FALLBACK — stick figure from spheres + lines
  // =====================================================================
  function createProceduralAvatar(name = 'myProcAvatar') {
    // Create spheres for key joints
    const joints = {};
    for (let i = 0; i < 33; i++) {
      const sphere = BABYLON.MeshBuilder.CreateSphere(`${name}_joint_${i}`, { diameter: 0.04 }, scene);
      const mat = new BABYLON.StandardMaterial(`${name}_jmat_${i}`, scene);
      mat.emissiveColor = new BABYLON.Color3(0, 0.7, 1);
      mat.disableLighting = true;
      sphere.material = mat;
      sphere.isVisible = false;
      joints[i] = sphere;
    }
    return joints;
  }

  // =====================================================================
  // LANDMARK → 3D POSITION CONVERSION
  // =====================================================================
  function landmarkToWorld(lm) {
    // MediaPipe world landmarks are in meters, relative to hip center
    // X = right, Y = up (negative), Z = towards camera
    // We flip Z for Babylon's left-handed coordinate system
    return new BABYLON.Vector3(
      lm.x,      // left-right
      -lm.y,     // up-down (flip: MediaPipe Y negative = up)
      -lm.z      // depth (flip for LH coords)
    );
  }

  // =====================================================================
  // APPLY LANDMARKS TO SKELETON
  // =====================================================================
  function applyLandmarksToAvatar(landmarks) {
    if (!landmarks || landmarks.length < 33) return;

    if (useProcedural || Object.keys(myAvatarBones).length < 5) {
      // Procedural: just move the avatar root based on hip center
      if (myAvatar) {
        const hipMid = landmarkToWorld({
          x: (landmarks[23].x + landmarks[24].x) / 2,
          y: (landmarks[23].y + landmarks[24].y) / 2,
          z: (landmarks[23].z + landmarks[24].z) / 2,
        });
        myAvatar.position = hipMid;
      }
      return;
    }

    // Apply bone rotations based on landmark positions
    for (const [lmIdx, bone] of Object.entries(myAvatarBones)) {
      const idx = parseInt(lmIdx);
      const pos = landmarkToWorld(landmarks[idx]);

      // For IK-style mapping, we compute the direction from parent to child
      // and apply as bone rotation
      try {
        // Find parent-child landmark pairs for this bone
        const parentChildMap = {
          13: { parent: 11, child: 15 }, // LeftArm: shoulder→elbow→wrist
          14: { parent: 12, child: 16 },
          15: { parent: 13, child: 17 }, // LeftForeArm
          16: { parent: 14, child: 18 },
          25: { parent: 23, child: 27 }, // LeftLeg
          26: { parent: 24, child: 28 },
          27: { parent: 25, child: 29 }, // LeftFoot
          28: { parent: 26, child: 30 },
        };

        if (parentChildMap[idx]) {
          const parentPos = landmarkToWorld(landmarks[parentChildMap[idx].parent]);
          const childPos = landmarkToWorld(landmarks[idx]);
          const dir = childPos.subtract(parentPos).normalize();

          // Calculate rotation quaternion from default bone direction to landmark direction
          const defaultDir = new BABYLON.Vector3(0, -1, 0); // bones typically point down
          const quat = BABYLON.Quaternion.FromUnitVectorsToRef(defaultDir, dir, new BABYLON.Quaternion());

          if (bone.getTransformNode()) {
            bone.getTransformNode().rotationQuaternion = quat;
          }
        }
      } catch (e) {
        // Silently handle bone rotation errors
      }
    }

    // Move avatar root based on hip center
    if (myAvatar) {
      const hipCenter = landmarkToWorld({
        x: (landmarks[23].x + landmarks[24].x) / 2,
        y: (landmarks[23].y + landmarks[24].y) / 2,
        z: (landmarks[23].z + landmarks[24].z) / 2,
      });
      myAvatar.position.x = hipCenter.x;
      myAvatar.position.z = hipCenter.z;
    }
  }

  // =====================================================================
  // OTHER PLAYERS — create/update/remove
  // =====================================================================
  function createOtherPlayerAvatar(playerId) {
    const joints = createProceduralAvatar(`other_${playerId}`);
    const lines = [];
    // Create line meshes for skeleton connections
    for (const [a, b] of SKELETON_CONNECTIONS) {
      const line = BABYLON.MeshBuilder.CreateLines(`other_${playerId}_line_${a}_${b}`, {
        points: [BABYLON.Vector3.Zero(), BABYLON.Vector3.Zero()],
        updatable: true,
      }, scene);
      line.color = new BABYLON.Color3(0.2, 0.8, 0.4);
      line.isVisible = false;
      lines.push({ a, b, mesh: line });
    }
    return { joints, lines };
  }

  function updateOtherPlayer(playerId, landmarks) {
    if (!landmarks || landmarks.length < 33) return;

    let playerData = otherPlayers.get(playerId);
    if (!playerData) {
      playerData = createOtherPlayerAvatar(playerId);
      otherPlayers.set(playerId, playerData);
    }

    // Update joint positions
    for (let i = 0; i < 33; i++) {
      const pos = landmarkToWorld(landmarks[i]);
      if (playerData.joints[i]) {
        playerData.joints[i].position = pos;
        playerData.joints[i].isVisible = true;
      }
    }

    // Update skeleton lines
    for (const lineData of playerData.lines) {
      const posA = landmarkToWorld(landmarks[lineData.a]);
      const posB = landmarkToWorld(landmarks[lineData.b]);
      try {
        lineData.mesh = BABYLON.MeshBuilder.CreateLines(null, {
          points: [posA, posB],
          instance: lineData.mesh,
        });
        lineData.mesh.isVisible = true;
      } catch (e) { /* line update failed, skip */ }
    }
  }

  function removeOtherPlayer(playerId) {
    const playerData = otherPlayers.get(playerId);
    if (!playerData) return;

    Object.values(playerData.joints).forEach(j => j.dispose());
    playerData.lines.forEach(l => l.mesh.dispose());
    otherPlayers.delete(playerId);
  }

  // =====================================================================
  // SOCKET EVENT HANDLERS
  // =====================================================================
  socket.on('welcome', (data) => {
    myPlayerId = data.playerId;
    myDisplayName = data.displayName;
    console.log(`[VRChat] Welcome ${myDisplayName} (${myPlayerId})`);
    updatePlayerList(data.players);
  });

  socket.on('playerJoined', (data) => {
    console.log(`[VRChat] ${data.displayName} joined`);
    addPlayerToList(data);
  });

  socket.on('playerLeft', (data) => {
    console.log(`[VRChat] ${data.displayName} left`);
    removeOtherPlayer(data.id);
    removePlayerFromList(data.id);
  });

  socket.on('playerMoved', (data) => {
    updateOtherPlayer(data.id, data.landMarkCurrent);
  });

  socket.on('sceneChanged', async (data) => {
    if (data.scene !== currentScene) {
      currentScene = data.scene;
      await loadEnvironment(currentScene);
      updateSceneButtons();
    }
  });

  // =====================================================================
  // RECEIVE TRACKING DATA FROM HUB (global namespace)
  // =====================================================================
  const hubSocket = io(); // connect to global namespace too
  hubSocket.on('trackingData', (data) => {
    currentLandmarks = data.landMarkCurrent;
    // Forward to /vrchat namespace for other players
    socket.emit('playerMoved', { landMarkCurrent: data.landMarkCurrent });
  });
  hubSocket.on('landMarkCurrent', (data) => {
    currentLandmarks = data;
    socket.emit('playerMoved', { landMarkCurrent: data });
  });

  // =====================================================================
  // UI: Player List
  // =====================================================================
  const playerListEl = document.getElementById('player-list');

  function updatePlayerList(players) {
    playerListEl.innerHTML = '';
    players.forEach(p => addPlayerToList(p));
  }

  function addPlayerToList(player) {
    const existing = playerListEl.querySelector(`[data-id="${player.id}"]`);
    if (existing) return;
    const li = document.createElement('li');
    li.className = 'player-item';
    li.dataset.id = player.id;
    li.innerHTML = `<span class="player-dot"></span>${player.displayName}${player.id === myPlayerId ? ' (You)' : ''}`;
    playerListEl.appendChild(li);
  }

  function removePlayerFromList(playerId) {
    const el = playerListEl.querySelector(`[data-id="${playerId}"]`);
    if (el) el.remove();
  }

  // =====================================================================
  // UI: Scene Selector
  // =====================================================================
  document.querySelectorAll('.scene-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sceneName = btn.dataset.scene;
      if (sceneName === currentScene) return;
      currentScene = sceneName;
      await loadEnvironment(sceneName);
      updateSceneButtons();
      socket.emit('changeScene', { scene: sceneName });
    });
  });

  function updateSceneButtons() {
    document.querySelectorAll('.scene-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.scene === currentScene);
    });
  }

  // =====================================================================
  // RENDER LOOP
  // =====================================================================
  async function main() {
    await createScene();

    engine.runRenderLoop(() => {
      // Apply latest landmarks to avatar
      if (currentLandmarks) {
        applyLandmarksToAvatar(currentLandmarks);
      }
      scene.render();
    });

    window.addEventListener('resize', () => engine.resize());
  }

  main().catch(err => console.error('[VRChat] Fatal:', err));

})();
