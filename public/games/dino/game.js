// ==========================================
//  DINO RUNNER — Chrome Dino-style game
//  with ShadowSync motion-control support
// ==========================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- State ---
let gameState = 'start'; // start | playing | over
let score = 0;
let hiScore = parseInt(localStorage.getItem('dinoHi') || '0');
let frameCount = 0;
let gameSpeed = 8;
let gravity = 0.8;
let groundY;
let S = 1; // Scale factor — computed on resize

// --- Dino ---
const dino = { x: 80, y: 0, w: 44, h: 48, vy: 0, jumping: false, ducking: false, legFrame: 0 };

// --- World ---
let obstacles = [];
let clouds = [];
let stars = [];
let groundTiles = [];
let coins = [];
let coinsCollected = 0;
let nextObstacleIn = 80;
let nextCoinIn = 40;
let nightMode = false;

// --- Audio ---
const jumpSound = new Audio('asset/jump.mp3');
const coinSound = new Audio('asset/coin.mp3');
const deathSound = new Audio('asset/death.mp3');
jumpSound.volume = 0.5;
coinSound.volume = 0.6;
deathSound.volume = 0.7;

// --- Resize ---
function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    S = 1; // Reverted to original small size (scale = 1)
    groundY = canvas.height - Math.floor(80 * S);
    dino.w = Math.floor(44 * S);
    dino.h = dino.ducking ? Math.floor(30 * S) : Math.floor(48 * S);
    dino.x = Math.floor(80 * S);
    dino.y = groundY - dino.h;
    gravity = 0.8 * S;
    gameSpeed = Math.max(gameSpeed, 8);
}
resize();
window.addEventListener('resize', resize);

// Init clouds, stars & hills
for (let i = 0; i < 6; i++) clouds.push({ x: Math.random() * canvas.width, y: 30 + Math.random() * 70, w: 60 + Math.random() * 50 });
for (let i = 0; i < 50; i++) stars.push({ x: Math.random() * canvas.width, y: Math.random() * (canvas.height * 0.5), r: Math.random() * 2, twinkle: Math.random() * Math.PI * 2 });
let hills = [];
for (let i = 0; i < 8; i++) hills.push({ x: i * 200 + Math.random() * 100, w: 120 + Math.random() * 100, h: 30 + Math.random() * 40 });

// --- Drawing Helpers (Mario-Inspired Theme) ---
function drawDino() {
    ctx.save();
    // Scale the entire dino drawing by S
    ctx.translate(dino.x, dino.y);
    ctx.scale(S, S);
    const x = 0, y = 0;
    // Green Yoshi-like dino
    const body = nightMode ? '#66bb6a' : '#43a047';
    const belly = nightMode ? '#a5d6a7' : '#81c784';
    const shoes = '#e53935';
    ctx.fillStyle = body;

    if (dino.ducking) {
        ctx.fillRect(x, y + 28, 56, 20);
        ctx.fillRect(x + 44, y + 22, 16, 10);
        ctx.fillStyle = '#fff'; ctx.fillRect(x + 52, y + 24, 6, 4);
        ctx.fillStyle = '#111'; ctx.fillRect(x + 54, y + 25, 3, 3);
        ctx.fillStyle = belly; ctx.fillRect(x + 4, y + 34, 40, 10);
        ctx.fillStyle = shoes;
        if (dino.legFrame % 10 < 5) {
            ctx.fillRect(x + 8, y + 48, 8, 10);
            ctx.fillRect(x + 28, y + 48, 8, 6);
        } else {
            ctx.fillRect(x + 8, y + 48, 8, 6);
            ctx.fillRect(x + 28, y + 48, 8, 10);
        }
    } else {
        // Head
        ctx.fillRect(x + 14, y, 30, 20);
        ctx.fillRect(x + 24, y - 4, 20, 6);
        // Eye
        ctx.fillStyle = '#fff'; ctx.fillRect(x + 32, y + 4, 6, 6);
        ctx.fillStyle = '#111'; ctx.fillRect(x + 34, y + 6, 3, 3);
        // Cheek blush
        ctx.fillStyle = 'rgba(255,100,100,0.4)'; ctx.fillRect(x + 28, y + 12, 6, 4);
        ctx.fillStyle = body;
        // Body
        ctx.fillRect(x + 8, y + 18, 24, 22);
        ctx.fillRect(x + 4, y + 24, 8, 12);
        // Belly
        ctx.fillStyle = belly;
        ctx.fillRect(x + 12, y + 22, 16, 14);
        ctx.fillStyle = body;
        // Arm
        ctx.fillRect(x + 28, y + 22, 10, 4);
        // Tail
        ctx.fillRect(x - 2, y + 20, 12, 8);
        ctx.fillRect(x - 6, y + 18, 8, 6);
        // Legs (red shoes!)
        ctx.fillStyle = shoes;
        if (dino.jumping) {
            ctx.fillRect(x + 8, y + 40, 8, 10);
            ctx.fillRect(x + 22, y + 40, 8, 10);
        } else if (dino.legFrame % 10 < 5) {
            ctx.fillRect(x + 8, y + 40, 8, 12);
            ctx.fillRect(x + 22, y + 40, 8, 6);
        } else {
            ctx.fillRect(x + 8, y + 40, 8, 6);
            ctx.fillRect(x + 22, y + 40, 8, 12);
        }
    }
    ctx.restore();
}

