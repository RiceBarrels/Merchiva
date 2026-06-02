// ═══════════════════════════════════════════════════════════
// BizOps Mobile — Dashboard (home)
// Mr. Merchiva AI · Inventory forecast · Today's schedule · Notifications
// Follows the design system in bz-shared.jsx (achromatic stone, 3px radii,
// bordered cards, Inter + JetBrains Mono).
// ═══════════════════════════════════════════════════════════

const { useState: dUS, useEffect: dUE, useRef: dUR } = React;

// ─── Mr. Merchiva accent (warm, used sparingly) ─────────
const M_ACCENT = 'oklch(0.55 0.09 55)';   // warm umber, brand
const M_ACCENT_SOFT = '#faf5ec';
const M_ACCENT_BORDER = '#ecd9b8';

// ─── Notch M mark — AI agent avatar ─────────────────────
function NotchM({ size = 22, fg = B.bg, bg = B.text }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: B.radius,
      background: bg,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <svg width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} viewBox="0 0 100 100">
        <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" fill={fg} />
      </svg>
    </span>
  );
}

// ─── Inventory forecast data (pinned, tuesday Apr 22) ───
const DASH_TODAY = new Date(2026, 3, 22);

const INV_FORECAST = [
  {
    sku: 'OAT-1L', name: 'Oat milk · 1L', vendor: 'Pacific Farms',
    onHand: 14, par: 24, unit: 'btl',
    spark: [22, 20, 18, 17, 16, 15, 14],
    stockoutIn: 3, // days
    suggest: '14 cases',
    risk: 'high',
  },
  {
    sku: 'BEAN-ETH-1KG', name: 'Beans · Ethiopia · 1kg', vendor: 'Ritual Roast',
    onHand: 18, par: 24, unit: 'bag',
    spark: [26, 25, 23, 22, 21, 19, 18],
    stockoutIn: 5,
    suggest: '8 bags',
    risk: 'med',
  },
  {
    sku: 'SYR-VAN-750', name: 'Vanilla syrup · 750ml', vendor: 'Monin · West',
    onHand: 3, par: 6, unit: 'btl',
    spark: [7, 6, 6, 5, 5, 4, 3],
    stockoutIn: 2,
    suggest: '6 btl',
    risk: 'high',
  },
  {
    sku: 'CUP-12-WHT', name: 'Cups · 12oz · white', vendor: 'PaperHaus',
    onHand: 312, par: 800, unit: 'pcs',
    spark: [620, 540, 480, 430, 390, 350, 312],
    stockoutIn: 7,
    suggest: '2 cases',
    risk: 'low',
  },
];

// ─── Merchiva insight cards (proactive AI suggestions) ──
const MR_INSIGHTS = [
  {
    id: 'i1',
    kind: 'reorder',
    icon: 'package',
    title: 'Reorder oat milk · today',
    body: 'Forecast shows stockout by Fri May 15. I drafted a 14-case PO to Pacific Farms.',
    confidence: 0.94,
    action: 'Review PO',
  },
  {
    id: 'i2',
    kind: 'staffing',
    icon: 'users',
    title: 'Add one closer · Saturday',
    body: 'Warriors home game + 18°C. Predicted 22% lift after 4pm. One barista short on the closing shift.',
    confidence: 0.81,
    action: 'See schedule',
  },
  {
    id: 'i3',
    kind: 'menu',
    icon: 'sparkles',
    title: 'Pull the mango lemonade',
    body: '14-day sales down 38%. Vendor cost up 9%. Replace with a stone-fruit special next week?',
    confidence: 0.72,
    action: 'Draft replacement',
  },
];

// ─── Notifications (kept short) ─────────────────────────
const NOTIFS = [
  {
    id: 'n1', icon: 'arrow-left-right', tone: 'warn',
    title: 'Marcus → Elena · trade',
    sub: 'Tue 11a–7p · Barista · awaiting your approval',
    when: '12m',
  },
  {
    id: 'n2', icon: 'calendar-x', tone: 'warn',
    title: '3 time-off requests',
    sub: 'Jordan, Elena, Sofia · earliest May 17',
    when: '1h',
  },
  {
    id: 'n3', icon: 'cloud-rain', tone: 'default',
    title: 'Thu weather · heavy rain',
    sub: 'Mr. Merchiva lowered Thu prep by 8%.',
    when: '2h',
  },
  {
    id: 'n4', icon: 'credit-card', tone: 'default',
    title: 'Payroll runs Friday',
    sub: '8 active · $4,128 estimated · auto-submit on',
    when: '3h',
  },
];

