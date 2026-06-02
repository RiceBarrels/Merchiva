// ═══════════════════════════════════════════════════════════
// Merchiva — Logo exploration
// Original marks grounded in the BizOps/Merchiva design system:
// achromatic stone, 3px radii, 1px borders, Inter + Geist Mono.
// ═══════════════════════════════════════════════════════════

const L = {
  bg:      '#ffffff',
  surface: '#fafaf9',
  panel:   '#f5f5f4',
  ink:     '#0c0a09',           // oklch(0.145 0 0)
  text:    '#1c1917',
  sec:     '#78716c',           // muted-foreground
  ter:     '#a8a29e',
  border:  '#e7e5e4',           // oklch(0.922 0 0)
  borderD: '#d6d3d1',
  inkSoft: '#292524',
  // One optional accent, used sparingly — kept near-achromatic with a
  // warm kiss (no neon). Exposed as a Tweak later.
  accent:  'oklch(0.55 0.09 55)',
  mono:    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  sans:    "'Inter', ui-sans-serif, system-ui, sans-serif",
};

// Tiny helpers ────────────────────────────────────────────────
function Card({ title, sub, tag, children, w, h, pad = 28, bg = L.bg, dark = false }) {
  const textColor = dark ? '#e7e5e4' : L.text;
  const secColor  = dark ? '#a8a29e' : L.sec;
  const borderCol = dark ? '#292524' : L.border;
  return (
    <div style={{
      width: w, height: h, background: bg,
      border: `1px solid ${borderCol}`, borderRadius: 3,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: L.sans,
    }}>
      <div style={{
        padding: '10px 12px', borderBottom: `1px solid ${borderCol}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: dark ? '#17120f' : L.surface,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: textColor, letterSpacing: -0.1 }}>{title}</span>
          {sub && <span style={{ fontSize: 10.5, color: secColor, fontFamily: L.mono }}>{sub}</span>}
        </div>
        {tag && (
          <span style={{
            fontSize: 9.5, fontFamily: L.mono, color: secColor,
            border: `1px solid ${borderCol}`, padding: '2px 5px', borderRadius: 2,
            textTransform: 'uppercase', letterSpacing: 0.4,
          }}>{tag}</span>
        )}
      </div>
      <div style={{ flex: 1, padding: pad, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {children}
      </div>
    </div>
  );
}

function Cap({ children }) {
  return (
    <div style={{
      position: 'absolute', bottom: 10, left: 12,
      fontSize: 10, color: L.sec, fontFamily: L.mono, letterSpacing: 0.2,
    }}>{children}</div>
  );
}

// ─── MARKS ─────────────────────────────────────────────────
// All marks render into a square of given size. No hand-drawn
// illustration — built from primitives: rectangles, lines, type.

// 01 — "Bracket M"
//     Two columns + a seated shelf. Reads as M and as [ ].
//     Echoes the app's borders-and-rectangles vocabulary.
function MarkBracket({ size = 96, fg = L.ink, bg = 'transparent' }) {
  const s = size, t = Math.max(2, Math.round(s * 0.11));
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" style={{ background: bg, borderRadius: 3 }}>
      {/* outer frame subtle */}
      {/* left column */}
      <rect x="14" y="14" width={t*1.3} height="72" fill={fg} />
      {/* right column */}
      <rect x={86 - t*1.3} y="14" width={t*1.3} height="72" fill={fg} />
      {/* top shelves — forms the two serifs of M */}
      <rect x="14" y="14" width="28" height={t*1.3} fill={fg} />
      <rect x={100 - 14 - 28} y="14" width="28" height={t*1.3} fill={fg} />
      {/* center V — two diagonals meeting, drawn as polygons */}
      <polygon points={`
        ${14 + t*1.3},14
        ${50},${58}
        ${86 - t*1.3},14
        ${86 - t*1.3 - t*0.9},14
        ${50},${44}
        ${14 + t*1.3 + t*0.9},14
      `} fill={fg} />
    </svg>
  );
}

// 02 — "Ledger M"
//     M carved from a grid of 3x3 blocks — like a receipt/ledger cell.
//     Very much "tool, not demo".
function MarkLedger({ size = 96, fg = L.ink, bg = 'transparent' }) {
  const s = size;
  // 7-column × 7-row grid, turn on the cells that form the M glyph.
  // Pattern:
  //   X . . . . . X
  //   X X . . . X X
  //   X . X . X . X
  //   X . . X . . X
  //   X . . . . . X
  //   X . . . . . X
  //   X . . . . . X
  const pat = [
    [1,0,0,0,0,0,1],
    [1,1,0,0,0,1,1],
    [1,0,1,0,1,0,1],
    [1,0,0,1,0,0,1],
    [1,0,0,0,0,0,1],
    [1,0,0,0,0,0,1],
    [1,0,0,0,0,0,1],
  ];
  const cell = 100 / 7;
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" style={{ background: bg, borderRadius: 3 }}>
      {pat.map((row, y) => row.map((v, x) => v ? (
        <rect key={`${x}-${y}`} x={x*cell + 0.5} y={y*cell + 0.5} width={cell - 1} height={cell - 1} fill={fg} />
      ) : null))}
    </svg>
  );
}

// 03 — "Notch M"
//     Solid square with a V notch cut from the top — minimal, confident.
function MarkNotch({ size = 96, fg = L.ink, bg = 'transparent' }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" style={{ background: bg, borderRadius: 3 }}>
      <path
        d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z"
        fill={fg}
      />
    </svg>
  );
}

// 04 — "Stack M"
//     Two stacked boxes with a seam — merchandise, stacked operations.
function MarkStack({ size = 96, fg = L.ink, bg = 'transparent' }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" style={{ background: bg, borderRadius: 3 }}>
      {/* outer */}
      <rect x="14" y="14" width="72" height="72" fill="none" stroke={fg} strokeWidth="5"/>
      {/* inner V */}
      <path d="M22 22 L50 54 L78 22" fill="none" stroke={fg} strokeWidth="5" strokeLinecap="square" strokeLinejoin="miter" />
      {/* base bar */}
      <rect x="22" y="70" width="56" height="8" fill={fg} />
    </svg>
  );
}

// 05 — "Bar M"
//     An M made from four vertical bars of varied height — reads as a
//     tiny bar chart as well. Very bizops.
function MarkBars({ size = 96, fg = L.ink, bg = 'transparent' }) {
  const s = size;
  // bar positions
  const bars = [
    { x: 16, h: 72 }, // tall
    { x: 34, h: 48 }, // med
    { x: 52, h: 48 }, // med
    { x: 70, h: 72 }, // tall
  ];
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" style={{ background: bg, borderRadius: 3 }}>
      {/* baseline */}
      <rect x="14" y="84" width="72" height="2" fill={fg} />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={86 - b.h} width="14" height={b.h} fill={fg} />
      ))}
      {/* connecting hairlines that cue "M" */}
      <rect x="16" y="14" width="72" height="2" fill={fg} />
      <polygon points="30,16 50,40 70,16 66,16 50,32 34,16" fill={fg} />
    </svg>
  );
}

// 06 — "Cursor M"
//     Monospace M in square frame with a blinking caret — signals the
//     app's mono-first, terminal-adjacent personality.
function MarkCursor({ size = 96, fg = L.ink, bg = L.bg, frame = true }) {
  const s = size;
  return (
    <div style={{
      width: s, height: s, background: bg,
      border: frame ? `1.5px solid ${fg}` : 'none',
      borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative',
    }}>
      <span style={{
        fontFamily: L.mono, fontWeight: 700,
        fontSize: s * 0.62, color: fg, letterSpacing: -2, lineHeight: 1,
      }}>M</span>
      <span style={{
        position: 'absolute', right: s * 0.18, bottom: s * 0.18,
        width: s * 0.08, height: s * 0.12, background: fg,
        animation: 'blink 1.1s steps(1) infinite',
      }} />
    </div>
  );
}

// ─── WORDMARK ──────────────────────────────────────────────
function Wordmark({ size = 40, color = L.ink, weight = 600, letterSpacing = -1.2, family = L.sans }) {
  return (
    <span style={{
      fontFamily: family, fontWeight: weight,
      fontSize: size, color, letterSpacing,
      lineHeight: 1,
    }}>Merchiva</span>
  );
}

// horizontal lockup: mark + wordmark
function Lockup({ Mark, size = 36, gap = 12, color = L.ink, family = L.sans, weight = 600, wordSize, letterSpacing = -1 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap }}>
      <Mark size={size} fg={color} />
      <Wordmark size={wordSize ?? Math.round(size * 0.62)} color={color} family={family} weight={weight} letterSpacing={letterSpacing} />
    </div>
  );
}

// ─── PAGES inside the canvas ───────────────────────────────

function HeroRecommended() {
  // Showcase the recommended choice: Notch M + Inter wordmark.
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'grid', gridTemplateColumns: '1.3fr 1fr',
      gap: 1, background: L.border,
    }}>
      {/* Left: big mark */}
      <div style={{
        background: L.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        <MarkNotch size={260} />
        <div style={{
          position: 'absolute', top: 20, left: 24, fontSize: 10.5, fontFamily: L.mono, color: L.sec,
          letterSpacing: 0.4, textTransform: 'uppercase',
        }}>03 · Notch M — primary mark</div>
        <div style={{
          position: 'absolute', bottom: 20, left: 24, right: 24,
          fontSize: 11.5, color: L.sec, fontFamily: L.mono, lineHeight: 1.55,
        }}>
          Solid block with a V notched from the top. Reads as M, as a roofline,
          as a divided ledger. One silhouette, scales cleanly from 12px favicon
          to wall-sized signage.
        </div>
      </div>
      {/* Right: stacked lockups + wordmark */}
      <div style={{
        background: L.surface, padding: 32,
        display: 'flex', flexDirection: 'column', gap: 28, justifyContent: 'center',
      }}>
        <div>
          <div style={{ fontSize: 9.5, fontFamily: L.mono, color: L.sec, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Horizontal lockup</div>
          <Lockup Mark={MarkNotch} size={44} wordSize={28} letterSpacing={-1.2} />
        </div>
        <div>
          <div style={{ fontSize: 9.5, fontFamily: L.mono, color: L.sec, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Wordmark · Inter 600</div>
          <Wordmark size={34} letterSpacing={-1.2} />
        </div>
        <div>
          <div style={{ fontSize: 9.5, fontFamily: L.mono, color: L.sec, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Utility mark · mono</div>
          <span style={{ fontFamily: L.mono, fontSize: 22, fontWeight: 600, letterSpacing: -0.5 }}>
            <span style={{ color: L.sec }}>$</span> merchiva<span style={{ color: L.sec, animation: 'blink 1.1s steps(1) infinite' }}>_</span>
          </span>
        </div>
        <div style={{
          borderTop: `1px solid ${L.border}`, paddingTop: 16,
          display: 'flex', gap: 24, fontSize: 10.5, fontFamily: L.mono, color: L.sec,
        }}>
          <div><div style={{ color: L.text, fontWeight: 600 }}>#0C0A09</div>Ink</div>
          <div><div style={{ color: L.text, fontWeight: 600 }}>#FAFAF9</div>Surface</div>
          <div><div style={{ color: L.text, fontWeight: 600 }}>Inter 600</div>Wordmark</div>
          <div><div style={{ color: L.text, fontWeight: 600 }}>−1.2</div>Tracking</div>
        </div>
      </div>
    </div>
  );
}

function MarkGrid() {
  const items = [
    { name: '01 · Bracket',  Mark: MarkBracket, note: 'columns + shelves' },
    { name: '02 · Ledger',   Mark: MarkLedger,  note: 'pixel grid' },
    { name: '03 · Notch ★',  Mark: MarkNotch,   note: 'solid + V cut' },
    { name: '04 · Stack',    Mark: MarkStack,   note: 'box + seam' },
    { name: '05 · Bars',     Mark: MarkBars,    note: 'M as chart' },
    { name: '06 · Cursor',   Mark: MarkCursor,  note: 'mono + caret' },
  ];
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)',
      gap: 1, background: L.border,
    }}>
      {items.map(({ name, Mark, note }) => (
        <div key={name} style={{
          background: L.bg, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', position: 'relative',
        }}>
          <Mark size={110} />
          <div style={{
            position: 'absolute', top: 12, left: 14,
            fontSize: 10, fontFamily: L.mono, color: L.sec,
          }}>{name}</div>
          <div style={{
            position: 'absolute', bottom: 12, left: 14,
            fontSize: 10, fontFamily: L.mono, color: L.ter,
          }}>{note}</div>
        </div>
      ))}
    </div>
  );
}

function Construction() {
  // 8x8 grid with the Notch M constructed on top + labeled measurements
  const G = 40; // cell size for visual
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="-20 -20 140 140" width="440" height="440" style={{ background: L.bg }}>
        {/* grid */}
        {Array.from({ length: 11 }).map((_, i) => (
          <g key={i} stroke={L.border} strokeWidth="0.25">
            <line x1={i*10} y1="0" x2={i*10} y2="100" />
            <line x1="0" y1={i*10} x2="100" y2={i*10} />
          </g>
        ))}
        {/* safe area */}
        <rect x="14" y="14" width="72" height="72" fill="none" stroke={L.ter} strokeWidth="0.3" strokeDasharray="1 1"/>
        {/* mark */}
        <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" fill={L.ink} />
        {/* measurement arrows */}
        <g stroke={L.accent} strokeWidth="0.3" fill={L.accent} fontFamily={L.mono} fontSize="3">
          <line x1="14" y1="8" x2="86" y2="8" />
          <line x1="14" y1="6" x2="14" y2="10" />
          <line x1="86" y1="6" x2="86" y2="10" />
          <text x="50" y="6" textAnchor="middle">72u</text>

          <line x1="-6" y1="14" x2="-6" y2="86" />
          <line x1="-8" y1="14" x2="-4" y2="14" />
          <line x1="-8" y1="86" x2="-4" y2="86" />
          <text x="-10" y="52" textAnchor="middle" transform="rotate(-90 -10 52)">72u</text>

          <line x1="40" y1="94" x2="60" y2="94" />
          <text x="50" y="98" textAnchor="middle">20u</text>

          <line x1="94" y1="14" x2="94" y2="42" />
          <text x="98" y="30" textAnchor="middle" transform="rotate(90 98 30)">28u</text>
        </g>
        {/* annotations */}
        <g fontFamily={L.mono} fontSize="2.6" fill={L.sec}>
          <text x="50" y="45" textAnchor="middle" fill="#fff">V = 28u deep</text>
          <text x="50" y="108" textAnchor="middle">base grid · 10u cell · 1u = 1% of glyph box</text>
        </g>
      </svg>
    </div>
  );
}

function ClearSpace() {
  // Show clear space as a multiple of the notch width (x).
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex',
      alignItems: 'center', justifyContent: 'center', gap: 56,
    }}>
      {/* clear space */}
      <div>
        <div style={{ fontSize: 10, fontFamily: L.mono, color: L.sec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Clear space · ≥ ½x</div>
        <div style={{ position: 'relative', width: 220, height: 220, border: `1px dashed ${L.borderD}`, background: L.surface }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MarkNotch size={140} />
          </div>
          {/* x label */}
          <div style={{ position: 'absolute', left: -38, top: 40, fontFamily: L.mono, fontSize: 10, color: L.accent }}>½x</div>
          <div style={{ position: 'absolute', left: -38, top: 140, fontFamily: L.mono, fontSize: 10, color: L.accent }}>½x</div>
          <div style={{ position: 'absolute', top: -16, left: 40, fontFamily: L.mono, fontSize: 10, color: L.accent }}>½x</div>
          <div style={{ position: 'absolute', top: -16, right: 40, fontFamily: L.mono, fontSize: 10, color: L.accent }}>½x</div>
        </div>
      </div>
      {/* min sizes */}
      <div>
        <div style={{ fontSize: 10, fontFamily: L.mono, color: L.sec, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Minimum sizes</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
          {[16, 24, 40, 72].map(px => (
            <div key={px} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <MarkNotch size={px} />
              <span style={{ fontFamily: L.mono, fontSize: 10, color: L.sec }}>{px}px</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18, fontSize: 11, color: L.sec, fontFamily: L.mono, maxWidth: 260, lineHeight: 1.5 }}>
          Holds at 16px. Never smaller — below that the notch closes and the
          mark reads as a solid square.
        </div>
      </div>
    </div>
  );
}

function OnDarkFixed() {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: L.border,
    }}>
      <div style={{
        background: L.bg, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20, position: 'relative',
      }}>
        <MarkNotch size={140} fg={L.ink}/>
        <Wordmark size={26} />
        <Cap>light · ink on white</Cap>
      </div>
      <div style={{
        background: '#0c0a09', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20, position: 'relative',
      }}>
        <MarkNotch size={140} fg="#fafaf9"/>
        <Wordmark size={26} color="#fafaf9" />
        <div style={{
          position: 'absolute', bottom: 10, left: 12,
          fontSize: 10, color: '#78716c', fontFamily: L.mono,
        }}>dark · paper on ink</div>
      </div>
    </div>
  );
}

// ─── APPLICATIONS ──────────────────────────────────────────

function AppSidebar() {
  // Echo of the real sidebar chrome — h-14, logo cell
  return (
    <div style={{
      width: '100%', height: '100%', display: 'grid', gridTemplateColumns: '220px 1fr',
      background: L.bg,
    }}>
      <div style={{ borderRight: `1px solid ${L.border}`, background: '#fafaf9', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 56, borderBottom: `1px solid ${L.border}`, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <MarkNotch size={22} />
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.3 }}>Merchiva</span>
        </div>
        {/* store switcher */}
        <div style={{ padding: 10, borderBottom: `1px solid ${L.border}` }}>
          <div style={{
            border: `1px solid ${L.border}`, borderRadius: 3, background: '#fff',
            padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: 999, background: '#059669' }} />
            <div style={{ fontSize: 12, fontWeight: 500 }}>Blue Bottle · Xintiandi</div>
          </div>
        </div>
        {/* nav items */}
        <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {['Dashboard', 'POS', 'Inventory', 'Staffing', 'Reports', 'Settings'].map((n, i) => (
            <div key={n} style={{
              padding: '7px 10px', fontSize: 12.5, borderRadius: 3,
              background: i === 0 ? '#f5f5f4' : 'transparent',
              color: i === 0 ? L.ink : L.sec, fontWeight: i === 0 ? 500 : 400,
            }}>{n}</div>
          ))}
        </div>
        <div style={{ marginTop: 'auto', padding: '10px 14px', fontSize: 10, fontFamily: L.mono, color: L.ter, borderTop: `1px solid ${L.border}` }}>
          merchiva · v4.2.1
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: L.ter, fontFamily: L.mono, fontSize: 11,
      }}>
        — app content —
      </div>
    </div>
  );
}

function AppKiosk() {
  // Matches the kiosk topbar treatment: h-11 bg-stone-900 text-white font-mono
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: '#0c0a09',
    }}>
      <div style={{
        height: 44, background: '#0c0a09', borderBottom: '1px solid #292524',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 14,
        color: '#fafaf9', fontFamily: L.mono,
      }}>
        <MarkNotch size={18} fg="#fafaf9" />
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1.5 }}>MERCHIVA</span>
        <span style={{ color: '#57534e' }}>·</span>
        <span style={{ fontSize: 11, color: '#a8a29e' }}>POS · Register 02</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: '#34d399' }} />
          <span style={{ color: '#34d399', letterSpacing: 0.8 }}>ONLINE</span>
          <span style={{ color: '#57534e', margin: '0 6px' }}>·</span>
          <span style={{ color: '#a8a29e' }}>14:32:08</span>
        </div>
      </div>
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#44403c', fontFamily: L.mono, fontSize: 11,
      }}>
        — register surface —
      </div>
      <div style={{
        height: 32, background: '#fafaf9', borderTop: `1px solid ${L.border}`,
        display: 'flex', alignItems: 'center', padding: '0 16px',
        fontFamily: L.mono, fontSize: 10.5, color: L.ter, gap: 14,
      }}>
        <span>DRAWER · $412.50</span><span>·</span><span>TXN 0248</span><span>·</span><span>STAFF · CW</span>
      </div>
    </div>
  );
}

function Favicons() {
  // Render the mark at favicon-relevant sizes with browser-tab chrome.
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 36, flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {/* Chrome-like tab */}
        {['Merchiva · Dashboard', 'Inventory', 'Staffing'].map((t, i) => (
          <div key={t} style={{
            width: 200, height: 32,
            background: i === 0 ? '#fff' : '#e7e5e4',
            borderRadius: '6px 6px 0 0',
            border: `1px solid ${L.borderD}`, borderBottom: 'none',
            display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8,
            fontSize: 11, color: i === 0 ? L.ink : L.sec,
          }}>
            <MarkNotch size={14} fg={i === 0 ? L.ink : L.sec} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span>
            <span style={{ marginLeft: 'auto', color: L.ter }}>×</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28 }}>
        {[16, 20, 32, 48, 64].map(px => (
          <div key={px} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: px, height: px, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: L.bg, border: `1px solid ${L.border}`, borderRadius: 3,
            }}>
              {/* for favicon we fit mark with a 2u padding */}
              <MarkNotch size={Math.max(10, px - 4)} />
            </div>
            <span style={{ fontSize: 10, fontFamily: L.mono, color: L.sec }}>{px}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BusinessCard() {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 20, flexDirection: 'column',
    }}>
      {/* front */}
      <div style={{
        width: 420, height: 248, background: '#fafaf9', border: `1px solid ${L.border}`,
        borderRadius: 3, padding: 28, display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', position: 'relative', overflow: 'hidden',
      }}>
        <MarkNotch size={44} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.4 }}>Chen Wei</div>
            <div style={{ fontSize: 12, color: L.sec, marginTop: 2 }}>Operations · Blue Bottle, Xintiandi</div>
          </div>
          <div style={{ textAlign: 'right', fontFamily: L.mono, fontSize: 10.5, color: L.sec, lineHeight: 1.6 }}>
            <div>chen@merchiva.app</div>
            <div>bb-sh-xt.merchiva.app</div>
          </div>
        </div>
        {/* subtle grid markers */}
        <div style={{ position: 'absolute', top: 14, right: 14, fontSize: 9.5, fontFamily: L.mono, color: L.ter, letterSpacing: 0.6 }}>
          MCV-0248
        </div>
      </div>
      {/* back - dark */}
      <div style={{
        width: 420, height: 80, background: '#0c0a09', borderRadius: 3, padding: '0 28px',
        display: 'flex', alignItems: 'center', gap: 16, color: '#fafaf9',
      }}>
        <MarkNotch size={28} fg="#fafaf9" />
        <Wordmark size={22} color="#fafaf9" />
        <div style={{ marginLeft: 'auto', fontSize: 10.5, fontFamily: L.mono, color: '#78716c' }}>
          Operations software for small shops
        </div>
      </div>
    </div>
  );
}

function WordmarkStudy() {
  // Tight study of tracking + weight options.
  const options = [
    { label: 'Inter 500 · −1.0',   weight: 500, ls: -1.0 },
    { label: 'Inter 600 · −1.2 ★', weight: 600, ls: -1.2 },
    { label: 'Inter 700 · −1.5',   weight: 700, ls: -1.5 },
    { label: 'Mono 600 · −0.6',    weight: 600, ls: -0.6, family: L.mono },
  ];
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      justifyContent: 'center', padding: '0 32px', gap: 22,
    }}>
      {options.map(o => (
        <div key={o.label} style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
          <div style={{
            width: 170, fontFamily: L.mono, fontSize: 10, color: L.sec,
            textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0,
          }}>{o.label}</div>
          <Wordmark size={44} weight={o.weight} letterSpacing={o.ls} family={o.family || L.sans} />
        </div>
      ))}
      {/* letterform inspection */}
      <div style={{ borderTop: `1px solid ${L.border}`, paddingTop: 18, marginTop: 6 }}>
        <div style={{ fontFamily: L.mono, fontSize: 10, color: L.sec, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
          Glyph inspection
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
          {'Merchiva'.split('').map((c, i) => (
            <div key={i} style={{
              border: `1px solid ${L.border}`, background: L.bg,
              width: 52, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: L.sans, fontWeight: 600, fontSize: 36, letterSpacing: -1.2,
            }}>{c}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Rationale() {
  return (
    <div style={{
      width: '100%', height: '100%', padding: 32,
      display: 'flex', flexDirection: 'column', gap: 16,
      color: L.text,
    }}>
      <div style={{
        fontFamily: L.mono, fontSize: 10, color: L.sec,
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}>Why this mark</div>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1.25 }}>
        A ledger block with a notch — M for Merchiva, and a cue that this is
        software for splitting, counting, reconciling.
      </div>
      <ul style={{
        margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: L.text,
      }}>
        <li><b>System-consistent.</b> Same vocabulary as the app: one block, 1px edges, 3px radius, no gradients.</li>
        <li><b>Reads at 16px.</b> The notch holds. No thin strokes, no detail that dies in favicons.</li>
        <li><b>Monogram first.</b> Works alone as an app icon; pairs with Inter 600 / −1.2 wordmark.</li>
        <li><b>One color.</b> Rendered in ink or paper. No gradient, no glyph inside — a mark, not an illustration.</li>
        <li><b>Room to grow.</b> The notch is a variable — can widen, deepen, split to express product lines (POS, Staffing, Inventory) without redrawing the mark.</li>
      </ul>
      <div style={{ marginTop: 'auto', display: 'flex', gap: 24, fontFamily: L.mono, fontSize: 10.5, color: L.sec }}>
        <div><b style={{ color: L.ink }}>DO</b> — keep the V centered, keep the frame square, keep one color.</div>
        <div><b style={{ color: L.ink }}>DON'T</b> — add gradients, outline the mark, tilt it, colorize per surface.</div>
      </div>
    </div>
  );
}

// ─── Expose to global scope so Logo.html can use them ─────
Object.assign(window, {
  L,
  MarkBracket, MarkLedger, MarkNotch, MarkStack, MarkBars, MarkCursor,
  Wordmark, Lockup,
  HeroRecommended, MarkGrid, Construction, ClearSpace, OnDark: OnDarkFixed,
  AppSidebar, AppKiosk, Favicons, BusinessCard, WordmarkStudy, Rationale,
  LogoCard: Card,
});