function drawCactus(obs) {
    ctx.save();
    // Mario-style green pipe - draw at pipe position, scaled
    const x = obs.x, y = groundY - obs.h;
    const pipeGreen = nightMode ? '#2e7d32' : '#388e3c';
    const pipeDark = nightMode ? '#1b5e20' : '#2e7d32';
    const pipeLight = nightMode ? '#4caf50' : '#66bb6a';
    const w = obs.w;
    const h = obs.h;
    // Pipe body
    ctx.fillStyle = pipeGreen;
    ctx.fillRect(x, y + 12, w, h - 12);
    // Pipe rim (wider)
    ctx.fillStyle = pipeDark;
    ctx.fillRect(x - 4, y, w + 8, 14);
    // Highlight stripe
    ctx.fillStyle = pipeLight;
    ctx.fillRect(x + 4, y + 14, 5, h - 16);
    ctx.fillRect(x + 2, y + 3, w + 2, 4);
    // Dark edge
    ctx.fillStyle = pipeDark;
    ctx.fillRect(x + w - 6, y + 14, 5, h - 16);
    ctx.restore();
}

function drawBird(obs) {
    ctx.save();
    // Koopa-like flying enemy — scale to match
    ctx.translate(obs.x, obs.y);
    ctx.scale(S, S);
    // Shell
    ctx.fillStyle = nightMode ? '#ff8f00' : '#e65100';
    ctx.fillRect(2, 4, 18, 12);
    // Shell pattern
    ctx.fillStyle = nightMode ? '#ffb300' : '#ff9800';
    ctx.fillRect(6, 6, 6, 8);
    // Head
    ctx.fillStyle = '#fff9c4';
    ctx.fillRect(18, 4, 8, 8);
    // Eye
    ctx.fillStyle = '#111';
    ctx.fillRect(22, 6, 3, 3);
    // Wings
    ctx.fillStyle = '#fff';
    if (obs.wingFrame % 16 < 8) {
        ctx.fillRect(6, -4, 10, 6);
    } else {
        ctx.fillRect(6, 16, 10, 6);
    }
    ctx.restore();
}