// ─── Sparkline ──────────────────────────────────────────
function Spark({ data, color = B.text, width = 64, height = 22, fill = false }) {
  const max = Math.max(...data) * 1.05;
  const min = Math.min(...data) * 0.95;
  const sx = (i) => (i / (data.length - 1)) * width;
  const sy = (v) => height - ((v - min) / (max - min || 1)) * height;
  const path = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');
  const last = data[data.length - 1];
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      {fill && (
        <path d={`${path} L ${width} ${height} L 0 ${height} Z`} fill={color} fillOpacity="0.08" />
      )}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={sx(data.length - 1)} cy={sy(last)} r="2" fill={color} />
    </svg>
  );
}

// ─── Mr. Merchiva — hero AI panel ───────────────────────
function MrMerchivaPanel({ insights, idx, setIdx }) {
  // typewriter on the headline of the active insight
  const active = insights[idx];
  const [shown, setShown] = dUS('');
  dUE(() => {
    setShown('');
    let i = 0;
    const target = active.title;
    const id = setInterval(() => {
      i++;
      setShown(target.slice(0, i));
      if (i >= target.length) clearInterval(id);
    }, 26);
    return () => clearInterval(id);
  }, [idx, active.title]);

  return (
    <div style={{
      margin: '14px 14px 0',
      border: `1px solid ${B.borderS}`,
      borderRadius: B.radiusLg,
      background: B.bg,
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* identity row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px 10px',
        background: M_ACCENT_SOFT,
        borderBottom: `1px solid ${M_ACCENT_BORDER}`,
      }}>
        <NotchM size={28} fg={M_ACCENT_SOFT} bg={B.text} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: B.text, letterSpacing: -0.2 }}>Mr. Merchiva</span>
            <span style={{
              width: 5, height: 5, borderRadius: 99, background: B.ok,
              boxShadow: `0 0 0 2px ${M_ACCENT_SOFT}`,
            }} />
            <span style={{ fontFamily: B.mono, fontSize: 9.5, color: B.sec, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              awake · 06:14
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: B.text2, marginTop: 2, letterSpacing: -0.05 }}>
            Good morning, Amelia. I scanned overnight — <span style={{ fontWeight: 600, color: B.text }}>3 things</span> need a look.
          </div>
        </div>
        <button style={{
          width: 28, height: 28, borderRadius: B.radius,
          border: `1px solid ${M_ACCENT_BORDER}`, background: B.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: B.text2, cursor: 'pointer', flexShrink: 0,
        }}>
          <BIcon name="message-square" size={14} />
        </button>
      </div>

      {/* insight body */}
      <div style={{ padding: '14px 14px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{
            width: 26, height: 26, borderRadius: B.radius,
            background: B.muted, border: `1px solid ${B.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: B.text2,
          }}>
            <BIcon name={active.icon} size={13} />
          </span>
          <Label>insight {idx + 1} of {insights.length}</Label>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: B.mono, fontSize: 10, color: B.sec, fontVariantNumeric: 'tabular-nums' }}>
            conf · {(active.confidence * 100).toFixed(0)}%
          </span>
        </div>

        <div style={{
          fontSize: 16, fontWeight: 600, color: B.text, letterSpacing: -0.3, lineHeight: 1.25,
          minHeight: 22, display: 'flex', alignItems: 'center', gap: 2,
        }}>
          {shown}
          <span style={{
            display: 'inline-block', width: 7, height: 14, marginLeft: 2, marginBottom: -2,
            background: B.text, animation: 'mvBlink 1s steps(1) infinite',
            opacity: shown.length < active.title.length ? 1 : 0,
          }} />
        </div>
        <div style={{ fontSize: 12.5, color: B.text2, marginTop: 6, lineHeight: 1.45, textWrap: 'pretty' }}>
          {active.body}
        </div>

        {/* actions + pager */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <button style={{
            height: 30, padding: '0 12px', borderRadius: B.radius,
            background: B.text, color: B.onPri, border: `1px solid ${B.text}`,
            fontSize: 12, fontWeight: 500, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: B.font,
          }}>
            {active.action} <BIcon name="arrow-right" size={12} />
          </button>
          <button style={{
            height: 30, padding: '0 10px', borderRadius: B.radius,
            background: B.bg, color: B.text2, border: `1px solid ${B.border}`,
            fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: B.font,
          }}>
            Dismiss
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={() => setIdx((idx - 1 + insights.length) % insights.length)} style={pagerBtn}>
            <BIcon name="chevron-left" size={14} />
          </button>
          <button onClick={() => setIdx((idx + 1) % insights.length)} style={pagerBtn}>
            <BIcon name="chevron-right" size={14} />
          </button>
        </div>
      </div>

      {/* pager dots */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 5,
        padding: '0 0 10px',
      }}>
        {insights.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)} style={{
            width: i === idx ? 16 : 5, height: 5, borderRadius: 99,
            background: i === idx ? B.text : B.borderS,
            border: 'none', padding: 0, cursor: 'pointer',
            transition: 'width 200ms ease, background 200ms ease',
          }} />
        ))}
      </div>
    </div>
  );
}
const pagerBtn = {
  width: 28, height: 28, borderRadius: B.radius,
  border: `1px solid ${B.border}`, background: B.bg,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: B.text2, cursor: 'pointer',
};

// ─── Forecast row ───────────────────────────────────────
function ForecastRow({ item, last }) {
  const pct = Math.min(1, item.onHand / item.par);
  const riskTone = item.risk === 'high' ? B.danger : item.risk === 'med' ? B.warn : B.ok;
  const riskLabel = item.risk === 'high' ? 'High' : item.risk === 'med' ? 'Watch' : 'OK';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
      borderTop: `1px solid ${B.border}`,
      background: B.bg,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500, color: B.text, letterSpacing: -0.15 }}>
            {item.name}
          </span>
          <span style={{ fontFamily: B.mono, fontSize: 9.5, color: B.ter }}>{item.sku}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
          <span style={{ fontFamily: B.mono, fontSize: 11, color: B.text2, fontVariantNumeric: 'tabular-nums' }}>
            {item.onHand}<span style={{ color: B.ter }}>/{item.par}</span> {item.unit}
          </span>
          <span style={{ color: B.borderS }}>·</span>
          <span style={{ fontSize: 11, color: item.risk === 'high' ? B.danger : B.sec }}>
            {item.risk === 'low'
              ? `${item.stockoutIn}d cover`
              : `out in ${item.stockoutIn}d`}
          </span>
        </div>
        <div style={{ height: 4, background: B.muted, borderRadius: 99, marginTop: 7, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct * 100}%`,
            background: item.risk === 'high' ? B.danger : item.risk === 'med' ? B.warn : B.text,
            transition: 'width 400ms',
          }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <Spark data={item.spark} color={riskTone} width={56} height={22} fill />
        <span style={{
          fontFamily: B.mono, fontSize: 9.5, fontWeight: 600,
          color: riskTone, textTransform: 'uppercase', letterSpacing: 0.4,
        }}>{riskLabel}</span>
      </div>
    </div>
  );
}

