// Mobile Staffing — 3 variants. Each returns a screen body designed to sit
// inside <IOSDevice width=402 height=874>. No status/home chrome here — the
// IOSDevice wraps these.

const { useState: mstUS } = React;

// ═══════════════════════════════════════════════════════════
// A+B — "Overview + Schedule" — merged: hero dashboard on top,
// week picker + timeline below. Everything scrolls in one screen.
// ═══════════════════════════════════════════════════════════
function MobileStaffingAB({ __hideTabBar } = {}) {
  const todayStr = isoDate(TODAY);
  const me = TEAM[0];
  const [selectedDate, setDate] = mstUS(todayStr);
  const [view, setView] = mstUS('day'); // 'day' | 'people'
  const [tab, setTab] = mstUS('overview'); // 'overview' | 'schedule'

  const todayShifts = SHIFTS_SEED.filter(s => s.date === todayStr);
  const myToday = todayShifts.find(s => s.memberId === me.id);
  const pendingTO = TIME_OFF_SEED.filter(r => r.status === 'pending').length;
  const pendingTD = TRADES_SEED.filter(r => r.status === 'pending').length;

  const dayShifts = SHIFTS_SEED.filter(s => s.date === selectedDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const selDay = new Date(selectedDate + 'T00:00:00');

  // Timeline layout
  const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
  const hourPx = 46;
  const toY = (t) => {
    const [h, m] = t.split(':').map(Number);
    return (h - HOURS[0]) * hourPx + (m / 60) * hourPx;
  };
  const withLanes = (() => {
    const sorted = [...dayShifts].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const lanes = [];
    return sorted.map(s => {
      const y1 = toY(s.startTime), y2 = toY(s.endTime);
      let lane = lanes.findIndex(end => end <= y1);
      if (lane === -1) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = y2;
      return { ...s, lane, y1, y2 };
    }).map((s, _, all) => {
      const maxLane = Math.max(...all.map(x => x.lane)) + 1;
      return { ...s, laneCount: maxLane };
    });
  })();

  const dayHours = dayShifts.reduce((sum, s) => {
    const [h1,m1]=s.startTime.split(':').map(Number);
    const [h2,m2]=s.endTime.split(':').map(Number);
    return sum + (h2+m2/60) - (h1+m1/60);
  }, 0);

  return (
    <div style={{ background: M.bg, minHeight: '100%', paddingBottom: 100, fontFamily: M.font }}>
      {/* ─── Large title ─── */}
      <div style={{ paddingTop: 54 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 20px' }}>
          <div style={{ fontSize: 13, color: M.sec, letterSpacing: -0.08 }}>{TODAY.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
            <MIcon name="search" size={22} color={M.tint} />
            <div style={{ position: 'relative' }}>
              <MIcon name="bell" size={22} color={M.tint} />
              {(pendingTO + pendingTD) > 0 && (
                <div style={{ position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 9999, background: M.red, color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                  {pendingTO + pendingTD}
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={{ padding: '6px 20px 6px', fontSize: 34, fontWeight: 700, letterSpacing: 0.37, lineHeight: '41px' }}>Staffing</div>

        {/* Top tabs: Overview / Schedule */}
        <div style={{ padding: '8px 16px 0', display: 'flex', gap: 24, borderBottom: `0.5px solid ${M.sep}` }}>
          {[
            { id: 'overview', l: 'Overview' },
            { id: 'schedule', l: 'Schedule' },
          ].map(t => {
            const active = tab === t.id;
            return (
              <div key={t.id} onClick={() => setTab(t.id)}
                style={{
                  padding: '10px 2px 12px', cursor: 'pointer',
                  fontSize: 15, fontWeight: active ? 600 : 500,
                  letterSpacing: -0.24,
                  color: active ? M.label : M.sec,
                  borderBottom: active ? `2px solid ${M.label}` : '2px solid transparent',
                  marginBottom: -0.5,
                }}>{t.l}</div>
            );
          })}
        </div>
      </div>

      {tab === 'overview' && (<>

      {/* ─── Today hero ─── */}
      <div style={{ margin: '12px 16px 0', background: M.label, color: '#fff', borderRadius: 16, padding: 18, position: 'relative', overflow: 'hidden' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.2, opacity: 0.55, textTransform: 'uppercase' }}>Today · {todayShifts.length} shifts</div>
        <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, letterSpacing: -0.5 }}>
          {TODAY.toLocaleDateString('en-US', { weekday: 'long' })}
        </div>
        <div style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>
          {todayShifts.reduce((sum, s) => { const [h1,m1]=s.startTime.split(':').map(Number); const [h2,m2]=s.endTime.split(':').map(Number); return sum+(h2+m2/60)-(h1+m1/60); },0).toFixed(1)}h scheduled · opens 7:00 AM
        </div>

        <div style={{ display: 'flex', marginTop: 14, marginBottom: 2 }}>
          {todayShifts.slice(0,5).map((s, i) => {
            const m = TEAM.find(x => x.id === s.memberId);
            return (
              <div key={s.id} style={{ marginLeft: i === 0 ? 0 : -8, border: '2px solid #1c1917', borderRadius: 9999 }}>
                <MAvatar name={m.name} size={30} color={m.color} />
              </div>
            );
          })}
          {todayShifts.length > 5 && (
            <div style={{ marginLeft: -8, width: 30, height: 30, borderRadius: 9999, background: '#3f3b37', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #1c1917' }}>
              +{todayShifts.length - 5}
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '0.5px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 4, height: 34, borderRadius: 2, background: SHIFT_COLORS[myToday?.shiftType || 'morning'] }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, opacity: 0.55 }}>Your shift</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{myToday ? `${formatTime(myToday.startTime)} – ${formatTime(myToday.endTime)}` : 'Off today'}</div>
          </div>
          {myToday && <MIcon name="arrow-right" size={18} color="rgba(255,255,255,0.6)" />}
        </div>
      </div>

      {/* ─── Quick actions ─── */}
      <div style={{ display: 'flex', gap: 10, padding: '16px 16px 0' }}>
        {[
          { icon: 'plus', label: 'Add shift', tone: '#1c1917' },
          { icon: 'swap', label: 'Trades', tone: '#44403c', badge: pendingTD },
          { icon: 'calendar', label: 'Time off', tone: '#57534e', badge: pendingTO },
        ].map(a => (
          <div key={a.label} style={{ flex: 1, background: M.surface, borderRadius: 14, padding: '14px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative' }}>
            <div style={{ width: 36, height: 36, borderRadius: 9999, background: a.tone, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MIcon name={a.icon} size={18} color="#fff" />
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: -0.08 }}>{a.label}</div>
            {a.badge > 0 && (
              <div style={{ position: 'absolute', top: 8, right: 10, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9999, background: M.red, color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{a.badge}</div>
            )}
          </div>
        ))}
      </div>

      {/* ─── Needs attention (compact) ─── */}
      {(pendingTO + pendingTD) > 0 && (
        <>
          <div style={{ padding: '20px 20px 8px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2 }}>Needs attention</div>
            <div style={{ fontSize: 12, color: M.tint, fontWeight: 500 }}>View all ({pendingTO + pendingTD})</div>
          </div>
          <div style={{ padding: '0 16px' }}>
            {TIME_OFF_SEED.filter(r => r.status === 'pending').slice(0, 1).map(r => {
              const mem = TEAM.find(m => m.id === r.userId);
              return (
                <div key={r.id} style={{ background: M.surface, borderRadius: 14, padding: 12, display: 'flex', gap: 11, alignItems: 'center', border: '0.5px solid rgba(0,0,0,0.04)' }}>
                  <MAvatar name={r.staffName} size={36} color={mem.color} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>{r.staffName}</div>
                      <MBadge tone="amber">Time off</MBadge>
                    </div>
                    <div style={{ fontSize: 12, color: M.sec, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {shortDate(r.startDate)}{r.endDate !== r.startDate && ` → ${shortDate(r.endDate)}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 9999, background: '#e8f7ed', color: '#1f7a3a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MIcon name="check" size={15} color="#1f7a3a" />
                    </div>
                    <div style={{ width: 30, height: 30, borderRadius: 9999, background: 'rgba(120,120,128,0.12)', color: M.label, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MIcon name="x" size={15} color={M.label} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ─── Schedule section (from B) ─── */}
      </>)}

      {tab === 'schedule' && (<>
      <div style={{ padding: '20px 20px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: M.sec, textTransform: 'uppercase' }}>Schedule</div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, marginTop: 2 }}>This week</div>
        </div>
        <div style={{ display: 'flex', background: 'rgba(118,118,128,0.12)', borderRadius: 9, padding: 2, fontSize: 12, fontWeight: 600 }}>
          {[
            { id: 'day', l: 'Day' },
            { id: 'people', l: 'People' },
          ].map(t => (
            <div key={t.id} onClick={() => setView(t.id)}
              style={{
                padding: '5px 11px', borderRadius: 7, cursor: 'pointer',
                background: view === t.id ? '#fff' : 'transparent',
                color: view === t.id ? M.label : M.sec,
                boxShadow: view === t.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}>{t.l}</div>
          ))}
        </div>
      </div>

      {/* Week picker pills */}
      <div style={{ padding: '4px 12px 14px', display: 'flex', gap: 6 }}>
        {THIS_WEEK.map(d => {
          const iso = isoDate(d);
          const active = iso === selectedDate;
          const count = SHIFTS_SEED.filter(s => s.date === iso).length;
          const isToday = iso === todayStr;
          return (
            <div key={iso} onClick={() => setDate(iso)}
              style={{
                flex: 1, borderRadius: 12,
                background: active ? M.label : (isToday ? 'rgba(28,25,23,0.05)' : 'transparent'),
                color: active ? '#fff' : M.label,
                padding: '7px 0 9px', textAlign: 'center', cursor: 'pointer',
                border: !active && isToday ? `1px solid ${M.label}` : 'none',
              }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.5, opacity: active ? 0.7 : 0.5, textTransform: 'uppercase' }}>
                {d.toLocaleDateString('en-US',{weekday:'short'}).slice(0,3)}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 3, letterSpacing: -0.4 }}>{d.getDate()}</div>
              <div style={{ marginTop: 4, height: 3, display: 'flex', justifyContent: 'center', gap: 2 }}>
                {count > 0 && <div style={{ width: 4, height: 3, borderRadius: 9999, background: active ? 'rgba(255,255,255,0.7)' : M.label }} />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Day summary line */}
      <div style={{ padding: '0 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3 }}>
          {selDay.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
        <div style={{ fontSize: 12, color: M.sec, fontVariantNumeric: 'tabular-nums' }}>
          {dayShifts.length} shifts · {dayHours.toFixed(1)}h
        </div>
      </div>

      {/* Timeline or People list */}
      {view === 'day' ? (
        <div style={{ position: 'relative', padding: '0 16px 20px' }}>
          <div style={{ position: 'relative', height: (HOURS.length - 1) * hourPx + hourPx }}>
            {HOURS.map((h, i) => {
              const t12 = (h % 12) || 12;
              const ampm = h < 12 ? 'AM' : 'PM';
              return (
                <div key={h} style={{ position: 'absolute', top: i * hourPx, left: 0, right: 0, height: hourPx }}>
                  <div style={{ position: 'absolute', left: 0, top: -6, fontSize: 11, color: M.ter, fontWeight: 500, width: 44, fontVariantNumeric: 'tabular-nums' }}>
                    {t12}<span style={{ fontSize: 9, opacity: 0.7, marginLeft: 1 }}>{ampm}</span>
                  </div>
                  <div style={{ position: 'absolute', left: 44, right: 0, top: 0, height: 0.5, background: M.sep }} />
                </div>
              );
            })}
            {withLanes.map(s => {
              const m = TEAM.find(x => x.id === s.memberId);
              const laneWidth = `calc((100% - 44px) / ${s.laneCount})`;
              const h = s.y2 - s.y1;
              return (
                <div key={s.id} style={{
                  position: 'absolute', top: s.y1, height: h,
                  left: `calc(44px + (100% - 44px) / ${s.laneCount} * ${s.lane} + 2px)`,
                  width: `calc(${laneWidth} - 4px)`,
                  background: '#fff', borderRadius: 8, overflow: 'hidden',
                  border: '0.5px solid rgba(0,0,0,0.08)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  display: 'flex',
                }}>
                  <div style={{ width: 4, background: SHIFT_COLORS[s.shiftType] }} />
                  <div style={{ padding: '6px 8px', flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MAvatar name={m.name} size={18} color={m.color} />
                      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: -0.08, lineHeight: 1.1, color: M.label, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name.split(' ')[0]}</div>
                    </div>
                    {h >= 50 && (
                      <>
                        <div style={{ fontSize: 11, color: M.sec, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                          {formatTimeShort(s.startTime)}–{formatTimeShort(s.endTime)}
                        </div>
                        <div style={{ fontSize: 10, color: M.sec, marginTop: 2 }}>{s.staffRoles[0]}</div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {selectedDate === todayStr && (() => {
              const now = new Date();
              const y = toY(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);
              if (y < 0 || y > (HOURS.length - 1) * hourPx) return null;
              return (
                <div style={{ position: 'absolute', top: y, left: 40, right: 0, zIndex: 5, display: 'flex', alignItems: 'center' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 9999, background: M.red, marginLeft: -4 }} />
                  <div style={{ flex: 1, height: 1.5, background: M.red }} />
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        <div style={{ padding: '0 16px 20px' }}>
          <div style={{ background: M.surface, borderRadius: 14, overflow: 'hidden', border: '0.5px solid rgba(0,0,0,0.04)' }}>
            {dayShifts.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', color: M.sec, fontSize: 13 }}>No shifts scheduled</div>
            ) : dayShifts.map((s, i, arr) => {
              const m = TEAM.find(x => x.id === s.memberId);
              return (
                <div key={s.id} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: i < arr.length - 1 ? '0.5px solid rgba(0,0,0,0.05)' : 'none' }}>
                  <MAvatar name={m.name} size={36} color={m.color} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: M.sec, marginTop: 2 }}>{s.staffRoles.join(', ')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {formatTimeShort(s.startTime)}–{formatTimeShort(s.endTime)}
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 9999, background: SHIFT_COLORS[s.shiftType] }} />
                      <div style={{ fontSize: 11, color: M.sec, textTransform: 'capitalize' }}>{s.shiftType}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </>)}

      {!__hideTabBar && (
      <MTabBar current="staffing" onTab={()=>{}} items={[
        { id: 'home', icon: 'building', label: 'Home' },
        { id: 'staffing', icon: 'calendar', label: 'Staffing' },
        { id: 'sales', icon: 'zap', label: 'Sales' },
        { id: 'chat', icon: 'msgs', label: 'Chat' },
        { id: 'more', icon: 'more', label: 'More' },
      ]} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// A — "Ops dashboard" — large title, Today hero, Requests, Week strip
// ═══════════════════════════════════════════════════════════
function MobileStaffingA() {
  const todayStr = isoDate(TODAY);
  const todayShifts = SHIFTS_SEED.filter(s => s.date === todayStr);
  const me = TEAM[0]; // Amelia (manager)
  const myToday = todayShifts.find(s => s.memberId === me.id);
  const pendingTO = TIME_OFF_SEED.filter(r => r.status === 'pending').length;
  const pendingTD = TRADES_SEED.filter(r => r.status === 'pending').length;
  const weekShifts = SHIFTS_SEED;

  return (
    <div style={{ background: M.bg, minHeight: '100%', paddingBottom: 100, fontFamily: M.font }}>
      {/* Large title */}
      <div style={{ paddingTop: 54 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 20px' }}>
          <div style={{ fontSize: 13, color: M.sec, letterSpacing: -0.08 }}>Tue, Apr 21</div>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
            <MIcon name="search" size={22} color={M.tint} />
            <div style={{ position: 'relative' }}>
              <MIcon name="bell" size={22} color={M.tint} />
              {(pendingTO + pendingTD) > 0 && (
                <div style={{ position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 9999, background: M.red, color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                  {pendingTO + pendingTD}
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={{ padding: '6px 20px 6px', fontSize: 34, fontWeight: 700, letterSpacing: 0.37, lineHeight: '41px' }}>Staffing</div>
      </div>

      {/* Today hero card */}
      <div style={{ margin: '12px 16px 0', background: M.label, color: '#fff', borderRadius: 16, padding: 18, position: 'relative', overflow: 'hidden' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.2, opacity: 0.55, textTransform: 'uppercase' }}>Today · {todayShifts.length} shifts</div>
        <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, letterSpacing: -0.5 }}>Tuesday</div>
        <div style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>
          {todayShifts.reduce((sum, s) => { const [h1,m1]=s.startTime.split(':').map(Number); const [h2,m2]=s.endTime.split(':').map(Number); return sum+(h2+m2/60)-(h1+m1/60); },0).toFixed(1)}h scheduled · opens 7:00 AM
        </div>

        {/* mini people stack */}
        <div style={{ display: 'flex', marginTop: 14, marginBottom: 2 }}>
          {todayShifts.slice(0,5).map((s, i) => {
            const m = TEAM.find(x => x.id === s.memberId);
            return (
              <div key={s.id} style={{ marginLeft: i === 0 ? 0 : -8, border: '2px solid #1c1917', borderRadius: 9999 }}>
                <MAvatar name={m.name} size={30} color={m.color} />
              </div>
            );
          })}
          {todayShifts.length > 5 && (
            <div style={{ marginLeft: -8, width: 30, height: 30, borderRadius: 9999, background: '#3f3b37', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #1c1917' }}>
              +{todayShifts.length - 5}
            </div>
          )}
        </div>

        {/* Next shift line */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '0.5px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 4, height: 34, borderRadius: 2, background: SHIFT_COLORS[myToday?.shiftType || 'morning'] }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, opacity: 0.55 }}>Your shift</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{myToday ? `${formatTime(myToday.startTime)} – ${formatTime(myToday.endTime)}` : 'Off today'}</div>
          </div>
          {myToday && <MIcon name="arrow-right" size={18} color="rgba(255,255,255,0.6)" />}
        </div>
      </div>

      {/* Quick actions row */}
      <div style={{ display: 'flex', gap: 10, padding: '16px 16px 0' }}>
        {[
          { icon: 'plus', label: 'Add shift', tone: '#1c1917' },
          { icon: 'swap', label: 'Trades', tone: '#44403c', badge: pendingTD },
          { icon: 'calendar', label: 'Time off', tone: '#57534e', badge: pendingTO },
        ].map(a => (
          <div key={a.label} style={{ flex: 1, background: M.surface, borderRadius: 14, padding: '14px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative' }}>
            <div style={{ width: 36, height: 36, borderRadius: 9999, background: a.tone, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MIcon name={a.icon} size={18} color="#fff" />
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: -0.08 }}>{a.label}</div>
            {a.badge > 0 && (
              <div style={{ position: 'absolute', top: 8, right: 10, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9999, background: M.red, color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{a.badge}</div>
            )}
          </div>
        ))}
      </div>

      {/* Week strip */}
      <div style={{ padding: '24px 20px 8px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4 }}>This week</div>
        <div style={{ fontSize: 13, color: M.tint, fontWeight: 500 }}>View all</div>
      </div>
      <div style={{ overflow: 'hidden', paddingLeft: 16, paddingRight: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {THIS_WEEK.map((d, i) => {
            const iso = isoDate(d);
            const ds = weekShifts.filter(s => s.date === iso);
            const isToday = iso === todayStr;
            return (
              <div key={iso} style={{
                flex: 1, background: isToday ? M.label : M.surface, color: isToday ? '#fff' : M.label,
                borderRadius: 12, padding: '10px 4px 12px', textAlign: 'center', position: 'relative',
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, opacity: isToday ? 0.7 : 0.5, letterSpacing: 0.6, textTransform: 'uppercase' }}>{d.toLocaleDateString('en-US',{weekday:'short'}).slice(0,1)}</div>
                <div style={{ fontSize: 17, fontWeight: 600, marginTop: 4, letterSpacing: -0.4 }}>{d.getDate()}</div>
                <div style={{ marginTop: 8, display: 'flex', gap: 2, justifyContent: 'center', minHeight: 4 }}>
                  {ds.slice(0, 5).map((s, j) => (
                    <div key={j} style={{ width: 4, height: 4, borderRadius: 9999, background: SHIFT_COLORS[s.shiftType] || '#888' }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Requests list */}
      <MGroupHeader style={{ marginTop: 16 }}>Needs your attention</MGroupHeader>
      <MCard>
        {TIME_OFF_SEED.filter(r => r.status === 'pending').slice(0, 2).map((r, i, arr) => {
          const mem = TEAM.find(m => m.id === r.userId);
          return (
            <div key={r.id} style={{ padding: '12px 16px', borderBottom: i < arr.length - 1 || TRADES_SEED.filter(t => t.status === 'pending').length > 0 ? `0.5px solid ${M.sep}` : 'none', display: 'flex', gap: 11 }}>
              <MAvatar name={r.staffName} size={36} color={mem.color} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.24 }}>{r.staffName}</div>
                  <MBadge tone="amber">Time off</MBadge>
                </div>
                <div style={{ fontSize: 13, color: M.sec, marginTop: 2 }}>
                  {shortDate(r.startDate)}{r.endDate !== r.startDate && ` → ${shortDate(r.endDate)}`}
                  {!r.fullDays && r.startTime && ` · ${formatTimeShort(r.startTime)}–${formatTimeShort(r.endTime)}`}
                </div>
                {r.comments && <div style={{ fontSize: 13, color: M.label, marginTop: 6, fontStyle: 'italic', opacity: 0.7 }}>&ldquo;{r.comments}&rdquo;</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <div style={{ flex: 1, height: 32, borderRadius: 8, background: '#e8f7ed', color: '#1f7a3a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
                    <MIcon name="check" size={15} color="#1f7a3a" /> Approve
                  </div>
                  <div style={{ flex: 1, height: 32, borderRadius: 8, background: 'rgba(120,120,128,0.12)', color: M.label, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
                    Deny
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {TRADES_SEED.filter(t => t.status === 'pending').slice(0, 1).map((t, i, arr) => {
          const req = TEAM.find(m => m.id === t.requesterId);
          const tgt = t.targetId ? TEAM.find(m => m.id === t.targetId) : null;
          const sh = SHIFTS_SEED.find(s => s.id === t.shiftId);
          return (
            <div key={t.id} style={{ padding: '12px 16px', display: 'flex', gap: 11 }}>
              <MAvatar name={req.name} size={36} color={req.color} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.24 }}>{req.name}</div>
                  <MBadge tone="blue">{t.type === 'trade' ? 'Trade' : 'Cover'}</MBadge>
                </div>
                <div style={{ fontSize: 13, color: M.sec, marginTop: 2 }}>
                  {sh && `${shortDate(sh.date)} · ${formatTimeShort(sh.startTime)}–${formatTimeShort(sh.endTime)}`}
                  {tgt && ` → ${tgt.name}`}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <div style={{ flex: 1, height: 32, borderRadius: 8, background: '#e8f7ed', color: '#1f7a3a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
                    <MIcon name="check" size={15} color="#1f7a3a" /> Accept
                  </div>
                  <div style={{ flex: 1, height: 32, borderRadius: 8, background: 'rgba(120,120,128,0.12)', color: M.label, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
                    Deny
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </MCard>

      <MTabBar current="staffing" onTab={()=>{}} items={[
        { id: 'home', icon: 'building', label: 'Home' },
        { id: 'staffing', icon: 'calendar', label: 'Staffing' },
        { id: 'sales', icon: 'zap', label: 'Sales' },
        { id: 'chat', icon: 'msgs', label: 'Chat' },
        { id: 'more', icon: 'more', label: 'More' },
      ]} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// B — "Timeline week" — segmented week picker + vertical day timeline
// ═══════════════════════════════════════════════════════════
function MobileStaffingB() {
  const todayStr = isoDate(TODAY);
  const [selectedDate, setDate] = mstUS(todayStr);
  const dayShifts = SHIFTS_SEED.filter(s => s.date === selectedDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const selDay = new Date(selectedDate + 'T00:00:00');

  // Compute stacking lanes so overlapping shifts sit side-by-side
  const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  const hourPx = 44;
  const toY = (t) => {
    const [h, m] = t.split(':').map(Number);
    return (h - HOURS[0]) * hourPx + (m / 60) * hourPx;
  };
  const withLanes = (() => {
    const sorted = [...dayShifts].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const lanes = [];
    return sorted.map(s => {
      const y1 = toY(s.startTime), y2 = toY(s.endTime);
      let lane = lanes.findIndex(end => end <= y1);
      if (lane === -1) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = y2;
      return { ...s, lane, laneCount: 0, y1, y2 };
    }).map((s, _, all) => {
      const maxLane = Math.max(...all.map(x => x.lane)) + 1;
      return { ...s, laneCount: maxLane };
    });
  })();

  return (
    <div style={{ background: M.bg, minHeight: '100%', paddingBottom: 100, fontFamily: M.font }}>
      {/* Header */}
      <div style={{ paddingTop: 54, paddingBottom: 0, background: M.surface, borderBottom: `0.5px solid ${M.sep}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 16px 4px' }}>
          <div>
            <div style={{ fontSize: 12, color: M.sec, fontWeight: 500, letterSpacing: -0.08 }}>APRIL 2026</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, marginTop: 2 }}>Schedule</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9999, background: M.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MIcon name="filter" size={18} color={M.tint} />
            </div>
            <div style={{ width: 36, height: 36, borderRadius: 9999, background: M.label, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MIcon name="plus" size={20} color="#fff" />
            </div>
          </div>
        </div>

        {/* Week picker — horizontal pills */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 12px 14px', overflow: 'hidden' }}>
          {THIS_WEEK.map(d => {
            const iso = isoDate(d);
            const active = iso === selectedDate;
            const count = SHIFTS_SEED.filter(s => s.date === iso).length;
            return (
              <div key={iso} onClick={() => setDate(iso)}
                style={{
                  flex: 1, borderRadius: 12,
                  background: active ? M.label : 'transparent',
                  color: active ? '#fff' : M.label,
                  padding: '7px 0 9px', textAlign: 'center', cursor: 'pointer',
                }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.5, opacity: active ? 0.7 : 0.5, textTransform: 'uppercase' }}>
                  {d.toLocaleDateString('en-US',{weekday:'short'}).slice(0,3)}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 3, letterSpacing: -0.4 }}>{d.getDate()}</div>
                <div style={{ marginTop: 4, height: 3, display: 'flex', justifyContent: 'center', gap: 2 }}>
                  {count > 0 && <div style={{ width: 4, height: 3, borderRadius: 9999, background: active ? 'rgba(255,255,255,0.7)' : M.label }} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day header */}
      <div style={{ padding: '16px 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>
            {selDay.toLocaleDateString('en-US', { weekday: 'long' })}
          </div>
          <div style={{ fontSize: 13, color: M.sec, marginTop: 2 }}>
            {dayShifts.length} shifts · {dayShifts.reduce((sum, s) => { const [h1,m1]=s.startTime.split(':').map(Number); const [h2,m2]=s.endTime.split(':').map(Number); return sum+(h2+m2/60)-(h1+m1/60); },0).toFixed(1)}h total
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['morning','afternoon','evening','closing'].map(k => {
            const count = dayShifts.filter(s => s.shiftType === k).length;
            if (!count) return null;
            return (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 6, height: 6, borderRadius: 9999, background: SHIFT_COLORS[k] }} />
                <div style={{ fontSize: 11, color: M.sec, fontWeight: 600 }}>{count}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ position: 'relative', padding: '0 16px 20px', marginLeft: 0 }}>
        <div style={{ position: 'relative', height: (HOURS.length - 1) * hourPx + hourPx }}>
          {/* Hour ticks */}
          {HOURS.map((h, i) => {
            const t12 = (h % 12) || 12;
            const ampm = h < 12 ? 'AM' : 'PM';
            return (
              <div key={h} style={{ position: 'absolute', top: i * hourPx, left: 0, right: 0, height: hourPx }}>
                <div style={{ position: 'absolute', left: 0, top: -6, fontSize: 11, color: M.ter, fontWeight: 500, width: 44, fontVariantNumeric: 'tabular-nums' }}>
                  {t12}<span style={{ fontSize: 9, opacity: 0.7, marginLeft: 1 }}>{ampm}</span>
                </div>
                <div style={{ position: 'absolute', left: 44, right: 0, top: 0, height: 0.5, background: M.sep }} />
              </div>
            );
          })}
          {/* Shift blocks */}
          {withLanes.map(s => {
            const m = TEAM.find(x => x.id === s.memberId);
            const laneWidth = `calc((100% - 44px) / ${s.laneCount})`;
            const h = s.y2 - s.y1;
            return (
              <div key={s.id} style={{
                position: 'absolute', top: s.y1, height: h,
                left: `calc(44px + (100% - 44px) / ${s.laneCount} * ${s.lane} + 2px)`,
                width: `calc(${laneWidth} - 4px)`,
                background: '#fff', borderRadius: 8, overflow: 'hidden',
                border: '0.5px solid rgba(0,0,0,0.08)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                display: 'flex',
              }}>
                <div style={{ width: 4, background: SHIFT_COLORS[s.shiftType] }} />
                <div style={{ padding: '6px 8px', flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MAvatar name={m.name} size={18} color={m.color} />
                    <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: -0.08, lineHeight: 1.1, color: M.label, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name.split(' ')[0]}</div>
                  </div>
                  {h >= 50 && (
                    <>
                      <div style={{ fontSize: 11, color: M.sec, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                        {formatTimeShort(s.startTime)}–{formatTimeShort(s.endTime)}
                      </div>
                      <div style={{ fontSize: 10, color: M.sec, marginTop: 2 }}>{s.staffRoles[0]}</div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {/* Current time indicator if today */}
          {selectedDate === todayStr && (() => {
            const now = new Date();
            const y = toY(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);
            if (y < 0 || y > (HOURS.length - 1) * hourPx) return null;
            return (
              <div style={{ position: 'absolute', top: y, left: 40, right: 0, zIndex: 5, display: 'flex', alignItems: 'center' }}>
                <div style={{ width: 8, height: 8, borderRadius: 9999, background: M.red, marginLeft: -4 }} />
                <div style={{ flex: 1, height: 1.5, background: M.red }} />
              </div>
            );
          })()}
        </div>
      </div>

      <MTabBar current="staffing" onTab={()=>{}} items={[
        { id: 'home', icon: 'building', label: 'Home' },
        { id: 'staffing', icon: 'calendar', label: 'Staffing' },
        { id: 'sales', icon: 'zap', label: 'Sales' },
        { id: 'chat', icon: 'msgs', label: 'Chat' },
        { id: 'more', icon: 'more', label: 'More' },
      ]} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// C — "My Shifts" (staff-facing) — upcoming shifts list + tasks
// ═══════════════════════════════════════════════════════════
function MobileStaffingC() {
  const me = TEAM[1]; // Marcus Lee - barista perspective
  const myShifts = SHIFTS_SEED.filter(s => s.memberId === me.id).sort((a,b) => a.date.localeCompare(b.date));
  const todayStr = isoDate(TODAY);
  const next = myShifts.find(s => s.date >= todayStr);
  const hours = myShifts.reduce((sum, s) => { const [h1,m1]=s.startTime.split(':').map(Number); const [h2,m2]=s.endTime.split(':').map(Number); return sum+(h2+m2/60)-(h1+m1/60); },0);

  const TASKS = [
    { id: 't1', t: 'Wipe down espresso machine', when: '7:00a', done: true },
    { id: 't2', t: 'Check milk levels',           when: '7:15a', done: true },
    { id: 't3', t: 'Refill pastry display',       when: '7:30a', done: false },
    { id: 't4', t: 'Backwash group heads',        when: '2:00p', done: false },
  ];

  return (
    <div style={{ background: M.bg, minHeight: '100%', paddingBottom: 100, fontFamily: M.font }}>
      {/* Header */}
      <div style={{ paddingTop: 54 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MAvatar name={me.name} size={32} color={me.color} />
            <div>
              <div style={{ fontSize: 12, color: M.sec }}>Welcome back</div>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.24 }}>{me.name.split(' ')[0]}</div>
            </div>
          </div>
          <div style={{ width: 36, height: 36, borderRadius: 9999, background: M.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <MIcon name="bell" size={18} color={M.tint} />
          </div>
        </div>
        <div style={{ padding: '16px 20px 6px', fontSize: 30, fontWeight: 700, letterSpacing: 0.1, lineHeight: '36px' }}>My week</div>
      </div>

      {/* Next shift hero */}
      {next && (() => {
        const d = new Date(next.date + 'T00:00:00');
        const isToday = next.date === todayStr;
        const isTomorrow = (() => {
          const tm = new Date(TODAY); tm.setDate(tm.getDate() + 1);
          return next.date === isoDate(tm);
        })();
        return (
          <div style={{ margin: '6px 16px 0', background: M.surface, borderRadius: 16, overflow: 'hidden', border: `0.5px solid ${M.sep}` }}>
            <div style={{ padding: '14px 16px 10px', background: SHIFT_COLORS[next.shiftType], color: '#fff' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, opacity: 0.8, textTransform: 'uppercase' }}>Next shift · {SHIFT_LABELS[next.shiftType]}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
                <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>
                  {isToday ? 'Today' : isTomorrow ? 'Tomorrow' : d.toLocaleDateString('en-US',{weekday:'long'})}
                </div>
                <div style={{ fontSize: 14, opacity: 0.7 }}>{d.toLocaleDateString('en-US',{month:'short', day:'numeric'})}</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums' }}>
                {formatTime(next.startTime)} — {formatTime(next.endTime)}
              </div>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              {next.staffRoles.map(rn => {
                const r = ROLES.find(x => x.name === rn);
                return (
                  <div key={rn} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: r.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MIcon name={r.icon === 'chef-hat' ? 'chef' : r.icon} size={12} color="#fff" />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{rn}</div>
                  </div>
                );
              })}
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ height: 30, padding: '0 11px', borderRadius: 9999, background: M.bg, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MIcon name="swap" size={13} color={M.tint} /> Trade
                </div>
                <div style={{ height: 30, padding: '0 11px', borderRadius: 9999, background: M.bg, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MIcon name="user" size={13} color={M.tint} /> Cover
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 8, padding: '14px 16px 0' }}>
        {[
          { l: 'Shifts', v: myShifts.length },
          { l: 'Hours', v: hours.toFixed(1) },
          { l: 'Est. pay', v: `$${(hours * 22).toFixed(0)}` },
        ].map(s => (
          <div key={s.l} style={{ flex: 1, background: M.surface, borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: M.sec, fontWeight: 500, letterSpacing: 0.2, textTransform: 'uppercase' }}>{s.l}</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Tasks */}
      <MGroupHeader style={{ marginTop: 20 }}>Today&rsquo;s tasks · {TASKS.filter(t=>t.done).length}/{TASKS.length}</MGroupHeader>
      <MCard>
        {TASKS.map((t, i) => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '11px 16px', position: 'relative',
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: 9999,
              border: `1.5px solid ${t.done ? M.tint : M.ter}`,
              background: t.done ? M.tint : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {t.done && <MIcon name="check" size={13} color="#fff" />}
            </div>
            <div style={{ flex: 1, fontSize: 15, letterSpacing: -0.24, color: t.done ? M.sec : M.label, textDecoration: t.done ? 'line-through' : 'none' }}>{t.t}</div>
            <div style={{ fontSize: 12, color: M.sec, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{t.when}</div>
            {i < TASKS.length - 1 && <div style={{ position: 'absolute', left: 50, right: 0, bottom: 0, height: 0.5, background: M.sep }} />}
          </div>
        ))}
      </MCard>

      {/* Upcoming list */}
      <MGroupHeader style={{ marginTop: 20 }}>Upcoming shifts</MGroupHeader>
      <MCard>
        {myShifts.slice(0, 5).map((s, i, arr) => {
          const d = new Date(s.date + 'T00:00:00');
          const isLast = i === arr.length - 1;
          return (
            <div key={s.id} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
              <div style={{ width: 40, textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: M.sec, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  {d.toLocaleDateString('en-US',{weekday:'short'}).slice(0,3)}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, letterSpacing: -0.4 }}>{d.getDate()}</div>
              </div>
              <div style={{ width: 3, height: 38, borderRadius: 2, background: SHIFT_COLORS[s.shiftType] }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.24, fontVariantNumeric: 'tabular-nums' }}>
                  {formatTime(s.startTime)} – {formatTime(s.endTime)}
                </div>
                <div style={{ fontSize: 12, color: M.sec, marginTop: 2 }}>{SHIFT_LABELS[s.shiftType]} · {s.staffRoles.join(', ')}</div>
              </div>
              <MIcon name="chevron-right" size={16} color={M.ter} />
              {!isLast && <div style={{ position: 'absolute', left: 66, right: 0, bottom: 0, height: 0.5, background: M.sep }} />}
            </div>
          );
        })}
      </MCard>

      <MTabBar current="staffing" onTab={()=>{}} items={[
        { id: 'home', icon: 'building', label: 'Home' },
        { id: 'staffing', icon: 'calendar', label: 'Shifts' },
        { id: 'clock', icon: 'clock', label: 'Clock in' },
        { id: 'chat', icon: 'msgs', label: 'Chat' },
        { id: 'more', icon: 'user', label: 'Me' },
      ]} />
    </div>
  );
}

Object.assign(window, { MobileStaffingA, MobileStaffingB, MobileStaffingC, MobileStaffingAB });