function drawCoin(c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(S, S);
    // Draw spinning gold coin
    const width = 8 * Math.max(0.1, Math.abs(Math.sin(frameCount * 0.1)));
    ctx.fillStyle = '#ffb300'; // Gold border
    ctx.beginPath();
    ctx.ellipse(8, 8, width, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe082'; // Inner light
    ctx.beginPath();
    ctx.ellipse(8, 8, width * 0.6, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawGround() {
    // Mario brick ground
    const brickH = canvas.height - groundY;
    const grassH = Math.floor(6 * S);
    // Top grass layer
    ctx.fillStyle = nightMode ? '#2e7d32' : '#4caf50';
    ctx.fillRect(0, groundY, canvas.width, grassH);
    // Dirt/brick layer
    ctx.fillStyle = nightMode ? '#5d4037' : '#8d6e63';
    ctx.fillRect(0, groundY + grassH, canvas.width, brickH - grassH);
    // Brick pattern
    const brickW = Math.floor(24 * S), brickGap = Math.floor(2 * S);
    const rowH = Math.floor(14 * S);
    ctx.fillStyle = nightMode ? '#4e342e' : '#6d4c41';
    for (let row = 0; row < 3; row++) {
        const by = groundY + grassH + 2 + row * rowH;
        const offset = row % 2 === 0 ? 0 : brickW / 2;
        for (let bx = -brickW + offset; bx < canvas.width + brickW; bx += brickW + brickGap) {
            ctx.fillRect(bx, by, brickW, brickGap);
            ctx.fillRect(bx + brickW, groundY + grassH + 2, brickGap, rowH * 3);
        }
    }
}

function drawHills() {
    hills.forEach(h => {
        const hw = h.w * S;
        ctx.fillStyle = nightMode ? 'rgba(46,125,50,0.3)' : 'rgba(76,175,80,0.35)';
        ctx.beginPath();
        ctx.arc(h.x + hw / 2, groundY, hw / 2, Math.PI, 0);
        ctx.fill();
        // Highlight
        ctx.fillStyle = nightMode ? 'rgba(102,187,106,0.15)' : 'rgba(129,199,132,0.3)';
        ctx.beginPath();
        ctx.arc(h.x + hw / 2 - 10, groundY, hw / 3, Math.PI, 0);
        ctx.fill();
    });
}

function drawClouds() {
    ctx.fillStyle = nightMode ? 'rgba(200,200,255,0.12)' : '#fff';
    clouds.forEach(c => {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.scale(S, S);
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.arc(22, -8, 22, 0, Math.PI * 2);
        ctx.arc(46, 0, 18, 0, Math.PI * 2);
        ctx.arc(22, 4, 16, 0, Math.PI * 2);
        ctx.fill();
        // Eye dots on clouds
        if (!nightMode) {
            ctx.fillStyle = '#333';
            ctx.fillRect(12, -4, 3, 3);
            ctx.fillRect(30, -4, 3, 3);
            ctx.fillStyle = '#fff';
        }
        ctx.restore();
    });
}

function drawStars() {
    if (!nightMode) return;
    stars.forEach(s => {
        const alpha = 0.4 + 0.6 * Math.abs(Math.sin(s.twinkle + frameCount * 0.02));
        ctx.fillStyle = `rgba(255,255,200,${alpha})`;
        // 4-point star shape
        const sz = s.r + 1;
        ctx.fillRect(s.x, s.y - sz, 1, sz * 2 + 1);
        ctx.fillRect(s.x - sz, s.y, sz * 2 + 1, 1);
    });
}

function drawBackground() {
    // Mario-style sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    if (nightMode) {
        grad.addColorStop(0, '#0d0d2b');
        grad.addColorStop(0.4, '#1a1a4e');
        grad.addColorStop(0.8, '#0d1b3e');
        grad.addColorStop(1, '#162447');
    } else {
        grad.addColorStop(0, '#42a5f5');
        grad.addColorStop(0.5, '#64b5f6');
        grad.addColorStop(0.8, '#90caf9');
        grad.addColorStop(1, '#bbdefb');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// --- Score ---
function formatScore(n) { return String(Math.floor(n)).padStart(5, '0'); }

function updateHUD() {
    document.getElementById('current-score').textContent = formatScore(score);
    document.getElementById('hi-score').textContent = formatScore(hiScore);
    document.getElementById('coin-counter').textContent = '🪙 ' + coinsCollected;
}

// --- Spawning ---
function spawnObstacle() {
    const r = Math.random();
    if (score > 300 && r < 0.2) {
        // Bird
        const birdHeights = [Math.floor(30 * S), Math.floor(60 * S), Math.floor(100 * S)];
        const birdY = groundY - birdHeights[Math.floor(Math.random() * 3)];
        obstacles.push({ type: 'bird', x: canvas.width + 20, y: birdY, w: Math.floor(28 * S), h: Math.floor(18 * S), wingFrame: 0 });
    } else {
        const types = ['small', 'large', 'cluster'];
        const t = types[Math.floor(Math.random() * (score > 200 ? 3 : 2))];
        const h = t === 'small' ? Math.floor(50 * S) : t === 'large' ? Math.floor(70 * S) : Math.floor(75 * S);
        const w = t === 'small' ? Math.floor(24 * S) : t === 'large' ? Math.floor(34 * S) : Math.floor(50 * S);
        obstacles.push({ type: t, x: canvas.width + 20, y: 0, w, h });
    }
    nextObstacleIn = 50 + Math.random() * 60;
}

function initGround() {
    groundTiles = [];
    for (let x = 0; x < canvas.width + 200; x += 8 + Math.random() * 30) {
        groundTiles.push({ x, yOff: Math.random() * 10, w: 2 + Math.random() * 12 });
    }
}
initGround();

// --- Collision ---
function checkCollision() {
    const dx = dino.x + Math.floor(6 * S), dy = dino.y + Math.floor(4 * S);
    const dw = dino.ducking ? Math.floor(50 * S) : Math.floor(32 * S);
    const dh = dino.ducking ? Math.floor(24 * S) : Math.floor(44 * S);
    for (const obs of obstacles) {
        let ox, oy, ow, oh;
        if (obs.type === 'bird') {
            ox = obs.x; oy = obs.y; ow = obs.w; oh = obs.h;
        } else {
            ox = obs.x; oy = groundY - obs.h; ow = obs.w; oh = obs.h;
        }
        if (dx < ox + ow && dx + dw > ox && dy < oy + oh && dy + dh > oy) return true;
    }
    return false;
}

// --- Game Actions ---
function jump() {
    if (dino.jumping || gameState !== 'playing') return;
    dino.jumping = true;
    dino.vy = -16 * S;
    dino.ducking = false;
    
    // Play jump sound
    jumpSound.currentTime = 0;
    jumpSound.play().catch(() => {});
}

function duck(state) {
    if (dino.jumping) return;
    dino.ducking = state;
    if (state) {
        dino.h = Math.floor(30 * S);
        dino.y = groundY - dino.h;
    } else {
        dino.h = Math.floor(48 * S);
        dino.y = groundY - dino.h;
    }
}

function startGame() {
    if (gameState === 'playing') return;
    gameState = 'playing';
    score = 0;
    gameSpeed = 8;
    frameCount = 0;
    obstacles = [];
    coins = [];
    coinsCollected = 0;
    nightMode = false;
    dino.y = groundY - dino.h;
    dino.vy = 0;
    dino.jumping = false;
    dino.ducking = false;
    dino.h = 48;
    nextObstacleIn = 60;
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'none';
    updateHUD();
}

function gameOver() {
    gameState = 'over';
    
    // Play death sound
    deathSound.currentTime = 0;
    deathSound.play().catch(() => {});
    
    if (score > hiScore) {
        hiScore = Math.floor(score);
        localStorage.setItem('dinoHi', hiScore);
    }
    document.getElementById('final-score').textContent = formatScore(score);
    document.getElementById('best-score').textContent = formatScore(hiScore);
    document.getElementById('game-over-screen').style.display = 'flex';
    updateHUD();
}

// --- Input ---
document.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (gameState === 'start' || gameState === 'over') startGame();
        else jump();
    }
    if (e.code === 'ArrowDown') { e.preventDefault(); duck(true); }
});
document.addEventListener('keyup', e => {
    if (e.code === 'ArrowDown') duck(false);
});

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (gameState !== 'playing') startGame();
    else jump();
});