// ─── Schedule strip (today, hourly band) ────────────────
function TodayScheduleBand({ shifts, nowMin }) {
  const startHr = 6, endHr = 22;
  const totalMin = (endHr - startHr) * 60;
  const pct = (m) => ((m - startHr * 60) / totalMin) * 100;

  // pack into lanes
  const sorted = [...shifts].sort((a, b) => a.startMin - b.startMin);
  const lanes = [];
  sorted.forEach(s => {
    let placed = false;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i][lanes[i].length - 1].endMin <= s.startMin) {
        lanes[i].push(s); s.lane = i; placed = true; break;
      }
    }
    if (!placed) { lanes.push([s]); s.lane = lanes.length - 1; }
  });
  const laneH = 22;
  const laneCount = Math.max(lanes.length, 1);

  // hour ticks (every 2h)
  const ticks = [];
  for (let h = startHr; h <= endHr; h += 2) ticks.push(h);

  return (
    <div style={{ padding: '4px 16px 14px' }}>
      {/* hour scale */}
      <div style={{ position: 'relative', height: 14, marginBottom: 4 }}>
        {ticks.map(h => (
          <div key={h} style={{
            position: 'absolute', left: `${pct(h * 60)}%`, top: 0,
            transform: 'translateX(-50%)',
            fontFamily: B.mono, fontSize: 9.5, color: B.ter, fontVariantNumeric: 'tabular-nums',
            letterSpacing: 0,
          }}>{h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}</div>
        ))}
      </div>

      <div style={{
        position: 'relative',
        height: laneCount * laneH + (laneCount - 1) * 4,
        background: B.muted, border: `1px solid ${B.border}`, borderRadius: B.radius,
        overflow: 'hidden',
      }}>
        {/* gridlines */}
        {ticks.map(h => (
          <div key={h} style={{
            position: 'absolute', left: `${pct(h * 60)}%`, top: 0, bottom: 0, width: 1,
            background: B.border, opacity: 0.6,
          }} />
        ))}
        {/* shift bars */}
        {sorted.map(s => {
          const left = pct(s.startMin);
          const width = pct(s.endMin) - pct(s.startMin);
          const isActive = nowMin >= s.startMin && nowMin < s.endMin;
          return (
            <div key={s.id} title={`${s.name} · ${s.label}`} style={{
              position: 'absolute',
              left: `${left}%`, width: `${width}%`,
              top: s.lane * (laneH + 4) + 2,
              height: laneH - 2,
              background: isActive ? B.text : B.bg,
              color: isActive ? B.onPri : B.text,
              border: `1px solid ${isActive ? B.text : B.borderS}`,
              borderRadius: B.radius,
              padding: '0 6px',
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 10.5, fontWeight: 500,
              whiteSpace: 'nowrap', overflow: 'hidden',
              letterSpacing: -0.1,
            }}>
              <span style={{
                width: 4, height: 4, borderRadius: 99,
                background: isActive ? B.onPri : SHIFT_COLORS[s.shiftType] || B.sec,
                flexShrink: 0,
              }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name.split(' ')[0]}</span>
            </div>
          );
        })}
        {/* now line */}
        <div style={{
          position: 'absolute', left: `${pct(nowMin)}%`, top: -2, bottom: -2,
          width: 1.5, background: B.danger,
        }} />
        <div style={{
          position: 'absolute', left: `${pct(nowMin)}%`, top: -2,
          transform: 'translateX(-50%)',
          width: 6, height: 6, borderRadius: 99, background: B.danger,
        }} />
      </div>
    </div>
  );
}

