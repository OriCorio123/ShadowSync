/* ====================================================================
 *  SHADOWSYNC — FRUIT NINJA (Socket-Driven, Dual Blade, Particle Avatar)
 * ==================================================================== */

const searchParams = new URLSearchParams(window.location.search);
const isMobile = searchParams.get('device') === 'mobile';

const GAME_WIDTH = isMobile ? 1920 : 3840;
const GAME_HEIGHT = isMobile ? 1080 : 2160;
const GRAVITY = isMobile ? 1100 : 1800;
const SPAWN_INTERVAL_MIN = 1800, SPAWN_INTERVAL_MAX = 3000;
const SPAWN_COUNT_MIN = 1, SPAWN_COUNT_MAX = 4, BOMB_CHANCE = 0.15, BOMB_SCALE = 0.55;
const LAUNCH_VY_MIN = isMobile ? -1400 : -2500;
const LAUNCH_VY_MAX = isMobile ? -1000 : -1700;
const LAUNCH_VX_MIN = isMobile ? -300 : -500;
const LAUNCH_VX_MAX = isMobile ? 300 : 500;
const ANGULAR_VEL_MIN = -300, ANGULAR_VEL_MAX = 300;
const BLADE_TRAIL_DURATION = 280;
const BLADE_MAX_POINTS = isMobile ? 20 : 24;
const BLADE_MIN_WIDTH = 2;
const BLADE_MAX_WIDTH = isMobile ? 12 : 18;
const MIN_SWIPE_DISTANCE = isMobile ? 20 : 36;
const SWOOSH_VELOCITY_THRESHOLD = isMobile ? 600 : 1000;
const SWOOSH_COOLDOWN = 220;

const FRUIT_DATA = {
  apple:      { scale: 0.50, particleTint: 0xff2244, splashKey: 'splash_red' },
  banana:     { scale: 0.55, particleTint: 0xffee33, splashKey: 'splash_yellow' },
  coconut:    { scale: 0.50, particleTint: 0xeeeedd, splashKey: 'splash_transparent' },
  orange:     { scale: 0.50, particleTint: 0xff8833, splashKey: 'splash_orange' },
  pineapple:  { scale: 0.50, particleTint: 0xeecc00, splashKey: 'splash_yellow' },
  watermelon: { scale: 0.45, particleTint: 0xff3366, splashKey: 'splash_red' },
};
const FRUIT_KEYS = Object.keys(FRUIT_DATA);

// Socket-driven tracking state
const socket = io();
const tracking = {
  current: null, lag1: null, lag2: null,
  leftWrist: { x: -100, y: -100, detected: false },
  rightWrist: { x: -100, y: -100, detected: false },
  useMouse: false,
};

// Listen for tracking data from server
socket.on('landMarkCurrent', (data) => { 
  console.log('[FruitNinja] Received landMarkCurrent:', data);
  tracking.current = data; 
  updateWrists(data, 'current'); 
});
socket.on('landMarkLag1', (data) => { tracking.lag1 = data; });
socket.on('landMarkLag2', (data) => { tracking.lag2 = data; });
socket.on('trackingData', (data) => {
  console.log('[FruitNinja] Received trackingData');
  tracking.current = data.landMarkCurrent;
  tracking.lag1 = data.landMarkLag1;
  tracking.lag2 = data.landMarkLag2;
  updateWrists(data.landMarkCurrent, 'current');
});

function landmarkToScreen(lm, idx) {
  if (!lm || !lm[idx]) return null;
  const p = lm[idx];
  const PIXELS_PER_METER = isMobile ? 500 : 1000;
  const screenX = GAME_WIDTH / 2 + p.x * PIXELS_PER_METER;
  const screenY = GAME_HEIGHT + p.y * PIXELS_PER_METER; // y is negative up
  return { x: screenX, y: screenY };
}