document.getElementById('restart-btn').addEventListener('click', startGame);

// --- ShadowSync Motion Control ---
// Uses imageLandmarks (normalized image coords, 0-1 range)
// Same approach as the Python/OpenCV subway surfer controller:
//   Y=0 top, Y=1 bottom. Shoulder goes UP = Y decreases.
//   Jump: avg_y < MID_Y - threshold
//   Duck: avg_y > MID_Y + threshold

// 1. Get the Session ID from the URL
const searchParams = new URLSearchParams(window.location.search);
const mySessionId = searchParams.get('session');

// 2. Connect to the local ShadowSync server
const socket = io();

// Motion state (same as Python code)
let MID_Y = null;          // Calibrated standing shoulder Y (normalized)
let calFrames = [];
let y_status = 'Standing'; // Standing | Jumping | Crouching
let lastJumpTime = 0;

// 3. Listen for the motion data
socket.on('trackingData', (data) => {
    // SECURITY: Ignore data from other players on the same server
    if (mySessionId && data.sessionId !== mySessionId) return;

    // Use imageLandmarks (normalized image coords, like Python's pose_landmarks)
    const landmarks = data.imageLandmarks;
    if (!landmarks || landmarks.length < 33) return;

    // Extract shoulders (same as Python: LEFT_SHOULDER=11, RIGHT_SHOULDER=12)
    const l_sh = landmarks[11];
    const r_sh = landmarks[12];
    if (!l_sh || !r_sh) return;

    // Average shoulder Y in normalized coords (0-1, top=0 bottom=1)
    const avg_y = (l_sh.y + r_sh.y) / 2;
    const now = Date.now();

    // --- Calibrate: record standing shoulder Y for ~1 second ---
    if (MID_Y === null) {
        calFrames.push(avg_y);
        if (calFrames.length >= 30) {
            MID_Y = calFrames.reduce((a, b) => a + b, 0) / calFrames.length;
            console.log('[Dino] ✓ Calibrated! MID_Y:', MID_Y.toFixed(4));
        }
        return;
    }

    // --- Jump & Duck detection ---
    // Lowered thresholds for higher sensitivity
    // Jump: < 0.04 (was 0.06)
    // Duck: > 0.08 (was 0.10)

    // DEBUG: Log every 15 frames to see tracking values
    if (!window._debugCount) window._debugCount = 0;
    window._debugCount++;
    if (window._debugCount % 15 === 0) {
        console.log(`[Dino Track] avg_y=${avg_y.toFixed(4)} | MID_Y=${MID_Y.toFixed(4)} | diff=${(MID_Y - avg_y).toFixed(4)} (needs >0.04 to jump)`);
    }

    if (avg_y < (MID_Y - 0.04)) {
        // Shoulder moved UP in camera → JUMP
        if (y_status !== 'Jumping' && now - lastJumpTime > 400) {
            lastJumpTime = now;
            if (gameState === 'start' || gameState === 'over') {
                startGame();
            } else if (gameState === 'playing' && !dino.jumping) {
                jump();
            }
            y_status = 'Jumping';
            console.log('JUMP TRIGGERED!');
        }
    } else if (avg_y > (MID_Y + 0.08)) {
        // Shoulder moved DOWN in camera → DUCK
        if (y_status !== 'Crouching' && gameState === 'playing') {
            duck(true);
            y_status = 'Crouching';
            console.log('DUCK TRIGGERED!');
        }
    } else {
        // Back to standing
        if (y_status === 'Crouching') {
            duck(false);
        }
        y_status = 'Standing';
    }
});