// ─── Notification row ───────────────────────────────────
function NotifRow({ n }) {
  const tones = {
    warn:    { bg: '#fffbeb', fg: B.warn,   bd: '#fde68a' },
    default: { bg: B.muted,   fg: B.text2,  bd: B.border  },
  };
  const t = tones[n.tone] || tones.default;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 11,
      padding: '12px 16px',
      borderTop: `1px solid ${B.border}`,
      background: B.bg,
    }}>
      <span style={{
        width: 28, height: 28, borderRadius: B.radius,
        background: t.bg, border: `1px solid ${t.bd}`,
        color: t.fg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <BIcon name={n.icon} size={13} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: B.text, letterSpacing: -0.15 }}>{n.title}</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: B.mono, fontSize: 10, color: B.ter, fontVariantNumeric: 'tabular-nums' }}>{n.when}</span>
        </div>
        <div style={{ fontSize: 11.5, color: B.sec, marginTop: 2, lineHeight: 1.4 }}>{n.sub}</div>
      </div>
    </div>
  );
}

// ─── Dashboard root ─────────────────────────────────────
function BzDashboard({ onGo }) {
  const [insightIdx, setInsightIdx] = dUS(0);

  // Auto-advance the AI insight carousel slowly.
  dUE(() => {
    const id = setInterval(() => setInsightIdx(i => (i + 1) % MR_INSIGHTS.length), 7000);
    return () => clearInterval(id);
  }, []);

  // pinned "now" — 10:30 AM Tuesday Apr 22 2026 to match staffing demo
  const nowMin = 10 * 60 + 30;
  const todayStr = isoDate(DASH_TODAY);
  const todayShifts = SHIFTS_SEED.filter(s => s.date === todayStr).map(s => {
    const [sh, sm] = s.startTime.split(':').map(Number);
    const [eh, em] = s.endTime.split(':').map(Number);
    const m = TEAM.find(x => x.id === s.memberId);
    return {
      ...s,
      name: m.name,
      label: s.staffRoles.join(' · '),
      startMin: sh * 60 + sm,
      endMin: eh * 60 + em,
    };
  });
  const onShiftNow = todayShifts.filter(s => nowMin >= s.startMin && nowMin < s.endMin);
  const expectedRev = 4128; // for the day, simulated

  // forecast headline numbers
  const atRisk = INV_FORECAST.filter(i => i.risk !== 'low').length;
  const totalSkus = 124;

  return (
    <div style={{ background: B.surface, color: B.text, fontFamily: B.font, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Inject blink keyframe once */}
      <style>{`@keyframes mvBlink { 0%,50% { opacity: 1; } 50.01%,100% { opacity: 0; } }`}</style>

      {/* Top bar — store + bell w/ badge */}
      <div style={{
        padding: '14px 16px 10px',
        background: B.bg, borderBottom: `1px solid ${B.border}`,
        display: 'flex', alignItems: 'center', gap: 10,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: B.mono, fontSize: 10, color: B.sec, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              Tue · Apr 22
            </span>
            <span style={{ color: B.borderS }}>·</span>
            <span style={{ fontFamily: B.mono, fontSize: 10, color: B.sec, letterSpacing: 0.4 }}>
              <span style={{ color: B.ok }}>●</span> open
            </span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: B.text, letterSpacing: -0.4, marginTop: 2 }}>
            Maple Coffee
          </div>
        </div>
        <button style={iconBtnSm}>
          <BIcon name="search" size={16} />
        </button>
        <button style={{ ...iconBtnSm, position: 'relative' }}>
          <BIcon name="bell" size={16} />
          <span style={{
            position: 'absolute', top: 5, right: 5,
            minWidth: 14, height: 14, padding: '0 3px',
            background: B.danger, color: B.onPri,
            borderRadius: 99, fontFamily: B.mono, fontSize: 8.5, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1.5px solid ${B.bg}`,
            fontVariantNumeric: 'tabular-nums',
          }}>4</span>
        </button>
        <Avatar name="Amelia Chen" size={30} />
      </div>

      {/* Scroll body */}
      <div style={{ flex: 1, overflow: 'auto' }} className="no-scrollbar">

        {/* KPI strip — tight */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          background: B.bg, borderBottom: `1px solid ${B.border}`,
        }}>
          <MiniKpi label="On shift" value={onShiftNow.length} suffix={`/ ${todayShifts.length}`} />
          <MiniKpi label="Today rev · est" value={`$${(expectedRev / 1000).toFixed(1)}k`} mono divLeft />
          <MiniKpi label="At risk · SKUs" value={atRisk} suffix={`/ ${totalSkus}`} tone={atRisk > 0 ? 'warn' : 'default'} divLeft />
        </div>

        {/* MR. MERCHIVA */}
        <MrMerchivaPanel insights={MR_INSIGHTS} idx={insightIdx} setIdx={setInsightIdx} />

        {/* Mr. Merchiva quick-ask row */}
        <div style={{ padding: '12px 14px 16px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px',
            background: B.bg, border: `1px solid ${B.border}`, borderRadius: B.radius,
          }}>
            <BIcon name="sparkles" size={14} color={M_ACCENT} />
            <span style={{ fontSize: 12.5, color: B.sec, flex: 1, letterSpacing: -0.1 }}>
              Ask Mr. Merchiva anything…
            </span>
            <span style={{
              fontFamily: B.mono, fontSize: 9.5, color: B.ter,
              padding: '2px 5px', border: `1px solid ${B.border}`, borderRadius: 3,
            }}>⌘ K</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, overflowX: 'auto' }} className="no-scrollbar">
            {[
              'Forecast next week',
              'Who can cover Sat?',
              'Top sellers · today',
              'Draft a PO',
            ].map(s => (
              <button key={s} style={{
                flexShrink: 0, height: 26, padding: '0 10px',
                background: B.bg, border: `1px solid ${B.border}`, borderRadius: 99,
                fontSize: 11.5, color: B.text2, cursor: 'pointer', fontFamily: B.font,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>{s}</button>
            ))}
          </div>
        </div>

        {/* INVENTORY FORECAST */}
        <DashSection
          title="Inventory forecast · 7-day"
          right={{ label: 'See all', onClick: () => onGo && onGo('inventory') }}
        >
          {INV_FORECAST.map((it, i) => (
            <ForecastRow key={it.sku} item={it} last={i === INV_FORECAST.length - 1} />
          ))}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', borderTop: `1px solid ${B.border}`,
            background: M_ACCENT_SOFT, color: B.text2, fontSize: 11.5,
          }}>
            <NotchM size={16} fg={M_ACCENT_SOFT} bg={B.text} />
            <span style={{ flex: 1 }}>
              <strong style={{ color: B.text, fontWeight: 600 }}>Mr. Merchiva</strong> has 2 POs ready to send · $612 total
            </span>
            <button style={{
              height: 24, padding: '0 8px',
              background: B.text, color: B.onPri, border: 'none', borderRadius: B.radius,
              fontSize: 11, fontWeight: 500, cursor: 'pointer',
              fontFamily: B.font,
            }}>Review</button>
          </div>
        </DashSection>

        {/* TODAY'S SCHEDULE */}
        <DashSection
          title="Today's schedule"
          rightLabel={`${todayShifts.length} shifts · ${formatTimeShort('07:00')}–${formatTimeShort('22:00')}`}
          right={{ label: 'Open', onClick: () => onGo && onGo('staffing') }}
        >
          <TodayScheduleBand shifts={todayShifts} nowMin={nowMin} />
          {/* on shift now */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 16px 14px', flexWrap: 'wrap',
          }}>
            <Label style={{ width: '100%', marginBottom: 4 }}>On shift now · {onShiftNow.length}</Label>
            {onShiftNow.map(s => (
              <div key={s.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 26, padding: '0 8px 0 4px',
                background: B.bg, border: `1px solid ${B.border}`, borderRadius: 99,
              }}>
                <Avatar name={s.name} size={20} />
                <span style={{ fontSize: 11.5, fontWeight: 500, color: B.text }}>{s.name.split(' ')[0]}</span>
                <span style={{ fontFamily: B.mono, fontSize: 10, color: B.sec, fontVariantNumeric: 'tabular-nums' }}>
                  {formatTimeShort(s.startTime)}–{formatTimeShort(s.endTime)}
                </span>
              </div>
            ))}
          </div>
        </DashSection>

        {/* NOTIFICATIONS */}
        <DashSection
          title="Notifications"
          rightLabel="4 new"
          right={{ label: 'Mark all read' }}
        >
          {NOTIFS.map(n => <NotifRow key={n.id} n={n} />)}
        </DashSection>

        <div style={{ height: 28 }} />
      </div>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────
const iconBtnSm = {
  width: 32, height: 32, borderRadius: B.radius,
  border: 'none', background: 'transparent',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: B.text2, cursor: 'pointer', flexShrink: 0, position: 'relative',
};

function MiniKpi({ label, value, suffix, tone, mono, divLeft }) {
  return (
    <div style={{
      padding: '12px 14px',
      borderLeft: divLeft ? `1px solid ${B.border}` : 0,
    }}>
      <div style={{
        fontSize: 9.5, fontWeight: 600, color: B.sec,
        letterSpacing: 0.8, textTransform: 'uppercase',
      }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
        <div style={{
          fontSize: 20, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1,
          fontFamily: mono ? B.mono : B.font,
          fontVariantNumeric: mono ? 'tabular-nums' : undefined,
          color: tone === 'warn' ? B.warn : B.text,
        }}>{value}</div>
        {suffix && <div style={{
          fontSize: 11, color: B.sec,
          fontFamily: B.mono, fontVariantNumeric: 'tabular-nums',
        }}>{suffix}</div>}
      </div>
    </div>
  );
}

function DashSection({ title, rightLabel, right, children }) {
  return (
    <div style={{ marginTop: 14, background: B.bg, borderTop: `1px solid ${B.border}`, borderBottom: `1px solid ${B.border}` }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '14px 16px 8px',
      }}>
        <span style={{
          fontSize: 10.5, fontWeight: 600, color: B.sec,
          letterSpacing: 0.8, textTransform: 'uppercase',
        }}>{title}</span>
        <div style={{ flex: 1 }} />
        {rightLabel && (
          <span style={{ fontFamily: B.mono, fontSize: 10, color: B.ter, letterSpacing: 0.3, textTransform: 'uppercase' }}>
            {rightLabel}
          </span>
        )}
        {right && (
          <button onClick={right.onClick} style={{
            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
            color: B.text2, display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 11.5, fontWeight: 500, fontFamily: B.font,
          }}>
            {right.label} <BIcon name="chevron-right" size={12} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

Object.assign(window, { BzDashboard });
