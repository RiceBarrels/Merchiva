// ═══════════════════════════════════════════════════════════
// Merchiva — Download page (animated, multi-platform)
// Reuses Merchiva brand vocab from home.jsx / pricing.jsx.
// ═══════════════════════════════════════════════════════════

const { useState: dUS, useEffect: dUE, useRef: dUR, useMemo: dUM } = React;

const D = {
  bg:       '#f0eee9',
  bgWarm:   '#e8e4dc',
  paper:    '#ffffff',
  surface:  '#fafaf9',
  panel:    '#f5f5f4',
  ink:      '#0c0a09',
  inkSoft:  '#17120f',
  text:     '#1c1917',
  text2:    '#44403c',
  text3:    '#57534e',
  sec:      '#78716c',
  ter:      '#a8a29e',
  border:   '#e0ddd6',
  borderD:  '#cbc7bd',
  good:     '#059669',
  bad:      '#b91c1c',
  accent:   'oklch(0.55 0.09 55)',
  accentSoft: 'oklch(0.92 0.04 65)',
  mono:     "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  sans:     "'Inter', ui-sans-serif, system-ui, sans-serif",
};

// ─── keyframes ─────────────────────────────────────────────
(function injectDK(){
  if (document.getElementById('mv-dl-kf')) return;
  const s = document.createElement('style');
  s.id = 'mv-dl-kf';
  s.textContent = `
    @keyframes dBlink { 0%, 50% { opacity:1 } 50.01%, 100% { opacity:0 } }
    @keyframes dDrift { from { transform: translate3d(0,0,0); } to { transform: translate3d(-40px,-40px,0); } }
    @keyframes dFadeUp { from { opacity:0; transform: translateY(14px); } to { opacity:1; transform: none; } }
    @keyframes dLetterIn { from { opacity:0; transform: translateY(40px) scale(0.96); filter: blur(8px); } to { opacity:1; transform:none; filter:none; } }
    @keyframes dGlow { 0%,100% { box-shadow:0 0 0 0 rgba(217,119,6,0); } 50% { box-shadow:0 0 0 8px rgba(217,119,6,0.15); } }
    @keyframes dArrowDown { 0% { transform: translateY(-14px); opacity:0; } 30% { opacity:1; } 100% { transform: translateY(14px); opacity:0; } }
    @keyframes dProgressShine { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    @keyframes dPulse { 0%,100% { transform: scale(1); opacity:1 } 50% { transform: scale(1.04); opacity:.7 } }
    @keyframes dScanY { 0% { transform: translateY(-10%); opacity:0; } 10% { opacity:1; } 90% { opacity:1; } 100% { transform: translateY(110%); opacity:0; } }
    @keyframes dSpin { to { transform: rotate(360deg); } }
    @keyframes dMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    @keyframes dSweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
    .d-reveal { opacity:0; transform: translateY(24px); transition: opacity 700ms cubic-bezier(.2,.8,.2,1), transform 700ms cubic-bezier(.2,.8,.2,1); }
    .d-reveal.in { opacity:1; transform:none; }
    .d-reveal[data-d="1"] { transition-delay: 80ms; }
    .d-reveal[data-d="2"] { transition-delay: 160ms; }
    .d-reveal[data-d="3"] { transition-delay: 240ms; }
    .d-reveal[data-d="4"] { transition-delay: 320ms; }
    .d-reveal[data-d="5"] { transition-delay: 400ms; }
    html { scroll-behavior: smooth; }
    ::selection { background: ${D.ink}; color: ${D.bg}; }
  `;
  document.head.appendChild(s);
})();