function updateWrists(landmarks) {
  if (!landmarks || landmarks.length < 33) {
    tracking.leftWrist.detected = false;
    tracking.rightWrist.detected = false;
    return;
  }
  const lw = landmarkToScreen(landmarks, 15); // Left wrist
  const rw = landmarkToScreen(landmarks, 16); // Right wrist
  if (lw) { tracking.leftWrist.x = lw.x; tracking.leftWrist.y = lw.y; tracking.leftWrist.detected = true; }
  else { tracking.leftWrist.detected = false; }
  if (rw) { tracking.rightWrist.x = rw.x; tracking.rightWrist.y = rw.y; tracking.rightWrist.detected = true; }
  else { tracking.rightWrist.detected = false; }
}

// =====================================================================
// BOOT SCENE
// =====================================================================
class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }
  preload() {
    const cx = this.cameras.main.centerX, cy = this.cameras.main.centerY;
    const boxW = 800, boxH = 88;
    const pBox = this.add.graphics(); pBox.fillStyle(0x1a1a2e, 0.9); pBox.fillRoundedRect(cx-boxW/2, cy-boxH/2, boxW, boxH, 16);
    const pBar = this.add.graphics();
    const loadTxt = this.add.text(cx, cy-100, 'LOADING ASSETS…', { fontSize:'44px', fontFamily:'Arial', color:'#5599cc', letterSpacing:6 }).setOrigin(0.5);
    const pctTxt = this.add.text(cx, cy, '0 %', { fontSize:'40px', fontFamily:'Arial', color:'#ffffff' }).setOrigin(0.5);
    this.load.on('progress', v => { pBar.clear(); pBar.fillStyle(0x00aaff,1); pBar.fillRoundedRect(cx-boxW/2+12, cy-boxH/2+12, (boxW-24)*v, boxH-24, 8); pctTxt.setText(`${Math.round(v*100)} %`); });
    this.load.on('complete', () => { pBar.destroy(); pBox.destroy(); loadTxt.destroy(); pctTxt.destroy(); });

    const S = 'assets/sprites/', A = 'assets/sfx/', M = 'assets/music/';
    this.load.image('dojo_bg', S+'Dojo/Basic Dojo.png');
    this.load.image('blade_tex', S+'Blades/Basic Blade.png');
    for (const k of FRUIT_KEYS) {
      this.load.image(k, S+`Fruits/${k}.png`);
      this.load.image(k+'_half_1', S+`Fruits/${k}_half_1.png`);
      this.load.image(k+'_half_2', S+`Fruits/${k}_half_2.png`);
    }
    this.load.image('bomb', S+'Fruits/bomb.png');
    this.load.image('explosion', S+'Fruits/explosion.png');
    this.load.image('splash_red', S+'Fruits/splash_red.png');
    this.load.image('splash_orange', S+'Fruits/splash_orange.png');
    this.load.image('splash_yellow', S+'Fruits/splash_yellow.png');
    this.load.image('splash_transparent', S+'Fruits/splash_transparent.png');
    this.load.audio('mainMenu', M+'mainMenu.mp3');
    this.load.audio('explosion_sfx', A+'explosion.mp3');
    this.load.audio('knifeSlice', A+'knife-slice.mp3');
    this.load.audio('swooshHeavy', A+'swooshHeavy.mp3');
    this.load.audio('swooshLight1', A+'swooshLight1.mp3');
    this.load.audio('swooshLight2', A+'swooshLight2.mp3');
  }
  create() { this.scene.start('GameScene'); }
}

