'use client';

import { useEffect, useRef, useState } from 'react';
import { ShadowSyncEngine } from '../lib/engine';

export default function Hub() {
  const [activeScreen, setActiveScreen] = useState('tracking'); // 'tracking', 'calibration', 'continue', 'menu'
  const [activeGameUrl, setActiveGameUrl] = useState(null);
  const [statusText, setStatusText] = useState('Initializing camera...');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [games, setGames] = useState([]);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [gameError, setGameError] = useState('');

  const videoRef = useRef(null);
  const skelCanvasRef = useRef(null);
  const miniVideoRef = useRef(null);
  const particlesRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Calibration state tracking
  const stateRef = useRef({
    isCalibrating: false,
    hasCalibrated: false,
    fullBodyStartTime: 0,
    bodyDetectedFrames: 0,
    calibratedHeight: 170
  });

  // Load particles
  useEffect(() => {
    const canvas = particlesRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let pts = [];
    
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    for (let i = 0; i < 80; i++) {
      pts.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 2 + 0.5,
        a: Math.random() * 0.3 + 0.05
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100,180,255,${p.a})`;
        ctx.fill();
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  // Initialize Engine
  useEffect(() => {
    if (!videoRef.current || !window.io) return;
    const socket = window.io();

    const skelLoop = () => {
      const skelCanvas = skelCanvasRef.current;
      if (!skelCanvas) return;
      const ctx = skelCanvas.getContext('2d');
      const wr = skelCanvas.parentElement;
      if (skelCanvas.width !== wr.clientWidth || skelCanvas.height !== wr.clientHeight) {
        skelCanvas.width = wr.clientWidth;
        skelCanvas.height = wr.clientHeight;
      }

      drawSkeleton(ctx, skelCanvas.width, skelCanvas.height);

      if (!stateRef.current.isCalibrating && !stateRef.current.hasCalibrated) {
        if (isEntireBodyInFrame()) {
          if (stateRef.current.fullBodyStartTime === 0) {
            stateRef.current.fullBodyStartTime = performance.now();
          } else if (performance.now() - stateRef.current.fullBodyStartTime >= 3000) {
            startCalibration();
          }
          const secs = Math.max(0, 3 - Math.floor((performance.now() - stateRef.current.fullBodyStartTime) / 1000));
          setStatusText(`Full body detected. Hold still... (${secs}s)`);
        } else {
          stateRef.current.fullBodyStartTime = 0;
          if (stateRef.current.bodyDetectedFrames > 0) {
            setStatusText('Body detected — ensure full body is in frame');
          }
        }
      }

      requestAnimationFrame(skelLoop);
    };

    ShadowSyncEngine.init(videoRef.current, socket, {
      onReady() {
        setIsCameraReady(true);
        setStatusText('Camera ready — step into frame');
        requestAnimationFrame(skelLoop);
      },
      onBodyDetected(detected) {
        if (detected) {
          stateRef.current.bodyDetectedFrames++;
          if (!stateRef.current.isCalibrating && stateRef.current.fullBodyStartTime === 0) {
            setStatusText('Body detected — ensure full body is in frame');
          }
        } else {
          stateRef.current.bodyDetectedFrames = 0;
          setStatusText('Step into frame...');
          stateRef.current.fullBodyStartTime = 0;
        }
      },
      onError(err) {
        setStatusText('Camera unavailable — ' + err);
      }
    });

  }, []);

  const isEntireBodyInFrame = () => {
    const lm = ShadowSyncEngine.getRawLandmarks();
    if (!lm || lm.length < 33) return false;
    if (lm[0].visibility > 0.6 && lm[27].visibility > 0.6 && lm[28].visibility > 0.6) {
      return true;
    }
    return false;
  };

  const SKEL_CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[28,30],[27,31],[28,32],[15,17],[15,19],[16,18],[16,20]
  ];

  const drawSkeleton = (ctx, w, h) => {
    const lm = ShadowSyncEngine.getRawLandmarks();
    ctx.clearRect(0, 0, w, h);
    if (!lm || lm.length < 33) return;

    ctx.strokeStyle = '#00ff66';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00ff66';
    ctx.shadowBlur = 6;
    for (const [a, b] of SKEL_CONNECTIONS) {
      const pA = lm[a], pB = lm[b];
      if (!pA || !pB || pA.visibility < 0.3 || pB.visibility < 0.3) continue;
      ctx.beginPath();
      ctx.moveTo(pA.x * w, pA.y * h);
      ctx.lineTo(pB.x * w, pB.y * h);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    for (let i = 0; i < 33; i++) {
      const p = lm[i];
      if (!p || p.visibility < 0.3) continue;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff3333';
      ctx.fill();
      ctx.strokeStyle = '#ff8888';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  };

  const startCalibration = () => {
    if (stateRef.current.isCalibrating) return;
    stateRef.current.isCalibrating = true;
    setActiveScreen('calibration');
    setCountdown(10);
    
    let currentCount = 10;
    const timer = setInterval(() => {
      currentCount--;
      setCountdown(currentCount);
      if (currentCount <= 0) {
        clearInterval(timer);
        finishCalibration();
      }
    }, 1000);
  };

  const finishCalibration = () => {
    stateRef.current.hasCalibrated = true;
    const lm = ShadowSyncEngine.getCurrentLandmarks();
    if (lm && lm.length >= 33) {
      const h = Math.abs(lm[0].y);
      let ch = Math.round(h * 100);
      if (ch < 80 || ch > 250) ch = 170;
      stateRef.current.calibratedHeight = ch;
    } else {
      stateRef.current.calibratedHeight = 170;
    }
    setActiveScreen('continue');
    if (videoRef.current && videoRef.current.srcObject && miniVideoRef.current) {
      miniVideoRef.current.srcObject = videoRef.current.srcObject;
    }
  };

  const loadGameMenu = async () => {
    setActiveScreen('menu');
    setIsLoadingGames(true);
    setGameError('');
    try {
      const res = await fetch('/api/games');
      const data = await res.json();
      setGames(data);
    } catch (e) {
      setGameError('Failed to load games');
    } finally {
      setIsLoadingGames(false);
    }
  };

  return (
    <>
      <canvas id="particles-canvas" ref={particlesRef}></canvas>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00d4ff"/>
            <stop offset="50%" stopColor="#3366ff"/>
            <stop offset="100%" stopColor="#8844ff"/>
          </linearGradient>
        </defs>
      </svg>

      {/* SCREEN 1: TRACKING */}
      <div className={`screen ${activeScreen === 'tracking' ? 'active' : ''}`} id="screen-tracking">
        <h1 className="hub-title">ShadowSync</h1>
        <p className="hub-subtitle">Full-Body Motion Capture Hub</p>
        <div className="webcam-wrapper">
          <video id="webcam" ref={videoRef} autoPlay playsInline muted></video>
          <canvas id="skeleton-canvas" ref={skelCanvasRef}></canvas>
          <div className={`webcam-overlay ${stateRef.current.bodyDetectedFrames > 0 ? 'hidden' : ''}`}>
            <p className="stepIn-text">STEP INTO FRAME</p>
          </div>
        </div>
        <div className="status-bar">
          <div className={`status-dot ${isCameraReady ? 'active' : ''}`}></div>
          <span>{statusText}</span>
        </div>
      </div>

      {/* SCREEN 2: CALIBRATION */}
      <div className={`screen ${activeScreen === 'calibration' ? 'active' : ''}`} id="screen-calibration">
        <p className="calibration-label">Calibrating</p>
        <div className="countdown-ring">
          <svg viewBox="0 0 220 220">
            <circle className="ring-bg" cx="110" cy="110" r="100" />
            <circle 
              className="ring-progress" 
              cx="110" cy="110" r="100" 
              style={{ strokeDasharray: 628, strokeDashoffset: 628 * (1 - (10 - countdown) / 10) }} 
            />
          </svg>
          <div className="countdown-number">{countdown}</div>
        </div>
        <p className="calibration-label" style={{ fontSize: '15px', color: 'var(--text-dim)' }}>
          Stand still with arms at your sides
        </p>
      </div>

      {/* SCREEN 3: CONTINUE */}
      <div className={`screen ${activeScreen === 'continue' ? 'active' : ''}`} id="screen-continue">
        <div className="cal-done-icon">✓</div>
        <button className="btn-continue" onClick={loadGameMenu}>Continue</button>
      </div>

      {/* SCREEN 4: GAME MENU */}
      <div className={`screen ${activeScreen === 'menu' ? 'active' : ''}`} id="screen-menu">
        <div>
          <h1 className="menu-title">Choose Your Game</h1>
          <p className="menu-subtitle">Select a game to launch</p>
        </div>
        <div className="game-grid">
          {isLoadingGames && <div className="loader"></div>}
          {gameError && <p style={{ color: '#ff4444', gridColumn: '1/-1', textAlign: 'center' }}>{gameError}</p>}
          {!isLoadingGames && !gameError && games.length === 0 && (
            <p style={{ color: 'var(--text-dim)', gridColumn: '1/-1', textAlign: 'center' }}>No games found</p>
          )}
          {games.map(g => (
            <button key={g.folder} className="game-card" onClick={() => setActiveGameUrl(g.htmlPath)}>
              {g.iconPath ? (
                <img className="game-card-icon" src={g.iconPath} alt={g.name} />
              ) : (
                <div className="game-card-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px' }}>🎮</div>
              )}
              <span className="game-card-name">{g.name}</span>
              <span className="game-card-play">▶ LAUNCH</span>
            </button>
          ))}
        </div>
      </div>

      {/* GAME IFRAME OVERLAY */}
      {activeGameUrl && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: '#000' }}>
          <iframe 
            src={activeGameUrl} 
            style={{ width: '100%', height: '100%', border: 'none' }} 
            title="ShadowSync Game"
          />
          <button 
            onClick={() => setActiveGameUrl(null)}
            style={{
              position: 'absolute', top: '16px', left: '16px', zIndex: 10000,
              fontFamily: 'var(--font-display)', fontSize: '14px', color: '#fff',
              background: 'rgba(200, 30, 30, 0.8)', border: '1px solid rgba(255, 100, 100, 0.5)',
              padding: '8px 20px', borderRadius: '8px', cursor: 'pointer', letterSpacing: '2px',
              textTransform: 'uppercase', transition: 'all 0.2s',
            }}
            onMouseOver={(e) => e.target.style.background = 'rgba(255, 40, 40, 0.9)'}
            onMouseOut={(e) => e.target.style.background = 'rgba(200, 30, 30, 0.8)'}
          >
            ← EXIT GAME
          </button>
        </div>
      )}

      <video 
        id="webcam-mini" 
        ref={miniVideoRef} 
        className={activeScreen === 'menu' || activeScreen === 'continue' ? 'visible' : ''} 
        autoPlay playsInline muted 
      />
    </>
  );
}