// ─── hooks ─────────────────────────────────────────────────
function useTick(fps=24, run=true) {
  const [, set] = dUS(0);
  dUE(() => {
    if (!run) return;
    const itv = 1000/fps; let last = performance.now(); let raf;
    const loop = (t) => { if (t-last>=itv) { last=t; set(x => (x+1)%1e9); } raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fps,run]);
}
function useReveal() {
  dUE(() => {
    const els = document.querySelectorAll('.d-reveal');
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}
function useMouse() {
  const [m, set] = dUS({ x: 0.5, y: 0.5 });
  dUE(() => {
    const onMove = e => set({ x: e.clientX/window.innerWidth, y: e.clientY/window.innerHeight });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  return m;
}

// ─── brand bits ────────────────────────────────────────────
function NotchM({ size=28, fg=D.ink, bg='transparent' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ background:bg, borderRadius:3, display:'block' }}>
      <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" fill={fg}/>
    </svg>
  );
}
function Wordmark({ size=22, color=D.ink, weight=600, ls=-1.2 }) {
  return <span style={{ fontFamily:D.sans, fontWeight:weight, fontSize:size, color, letterSpacing:ls, lineHeight:1 }}>Merchiva</span>;
}
function MonoTag({ children, color=D.sec, border=true }) {
  return (
    <span style={{
      fontFamily:D.mono, fontSize:10.5, color, letterSpacing:0.4, textTransform:'uppercase',
      border: border ? `1px solid ${D.border}` : 'none',
      padding: border ? '4px 8px' : 0, borderRadius:3, background: border ? D.paper : 'transparent',
      display:'inline-flex', alignItems:'center', gap:6,
    }}>{children}</span>
  );
}
function DotLeader({ color=D.borderD }) {
  return <div style={{ flex:1, height:1, borderTop:`1px dashed ${color}`, transform:'translateY(-2px)' }}/>;
}

// ═══════════════════════════════════════════════════════════
// NAV
// ═══════════════════════════════════════════════════════════
function Nav() {
  const [scrolled, setScrolled] = dUS(false);
  dUE(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive:true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <nav style={{
      position:'fixed', top:0, left:0, right:0, zIndex:100, padding:'14px 32px',
      transition:'background 240ms ease, border-color 240ms ease, backdrop-filter 240ms ease',
      background: scrolled ? 'rgba(240,238,233,0.78)' : 'transparent',
      backdropFilter: scrolled ? 'saturate(140%) blur(14px)' : 'none',
      WebkitBackdropFilter: scrolled ? 'saturate(140%) blur(14px)' : 'none',
      borderBottom: `1px solid ${scrolled ? D.border : 'transparent'}`,
    }}>
      <div style={{ maxWidth:1280, margin:'0 auto', display:'flex', alignItems:'center', gap:32 }}>
        <a href="Home.html" style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none', color:D.ink }}>
          <NotchM size={22}/><Wordmark size={17} ls={-0.8}/>
        </a>
        <div style={{ display:'flex', gap:24, marginLeft:24 }}>
          {[['Forecast','Home.html#product'],['Modules','Home.html#modules'],['Pricing','Pricing.html'],['Download','#'],['Changelog','#changelog']].map(([x,h]) => (
            <a key={x} href={h} style={{
              fontSize:13, color: x==='Download'? D.ink : D.text3, textDecoration:'none',
              fontWeight: x==='Download'? 600 : 500, letterSpacing:-0.1,
            }}>{x}</a>
          ))}
        </div>
        <div style={{ flex:1 }}/>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontFamily:D.mono, fontSize:10.5, color:D.sec, letterSpacing:0.3 }}>
            v3.4.2 <span style={{ color:D.good }}>●</span> shipped 14h ago
          </span>
          <a href="#" style={{ fontSize:13, color:D.text2, textDecoration:'none', fontWeight:500, padding:'6px 10px' }}>Sign in</a>
          <a href="#hero-cta" style={{
            fontSize:13, fontWeight:500, color:'#fff', background:D.ink, textDecoration:'none',
            padding:'8px 14px', borderRadius:4, letterSpacing:-0.1,
            display:'inline-flex', alignItems:'center', gap:6,
          }}>Start free <span style={{ fontFamily:D.mono, fontSize:11, opacity:0.7 }}>→</span></a>
        </div>
      </div>
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════
// PLATFORM DATA
// ═══════════════════════════════════════════════════════════
const PLATFORMS = [
  { id:'macos',   label:'macOS',    sub:'Apple silicon · Intel', file:'Merchiva-3.4.2.dmg',   size:'118 MB', ext:'.dmg',  shaTail:'a3f9' },
  { id:'windows', label:'Windows',  sub:'10 · 11 · ARM64',       file:'Merchiva-3.4.2.exe',   size:'142 MB', ext:'.exe',  shaTail:'7c11' },
  { id:'linux',   label:'Linux',    sub:'.deb · .AppImage',      file:'merchiva_3.4.2.deb',   size:'126 MB', ext:'.deb',  shaTail:'1e88' },
  { id:'ios',     label:'iOS',      sub:'iPhone · iPad · 16+',   file:'on the App Store',     size:'94 MB',  ext:'app',   shaTail:'—'    },
  { id:'android', label:'Android',  sub:'10+ · 64-bit',          file:'on Google Play',       size:'88 MB',  ext:'apk',   shaTail:'—'    },
  { id:'web',     label:'Web',      sub:'Chrome · Safari · FF',  file:'app.merchiva.app',     size:'no install', ext:'pwa', shaTail:'—' },
];

// platform glyph — abstract, original; no copyrighted marks
function PlatformGlyph({ id, size=28, color=D.ink }) {
  const s = { width:size, height:size, display:'block' };
  const stroke = color;
  switch (id) {
    case 'macos': return (
      <svg viewBox="0 0 32 32" style={s}>
        <rect x="3" y="6" width="26" height="16" rx="2" fill="none" stroke={stroke} strokeWidth="1.8"/>
        <line x1="11" y1="26" x2="21" y2="26" stroke={stroke} strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="13" y1="22" x2="13" y2="26" stroke={stroke} strokeWidth="1.8"/>
        <line x1="19" y1="22" x2="19" y2="26" stroke={stroke} strokeWidth="1.8"/>
      </svg>
    );
    case 'windows': return (
      <svg viewBox="0 0 32 32" style={s}>
        <rect x="4" y="5" width="11" height="11" fill={stroke}/>
        <rect x="17" y="5" width="11" height="11" fill={stroke}/>
        <rect x="4" y="18" width="11" height="11" fill={stroke}/>
        <rect x="17" y="18" width="11" height="11" fill={stroke}/>
      </svg>
    );
    case 'linux': return (
      <svg viewBox="0 0 32 32" style={s}>
        <rect x="4" y="4" width="24" height="24" rx="3" fill="none" stroke={stroke} strokeWidth="1.8"/>
        <path d="M10 22 L16 10 L22 22" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round"/>
        <line x1="13" y1="16" x2="19" y2="16" stroke={stroke} strokeWidth="1.5"/>
      </svg>
    );
    case 'ios': return (
      <svg viewBox="0 0 32 32" style={s}>
        <rect x="9" y="3" width="14" height="26" rx="3" fill="none" stroke={stroke} strokeWidth="1.8"/>
        <line x1="14" y1="6" x2="18" y2="6" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="16" cy="25" r="1.2" fill={stroke}/>
      </svg>
    );
    case 'android': return (
      <svg viewBox="0 0 32 32" style={s}>
        <path d="M6 14 Q16 5 26 14 L26 22 L6 22 Z" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round"/>
        <circle cx="12" cy="17" r="1.4" fill={stroke}/>
        <circle cx="20" cy="17" r="1.4" fill={stroke}/>
        <line x1="10" y1="9" x2="8" y2="6" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="22" y1="9" x2="24" y2="6" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
    case 'web': return (
      <svg viewBox="0 0 32 32" style={s}>
        <circle cx="16" cy="16" r="12" fill="none" stroke={stroke} strokeWidth="1.8"/>
        <ellipse cx="16" cy="16" rx="6" ry="12" fill="none" stroke={stroke} strokeWidth="1.5"/>
        <line x1="4" y1="16" x2="28" y2="16" stroke={stroke} strokeWidth="1.5"/>
      </svg>
    );
  }
}

function detectPlatformId() {
  if (typeof navigator === 'undefined') return 'macos';
  const ua = (navigator.userAgent || '').toLowerCase();
  const p = (navigator.platform || '').toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/mac/.test(p)) return 'macos';
  if (/win/.test(p)) return 'windows';
  if (/linux/.test(p)) return 'linux';
  return 'web';
}

// ═══════════════════════════════════════════════════════════
// HERO — gigantic word "download" + platform picker
// ═══════════════════════════════════════════════════════════
function HeroBackdrop() {
  const m = useMouse();
  return (
    <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
      <div style={{
        position:'absolute', inset:'-40px',
        backgroundImage: `radial-gradient(${D.borderD} 1px, transparent 1px)`,
        backgroundSize:'24px 24px', opacity:0.6,
        animation:'dDrift 18s linear infinite',
        maskImage:'radial-gradient(ellipse at 50% 60%, black 30%, transparent 75%)',
        WebkitMaskImage:'radial-gradient(ellipse at 50% 60%, black 30%, transparent 75%)',
      }}/>
      <div style={{
        position:'absolute',
        left:`calc(${m.x*100}% - 280px)`, top:`calc(${m.y*100}% - 280px)`,
        width:560, height:560, borderRadius:'50%',
        background:'radial-gradient(circle, rgba(217,119,6,0.08), transparent 60%)',
        transition:'left 240ms ease-out, top 240ms ease-out',
      }}/>
      {/* falling arrows */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{
          position:'absolute', top:0,
          left: `${(i*13 + 8) % 100}%`, color: D.ter, opacity: 0.4,
          animation: `dArrowDown ${3 + (i%4)*0.6}s ease-in ${i*0.4}s infinite`,
          fontFamily: D.mono, fontSize: 12,
        }}>↓</div>
      ))}
    </div>
  );
}