// --- Main Loop ---
function update() {
    if (gameState !== 'playing') return;
    frameCount++;
    dino.legFrame++;

    // Score
    score += gameSpeed * 0.05;
    if (frameCount % 6 === 0) updateHUD();

    // Speed up
    if (frameCount % 500 === 0) gameSpeed += 0.3;

    // Night mode toggle
    if (Math.floor(score) % 700 < 5 && score > 100) nightMode = !nightMode;

    // Jump physics
    if (dino.jumping) {
        dino.vy += gravity;
        dino.y += dino.vy;
        if (dino.y >= groundY - dino.h) {
            dino.y = groundY - dino.h;
            dino.jumping = false;
            dino.vy = 0;
        }
    }

    // Move obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.x -= gameSpeed;
        if (obs.type === 'bird') obs.wingFrame++;
        if (obs.x + obs.w < -20) { obstacles.splice(i, 1); }
    }

    // Move coins
    const dx = dino.x + Math.floor(6 * S);
    const dy = dino.y + Math.floor(4 * S);
    const dw = dino.ducking ? Math.floor(50 * S) : Math.floor(32 * S);
    const dh = dino.ducking ? Math.floor(24 * S) : Math.floor(44 * S);

    for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i];
        c.x -= gameSpeed;
        
        // Collision with dino
        if (dx < c.x + c.w && dx + dw > c.x && dy < c.y + c.h && dy + dh > c.y) {
            coinsCollected++;
            coins.splice(i, 1);
            updateHUD();
            
            // Play coin sound
            coinSound.currentTime = 0;
            coinSound.play().catch(() => {});
            
            continue;
        }

        if (c.x + c.w < -20) { coins.splice(i, 1); }
    }

    // Spawn
    nextObstacleIn--;
    if (nextObstacleIn <= 0) spawnObstacle();

    // Spawn Coins
    nextCoinIn--;
    if (nextCoinIn <= 0) {
        const coinY = groundY - Math.floor((40 + Math.random() * 80) * S);
        const count = 1 + Math.floor(Math.random() * 3); // 1 to 3 coins
        for(let j=0; j<count; j++) {
            coins.push({ x: canvas.width + 20 + j * 30 * S, y: coinY, w: 16 * S, h: 16 * S });
        }
        nextCoinIn = 60 + Math.random() * 80;
    }

    // Ground scroll
    groundTiles.forEach(t => {
        t.x -= gameSpeed;
        if (t.x < -20) { t.x = canvas.width + Math.random() * 40; t.w = 2 + Math.random() * 12; }
    });

    // Cloud scroll
    clouds.forEach(c => {
        c.x -= gameSpeed * 0.15;
        if (c.x < -80) { c.x = canvas.width + 60; c.y = 30 + Math.random() * 70; }
    });

    // Hills scroll (parallax — slower)
    hills.forEach(h => {
        h.x -= gameSpeed * 0.3;
        if (h.x + h.w < -50) { h.x = canvas.width + Math.random() * 100; h.w = 120 + Math.random() * 100; h.h = 30 + Math.random() * 40; }
    });

    // Collision
    if (checkCollision()) gameOver();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawStars();
    drawClouds();
    drawHills();
    drawGround();

    // Coins
    coins.forEach(c => drawCoin(c));

    // Obstacles
    obstacles.forEach(obs => {
        if (obs.type === 'bird') drawBird(obs);
        else drawCactus(obs);
    });

    // Dino
    if (gameState === 'playing' || gameState === 'over') drawDino();
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

loop();