// =====================================================================
// GAME SCENE
// =====================================================================
class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    this.isGameOver = false;
    this.score = 0;
    this.lastSwooshTime = 0;

    // Avatar Particles Setup
    this.avatarParticles = [];
    const bodyParts = isMobile ? [
      { type: 'quad', nodes: [11, 12, 24, 23], count: 25 },
      { type: 'circle', center: 0, radiusNode: 8, count: 15 },
      { type: 'bone', nodes: [11, 13], count: 5, width: 25 },
      { type: 'bone', nodes: [13, 15], count: 4, width: 20 },
      { type: 'bone', nodes: [12, 14], count: 5, width: 25 },
      { type: 'bone', nodes: [14, 16], count: 4, width: 20 },
      { type: 'bone', nodes: [23, 25], count: 8, width: 35 },
      { type: 'bone', nodes: [25, 27], count: 6, width: 25 },
      { type: 'bone', nodes: [24, 26], count: 8, width: 35 },
      { type: 'bone', nodes: [26, 28], count: 6, width: 25 },
    ] : [
      { type: 'quad', nodes: [11, 12, 24, 23], count: 45 },
      { type: 'circle', center: 0, radiusNode: 8, count: 25 },
      { type: 'bone', nodes: [11, 13], count: 8, width: 35 },
      { type: 'bone', nodes: [13, 15], count: 6, width: 25 },
      { type: 'bone', nodes: [12, 14], count: 8, width: 35 },
      { type: 'bone', nodes: [14, 16], count: 6, width: 25 },
      { type: 'bone', nodes: [23, 25], count: 12, width: 45 },
      { type: 'bone', nodes: [25, 27], count: 10, width: 35 },
      { type: 'bone', nodes: [24, 26], count: 12, width: 45 },
      { type: 'bone', nodes: [26, 28], count: 10, width: 35 },
    ];

    for (const part of bodyParts) {
      for (let i = 0; i < part.count; i++) {
        let p = {
          type: part.type,
          x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2,
          size: Phaser.Math.Between(5, 12),
          phase: Math.random() * Math.PI * 2,
          speed: Phaser.Math.FloatBetween(0.1, 0.25)
        };
        if (part.type === 'quad') {
          p.nodes = part.nodes; p.u = Math.random(); p.v = Math.random();
        } else if (part.type === 'circle') {
          p.center = part.center; p.radiusNode = part.radiusNode;
          p.rScale = Math.sqrt(Math.random()); p.theta = Math.random() * 2 * Math.PI;
        } else if (part.type === 'bone') {
          p.nodes = part.nodes; p.t = Math.random(); p.offset = (Math.random() - 0.5) * part.width;
        }
        this.avatarParticles.push(p);
      }
    }

    // Dual blade trails
    this.leftTrail = [];
    this.rightTrail = [];

    // Background
    this.bg = this.add.image(GAME_WIDTH/2, GAME_HEIGHT/2, 'dojo_bg').setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setDepth(0);

    // Physics groups
    this.fruits = this.physics.add.group({ allowGravity:true, collideWorldBounds:false });
    this.debris = this.physics.add.group({ allowGravity:true, collideWorldBounds:false });

    // Particle dot texture
    const gfx = this.make.graphics({ add:false }); gfx.fillStyle(0xffffff,1); gfx.fillCircle(6,6,6); gfx.generateTexture('particle_dot',12,12); gfx.destroy();

    // Blade graphics
    this.bladeGfx = this.add.graphics().setDepth(50);

    // Avatar particle graphics
    this.avatarGfx = this.add.graphics().setDepth(3);

    // Score UI
    this.add.text(72, 40, 'SCORE', { fontSize:'44px', fontFamily:'Arial', color:'#88bbdd', letterSpacing:4 }).setDepth(100);
    this.scoreText = this.add.text(72, 100, '0', { fontSize:'116px', fontFamily:'Arial Black', color:'#ffffff', stroke:'#001133', strokeThickness:8 }).setDepth(100);

    // Tracking dots
    this.trackDotL = this.add.circle(GAME_WIDTH-140, 72, 14, 0xff4444).setDepth(110);
    this.trackDotR = this.add.circle(GAME_WIDTH-72, 72, 14, 0xff4444).setDepth(110);
    this.add.text(GAME_WIDTH-160, 100, 'L   R', { fontSize:'24px', fontFamily:'Arial', color:'#667788' }).setDepth(110);

    // Check for mouse fallback (no tracking data after 3s)
    this.time.delayedCall(3000, () => {
      if (!tracking.current) {
        tracking.useMouse = true;
        console.log('[FruitNinja] No tracking data — mouse fallback active');
      }
    });

    // Start gameplay
    this.bgMusic = this.sound.add('mainMenu', { loop:true, volume:0.25 });
    this.bgMusic.play();
    this.scheduleNextWave();
  }

  // ---- SPAWNING ----
  scheduleNextWave() {
    if (this.isGameOver) return;
    this.spawnTimer = this.time.delayedCall(Phaser.Math.Between(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_MAX), () => { this.spawnWave(); this.scheduleNextWave(); });
  }

  spawnWave() {
    if (this.isGameOver) return;
    const count = Phaser.Math.Between(SPAWN_COUNT_MIN, SPAWN_COUNT_MAX);
    for (let i = 0; i < count; i++) this.time.delayedCall(i * Phaser.Math.Between(50,280), () => { if (!this.isGameOver) this.spawnObject(); });
  }

  spawnObject() {
    const isBomb = Math.random() < BOMB_CHANCE;
    const paddingX = GAME_WIDTH * 0.2; // 20% padding on each side leaves the middle 60%
    const x = Phaser.Math.Between(paddingX, GAME_WIDTH - paddingX), y = GAME_HEIGHT + 70;
    const vx = Phaser.Math.Between(LAUNCH_VX_MIN, LAUNCH_VX_MAX), vy = Phaser.Math.Between(LAUNCH_VY_MIN, LAUNCH_VY_MAX);
    const ang = Phaser.Math.Between(ANGULAR_VEL_MIN, ANGULAR_VEL_MAX);
    let sprite;
    if (isBomb) { sprite = this.fruits.create(x,y,'bomb'); sprite.setScale(BOMB_SCALE); sprite.setData('isBomb',true); sprite.setData('fruitType','bomb'); }
    else { const k = FRUIT_KEYS[Phaser.Math.Between(0,FRUIT_KEYS.length-1)]; sprite = this.fruits.create(x,y,k); sprite.setScale(FRUIT_DATA[k].scale); sprite.setData('isBomb',false); sprite.setData('fruitType',k); }
    sprite.setData('sliced',false); sprite.setVelocity(vx,vy); sprite.setAngularVelocity(ang); sprite.setDepth(10);
  }

  // ---- PARTICLE AVATAR ----
  drawAvatar() {
    this.avatarGfx.clear();
    if (!tracking.current || tracking.current.length < 33) return;

    const lm = tracking.current;
    const time = this.time.now;

    // Skeleton connections for humanoid figure
    const connections = [[0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[28,30],[27,31],[28,32],[15,17],[15,19],[15,21],[16,18],[16,20],[16,22]];

    // Draw skeleton lines (50% visibility)
    this.avatarGfx.lineStyle(3, 0x00ffff, 0.50);
    for (const [a, b] of connections) {
      const pA = landmarkToScreen(lm, a), pB = landmarkToScreen(lm, b);
      if (pA && pB) this.avatarGfx.lineBetween(pA.x, pA.y, pB.x, pB.y);
    }

    for (const p of this.avatarParticles) {
      let targetX = p.x, targetY = p.y;
      
      if (p.type === 'quad') {
        const tl = landmarkToScreen(lm, p.nodes[0]);
        const tr = landmarkToScreen(lm, p.nodes[1]);
        const br = landmarkToScreen(lm, p.nodes[2]);
        const bl = landmarkToScreen(lm, p.nodes[3]);
        if (tl && tr && br && bl) {
          const topX = Phaser.Math.Linear(tl.x, tr.x, p.u);
          const topY = Phaser.Math.Linear(tl.y, tr.y, p.u);
          const botX = Phaser.Math.Linear(bl.x, br.x, p.u);
          const botY = Phaser.Math.Linear(bl.y, br.y, p.u);
          targetX = Phaser.Math.Linear(topX, botX, p.v);
          targetY = Phaser.Math.Linear(topY, botY, p.v);
        }
      } else if (p.type === 'circle') {
        const center = landmarkToScreen(lm, p.center);
        const edge = landmarkToScreen(lm, p.radiusNode);
        if (center && edge) {
          const radius = Math.hypot(edge.x - center.x, edge.y - center.y) * 1.6;
          targetX = center.x + Math.cos(p.theta) * radius * p.rScale;
          targetY = center.y + Math.sin(p.theta) * radius * p.rScale;
        }
      } else if (p.type === 'bone') {
        const a = landmarkToScreen(lm, p.nodes[0]);
        const b = landmarkToScreen(lm, p.nodes[1]);
        if (a && b) {
          const baseTargetX = Phaser.Math.Linear(a.x, b.x, p.t);
          const baseTargetY = Phaser.Math.Linear(a.y, b.y, p.t);
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          targetX = baseTargetX + Math.cos(angle + Math.PI/2) * p.offset;
          targetY = baseTargetY + Math.sin(angle + Math.PI/2) * p.offset;
        }
      }

      // Floating sine wave offset
      targetX += Math.cos(time * 0.002 + p.phase) * 15;
      targetY += Math.sin(time * 0.003 + p.phase) * 15;

      // Smooth follow
      p.x += (targetX - p.x) * p.speed;
      p.y += (targetY - p.y) * p.speed;

      // Draw particle with pulsing
      const pulse = 0.5 + 0.5 * Math.sin(time * 0.005 + p.phase);
      const size = p.size * (0.7 + 0.5 * pulse);
      
      // Outer glow
      this.avatarGfx.fillStyle(0x00ffff, 0.15);
      this.avatarGfx.fillCircle(p.x, p.y, size * 2.5);
      
      // Core
      this.avatarGfx.fillStyle(0xccffff, 0.8);
      this.avatarGfx.fillCircle(p.x, p.y, size);
    }
  }

  // ---- DUAL BLADE TRAILS ----
  updateBlade(trail, wrist) {
    const now = Date.now();
    if (wrist.detected) trail.push({ x: wrist.x, y: wrist.y, time: now });
    while (trail.length > 0 && now - trail[0].time > BLADE_TRAIL_DURATION) trail.shift();
    while (trail.length > BLADE_MAX_POINTS) trail.shift();
  }

  drawBladeTrail(trail, hue) {
    if (trail.length < 2) return;
    const len = trail.length;
    for (let i = 1; i < len; i++) {
      const prev = trail[i-1], curr = trail[i], t = i/(len-1);
      const w = BLADE_MIN_WIDTH + t * (BLADE_MAX_WIDTH - BLADE_MIN_WIDTH);
      // Outer glow
      this.bladeGfx.lineStyle(w+18, hue === 'left' ? 0xcc4400 : 0x0044cc, t*0.12);
      this.bladeGfx.lineBetween(prev.x, prev.y, curr.x, curr.y);
      // Mid
      this.bladeGfx.lineStyle(w+7, hue === 'left' ? 0xff8822 : 0x22aaff, t*0.4);
      this.bladeGfx.lineBetween(prev.x, prev.y, curr.x, curr.y);
      // Core
      this.bladeGfx.lineStyle(w, hue === 'left' ? 0xffeedd : 0xeeffff, t*0.92);
      this.bladeGfx.lineBetween(prev.x, prev.y, curr.x, curr.y);
    }
    // Tip dot
    const tip = trail[len-1];
    this.bladeGfx.fillStyle(hue === 'left' ? 0xff8822 : 0x22aaff, 0.25);
    this.bladeGfx.fillCircle(tip.x, tip.y, 40);
    this.bladeGfx.fillStyle(0xffffff, 0.7);
    this.bladeGfx.fillCircle(tip.x, tip.y, 10);
  }

  // ---- COLLISION ----
  checkTrailCollisions(trail) {
    if (trail.length < 2) return;
    const numSegs = trail.length - 1, segsToCheck = Math.min(3, numSegs), firstSeg = numSegs - segsToCheck;
    const newest = trail[trail.length-1], oldest = trail[firstSeg];
    if (Math.hypot(newest.x-oldest.x, newest.y-oldest.y) < MIN_SWIPE_DISTANCE) return;
    const children = this.fruits.getChildren().slice();
    for (const obj of children) {
      if (!obj || !obj.active || obj.getData('sliced')) continue;
      const r = obj.displayWidth * 0.45;
      for (let i = firstSeg; i < numSegs; i++) {
        if (lineCircleIntersect(trail[i].x, trail[i].y, trail[i+1].x, trail[i+1].y, obj.x, obj.y, r)) {
          if (obj.getData('isBomb')) this.hitBomb(obj); else this.sliceFruit(obj);
          break;
        }
      }
    }
  }

  // ---- SLICE FRUIT ----
  sliceFruit(fruit) {
    const type = fruit.getData('fruitType'), data = FRUIT_DATA[type];
    const x = fruit.x, y = fruit.y, vx = fruit.body.velocity.x, vy = fruit.body.velocity.y;
    fruit.setData('sliced',true); fruit.destroy();
    this.sound.play('knifeSlice', { volume:0.55 });

    const h1 = this.debris.create(x-15, y, type+'_half_1'); h1.setScale(data.scale); h1.setVelocity(vx-220, vy-120); h1.setAngularVelocity(Phaser.Math.Between(-500,-250)); h1.setDepth(20);
    const h2 = this.debris.create(x+15, y, type+'_half_2'); h2.setScale(data.scale); h2.setVelocity(vx+220, vy-120); h2.setAngularVelocity(Phaser.Math.Between(250,500)); h2.setDepth(20);
    this.tweens.add({ targets:[h1,h2], alpha:0, delay:600, duration:400 });

    // Splash
    const splash = this.add.sprite(x, y, data.splashKey).setScale(0.05).setDepth(8).setAlpha(0.85);
    this.tweens.add({ targets:splash, scaleX:0.28, scaleY:0.28, alpha:0, duration:650, ease:'Power2', onComplete:()=>splash.destroy() });

    // Juice particles
    const em = this.add.particles(x, y, 'particle_dot', { speed:{min:120,max:380}, angle:{min:0,max:360}, scale:{start:1.1,end:0}, alpha:{start:0.9,end:0}, lifespan:550, gravityY:450, tint:data.particleTint, emitting:false });
    em.setDepth(22); em.explode(18); this.time.delayedCall(650, ()=>{ if(em) em.destroy(); });

    this.score += 1; this.scoreText.setText(this.score.toString());
    // Floating +1
    const popup = this.add.text(x, y-20, '+1', { fontSize:'84px', fontFamily:'Arial Black', color:'#ffffff', stroke:'#002244', strokeThickness:10 }).setOrigin(0.5).setDepth(90);
    this.tweens.add({ targets:popup, y:y-200, alpha:0, duration:750, ease:'Power2', onComplete:()=>popup.destroy() });
  }

  // ---- BOMB ----
  hitBomb(bomb) {
    if (this.isGameOver) return;
    const x = bomb.x, y = bomb.y; bomb.setData('sliced',true); bomb.destroy();
    this.sound.play('explosion_sfx', { volume:0.75 });
    const boom = this.add.sprite(x, y, 'explosion').setScale(0.25).setDepth(30);
    this.tweens.add({ targets:boom, scaleX:0.65, scaleY:0.65, alpha:0, duration:650, ease:'Power2', onComplete:()=>boom.destroy() });
    this.cameras.main.shake(400, 0.025);
    this.triggerGameOver();
  }

  // ---- GAME OVER ----
  triggerGameOver() {
    this.isGameOver = true;
    if (this.spawnTimer) this.spawnTimer.remove();
    if (this.bgMusic && this.bgMusic.isPlaying) this.tweens.add({ targets:this.bgMusic, volume:0, duration:1200, onComplete:()=>this.bgMusic.stop() });

    const flash = this.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH, GAME_HEIGHT, 0xff0000, 0.45).setDepth(89);
    this.tweens.add({ targets:flash, alpha:0, duration:500, onComplete:()=>flash.destroy() });

    this.time.delayedCall(550, () => {
      const ov = this.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0).setDepth(100);
      this.tweens.add({ targets:ov, alpha:0.72, duration:500 });

      const goTxt = this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2-180, 'GAME OVER', { fontSize:'192px', fontFamily:'Arial Black', color:'#ff2222', stroke:'#440000', strokeThickness:16 }).setOrigin(0.5).setDepth(101).setAlpha(0).setScale(2);
      this.tweens.add({ targets:goTxt, alpha:1, scaleX:1, scaleY:1, duration:550, ease:'Back.easeOut' });

      const fScore = this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2+40, `Final Score: ${this.score}`, { fontSize:'96px', fontFamily:'Arial', color:'#ffffff' }).setOrigin(0.5).setDepth(101).setAlpha(0);
      this.tweens.add({ targets:fScore, alpha:1, duration:450, delay:250 });

      const rBtn = this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2+240, 'RESTART', { fontSize:'84px', fontFamily:'Arial Black', color:'#00ccff', backgroundColor:'#0d1b33', padding:{left:72,right:72,top:28,bottom:28} }).setOrigin(0.5).setDepth(101).setAlpha(0).setInteractive({useHandCursor:true});
      this.tweens.add({ targets:rBtn, alpha:1, duration:450, delay:450 });
      rBtn.on('pointerover', ()=>rBtn.setStyle({color:'#ffffff',backgroundColor:'#1a3366'}));
      rBtn.on('pointerout', ()=>rBtn.setStyle({color:'#00ccff',backgroundColor:'#0d1b33'}));
      rBtn.on('pointerdown', ()=>{ this.sound.stopAll(); this.scene.restart(); });
    });
  }

  // ---- SWOOSH SOUND ----
  checkSwoosh(trail) {
    if (trail.length < 2) return;
    const now = Date.now(), p1 = trail[trail.length-2], p2 = trail[trail.length-1];
    const dt = Math.max((p2.time-p1.time)/1000, 0.001);
    const vel = Math.hypot(p2.x-p1.x, p2.y-p1.y) / dt;
    if (vel > SWOOSH_VELOCITY_THRESHOLD && now - this.lastSwooshTime > SWOOSH_COOLDOWN) {
      const keys = ['swooshHeavy','swooshLight1','swooshLight2'];
      this.sound.play(keys[Math.floor(Math.random()*keys.length)], {volume:0.35});
      this.lastSwooshTime = now;
    }
  }

  // ---- CLEANUP ----
  cleanupOffscreen() {
    const cut = GAME_HEIGHT + 200;
    this.fruits.getChildren().slice().forEach(o => { if(o&&o.active&&o.y>cut) o.destroy(); });
    this.debris.getChildren().slice().forEach(o => { if(o&&o.active&&o.y>cut) o.destroy(); });
  }

  // ---- UPDATE LOOP ----
  update() {
    // Mouse fallback
    if (tracking.useMouse) {
      const ptr = this.input.activePointer;
      tracking.rightWrist.x = ptr.worldX; tracking.rightWrist.y = ptr.worldY; tracking.rightWrist.detected = true;
    }

    // Update tracking indicators
    this.trackDotL.setFillStyle(tracking.leftWrist.detected ? 0xff8822 : 0xff4444);
    this.trackDotR.setFillStyle(tracking.rightWrist.detected ? 0x22aaff : 0xff4444);

    // Update blade trails
    this.updateBlade(this.leftTrail, tracking.leftWrist);
    this.updateBlade(this.rightTrail, tracking.rightWrist);

    // Draw blades
    this.bladeGfx.clear();
    this.drawBladeTrail(this.leftTrail, 'left');
    this.drawBladeTrail(this.rightTrail, 'right');

    // Draw particle avatar
    this.drawAvatar();

    // Collisions & sounds
    if (!this.isGameOver) {
      this.checkTrailCollisions(this.leftTrail);
      this.checkTrailCollisions(this.rightTrail);
      this.checkSwoosh(this.leftTrail);
      this.checkSwoosh(this.rightTrail);
    }

    this.cleanupOffscreen();
  }
}

// =====================================================================
// UTILITY: Line-Circle Intersection
// =====================================================================
function lineCircleIntersect(x1,y1,x2,y2,cx,cy,r) {
  const dx=x2-x1, dy=y2-y1, fx=cx-x1, fy=cy-y1, lenSq=dx*dx+dy*dy;
  if (lenSq < 0.0001) return (fx*fx+fy*fy) <= r*r;
  let t = (fx*dx+fy*dy)/lenSq; t = Math.max(0, Math.min(1, t));
  const closestX=x1+t*dx, closestY=y1+t*dy, distX=cx-closestX, distY=cy-closestY;
  return (distX*distX+distY*distY) <= r*r;
}

// =====================================================================
// PHASER INIT
// =====================================================================
const game = new Phaser.Game({
  type: Phaser.AUTO, width: GAME_WIDTH, height: GAME_HEIGHT,
  parent: 'game-container', backgroundColor: '#0a0a1a',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default:'arcade', arcade:{ gravity:{y:GRAVITY}, debug:false } },
  audio: { disableWebAudio:false },
  scene: [BootScene, GameScene],
});
