// ═══════════════════════════════════════════════════════════
// BizOps Desktop — Dashboard (v2 · chat-forward)
// Mr. Merchiva is a real chat. His insights are messages in the
// thread with embedded data (forecast chart, schedule preview,
// watchlist). The chat fills most of the screen; right rail keeps
// today's crew + notifications.
// ═══════════════════════════════════════════════════════════

const { useState: ddUS, useEffect: ddUE, useRef: ddUR, useMemo: ddUM } = React;

const M_ACC      = 'oklch(0.55 0.09 55)';
const M_ACC_SOFT = '#faf5ec';
const M_ACC_BD   = '#ecd9b8';
const DD_NOW_MIN = 10 * 60 + 30;

// ─── Notch M (agent mark) ────────────────────────────────
function NotchM({ size = 28, fg = '#fff', bg = '#1c1917' }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: 4,
      background: bg, flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} viewBox="0 0 100 100">
        <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" fill={fg} />
      </svg>
    </span>
  );
}

function MonoCap({ children, color = '#78716c', style }) {
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: 10, color, letterSpacing: 0.6, textTransform: 'uppercase',
      ...style,
    }}>{children}</span>
  );
}

function DDSpark({ data, color = '#1c1917', width = 80, height = 26, fill }) {
  const max = Math.max(...data) * 1.05;
  const min = Math.min(...data) * 0.95;
  const sx = (i) => (i / (data.length - 1)) * width;
  const sy = (v) => height - ((v - min) / (max - min || 1)) * height;
  const path = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {fill && <path d={`${path} L ${width} ${height} L 0 ${height} Z`} fill={color} fillOpacity="0.08" />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={sx(data.length - 1)} cy={sy(data[data.length - 1])} r="2.2" fill={color} />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════
// Top header (cleaner)
// ═══════════════════════════════════════════════════════════
function DDHeader() {
  return (
    <header className="h-14 border-b border-[var(--border)] bg-white flex items-center px-6 gap-4 shrink-0">
      <div className="flex items-center gap-3">
        <div className="text-[15px] font-semibold tracking-[-0.01em]">Dashboard</div>
        <span className="text-stone-300">·</span>
        <MonoCap>Tue · Apr 22</MonoCap>
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-wider text-stone-500 ml-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> open
        </span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        <button className="h-8 w-8 rounded border border-[var(--border)] bg-white text-stone-700 inline-flex items-center justify-center hover:bg-stone-50">
          <Icon name="search" size={14} />
        </button>
        <button className="relative h-8 w-8 rounded border border-[var(--border)] bg-white text-stone-700 inline-flex items-center justify-center hover:bg-stone-50">
          <Icon name="bell" size={14} />
          <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-red-600 text-white text-[9px] font-mono font-bold flex items-center justify-center tabular-nums border-2 border-white">4</span>
        </button>
        <div className="h-6 w-px bg-stone-200 mx-1" />
        <div className="flex items-center gap-2 pr-1">
          <Avatar name="Amelia Chen" size={28} />
          <div className="leading-tight">
            <div className="text-[12.5px] font-medium">Amelia Chen</div>
            <div className="text-[10.5px] text-stone-500">Manager · Maple Coffee</div>
          </div>
        </div>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════
// KPI strip — 4 cells
// ═══════════════════════════════════════════════════════════
function DDKpis() {
  const kpis = [
    { label: 'Revenue · today',  v: '$2,148', sub: 'vs Tue avg',     delta: '+9.4%', good: true },
    { label: 'Orders',           v: '184',    sub: '0–10:30 AM',     delta: '+12',   good: true },
    { label: 'On shift',         v: '4 / 5',  sub: '1 on break',     delta: 'live',  mono: true },
    { label: 'SKUs at risk',     v: '12',     sub: 'of 124 tracked', delta: '3 high', warn: true },
  ];
  return (
    <div className="grid grid-cols-4 border-b border-[var(--border)] bg-white">
      {kpis.map((k, i) => (
        <div key={i} className={`px-6 py-4 ${i > 0 ? 'border-l border-[var(--border)]' : ''}`}>
          <MonoCap>{k.label}</MonoCap>
          <div className="flex items-baseline gap-2 mt-2">
            <div className={`text-[26px] font-semibold leading-none tracking-[-0.02em] ${k.mono ? 'font-mono' : ''} ${k.warn ? 'text-amber-600' : 'text-stone-900'}`}>
              {k.v}
            </div>
            <div className={`text-[11px] font-mono tabular-nums ${k.warn ? 'text-amber-600' : k.good ? 'text-emerald-600' : 'text-stone-500'}`}>
              {k.delta}
            </div>
          </div>
          <div className="text-[11px] text-stone-500 mt-1.5">{k.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Mini forecast chart for embedded use inside chat
// ═══════════════════════════════════════════════════════════
const DD_FEATURED = {
  sku: 'OAT-1L',
  name: 'Oat milk · 1L',
  past:   [38, 42, 39, 45, 47, 51, 49, 46, 52, 55, 53, 58, 56, 62],
  future: [63, 66, 64, 70, 72, 68, 74, 76, 73, 78, 80, 77, 82, 84],
  bandHi: [68, 72, 71, 78, 81, 78, 85, 88, 86, 92, 95, 93, 99, 102],
  bandLo: [58, 60, 57, 62, 63, 58, 63, 64, 60, 64, 65, 61, 65, 66],
  reorderDay: 4,
  stockoutDay: 9,
};

function ForecastInlineChart() {
  const W = 600, H = 160, pad = 28;
  const all = [...DD_FEATURED.past, ...DD_FEATURED.future, ...DD_FEATURED.bandHi];
  const max = Math.max(...all) * 1.12;
  const len = DD_FEATURED.past.length + DD_FEATURED.future.length - 1;
  const sx = (i) => pad + (i / len) * (W - pad * 2);
  const sy = (v) => H - pad - (v / max) * (H - pad * 2);
  const pastPath = DD_FEATURED.past.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i)} ${sy(v)}`).join(' ');
  const splitIdx = DD_FEATURED.past.length - 1;
  const futPath = DD_FEATURED.future.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(splitIdx + i)} ${sy(v)}`).join(' ');
  const bandHi  = DD_FEATURED.bandHi.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(splitIdx + i)} ${sy(v)}`).join(' ');
  const bandLo  = DD_FEATURED.bandLo.map((v, i) => `L ${sx(splitIdx + (DD_FEATURED.bandLo.length - 1 - i))} ${sy(DD_FEATURED.bandLo[DD_FEATURED.bandLo.length - 1 - i])}`).join(' ');
  const reorderX = sx(splitIdx + DD_FEATURED.reorderDay);
  const stockoutX = sx(splitIdx + DD_FEATURED.stockoutDay);
  const splitX = sx(splitIdx);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      <defs>
        <linearGradient id="ddBandFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={M_ACC} stopOpacity="0.18" />
          <stop offset="100%" stopColor={M_ACC} stopOpacity="0.02" />
        </linearGradient>
        <pattern id="ddHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={M_ACC} strokeWidth="0.7" strokeOpacity="0.2" />
        </pattern>
      </defs>
      {[0.5, 1].map((p, i) => (
        <line key={i} x1={pad} x2={W - pad} y1={sy(max * p)} y2={sy(max * p)} stroke="#e7e5e4" strokeDasharray="2 4" />
      ))}
      <line x1={splitX} x2={splitX} y1={pad} y2={H - pad} stroke="#d6d3d1" strokeDasharray="3 3" />
      <text x={splitX - 5} y={pad + 9} textAnchor="end" fontFamily="JetBrains Mono" fontSize="9" fill="#78716c">actual</text>
      <text x={splitX + 5} y={pad + 9} textAnchor="start" fontFamily="JetBrains Mono" fontSize="9" fill={M_ACC}>forecast</text>
      <path d={`${bandHi} ${bandLo} Z`} fill="url(#ddHatch)" />
      <path d={`${bandHi} ${bandLo} Z`} fill="url(#ddBandFill)" />
      <path d={pastPath} fill="none" stroke="#1c1917" strokeWidth="1.8" />
      <path d={futPath} fill="none" stroke={M_ACC} strokeWidth="1.8" strokeDasharray="4 3" />
      {DD_FEATURED.past.map((v, i) => <circle key={'p' + i} cx={sx(i)} cy={sy(v)} r="1.8" fill="#1c1917" />)}
      {DD_FEATURED.future.map((v, i) => <circle key={'f' + i} cx={sx(splitIdx + i)} cy={sy(v)} r="2.2" fill="#fff" stroke={M_ACC} strokeWidth="1.3" />)}
      <line x1={reorderX} x2={reorderX} y1={pad - 6} y2={H - pad} stroke="#1c1917" strokeWidth="1" />
      <rect x={reorderX - 48} y={pad - 14} width="96" height="14" fill="#1c1917" rx="3" />
      <text x={reorderX} y={pad - 4} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="8.5" fill="#fff" letterSpacing="0.6">REORDER · MAY 14</text>
      <line x1={stockoutX} x2={stockoutX} y1={pad - 6} y2={H - pad} stroke="#dc2626" strokeWidth="1" strokeDasharray="2 2" />
      <rect x={stockoutX - 44} y={pad - 14} width="88" height="14" fill="#fef2f2" stroke="#fecaca" rx="3" />
      <text x={stockoutX} y={pad - 4} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="8.5" fill="#b91c1c" letterSpacing="0.6">STOCKOUT · MAY 19</text>
    </svg>
  );
}

// ─── Saturday gap preview ───────────────────────────────
function SaturdayPreview() {
  // closing window 4pm–10pm with one barista, recommended 2
  const hours = ['4p','5p','6p','7p','8p','9p','10p'];
  return (
    <div className="rounded border border-[var(--border)] bg-stone-50/60 p-3">
      <div className="flex items-center gap-2 mb-2">
        <MonoCap>sat may 1 · closing window</MonoCap>
        <span className="ml-auto text-[10.5px] font-mono text-amber-600">−1 barista</span>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {hours.map((h, i) => (
          <div key={h} className="flex flex-col items-center gap-1">
            <div className="text-[9px] font-mono text-stone-400 tabular-nums">{h}</div>
            <div className="w-full h-5 rounded-sm border" style={{
              background: i >= 0 && i <= 5 ? '#1c1917' : '#fff',
              borderColor: i >= 0 && i <= 5 ? '#1c1917' : '#d6d3d1',
            }} />
            <div className="w-full h-5 rounded-sm border border-dashed" style={{
              borderColor: '#d97706', background: '#fffbeb',
            }} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10.5px] text-stone-500">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 bg-stone-900 rounded-sm" /> scheduled</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 border border-dashed border-amber-600 bg-amber-50 rounded-sm" /> suggested</span>
        <span className="ml-auto font-mono text-stone-600">+6h · $84 labor</span>
      </div>
    </div>
  );
}

// ─── Watchlist mini-table ───────────────────────────────
const DD_INV_RISK = [
  { sku: 'SYR-VAN-750',  name: 'Vanilla syrup · 750ml', stock: 3,  par: 6,   unit: 'btl', cover: 2, risk: 'high', spark: [7,6,6,5,5,4,3] },
  { sku: 'MILK-WH-1G',   name: 'Whole milk · 1 gal',    stock: 6,  par: 12,  unit: 'gal', cover: 2, risk: 'high', spark: [12,11,10,9,8,7,6] },
  { sku: 'BEAN-ETH-1KG', name: 'Beans · Ethiopia · 1kg',stock: 18, par: 24,  unit: 'bag', cover: 5, risk: 'med',  spark: [26,25,23,22,21,19,18] },
];

function WatchlistMini() {
  return (
    <div className="rounded border border-[var(--border)] bg-white overflow-hidden">
      {DD_INV_RISK.map((r, i) => {
        const tone = r.risk === 'high' ? '#dc2626' : r.risk === 'med' ? '#d97706' : '#059669';
        return (
          <div key={r.sku} className={`flex items-center gap-3 px-3 py-2 ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}>
            <span className="font-mono text-[10.5px] text-stone-500 w-[100px] shrink-0">{r.sku}</span>
            <span className="text-[12.5px] flex-1 truncate">{r.name}</span>
            <span className="font-mono text-[11px] tabular-nums text-stone-700">
              <span style={{ color: tone, fontWeight: 600 }}>{r.stock}</span>
              <span className="text-stone-400">/{r.par}</span>
            </span>
            <DDSpark data={r.spark} color={tone} width={48} height={18} fill />
            <span className="font-mono text-[10.5px] tabular-nums" style={{ color: tone, width: 30, textAlign: 'right' }}>
              {r.cover}d
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Chat message components
// ═══════════════════════════════════════════════════════════
function Bubble({ children, footer }) {
  return (
    <div className="flex flex-col gap-2 max-w-[680px]">
      <div className="rounded-lg border border-[var(--border)] bg-white p-4 flex flex-col gap-3">
        {children}
      </div>
      {footer && <div className="px-1">{footer}</div>}
    </div>
  );
}

function ChatRow({ from = 'merchiva', children, time, footer }) {
  if (from === 'system') {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1 h-px bg-stone-200" />
        <MonoCap>{children}</MonoCap>
        <div className="flex-1 h-px bg-stone-200" />
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3">
      <NotchM size={32} fg="#fff" bg="#1c1917" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[12.5px] font-semibold tracking-[-0.01em]">Mr. Merchiva</span>
          <MonoCap color="#a8a29e">{time}</MonoCap>
        </div>
        <div className="flex flex-col gap-2">
          {children}
        </div>
        {footer && <div className="mt-2">{footer}</div>}
      </div>
    </div>
  );
}

function InsightCard({ pill, icon, title, body, confidence, primary, secondary, embed, reasoning }) {
  const [expanded, setExpanded] = ddUS(false);
  return (
    <Bubble>
      <div className="flex items-center gap-2">
        <span className="h-6 px-2 rounded inline-flex items-center gap-1.5"
          style={{ background: M_ACC_SOFT, border: `1px solid ${M_ACC_BD}`, color: M_ACC }}>
          <Icon name={icon} size={11} />
          <span className="font-mono text-[10px] tracking-[0.08em] uppercase font-semibold">{pill}</span>
        </span>
        <div className="flex-1" />
        <div className="inline-flex items-center gap-1.5 text-[10.5px] font-mono text-stone-500">
          confidence
          <span className="tabular-nums text-stone-900 font-semibold">{(confidence * 100).toFixed(0)}%</span>
          <span className="inline-block w-12 h-1 rounded-full bg-stone-100 overflow-hidden">
            <span className="block h-full" style={{ width: `${confidence * 100}%`, background: M_ACC }} />
          </span>
        </div>
      </div>
      <h3 className="text-[20px] font-semibold tracking-[-0.02em] leading-[1.2]">{title}</h3>
      <p className="text-[13.5px] text-stone-600 leading-[1.55]" style={{ textWrap: 'pretty' }}>{body}</p>

      {embed}

      <div className="flex items-center gap-2">
        <button className="h-9 px-4 bg-stone-900 text-white rounded text-[13px] font-medium hover:bg-stone-800 inline-flex items-center gap-2">
          {primary.label}
          <Icon name={primary.icon || 'arrow-right'} size={13} />
        </button>
        <button className="h-9 px-3 rounded border border-[var(--border)] bg-white text-stone-700 text-[13px] font-medium hover:bg-stone-50">
          {secondary}
        </button>
        <div className="flex-1" />
        {reasoning && (
          <button onClick={() => setExpanded(e => !e)}
            className="h-9 px-2 text-[11.5px] text-stone-500 hover:text-stone-900 inline-flex items-center gap-1">
            {expanded ? 'Hide' : 'Why'}
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={12} />
          </button>
        )}
      </div>
      {expanded && reasoning && (
        <div className="border-t border-[var(--border)] pt-3 -mx-4 -mb-4 px-4 pb-4 bg-stone-50/60">
          <MonoCap>based on</MonoCap>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {reasoning.map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5 px-2 py-1 border border-[var(--border)] rounded bg-white font-mono text-[10.5px] text-stone-600">
                <span className="w-1 h-1 rounded-full" style={{ background: M_ACC }} />
                {r}
              </span>
            ))}
          </div>
        </div>
      )}
    </Bubble>
  );
}

// ═══════════════════════════════════════════════════════════
// Mr. Merchiva — chat console (the main surface)
// ═══════════════════════════════════════════════════════════
function MerchivaChat() {
  const [draft, setDraft] = ddUS('');
  const [shown, setShown] = ddUS('');
  const headline = 'Good morning, Amelia. I scanned overnight — here are 3 things to look at.';
  const scrollRef = ddUR(null);

  ddUE(() => {
    let i = 0;
    setShown('');
    const h = setInterval(() => {
      i++;
      setShown(headline.slice(0, i));
      if (i >= headline.length) clearInterval(h);
    }, 18);
    return () => clearInterval(h);
  }, []);

  const quickChips = [
    'Forecast next week',
    'Who can cover Saturday?',
    'Draft a PO for oat milk',
    'Top sellers today',
    'Why was Monday slow?',
  ];

  return (
    <section className="rounded-lg border border-[var(--border)] bg-white overflow-hidden flex flex-col min-h-0">
      {/* Header */}
      <header className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-3 shrink-0" style={{ background: M_ACC_SOFT }}>
        <NotchM size={36} fg={M_ACC_SOFT} bg="#1c1917" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold tracking-[-0.01em]">Mr. Merchiva</span>
            <span className="inline-flex items-center gap-1 ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <MonoCap color="#059669">online</MonoCap>
            </span>
          </div>
          <div className="text-[11.5px] text-stone-600 mt-0.5">
            Your ops agent · trained on Maple Coffee · <span className="font-mono">4,128</span> actions in the last 30 days
          </div>
        </div>
        <button className="h-8 w-8 rounded border bg-white text-stone-700 inline-flex items-center justify-center hover:bg-stone-50" style={{ borderColor: M_ACC_BD }}>
          <Icon name="history" size={14} />
        </button>
        <button className="h-8 w-8 rounded border bg-white text-stone-700 inline-flex items-center justify-center hover:bg-stone-50" style={{ borderColor: M_ACC_BD }}>
          <Icon name="more-horizontal" size={14} />
        </button>
      </header>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-6 py-5 flex flex-col gap-5 min-h-0">
        <ChatRow from="system">today · tuesday april 22</ChatRow>

        <ChatRow time="06:14">
          <div className="text-[14px] text-stone-800 leading-[1.55] max-w-[680px]">
            {shown}
            <span className="inline-block w-[8px] h-[14px] -mb-0.5 ml-0.5 bg-stone-900 align-middle"
              style={{ animation: 'ddBlink 1s steps(1) infinite', opacity: shown.length < headline.length ? 1 : 0 }} />
          </div>
        </ChatRow>

        <ChatRow time="06:14">
          <InsightCard
            pill="INVENTORY"
            icon="package"
            title="Reorder oat milk today."
            body="At current pace you stock out Fri May 15. Pacific Farms lead time is 3 days. I drafted a 14-case PO at $42.50/case."
            confidence={0.94}
            primary={{ label: 'Review PO · $595', icon: 'arrow-right' }}
            secondary="Snooze 24h"
            reasoning={['sales velocity · 7d', 'lead time · 3d', 'safety stock · 2d', 'pack rounding · 12-btl cases']}
            embed={
              <div className="rounded border border-[var(--border)] bg-stone-50/40 p-3">
                <div className="flex items-baseline gap-2 mb-2">
                  <div className="text-[12.5px] font-semibold">{DD_FEATURED.name}</div>
                  <MonoCap>{DD_FEATURED.sku} · pacific farms · lead 3d</MonoCap>
                </div>
                <ForecastInlineChart />
                <div className="grid grid-cols-4 gap-0 mt-2 divide-x divide-[var(--border)] border-t border-[var(--border)] pt-3 -mx-3 -mb-3 px-3 pb-2">
                  {[
                    ['Predicted · 14d', '1,028 L'],
                    ['Reorder by',      'May 14'],
                    ['Qty · cost',      '14 · $595'],
                    ['Stockout risk',   '2.4%'],
                  ].map(([k, v], i) => (
                    <div key={k} className={`${i > 0 ? 'pl-3' : ''}`}>
                      <MonoCap>{k}</MonoCap>
                      <div className="text-[14px] font-mono tabular-nums mt-1">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            }
          />
        </ChatRow>

        <ChatRow time="06:15">
          <InsightCard
            pill="STAFFING"
            icon="users"
            title="Add one closer on Saturday."
            body="Warriors home game + clear skies + payday weekend. I expect a 22% lift after 4 PM. Closing shift is one barista short of recommended ratio."
            confidence={0.81}
            primary={{ label: 'Open schedule', icon: 'calendar' }}
            secondary="Dismiss"
            reasoning={['similar saturdays · +21%', 'weather · clear · +4%', 'event proximity · 0.8 mi', 'ratio · 3.4 orders/staff']}
            embed={<SaturdayPreview />}
          />
        </ChatRow>

        <ChatRow time="06:17">
          <Bubble>
            <div className="flex items-center gap-2">
              <span className="h-6 px-2 rounded inline-flex items-center gap-1.5"
                style={{ background: '#f5f5f4', border: `1px solid #e7e5e4`, color: '#57534e' }}>
                <Icon name="eye" size={11} />
                <span className="font-mono text-[10px] tracking-[0.08em] uppercase font-semibold">WATCHLIST</span>
              </span>
              <span className="text-[13.5px] font-medium ml-1">Also keep an eye on these 3.</span>
              <div className="flex-1" />
              <button className="text-[11.5px] text-stone-500 hover:text-stone-900 inline-flex items-center gap-1">
                view all 12 <Icon name="chevron-right" size={12} />
              </button>
            </div>
            <WatchlistMini />
          </Bubble>
        </ChatRow>

        <ChatRow from="system">type a message to chat with Mr. Merchiva</ChatRow>
      </div>

      {/* Quick chips */}
      <div className="px-6 pt-3 pb-2 flex items-center gap-1.5 flex-wrap shrink-0">
        {quickChips.map((s) => (
          <button key={s} className="h-7 px-2.5 rounded-full border border-[var(--border)] bg-white text-[11.5px] text-stone-600 hover:bg-stone-50 inline-flex items-center gap-1.5">
            <Icon name="sparkles" size={11} style={{ color: M_ACC }} />
            {s}
          </button>
        ))}
      </div>

      {/* Composer — big */}
      <div className="px-6 pb-5 pt-2 shrink-0">
        <div className="rounded-lg border border-[var(--border)] bg-white focus-within:border-stone-400 transition-colors">
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask Mr. Merchiva anything — “forecast next week”, “draft a PO”, “why was Monday slow?”"
            className="w-full resize-none bg-transparent border-0 outline-none px-4 pt-3 pb-2 text-[14px] leading-[1.5] placeholder:text-stone-400"
            style={{ fontFamily: "'Inter', sans-serif" }}
          />
          <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
            <button className="h-8 w-8 rounded text-stone-500 hover:bg-stone-100 inline-flex items-center justify-center" title="Attach">
              <Icon name="paperclip" size={15} />
            </button>
            <button className="h-8 w-8 rounded text-stone-500 hover:bg-stone-100 inline-flex items-center justify-center" title="Voice">
              <Icon name="mic" size={15} />
            </button>
            <button className="h-8 px-2 rounded text-stone-500 hover:bg-stone-100 inline-flex items-center gap-1.5" title="Mention data">
              <Icon name="at-sign" size={14} />
              <span className="text-[11.5px]">data</span>
            </button>
            <div className="flex-1" />
            <kbd className="font-mono text-[10px] text-stone-400 border border-[var(--border)] rounded px-1.5 py-0.5">⏎ to send</kbd>
            <button
              disabled={!draft.trim()}
              className="h-9 px-4 rounded bg-stone-900 text-white text-[13px] font-medium hover:bg-stone-800 inline-flex items-center gap-2 disabled:opacity-30">
              Send
              <Icon name="arrow-up" size={13} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// Today's Schedule (right column upper) — compact
// ═══════════════════════════════════════════════════════════
function TodayScheduleCard() {
  const todayStr = isoDate(new Date(2026, 3, 22));
  const shifts = SHIFTS_SEED.filter(s => s.date === todayStr).map(s => {
    const [sh, sm] = s.startTime.split(':').map(Number);
    const [eh, em] = s.endTime.split(':').map(Number);
    const m = TEAM.find(x => x.id === s.memberId);
    return { ...s, name: m.name, role: s.staffRoles.join(' · '), startMin: sh * 60 + sm, endMin: eh * 60 + em };
  }).sort((a, b) => a.startMin - b.startMin);

  const onShift = shifts.filter(s => DD_NOW_MIN >= s.startMin && DD_NOW_MIN < s.endMin);
  const upNext  = shifts.filter(s => s.startMin > DD_NOW_MIN).slice(0, 2);

  const startHr = 6, endHr = 22;
  const totalMin = (endHr - startHr) * 60;
  const pct = (m) => ((m - startHr * 60) / totalMin) * 100;
  const lanes = [];
  shifts.forEach(s => {
    let placed = false;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i][lanes[i].length - 1].endMin <= s.startMin) {
        lanes[i].push(s); s.lane = i; placed = true; break;
      }
    }
    if (!placed) { lanes.push([s]); s.lane = lanes.length - 1; }
  });
  const ticks = [6, 10, 14, 18, 22];

  return (
    <section className="rounded-lg border border-[var(--border)] bg-white overflow-hidden">
      <header className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
        <div className="flex-1">
          <div className="text-[13.5px] font-semibold">Today's schedule</div>
          <div className="text-[11px] text-stone-500">
            <span className="font-mono">{shifts.length}</span> shifts · <span className="font-mono">53.0</span> hrs
          </div>
        </div>
        <button className="text-[11.5px] text-stone-500 hover:text-stone-900 inline-flex items-center gap-0.5">
          Open <Icon name="chevron-right" size={12} />
        </button>
      </header>

      <div className="px-5 pt-3 pb-4">
        <div className="relative h-3 mb-1">
          {ticks.map(h => (
            <div key={h} className="absolute font-mono text-[9px] text-stone-400 tabular-nums -translate-x-1/2" style={{ left: `${pct(h * 60)}%`, top: 0 }}>
              {h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}
            </div>
          ))}
        </div>
        <div className="relative rounded border border-[var(--border)] bg-stone-50 overflow-hidden" style={{ height: lanes.length * 22 + (lanes.length - 1) * 3 + 8 }}>
          {ticks.map(h => (
            <div key={h} className="absolute top-0 bottom-0 w-px bg-stone-200" style={{ left: `${pct(h * 60)}%` }} />
          ))}
          {shifts.map(s => {
            const left = pct(s.startMin);
            const width = pct(s.endMin) - pct(s.startMin);
            const isActive = DD_NOW_MIN >= s.startMin && DD_NOW_MIN < s.endMin;
            return (
              <div key={s.id} className="absolute flex items-center gap-1.5 px-1.5 rounded border text-[10px] font-medium whitespace-nowrap overflow-hidden"
                style={{
                  left: `${left}%`, width: `${width}%`,
                  top: s.lane * 25 + 4, height: 21,
                  background: isActive ? '#1c1917' : '#fff',
                  borderColor: isActive ? '#1c1917' : '#d6d3d1',
                  color: isActive ? '#fff' : '#1c1917',
                }}>
                <span className="w-1 h-1 rounded-full shrink-0" style={{ background: isActive ? '#fff' : SHIFT_COLORS[s.shiftType] || '#78716c' }} />
                <span className="overflow-hidden text-ellipsis">{s.name.split(' ')[0]}</span>
              </div>
            );
          })}
          <div className="absolute -top-1 -bottom-1 w-px bg-red-500" style={{ left: `${pct(DD_NOW_MIN)}%` }}>
            <div className="absolute -top-1 -left-[3px] w-[7px] h-[7px] rounded-full bg-red-500" />
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
        <div className="px-5 py-2 flex items-center gap-2">
          <MonoCap>on shift · {onShift.length}</MonoCap>
          <span className="ml-auto text-[10.5px] font-mono text-emerald-600 inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> live
          </span>
        </div>
        {onShift.map(s => (
          <div key={s.id} className="px-5 py-2 flex items-center gap-3">
            <Avatar name={s.name} size={24} />
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-medium leading-tight">{s.name}</div>
              <div className="text-[10.5px] text-stone-500 leading-tight mt-0.5">{s.role}</div>
            </div>
            <div className="font-mono text-[11px] tabular-nums text-stone-700 text-right">
              {formatTimeShort(s.startTime)}–{formatTimeShort(s.endTime)}
            </div>
          </div>
        ))}
        <div className="px-5 py-2 flex items-center gap-2">
          <MonoCap>up next</MonoCap>
        </div>
        {upNext.map(s => {
          const inMin = s.startMin - DD_NOW_MIN;
          const inStr = inMin < 60 ? `in ${inMin}m` : `in ${Math.floor(inMin/60)}h`;
          return (
            <div key={s.id} className="px-5 py-2 flex items-center gap-3">
              <Avatar name={s.name} size={24} />
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium leading-tight">{s.name}</div>
                <div className="text-[10.5px] text-stone-500 leading-tight mt-0.5">{s.role} · {inStr}</div>
              </div>
              <div className="font-mono text-[11px] tabular-nums text-stone-700">{formatTimeShort(s.startTime)}–{formatTimeShort(s.endTime)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// Notifications — simplified (no filter chips)
// ═══════════════════════════════════════════════════════════
const DD_NOTIFS = [
  { id: 'n1', icon: 'arrow-left-right', tone: 'warn',
    title: 'Marcus → Elena · shift trade',
    sub:   'Tue 11a–7p · Barista',
    when:  '12m', action: 'Review', actor: 'Marcus Lee',
  },
  { id: 'n2', icon: 'calendar-x', tone: 'warn',
    title: '3 time-off requests',
    sub:   'Jordan, Elena, Sofia · earliest May 17',
    when:  '1h', action: 'Approve',
  },
  { id: 'n3', icon: 'cloud-rain', tone: 'agent',
    title: 'Thu weather adjust',
    sub:   'Heavy rain. Mr. Merchiva lowered prep by 8%.',
    when:  '2h', action: 'Undo',
  },
  { id: 'n4', icon: 'truck', tone: 'default',
    title: 'Pacific Farms · delivery confirmed',
    sub:   'PO #4188 · Wed 7:30 AM',
    when:  '3h',
  },
];

function NotificationsCard() {
  const tones = {
    warn:    { bg: '#fffbeb', bd: '#fde68a', fg: '#d97706' },
    agent:   { bg: M_ACC_SOFT, bd: M_ACC_BD, fg: M_ACC },
    default: { bg: '#f5f5f4', bd: '#e7e5e4', fg: '#57534e' },
  };
  return (
    <section className="rounded-lg border border-[var(--border)] bg-white overflow-hidden flex flex-col">
      <header className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
        <div className="flex-1">
          <div className="text-[13.5px] font-semibold">Notifications</div>
          <div className="text-[11px] text-stone-500">
            <span className="font-mono">4</span> new · <span className="font-mono">2</span> need a decision
          </div>
        </div>
        <button className="text-[11.5px] text-stone-500 hover:text-stone-900">Mark all read</button>
      </header>

      <div className="divide-y divide-[var(--border)]">
        {DD_NOTIFS.map(n => {
          const t = tones[n.tone];
          return (
            <div key={n.id} className="px-5 py-3 flex items-start gap-3">
              {n.tone === 'agent' ? (
                <NotchM size={24} fg={M_ACC_SOFT} bg="#1c1917" />
              ) : n.actor ? (
                <Avatar name={n.actor} size={24} />
              ) : (
                <span className="h-6 w-6 rounded border inline-flex items-center justify-center shrink-0"
                  style={{ background: t.bg, borderColor: t.bd, color: t.fg }}>
                  <Icon name={n.icon} size={12} />
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <div className="text-[12.5px] font-medium text-stone-900 leading-tight truncate">{n.title}</div>
                  <span className="ml-auto font-mono text-[10px] text-stone-400 tabular-nums shrink-0">{n.when}</span>
                </div>
                <div className="text-[11.5px] text-stone-500 leading-snug mt-1">{n.sub}</div>
                {n.action && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <button className="h-6 px-2 rounded bg-stone-900 text-white text-[11px] font-medium hover:bg-stone-800">
                      {n.action}
                    </button>
                    <button className="h-6 px-2 rounded border border-[var(--border)] bg-white text-stone-600 text-[11px] font-medium hover:bg-stone-50">
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// Root
// ═══════════════════════════════════════════════════════════
function DesktopDashboard() {
  const [route, setRoute] = ddUS('dashboard');
  const [collapsed, setCollapsed] = ddUS(false);
  return (
    <div className="h-screen w-screen flex bg-stone-50">
      <style>{`@keyframes ddBlink { 0%,50% { opacity: 1; } 50.01%,100% { opacity: 0; } }`}</style>
      <AppSidebar current={route} onNav={setRoute} collapsed={collapsed} onToggleCollapse={() => setCollapsed(c => !c)} />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <DDHeader />
        <DDKpis />
        <div className="flex-1 min-h-0 grid gap-4 p-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 360px' }}>
          <MerchivaChat />
          <div className="flex flex-col gap-4 min-h-0 overflow-auto">
            <TodayScheduleCard />
            <NotificationsCard />
          </div>
        </div>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<DesktopDashboard />);