function HeroHeadline() {
  const lines = ['download', 'merchiva.'];
  let idx = 0;
  return (
    <h1 style={{
      margin:0, fontFamily:D.sans, fontWeight:600,
      fontSize:'clamp(64px, 12vw, 196px)', lineHeight:0.92,
      letterSpacing:'-0.06em', color:D.ink,
    }}>
      {lines.map((line, li) => (
        <div key={li} style={{ display:'flex', flexWrap:'nowrap' }}>
          {line.split('').map((c) => {
            const i = idx++;
            return (
              <span key={i} style={{
                display:'inline-block',
                color: c === '.' ? D.accent : 'inherit',
                whiteSpace:'pre',
                animation:`dLetterIn 900ms cubic-bezier(.2,.8,.2,1) ${120 + i*45}ms both`,
              }}>{c === ' ' ? '\u00A0' : c}</span>
            );
          })}
        </div>
      ))}
    </h1>
  );
}

function PlatformPicker({ activeId, setActiveId, detectedId }) {
  return (
    <div style={{
      display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:8,
      border:`1px solid ${D.border}`, borderRadius:6, padding:8,
      background: D.paper,
    }}>
      {PLATFORMS.map(p => {
        const on = p.id === activeId;
        const detected = p.id === detectedId;
        return (
          <button key={p.id} onClick={() => setActiveId(p.id)} style={{
            position:'relative', textAlign:'left', cursor:'pointer',
            padding:'14px 14px',
            border:'none', borderRadius:4,
            background: on ? D.ink : 'transparent',
            color: on ? '#fff' : D.text,
            transition: 'background 200ms, color 200ms, transform 200ms',
            transform: on ? 'translateY(-1px)' : 'none',
            display:'flex', flexDirection:'column', gap:10,
            fontFamily: D.sans,
          }}>
            <PlatformGlyph id={p.id} size={22} color={on ? '#fff' : D.ink}/>
            <div>
              <div style={{ fontSize:13, fontWeight:600, letterSpacing:-0.2 }}>{p.label}</div>
              <div style={{
                fontFamily:D.mono, fontSize:9.5,
                color: on ? 'rgba(255,255,255,0.65)' : D.sec,
                letterSpacing:0.3, marginTop:2,
              }}>{p.sub}</div>
            </div>
            {detected && (
              <span style={{
                position:'absolute', top:8, right:8,
                fontFamily:D.mono, fontSize:8.5, letterSpacing:0.4, textTransform:'uppercase',
                padding:'2px 5px', borderRadius:2,
                background: on ? 'rgba(255,255,255,0.16)' : D.accentSoft,
                color: on ? '#fff' : D.accent,
              }}>your os</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Animated download progress demo (visual only)
function DownloadProgressDemo({ platform, kick }) {
  const [phase, setPhase] = dUS('idle'); // idle | downloading | verifying | done
  const [pct, setPct] = dUS(0);
  const rafRef = dUR();
  dUE(() => {
    if (!kick) return;
    setPhase('downloading'); setPct(0);
    const start = performance.now();
    const total = 2600;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / total);
      const e = 1 - Math.pow(1 - t, 2.4);
      setPct(e * 100);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else {
        setPhase('verifying');
        setTimeout(() => setPhase('done'), 700);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [kick]);
  const label = {
    idle: 'ready',
    downloading: `downloading ${Math.round(pct)}%`,
    verifying: 'verifying signature…',
    done: 'done · check your downloads folder',
  }[phase];
  return (
    <div style={{
      background:D.inkSoft, color:'#fafaf9', borderRadius:6, padding:'14px 16px',
      fontFamily:D.mono, fontSize:11.5,
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <span style={{ color:'#a8a29e' }}>$ merchiva fetch --platform {platform.id}</span>
        <span style={{ color: phase === 'done' ? D.good : phase === 'verifying' ? D.accent : '#a8a29e' }}>● {label}</span>
      </div>
      <div style={{ height:6, background:'#292524', borderRadius:99, overflow:'hidden' }}>
        <div style={{
          height:'100%', width:`${pct}%`,
          background:`linear-gradient(90deg, ${D.accent}, #fafaf9, ${D.accent})`,
          backgroundSize:'200% 100%',
          animation: phase==='downloading' ? 'dProgressShine 1.4s linear infinite' : 'none',
          transition:'width 80ms linear',
        }}/>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, color:'#78716c' }}>
        <span>{platform.file} · {platform.size}</span>
        <span>sha256 …{platform.shaTail}</span>
      </div>
    </div>
  );
}

function Hero({ activeId, setActiveId, detectedId }) {
  const platform = PLATFORMS.find(p => p.id === activeId);
  const [kick, setKick] = dUS(0);
  const isStore = activeId === 'ios' || activeId === 'android';
  const isWeb = activeId === 'web';
  return (
    <section style={{ position:'relative', paddingTop:128, paddingBottom:80, paddingLeft:32, paddingRight:32, overflow:'hidden' }}>
      <HeroBackdrop />
      <div style={{ position:'relative', maxWidth:1280, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:32, animation:'dFadeUp 700ms 60ms both' }}>
          <MonoTag>
            <span style={{ width:6, height:6, background:D.good, borderRadius:'50%' }}/>
            01 · download · v3.4.2 · shipped 14h ago
          </MonoTag>
          <span style={{ fontSize:13, color:D.sec, letterSpacing:-0.1 }}>
            Native on every desk. Hot on every counter. Honest on every device.
          </span>
        </div>

        <HeroHeadline />

        <div style={{
          marginTop:48, display:'grid', gridTemplateColumns:'1.25fr 1fr', gap:48, alignItems:'end',
          animation:'dFadeUp 800ms 700ms both',
        }}>
          <p style={{
            margin:0, fontSize:22, lineHeight:1.4, color:D.text2,
            letterSpacing:-0.3, maxWidth:640, fontWeight:400, textWrap:'pretty',
          }}>
            One forecast engine, six surfaces. Pick where you work — desktop for the back office, mobile for the floor, web for the laptop you just opened.
            <em style={{ color:D.ink, fontStyle:'normal', fontWeight:600 }}> Auto-update by default. Notarized & signed.</em>
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:14, alignItems:'flex-start', width:'100%' }}>
            <div style={{
              fontFamily:D.mono, fontSize:12, color:D.text2, padding:'10px 14px',
              border:`1px solid ${D.border}`, background:D.paper, borderRadius:4, lineHeight:1.5,
              width:'100%',
            }}>
              <div><span style={{ color:D.ter }}>$</span> merchiva install.detected</div>
              <div style={{ color:D.good }}>→ {PLATFORMS.find(p => p.id === detectedId)?.label || 'macOS'} · we picked this for you</div>
            </div>
            <span style={{ fontFamily:D.mono, fontSize:10.5, color:D.sec, letterSpacing:0.3 }}>
              auto-update · signed builds · no telemetry without consent
            </span>
          </div>
        </div>

        {/* picker */}
        <div className="d-reveal" data-d="2" style={{ marginTop:56 }}>
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:12 }}>
            <MonoTag border={false}>02 · pick a surface</MonoTag>
            <DotLeader/>
            <MonoTag border={false}>{PLATFORMS.length} platforms · auto-detected</MonoTag>
          </div>
          <PlatformPicker activeId={activeId} setActiveId={setActiveId} detectedId={detectedId}/>
        </div>

        {/* primary download card */}
        <div id="hero-cta" className="d-reveal" data-d="3" style={{
          marginTop:24,
          background:D.paper, border:`1px solid ${D.border}`, borderRadius:8,
          boxShadow: '0 22px 60px -28px rgba(28,25,23,0.22), 0 4px 12px -8px rgba(28,25,23,0.06)',
          overflow:'hidden', position:'relative',
        }}>
          {/* shimmer */}
          <div style={{
            position:'absolute', inset:0, pointerEvents:'none',
            background:'linear-gradient(105deg, transparent 40%, rgba(217,119,6,0.06) 50%, transparent 60%)',
            backgroundSize:'200% 100%', animation:'dSweep 8s ease-in-out infinite',
          }}/>
          <div style={{ display:'grid', gridTemplateColumns:'1.1fr 1fr', position:'relative' }}>
            {/* left */}
            <div style={{ padding:'32px 36px', borderRight:`1px solid ${D.border}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:18 }}>
                <PlatformGlyph id={platform.id} size={32}/>
                <div>
                  <div style={{ fontSize:24, fontWeight:600, color:D.ink, letterSpacing:-0.4 }}>
                    Merchiva for {platform.label}
                  </div>
                  <div style={{ fontFamily:D.mono, fontSize:10.5, color:D.sec, marginTop:2, letterSpacing:0.3 }}>
                    {platform.sub} · {platform.file} · {platform.size}
                  </div>
                </div>
              </div>

              <div style={{ display:'flex', gap:10, marginBottom:18 }}>
                {!isStore && !isWeb && (
                  <button onClick={() => setKick(k => k+1)} style={{
                    display:'inline-flex', alignItems:'center', gap:10,
                    padding:'14px 22px', borderRadius:4, cursor:'pointer',
                    background:D.ink, color:'#fff', border:`1px solid ${D.ink}`,
                    fontFamily:D.sans, fontSize:14, fontWeight:500, letterSpacing:-0.1,
                    animation:'dGlow 2.6s ease-in-out infinite',
                  }}>
                    Download {platform.ext}
                    <span style={{ fontFamily:D.mono, fontSize:12, opacity:0.8 }}>↓ {platform.size}</span>
                  </button>
                )}
                {isStore && (
                  <a href="#" style={{
                    display:'inline-flex', alignItems:'center', gap:10,
                    padding:'14px 22px', borderRadius:4, textDecoration:'none',
                    background:D.ink, color:'#fff',
                    fontSize:14, fontWeight:500, letterSpacing:-0.1,
                  }}>
                    Open {platform.file}
                    <span style={{ fontFamily:D.mono, fontSize:12, opacity:0.8 }}>→</span>
                  </a>
                )}
                {isWeb && (
                  <a href="#" style={{
                    display:'inline-flex', alignItems:'center', gap:10,
                    padding:'14px 22px', borderRadius:4, textDecoration:'none',
                    background:D.ink, color:'#fff',
                    fontSize:14, fontWeight:500, letterSpacing:-0.1,
                  }}>
                    Launch web app
                    <span style={{ fontFamily:D.mono, fontSize:12, opacity:0.8 }}>↗</span>
                  </a>
                )}
                <a href="#release-notes" style={{
                  display:'inline-flex', alignItems:'center', gap:10,
                  padding:'14px 18px', borderRadius:4, textDecoration:'none',
                  background:'transparent', color:D.ink, border:`1px solid ${D.borderD}`,
                  fontSize:14, fontWeight:500, letterSpacing:-0.1,
                }}>Release notes <span style={{ fontFamily:D.mono, fontSize:12, opacity:0.7 }}>→</span></a>
              </div>

              {/* alt build pills */}
              {!isStore && !isWeb && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {(platform.id === 'macos'
                    ? ['Apple silicon', 'Intel', 'Universal', 'Homebrew', 'MAS · in review']
                    : platform.id === 'windows'
                    ? ['x64', 'ARM64', '.msi (MSI)', 'winget', 'portable .zip']
                    : ['.deb', '.rpm', '.AppImage', 'flatpak', 'snap']
                  ).map((t, i) => (
                    <span key={t} style={{
                      fontFamily:D.mono, fontSize:10, color: i === 0 ? D.ink : D.text3,
                      padding:'5px 9px', borderRadius:2,
                      background: i === 0 ? D.accentSoft : D.surface,
                      border:`1px solid ${i===0 ? 'transparent' : D.border}`,
                    }}>{t}{i === 0 ? ' · default' : ''}</span>
                  ))}
                </div>
              )}

              <div style={{ marginTop:18, paddingTop:14, borderTop:`1px solid ${D.border}`, display:'flex', gap:18, flexWrap:'wrap', fontFamily:D.mono, fontSize:10.5, color:D.sec, letterSpacing:0.3 }}>
                <span><span style={{ color:D.good }}>✓</span> signed & notarized</span>
                <span><span style={{ color:D.good }}>✓</span> auto-updates</span>
                <span><span style={{ color:D.good }}>✓</span> sha256 verified</span>
              </div>
            </div>

            {/* right — progress demo */}
            <div style={{ padding:'32px 36px', background:D.surface, display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between' }}>
                <MonoTag border={false}>install · live demo</MonoTag>
                <span style={{ fontFamily:D.mono, fontSize:10, color:D.sec }}>press the download button →</span>
              </div>
              <DownloadProgressDemo platform={platform} kick={kick}/>
              <div style={{
                fontFamily:D.mono, fontSize:11, color:D.text2,
                background:D.paper, border:`1px solid ${D.border}`, borderRadius:4,
                padding:'10px 12px', lineHeight:1.6,
              }}>
                <div><span style={{ color:D.ter }}>1</span>  open <span style={{ color:D.ink, fontWeight:600 }}>{platform.file}</span></div>
                <div><span style={{ color:D.ter }}>2</span>  drag into Applications · sign in once</div>
                <div><span style={{ color:D.ter }}>3</span>  connect your POS · forecast in 7 days</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// MARQUEE — what's in the build
// ═══════════════════════════════════════════════════════════
function Marquee() {
  const items = [
    'forecast engine v3.4', 'hourly windows', 'driver attribution', 'reorder POs',
    'weather signal', 'multi-location', 'API + webhooks', 'CSV + JSON export',
    'offline-first mobile', 'optical SKU scan', 'cycle counts', 'shrink alerts',
    'vendor scorecards', 'safety-stock tuning', 'what-if scenarios', 'audit trail',
  ];
  const row = [...items, ...items];
  return (
    <section style={{ padding:'28px 0', borderTop:`1px solid ${D.border}`, borderBottom:`1px solid ${D.border}`, background:D.bgWarm, overflow:'hidden' }}>
      <div style={{ display:'flex', gap:0, animation:'dMarquee 60s linear infinite', whiteSpace:'nowrap', width:'max-content' }}>
        {row.map((x, i) => (
          <span key={i} style={{
            display:'inline-flex', alignItems:'center', gap:12, padding:'0 22px',
            fontFamily:D.sans, fontSize:28, fontWeight:500,
            color: i % 7 === 3 ? D.ink : D.text3, letterSpacing:-0.6,
          }}>
            <NotchM size={14} fg={D.ter}/>{x}
          </span>
        ))}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// WHAT'S NEW + SYSTEM REQUIREMENTS (split section)
// ═══════════════════════════════════════════════════════════
function WhatsNew({ activeId }) {
  const platform = PLATFORMS.find(p => p.id === activeId);
  const reqs = {
    macos:   [['OS', 'macOS 13 Ventura or later'], ['CPU', 'Apple silicon or Intel x86-64'], ['RAM', '4 GB minimum · 8 GB recommended'], ['Disk', '320 MB free'], ['Network', 'always-on for live forecast sync']],
    windows: [['OS', 'Windows 10 (1903+) · 11 · Server 2022'], ['CPU', 'x64 or ARM64'], ['RAM', '4 GB minimum · 8 GB recommended'], ['Disk', '380 MB free'], ['Network', 'always-on for live forecast sync']],
    linux:   [['OS', 'Ubuntu 22.04+ · Debian 12+ · Fedora 39+'], ['CPU', 'x86-64'], ['RAM', '4 GB minimum'], ['Disk', '340 MB free'], ['Deps', 'glibc 2.35+ · GTK 3.24+']],
    ios:     [['OS', 'iOS 16 or later · iPadOS 16+'], ['Device', 'iPhone XR or newer · all iPads ≥ 2019'], ['RAM', 'managed'], ['Disk', '180 MB free'], ['Network', 'offline-capable · syncs on reconnect']],
    android: [['OS', 'Android 10 (API 29) or later'], ['CPU', 'arm64-v8a · x86_64'], ['RAM', '3 GB minimum'], ['Disk', '220 MB free'], ['Network', 'offline-capable · syncs on reconnect']],
    web:     [['Browser', 'Chrome 110+ · Safari 16+ · Firefox 112+'], ['Engine', 'WebGPU optional · WebGL 2 required'], ['RAM', '4 GB free'], ['Disk', 'PWA · ~20 MB local'], ['Network', 'always-on']],
  }[activeId];

  const changes = [
    { tag:'NEW', text:'95% confidence bands now calibrated per SKU', color:D.accent },
    { tag:'NEW', text:'Cross-location stock balancing (Chain plan)', color:D.accent },
    { tag:'FIX', text:'Forecast jitter on cold-start SKUs reduced ~38%', color:D.good },
    { tag:'FIX', text:'Auto-PO retries on vendor timeouts', color:D.good },
    { tag:'CHG', text:'POS connectors moved to background workers', color:D.text2 },
    { tag:'CHG', text:'Default forecast window: 14d → 21d on Operator', color:D.text2 },
  ];

  return (
    <section style={{ padding:'120px 32px', background:D.bg }}>
      <div style={{ maxWidth:1280, margin:'0 auto' }}>
        <div className="d-reveal" style={{ display:'flex', alignItems:'baseline', gap:24, marginBottom:16 }}>
          <MonoTag border={false}>03 · what ships in v3.4.2</MonoTag>
          <DotLeader/>
          <span style={{ fontFamily:D.mono, fontSize:10.5, color:D.sec }}>requirements update per platform</span>
        </div>
        <h2 className="d-reveal" data-d="1" style={{
          margin:'0 0 48px', fontSize:'clamp(36px, 5vw, 56px)', fontWeight:600,
          letterSpacing:-1.6, lineHeight:1.04, color:D.ink, maxWidth:900, textWrap:'balance',
        }}>
          Smaller binary. Faster forecast. <span style={{ color:D.ter }}>Same Merchiva.</span>
        </h2>

        <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr', gap:24 }}>
          {/* changelog */}
          <div className="d-reveal" data-d="2" style={{
            background:D.paper, border:`1px solid ${D.border}`, borderRadius:6, padding:'24px 28px',
          }}>
            <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:18 }}>
              <span style={{ fontSize:14, fontWeight:600, color:D.ink, letterSpacing:-0.2 }}>v3.4.2 · what's inside</span>
              <span style={{ fontFamily:D.mono, fontSize:10.5, color:D.sec }}>{platform.label} build · {platform.size}</span>
            </div>
            <ul style={{ listStyle:'none', margin:0, padding:0, display:'flex', flexDirection:'column', gap:10 }}>
              {changes.map((c, i) => (
                <li key={i} style={{ display:'flex', alignItems:'baseline', gap:12, fontSize:13.5, color:D.text }}>
                  <span style={{
                    fontFamily:D.mono, fontSize:9.5, fontWeight:600, letterSpacing:0.5,
                    padding:'3px 6px', borderRadius:2, color:c.color,
                    background: c.tag === 'NEW' ? D.accentSoft : c.tag === 'FIX' ? '#dcfce7' : D.panel,
                    minWidth:38, textAlign:'center', flexShrink:0,
                  }}>{c.tag}</span>
                  <span style={{ lineHeight:1.5 }}>{c.text}</span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop:18, paddingTop:14, borderTop:`1px solid ${D.border}`, display:'flex', justifyContent:'space-between', fontFamily:D.mono, fontSize:10.5, color:D.sec }}>
              <a href="#" style={{ color:D.text2, textDecoration:'none' }}>full changelog →</a>
              <span>compared with v3.4.1</span>
            </div>
          </div>

          {/* requirements */}
          <div className="d-reveal" data-d="3" style={{
            background:D.paper, border:`1px solid ${D.border}`, borderRadius:6, overflow:'hidden',
          }}>
            <div style={{
              padding:'16px 20px', borderBottom:`1px solid ${D.border}`, background:D.surface,
              display:'flex', alignItems:'center', gap:10,
            }}>
              <PlatformGlyph id={activeId} size={18}/>
              <span style={{ fontSize:14, fontWeight:600, color:D.ink, letterSpacing:-0.2 }}>System requirements · {platform.label}</span>
            </div>
            <div>
              {reqs.map(([k, v], i) => (
                <div key={k} style={{
                  display:'grid', gridTemplateColumns:'100px 1fr',
                  padding:'12px 20px',
                  borderBottom: i < reqs.length-1 ? `1px solid ${D.border}` : 'none',
                  fontSize:13, color:D.text,
                  background: i % 2 === 0 ? 'transparent' : D.surface,
                }}>
                  <span style={{ fontFamily:D.mono, fontSize:10.5, color:D.sec, textTransform:'uppercase', letterSpacing:0.4 }}>{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// VERIFY YOUR DOWNLOAD — sha256 + signature
// ═══════════════════════════════════════════════════════════
function VerifyBlock({ activeId }) {
  const platform = PLATFORMS.find(p => p.id === activeId);
  const isStore = activeId === 'ios' || activeId === 'android' || activeId === 'web';
  const fakeSha = `9f${platform.shaTail.padEnd(58, '0')}${platform.shaTail}`;
  useTick(2);
  const t = performance.now() / 1000;
  const cmd = activeId === 'windows'
    ? `> certutil -hashfile ${platform.file} SHA256`
    : `$ shasum -a 256 ${platform.file}`;
  return (
    <section style={{ padding:'80px 32px 40px', background:D.bg }}>
      <div style={{ maxWidth:1280, margin:'0 auto' }}>
        <div className="d-reveal" style={{ display:'flex', alignItems:'baseline', gap:24, marginBottom:16 }}>
          <MonoTag border={false}>04 · verify your download</MonoTag>
          <DotLeader/>
          <span style={{ fontFamily:D.mono, fontSize:10.5, color:D.sec }}>{isStore ? 'store-signed · skip' : 'sha256 + developer signature'}</span>
        </div>
        <div className="d-reveal" data-d="1" style={{
          background:D.inkSoft, color:'#fafaf9', borderRadius:8, padding:'28px 32px',
          fontFamily:D.mono, fontSize:12.5, lineHeight:1.6, position:'relative', overflow:'hidden',
        }}>
          {/* scanline */}
          <div style={{
            position:'absolute', inset:0, pointerEvents:'none',
            background:`linear-gradient(to bottom, transparent 0%, rgba(217,119,6,0.06) 50%, transparent 100%)`,
            height:80, animation:'dScanY 6s ease-in-out infinite',
          }}/>
          <div style={{ position:'relative' }}>
            <div style={{ color:'#78716c', marginBottom:8 }}>{cmd}</div>
            <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:8 }}>
              <span style={{ color:'#fafaf9' }}>{fakeSha}</span>
              <span style={{ color:'#a8a29e' }}>  {platform.file}</span>
            </div>
            <div style={{ marginTop:10, color:'#78716c' }}>verifying signature…</div>
            <div style={{ color: D.good, display:'flex', alignItems:'center', gap:10 }}>
              <span style={{
                width:8, height:8, borderRadius:'50%', background:D.good,
                animation:'dPulse 1.4s ease-in-out infinite',
              }}/>
              signed by <span style={{ color:'#fafaf9' }}>Merchiva, Inc.</span> · Developer ID · Apple notary: <span style={{ color:'#fafaf9' }}>OK</span>
              <span style={{ color:'#78716c' }}>· verified {Math.floor(t) % 50 + 1}s ago</span>
            </div>
          </div>
        </div>
        <div className="d-reveal" data-d="2" style={{
          marginTop:14, display:'flex', flexWrap:'wrap', gap:24, fontFamily:D.mono, fontSize:11, color:D.sec, letterSpacing:0.3,
        }}>
          <span><span style={{ color:D.good }}>✓</span> public key on keys.merchiva.app</span>
          <span><span style={{ color:D.good }}>✓</span> reproducible builds on GitHub Actions</span>
          <span><span style={{ color:D.good }}>✓</span> auto-updates verified before install</span>
          <DotLeader/>
          <a href="#" style={{ color:D.text2, textDecoration:'none' }}>how to verify → docs/security</a>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// RELEASE TIMELINE
// ═══════════════════════════════════════════════════════════
const RELEASES = [
  { v:'v3.4.2', date:'2026 · 05 · 11', tag:'patch',  blurb:'Cold-start jitter ↓ · auto-PO retries · POS workers' },
  { v:'v3.4.1', date:'2026 · 04 · 28', tag:'patch',  blurb:'Forecast cache hit-rate +12% · CSV import 4× faster' },
  { v:'v3.4.0', date:'2026 · 04 · 14', tag:'minor',  blurb:'Cross-location stock balancing · calibrated 95% bands' },
  { v:'v3.3.0', date:'2026 · 03 · 03', tag:'minor',  blurb:'Hourly forecasts · vendor scorecards · API v3' },
  { v:'v3.2.5', date:'2026 · 02 · 11', tag:'patch',  blurb:'Lightspeed connector · Shopify webhook fan-out' },
  { v:'v3.2.0', date:'2026 · 01 · 20', tag:'minor',  blurb:'Driver attribution: weather · payday · holiday lift' },
];
function ReleaseTimeline() {
  return (
    <section id="release-notes" style={{ padding:'120px 32px', background:D.bg, borderTop:`1px solid ${D.border}` }}>
      <div style={{ maxWidth:1280, margin:'0 auto' }}>
        <div className="d-reveal" style={{ display:'flex', alignItems:'baseline', gap:24, marginBottom:16 }}>
          <MonoTag border={false}>05 · release timeline</MonoTag>
          <DotLeader/>
          <span style={{ fontFamily:D.mono, fontSize:10.5, color:D.sec }}>every two weeks · usually a thursday</span>
        </div>
        <h2 className="d-reveal" data-d="1" style={{
          margin:'0 0 48px', fontSize:'clamp(36px, 5vw, 56px)', fontWeight:600,
          letterSpacing:-1.6, lineHeight:1.04, color:D.ink, maxWidth:800, textWrap:'balance',
        }}>
          We ship boring. <span style={{ color:D.ter }}>On a schedule.</span>
        </h2>
        <div className="d-reveal" data-d="2" style={{
          background:D.paper, border:`1px solid ${D.border}`, borderRadius:6, overflow:'hidden',
        }}>
          {RELEASES.map((r, i) => {
            const isLatest = i === 0;
            return (
              <div key={r.v} style={{
                display:'grid', gridTemplateColumns:'140px 160px 90px 1fr 120px',
                alignItems:'center', padding:'18px 22px',
                borderBottom: i < RELEASES.length-1 ? `1px solid ${D.border}` : 'none',
                background: isLatest ? `linear-gradient(90deg, ${D.accentSoft}55 0%, transparent 60%)` : (i % 2 ? D.surface : 'transparent'),
              }}>
                <span style={{ fontFamily:D.mono, fontSize:14, fontWeight:600, color:D.ink, letterSpacing:-0.2 }}>{r.v}</span>
                <span style={{ fontFamily:D.mono, fontSize:11, color:D.sec, letterSpacing:0.4 }}>{r.date}</span>
                <span style={{
                  fontFamily:D.mono, fontSize:9.5, fontWeight:600, letterSpacing:0.5,
                  padding:'3px 8px', borderRadius:2,
                  background: r.tag === 'minor' ? D.ink : D.panel,
                  color: r.tag === 'minor' ? '#fff' : D.text2,
                  width:'fit-content', textTransform:'uppercase',
                }}>{r.tag}</span>
                <span style={{ fontSize:13, color:D.text2, paddingRight:20 }}>{r.blurb}</span>
                <span style={{ textAlign:'right' }}>
                  {isLatest ? (
                    <span style={{
                      fontFamily:D.mono, fontSize:10, padding:'4px 8px', borderRadius:2,
                      background:D.accentSoft, color:D.accent, letterSpacing:0.4,
                    }}>● current</span>
                  ) : (
                    <a href="#" style={{ fontFamily:D.mono, fontSize:11, color:D.text3, textDecoration:'none' }}>notes →</a>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// PACKAGE MANAGERS / CLI
// ═══════════════════════════════════════════════════════════
function PackageManagers() {
  const cmds = [
    { id:'brew',   os:'macOS',    cmd:'brew install --cask merchiva' },
    { id:'winget', os:'Windows',  cmd:'winget install Merchiva.Desktop' },
    { id:'apt',    os:'Debian',   cmd:'sudo apt install ./merchiva_3.4.2.deb' },
    { id:'flatpak',os:'Linux',    cmd:'flatpak install flathub app.merchiva.Desktop' },
    { id:'snap',   os:'Ubuntu',   cmd:'sudo snap install merchiva' },
    { id:'docker', os:'Self-host',cmd:'docker run -p 7700:7700 merchiva/edge:3.4.2' },
  ];
  const [copied, setCopied] = dUS(null);
  return (
    <section style={{ padding:'80px 32px', background:D.bg }}>
      <div style={{ maxWidth:1280, margin:'0 auto' }}>
        <div className="d-reveal" style={{ display:'flex', alignItems:'baseline', gap:24, marginBottom:16 }}>
          <MonoTag border={false}>06 · prefer the terminal?</MonoTag>
          <DotLeader/>
          <span style={{ fontFamily:D.mono, fontSize:10.5, color:D.sec }}>one-line installs · pinned versions</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12 }}>
          {cmds.map((c, i) => (
            <div key={c.id} className="d-reveal" data-d={String((i % 5) + 1)} style={{
              background:D.inkSoft, color:'#fafaf9', borderRadius:6,
              padding:'14px 16px', position:'relative',
              fontFamily:D.mono, fontSize:12,
              border:`1px solid #292524`,
            }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ color:'#a8a29e', fontSize:10, letterSpacing:0.5, textTransform:'uppercase' }}>{c.id} · {c.os}</span>
                <button onClick={() => { setCopied(c.id); navigator.clipboard?.writeText(c.cmd); setTimeout(() => setCopied(null), 1200); }} style={{
                  background:'transparent', border:`1px solid #44403c`, color:'#fafaf9',
                  fontFamily:D.mono, fontSize:9.5, padding:'3px 7px', borderRadius:3, cursor:'pointer',
                  letterSpacing:0.4, textTransform:'uppercase',
                }}>{copied === c.id ? '✓ copied' : 'copy'}</button>
              </div>
              <div><span style={{ color:'#78716c' }}>$</span> {c.cmd}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// FAQ (compact)
// ═══════════════════════════════════════════════════════════
const FAQS = [
  { q:'Is the download free?', a:'Yes. The app is free to install on every platform. You only pay for the Merchiva forecast plan you choose — see Pricing.' },
  { q:'Do I need an account to install?', a:'No. You can install and explore the demo workspace before signing in. The forecast engine activates once you connect a POS or upload CSVs.' },
  { q:'How big is the install?', a:'Desktop builds are 110–145 MB depending on platform. Mobile is ~90 MB. Web is 0 MB (PWA installs ~20 MB cache).' },
  { q:'Does it work offline?', a:'Mobile is offline-first — punch-in, count, scan, queue POs. Desktop and web sync continuously. All apps reconcile when reconnected.' },
  { q:'Where can I get older versions?', a:'All signed builds back to v2.0 are on releases.merchiva.app. We keep 24 months of binaries hot, and lifetime on cold storage.' },
];
function FAQ() {
  const [open, setOpen] = dUS(0);
  return (
    <section style={{ padding:'120px 32px', background:D.bg }}>
      <div style={{ maxWidth:960, margin:'0 auto' }}>
        <div className="d-reveal" style={{ display:'flex', alignItems:'baseline', gap:24, marginBottom:16 }}>
          <MonoTag border={false}>07 · faq</MonoTag>
          <DotLeader/>
          <span style={{ fontFamily:D.mono, fontSize:10.5, color:D.sec }}>still stuck? → hi@merchiva.app</span>
        </div>
        <h2 className="d-reveal" data-d="1" style={{
          margin:'0 0 40px', fontSize:'clamp(34px, 5vw, 52px)', fontWeight:600,
          letterSpacing:-1.5, lineHeight:1.04, color:D.ink, textWrap:'balance',
        }}>
          Common questions.
        </h2>
        <div className="d-reveal" data-d="2" style={{ borderTop:`1px solid ${D.border}` }}>
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={i} style={{ borderBottom:`1px solid ${D.border}` }}>
                <button onClick={() => setOpen(isOpen ? -1 : i)} style={{
                  width:'100%', textAlign:'left', background:'transparent', border:'none',
                  padding:'20px 0', cursor:'pointer', display:'flex', alignItems:'center', gap:24, fontFamily:D.sans,
                }}>
                  <span style={{ fontFamily:D.mono, fontSize:11, color:D.sec, letterSpacing:0.4, width:28, flexShrink:0 }}>0{i+1}</span>
                  <span style={{ flex:1, fontSize:17, fontWeight:500, color:D.ink, letterSpacing:-0.3 }}>{f.q}</span>
                  <span style={{
                    width:22, height:22, borderRadius:99, border:`1px solid ${D.borderD}`,
                    display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                    background: isOpen ? D.ink : 'transparent', color: isOpen ? '#fff' : D.text2,
                    transition:'all 240ms cubic-bezier(.2,.8,.2,1)',
                    transform: isOpen ? 'rotate(45deg)' : 'rotate(0)',
                    fontSize:16, lineHeight:1, fontWeight:300,
                  }}>+</span>
                </button>
                <div style={{
                  display:'grid', gridTemplateRows: isOpen ? '1fr' : '0fr',
                  transition:'grid-template-rows 380ms cubic-bezier(.2,.8,.2,1)',
                }}>
                  <div style={{ overflow:'hidden' }}>
                    <div style={{ paddingLeft:52, paddingRight:46, paddingBottom:20, fontSize:14.5, lineHeight:1.6, color:D.text2, textWrap:'pretty' }}>{f.a}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// CTA + FOOTER
// ═══════════════════════════════════════════════════════════
function CTAFooter() {
  return (
    <section style={{ padding:'120px 32px 0', background:D.bg, position:'relative', overflow:'hidden' }}>
      <div style={{ maxWidth:1280, margin:'0 auto', position:'relative' }}>
        <div style={{ position:'relative', textAlign:'center', marginBottom:64 }}>
          <div className="d-reveal" style={{ display:'flex', justifyContent:'center', marginBottom:24 }}>
            <NotchM size={48} fg={D.ink}/>
          </div>
          <h2 className="d-reveal" data-d="1" style={{
            margin:0, fontSize:'clamp(56px, 12vw, 176px)', fontWeight:600,
            letterSpacing:'-0.06em', lineHeight:0.94, color:D.ink, textWrap:'balance',
          }}>
            install it.<br/>see day seven.
          </h2>
          <p className="d-reveal" data-d="2" style={{
            margin:'32px auto 0', maxWidth:600, fontSize:18, color:D.text3, lineHeight:1.5, textWrap:'pretty',
          }}>
            Free to download. Free for thirty days. Your first forecast lands by the end of the first week.
          </p>
          <div className="d-reveal" data-d="3" style={{ marginTop:40, display:'flex', justifyContent:'center', gap:12, flexWrap:'wrap' }}>
            <a href="#hero-cta" style={{
              display:'inline-flex', alignItems:'center', gap:10,
              padding:'14px 22px', borderRadius:4,
              background:D.ink, color:'#fff', textDecoration:'none',
              fontSize:14, fontWeight:500, letterSpacing:-0.1,
              animation:'dGlow 2.6s ease-in-out infinite',
            }}>Download for your OS <span style={{ fontFamily:D.mono, fontSize:12, opacity:0.7 }}>↓</span></a>
            <a href="Pricing.html" style={{
              display:'inline-flex', alignItems:'center', gap:10,
              padding:'14px 22px', borderRadius:4,
              background:'transparent', color:D.ink, border:`1px solid ${D.borderD}`, textDecoration:'none',
              fontSize:14, fontWeight:500, letterSpacing:-0.1,
            }}>See pricing <span style={{ fontFamily:D.mono, fontSize:12 }}>→</span></a>
          </div>
        </div>

        <div style={{
          marginTop:60, paddingTop:28, paddingBottom:28,
          borderTop:`1px solid ${D.border}`,
          display:'grid', gridTemplateColumns:'1fr 2fr 1fr', gap:32,
          fontFamily:D.mono, fontSize:11, color:D.sec, alignItems:'start',
        }}>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <NotchM size={14} fg={D.ink}/><Wordmark size={13} ls={-0.6}/>
            </div>
            <span>© 2026 Merchiva, Inc.</span>
            <span>Oakland · Brooklyn · remote-first</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:14 }}>
            {[
              ['Product', ['Forecast','Reorder','Inventory','Signal']],
              ['Download', ['macOS','Windows','Linux','iOS · Android']],
              ['Resources', ['Docs','Changelog','Status','Brand kit']],
              ['Legal', ['Privacy','Terms','DPA','Security']],
            ].map(([h, items]) => (
              <div key={h} style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <span style={{ color:D.text, fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 }}>{h}</span>
                {items.map(x => <a key={x} href="#" style={{ color:D.sec, textDecoration:'none' }}>{x}</a>)}
              </div>
            ))}
          </div>
          <div style={{ textAlign:'right', display:'flex', flexDirection:'column', gap:6 }}>
            <span style={{ color:D.text }}>builds.merchiva.app</span>
            <span>signing key · 0xC0FF·EEBA</span>
            <span>status · <span style={{ color:D.good }}>● all systems normal</span></span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════
function App() {
  const [detectedId] = dUS(() => detectPlatformId());
  const [activeId, setActiveId] = dUS(detectedId);
  useReveal();
  return (
    <main style={{ background:D.bg, minHeight:'100vh' }}>
      <Nav/>
      <Hero activeId={activeId} setActiveId={setActiveId} detectedId={detectedId}/>
      <Marquee/>
      <WhatsNew activeId={activeId}/>
      <VerifyBlock activeId={activeId}/>
      <ReleaseTimeline/>
      <PackageManagers/>
      <FAQ/>
      <CTAFooter/>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
