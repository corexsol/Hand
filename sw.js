<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <title>Hand Tap → Success</title>

  <!-- PWA hooks (keep your sw.js & manifest as before) -->
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#030418" />
  <link rel="icon" href="icons/icon-192.png" sizes="192x192">
  <link rel="apple-touch-icon" href="icons/icon-192.png">

  <style>
    :root { --bg:#030418; --t:720ms; --e:cubic-bezier(.2,.8,.2,1); }

    /* Hardening */
    *{ -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; -webkit-tap-highlight-color:transparent; }
    html,body{ height:100%; margin:0; background:var(--bg); overflow:hidden; overscroll-behavior:none; font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif; }
    html,body,.stage,video,#hit{ touch-action:none; }

    /* Stage: blurred cover bg + crisp contain fg */
    .stage{ position:fixed; inset:0; background:var(--bg); }
    .stage video{ position:absolute; inset:0; width:100vw; height:100vh; }
    .stage .bg{
      object-fit:cover; transform:scale(1.15);
      filter:blur(12px) brightness(.7) saturate(1.08);
      transition:transform var(--t) var(--e), opacity var(--t) var(--e);
      z-index:0;
    }
    .stage .fg{
      object-fit:contain; background:transparent; transform:scale(1) translateZ(0);
      transition:transform 240ms var(--e), opacity var(--t) var(--e), filter var(--t) var(--e);
      z-index:1; will-change:transform,filter;
    }
    /* pressed (any fingers down) */
    .pressed .stage .fg{ transform:scale(1.03); filter:brightness(.98); }
    /* success in */
    .go .stage .fg{ transform:scale(1.06); filter:blur(2px) brightness(.9); transition:transform 520ms var(--e), filter 520ms var(--e); }
    /* return */
    .returning .stage .fg{ transform:scale(1); filter:none; }

    /* Fullscreen hitbox */
    #hit{ position:fixed; inset:0; z-index:2; background:transparent; }

    /* Success overlay */
    .success{
      position:fixed; inset:0; display:grid; place-items:center; text-align:center; z-index:4;
      color:#e8eefc; background:rgba(3,4,24,0);
      backdrop-filter:blur(0px) saturate(110%); -webkit-backdrop-filter:blur(0px) saturate(110%);
      padding:2rem; opacity:0; visibility:hidden; transform:scale(.985);
      transition:
        opacity var(--t) var(--e),
        transform var(--t) var(--e),
        visibility 0s linear var(--t),
        backdrop-filter 520ms var(--e),
        -webkit-backdrop-filter 520ms var(--e),
        background 520ms var(--e);
    }
    .go .success{
      opacity:1; visibility:visible; transform:scale(1);
      backdrop-filter:blur(12px) saturate(125%);
      -webkit-backdrop-filter:blur(12px) saturate(125%);
      background:rgba(3,4,24,.55);
    }

    .success h1{
      margin:0; letter-spacing:.02em; font-size:clamp(28px,5vw,80px); color:#eef3ff;
      text-shadow:
        0 0 6px rgba(120,150,255,.55),
        0 0 14px rgba(120,150,255,.45),
        0 0 34px rgba(120,150,255,.35),
        0 0 60px rgba(120,150,255,.25);
      opacity:0; transform:translateY(12px) scale(.97); filter:blur(10px);
      will-change:opacity,transform,filter,letter-spacing;
      animation:none;
    }
    /* Modern, smooth in/out for the title */
    .go .success h1{ animation: titleIn 680ms var(--e) forwards, neon 2600ms .3s ease-in-out infinite alternate; }
    .success.out h1{ animation: titleOut 420ms var(--e) forwards !important; }

    @keyframes titleIn{
      0%   { opacity:0; transform:translateY(12px) scale(.97); filter:blur(10px); letter-spacing:.08em; }
      60%  { opacity:1; transform:translateY(-2px) scale(1.015); filter:blur(0px); letter-spacing:.02em; }
      100% { opacity:1; transform:translateY(0) scale(1); filter:blur(0); letter-spacing:.02em; }
    }
    @keyframes titleOut{
      0%   { opacity:1; transform:translateY(0) scale(1); filter:blur(0); }
      100% { opacity:0; transform:translateY(10px) scale(.985); filter:blur(8px); }
    }
    @keyframes neon{
      0%{ text-shadow:0 0 6px rgba(120,150,255,.55),0 0 14px rgba(120,150,255,.45),0 0 34px rgba(120,150,255,.35),0 0 60px rgba(120,150,255,.25); }
      100%{ text-shadow:0 0 10px rgba(170,200,255,.8),0 0 24px rgba(170,200,255,.65),0 0 52px rgba(170,200,255,.5),0 0 96px rgba(170,200,255,.4); }
    }
  </style>
</head>
<body>
  <!-- Videos -->
  <div class="stage">
    <video class="bg" id="bgVid" src="assets/hand-loop.mp4" preload="auto" autoplay muted loop playsinline></video>
    <video class="fg" id="fgVid" src="assets/hand-loop.mp4" preload="auto" autoplay muted loop playsinline></video>
  </div>

  <!-- Hitbox (no hint text on scene 1) -->
  <div id="hit" aria-hidden="true"></div>

  <!-- Success -->
  <section class="success" id="success">
    <h1 id="title">تم التدشين بحمد الله</h1>
  </section>

  <script>
  // Prevent context menu
  addEventListener('contextmenu', e => e.preventDefault(), {capture:true});

  const fg = document.getElementById('fgVid');
  const bg = document.getElementById('bgVid');
  const hit = document.getElementById('hit');
  const success = document.getElementById('success');
  const title = document.getElementById('title');

  // Autoplay nudge
  const nudge = () => { fg.play().catch(()=>{}); bg.play?.().catch(()=>{}); };
  addEventListener('touchstart', nudge, { once:true, passive:false });
  addEventListener('pointerdown', nudge, { once:true, passive:false });

  // Minimal video sync
  let rs;
  function syncV(){
    if (Math.abs(fg.currentTime - bg.currentTime) > 0.15) bg.currentTime = fg.currentTime;
    if (fg.paused && !bg.paused) fg.play().catch(()=>{});
    if (!fg.paused && bg.paused) bg.play().catch(()=>{});
  }
  fg.addEventListener('timeupdate', () => { cancelAnimationFrame(rs); rs = requestAnimationFrame(syncV); });
  fg.addEventListener('play', () => { bg.play().catch(()=>{}); syncV(); });

  // Tap-to-trigger-on-release (transition only when last touch lifts)
  const BACK_LOCK_MS = 4000;
  let useTouch = false, touches = 0, backUnlock = 0;

  function pressOn(){
    if (!document.body.classList.contains('go'))
      document.body.classList.add('pressed');
  }
  function pressOff(){ document.body.classList.remove('pressed'); }

  function fireSuccess(){
    document.body.classList.add('go');
    pressOff();
    backUnlock = performance.now() + BACK_LOCK_MS;
  }

  // TOUCH path
  hit.addEventListener('touchstart', (e) => {
    useTouch = true;
    e.preventDefault();
    touches = e.touches.length;
    if (touches > 0) pressOn();
  }, {passive:false});

  function onTouchEnd(e){
    e.preventDefault();
    touches = e.touches.length;
    if (touches === 0){
      if (!document.body.classList.contains('go')) fireSuccess();
      else pressOff();
    }
  }
  hit.addEventListener('touchend', onTouchEnd, {passive:false});
  hit.addEventListener('touchcancel', onTouchEnd, {passive:false});

  // POINTER fallback
  const pset = new Set();
  hit.addEventListener('pointerdown', (e) => {
    if (useTouch) return;
    e.preventDefault();
    pset.add(e.pointerId);
    try { hit.setPointerCapture(e.pointerId); } catch(_){}
    pressOn();
  }, {passive:false});
  function onPointerUp(e){
    if (useTouch) return;
    pset.delete(e.pointerId);
    if (pset.size === 0){
      if (!document.body.classList.contains('go')) fireSuccess();
      else pressOff();
    }
  }
  hit.addEventListener('pointerup', onPointerUp, {passive:true});
  hit.addEventListener('pointercancel', onPointerUp, {passive:true});

  // Back from success via double-tap/click (after lock window)
  let lastTap = 0;
  function beginBack(){
    const t = performance.now();
    if (t < backUnlock) return;
    success.classList.add('out');
  }
  success.addEventListener('dblclick', beginBack);
  success.addEventListener('touchend', () => {
    const t = performance.now();
    if (t < backUnlock) return;
    if (t - lastTap < 320) beginBack();
    lastTap = t;
  }, {passive:true});

  // When title finishes OUT, reset scene 1 cleanly
  title.addEventListener('animationend', (e) => {
    if (e.animationName === 'titleOut' && success.classList.contains('out')){
      success.classList.remove('out');
      document.body.classList.remove('go');
      document.body.classList.add('returning');
      setTimeout(() => document.body.classList.remove('returning'), 720);
    }
  });

  // Fullscreen + portrait lock once
  addEventListener('pointerdown', async () => {
    const el = document.documentElement;
    (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)?.call(el);
    try { await screen.orientation.lock('portrait'); } catch(_){}
  }, { once:true, passive:true });

  // Register SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  }
  </script>
</body>
</html>
