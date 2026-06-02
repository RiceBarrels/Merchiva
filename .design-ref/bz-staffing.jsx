// ═══════════════════════════════════════════════════════════
// BizOps Mobile — Staffing
// Two tabs: Overview (dashboard) + Schedule (week strip + day timeline).
// Dense, bordered, achromatic — matches design.md.
// ═══════════════════════════════════════════════════════════

function BzStaffing() {
  const [tab, setTab] = bzUS('overview');
  const todayStr = isoDate(TODAY);
  const [selDate, setSelDate] = bzUS(todayStr);

  const pendingTO = TIME_OFF_SEED.filter(r => r.status === 'pending').length;
  const pendingTD = TRADES_SEED.filter(r => r.status === 'pending').length;
  const pendingTotal = pendingTO + pendingTD;
  const activeStaff = TEAM.filter(m => m.status === 'active').length;
  const todayShifts = SHIFTS_SEED.filter(s => s.date === todayStr);
  const todayHours = todayShifts.reduce((a, s) => {
    const [sh, sm] = s.startTime.split(':').map(Number);
    const [eh, em] = s.endTime.split(':').map(Number);
    return a + ((eh * 60 + em) - (sh * 60 + sm)) / 60;
  }, 0);

  return (
    <div style={{ background: B.bg, color: B.text, fontFamily: B.font, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar
        title="Staffing"
        subtitle="Maple Coffee · 12 active"
        right={<>
          <IconBtn icon="search" />
          <IconBtn icon="bell" />
          <IconBtn icon="plus" />
        </>}
      />

      {/* Segmented tabs (borders, not pill) */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${B.border}`, background: B.bg }}>
        {[
          { id: 'overview', l: 'Overview' },
          { id: 'schedule', l: 'Schedule' },
        ].map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '14px 8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontFamily: B.font, fontSize: 13.5, fontWeight: active ? 600 : 500,
              color: active ? B.text : B.sec,
              borderBottom: active ? `2px solid ${B.text}` : '2px solid transparent',
              marginBottom: -1, letterSpacing: -0.1,
            }}>
              {t.l}
              {t.count ? (
                <span style={{
                  fontSize: 10, fontWeight: 600, minWidth: 16, height: 16, padding: '0 4px',
                  borderRadius: B.radius, background: B.text, color: B.onPri,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: B.mono, fontVariantNumeric: 'tabular-nums',
                }}>{t.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Scroll region */}
      <div style={{ flex: 1, overflow: 'auto' }} className="no-scrollbar">
        {tab === 'overview' && <OverviewTab
          pendingTO={pendingTO} pendingTD={pendingTD}
          activeStaff={activeStaff} todayShifts={todayShifts} todayHours={todayHours}
          onGotoSchedule={() => setTab('schedule')}
          onGotoRequests={() => setTab('requests')}
        />}
        {tab === 'schedule' && <ScheduleTab selDate={selDate} setSelDate={setSelDate} />}
        {tab === 'requests' && <RequestsTab />}
        {tab === 'team' && <TeamTab />}
      </div>
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────
function OverviewTab({ pendingTO, pendingTD, activeStaff, todayShifts, todayHours, onGotoSchedule, onGotoRequests }) {
  const now = new Date();
  const onShiftNow = todayShifts.filter(s => {
    const [sh, sm] = s.startTime.split(':').map(Number);
    const [eh, em] = s.endTime.split(':').map(Number);
    const start = sh * 60 + sm, end = eh * 60 + em;
    const cur = 10 * 60 + 30; // 10:30 AM "now" for the mocked today
    return cur >= start && cur < end;
  });
  const upNext = todayShifts.filter(s => {
    const [sh, sm] = s.startTime.split(':').map(Number);
    const cur = 10 * 60 + 30;
    return sh * 60 + sm >= cur;
  }).slice(0, 3);

  return (
    <div>
      {/* KPI row — 4 compact cells, borders not shadows */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${B.border}` }}>
        <Kpi label="On shift now" value={onShiftNow.length} suffix={`/ ${activeStaff}`} />
        <Kpi label="Today hours" value={todayHours.toFixed(1)} mono border />
        <Kpi label="Open requests" value={pendingTO + pendingTD} tone={pendingTO + pendingTD > 0 ? 'warn' : 'default'} topBorder />
        <Kpi label="This week" value="168.0" mono suffix="hrs" topBorder border />
      </div>

      {/* On shift now */}
      <Section title="Currently on shift" count={onShiftNow.length} action={onShiftNow.length ? { l: 'Clock out', i: 'log-out' } : null}>
        {onShiftNow.length === 0 ? (
          <EmptyRow icon="moon" text="No one clocked in right now." />
        ) : onShiftNow.map(s => {
          const m = TEAM.find(x => x.id === s.memberId);
          return (
            <ListRow key={s.id}
              left={<Avatar name={m.name} size={28} />}
              title={m.name}
              meta={s.staffRoles.join(' · ')}
              right={<>
                <span style={{ fontFamily: B.mono, fontSize: 12, color: B.text2, fontVariantNumeric: 'tabular-nums' }}>
                  {formatTimeShort(s.startTime)}–{formatTimeShort(s.endTime)}
                </span>
                <StatusDot color={B.ok} />
              </>}
            />
          );
        })}
      </Section>

      {/* Up next */}
      <Section title="Up next today" count={upNext.length}
        action={{ l: 'Schedule', i: 'calendar', onClick: onGotoSchedule }}>
        {upNext.length === 0 ? (
          <EmptyRow icon="check" text="Nothing else scheduled today." />
        ) : upNext.map(s => {
          const m = TEAM.find(x => x.id === s.memberId);
          const [sh, sm] = s.startTime.split(':').map(Number);
          const inMin = (sh * 60 + sm) - (10 * 60 + 30);
          const inStr = inMin < 60 ? `in ${inMin}m` : `in ${Math.floor(inMin/60)}h ${inMin%60 ? (inMin%60)+'m' : ''}`.trim();
          return (
            <ListRow key={s.id}
              left={<Avatar name={m.name} size={28} />}
              title={m.name}
              meta={`${s.staffRoles.join(' · ')} · ${inStr}`}
              right={<span style={{ fontFamily: B.mono, fontSize: 12, color: B.text2, fontVariantNumeric: 'tabular-nums' }}>
                {formatTimeShort(s.startTime)}–{formatTimeShort(s.endTime)}
              </span>}
            />
          );
        })}
      </Section>

      {/* Needs attention */}
      <Section title="Needs attention" count={pendingTO + pendingTD}
        action={{ l: 'Review all', i: 'chevron-right', onClick: onGotoRequests }}>
        {pendingTO > 0 && (
          <ListRow
            left={<IconTile icon="calendar-x" />}
            title={`${pendingTO} time-off ${pendingTO === 1 ? 'request' : 'requests'}`}
            meta="Awaiting approval"
            right={<Badge tone="warn">Pending</Badge>}
            onClick={onGotoRequests}
          />
        )}
        {pendingTD > 0 && (
          <ListRow
            left={<IconTile icon="arrow-left-right" />}
            title={`${pendingTD} shift ${pendingTD === 1 ? 'trade' : 'trades / covers'}`}
            meta="Awaiting approval"
            right={<Badge tone="warn">Pending</Badge>}
            onClick={onGotoRequests}
          />
        )}
        <ListRow
          left={<IconTile icon="clock" />}
          title="Unfilled shift · Sun 4–10p"
          meta="Closing · Barista"
          right={<Badge tone="danger">Open</Badge>}
        />
      </Section>

      <div style={{ height: 24 }} />
    </div>
  );
}

// ─── Schedule ────────────────────────────────────────────
function ScheduleTab({ selDate, setSelDate }) {
  const week = THIS_WEEK;
  const selDay = new Date(selDate + 'T00:00:00');
  const dayShifts = SHIFTS_SEED.filter(s => s.date === selDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const dayHours = dayShifts.reduce((a, s) => {
    const [sh, sm] = s.startTime.split(':').map(Number);
    const [eh, em] = s.endTime.split(':').map(Number);
    return a + ((eh * 60 + em) - (sh * 60 + sm)) / 60;
  }, 0);

  return (
    <div>
      {/* Week strip */}
      <div style={{ borderBottom: `1px solid ${B.border}`, background: B.surface }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 8px' }}>
          <Label>Week of {week[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Label>
          <div style={{ display: 'flex', gap: 2 }}>
            <IconBtn icon="chevron-left" size={28} />
            <IconBtn icon="chevron-right" size={28} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 12px 14px' }}>
          {week.map((d, i) => {
            const iso = isoDate(d);
            const active = iso === selDate;
            const isToday = iso === isoDate(TODAY);
            const count = SHIFTS_SEED.filter(s => s.date === iso).length;
            return (
              <button key={iso} onClick={() => setSelDate(iso)} style={{
                background: active ? B.text : 'transparent',
                color: active ? B.onPri : (isToday ? B.text : B.text2),
                border: `1px solid ${active ? B.text : 'transparent'}`,
                borderRadius: B.radiusLg,
                padding: '9px 0 7px', margin: '0 2px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                fontFamily: B.font,
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', opacity: active ? 0.75 : 0.6 }}>
                  {DAY_ABBR[i]}
                </div>
                <div style={{ fontSize: 17, fontWeight: 600, fontFamily: B.mono, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                  {d.getDate()}
                </div>
                <div style={{
                  marginTop: 4,
                  fontSize: 9.5, fontWeight: 600, fontFamily: B.mono,
                  color: active ? B.onPri : B.sec,
                  fontVariantNumeric: 'tabular-nums', opacity: active ? 0.85 : 1,
                }}>{count}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day header */}
      <div style={{
        padding: '14px 18px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        borderBottom: `1px solid ${B.border}`, background: B.bg,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: B.text, letterSpacing: -0.2 }}>
            {selDay.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
          <div style={{ fontSize: 12, color: B.sec, marginTop: 3 }}>
            <span style={{ fontFamily: B.mono, fontVariantNumeric: 'tabular-nums' }}>{dayShifts.length}</span> shifts
            {' · '}<span style={{ fontFamily: B.mono, fontVariantNumeric: 'tabular-nums' }}>{dayHours.toFixed(1)}h</span>
          </div>
        </div>
        <button style={{
          height: 32, padding: '0 12px', borderRadius: B.radiusLg,
          border: `1px solid ${B.border}`, background: B.bg,
          fontSize: 13, fontWeight: 500, color: B.text, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: B.font,
        }}>
          <BIcon name="plus" size={14} /> Add shift
        </button>
      </div>

      {/* Timeline — hour rows + shift bars */}
      <DayTimeline shifts={dayShifts} />

      <div style={{ height: 24 }} />
    </div>
  );
}

function DayTimeline({ shifts }) {
  const start = 6, end = 23; // 6a–11p
  const rowH = 38;
  const timeCol = 50;
  const total = (end - start) * rowH;

  return (
    <div style={{ position: 'relative', padding: '8px 0 16px' }}>
      <div style={{ position: 'relative', marginLeft: timeCol, marginRight: 16, borderLeft: `1px solid ${B.border}` }}>
        {/* Hour rows */}
        {Array.from({ length: end - start + 1 }, (_, i) => {
          const hr = start + i;
          const label = hr % 12 === 0 ? 12 : hr % 12;
          const p = hr >= 12 ? 'PM' : 'AM';
          return (
            <div key={hr} style={{ position: 'relative', height: rowH }}>
              <div style={{
                position: 'absolute', right: '100%', top: -6, marginRight: 10,
                fontSize: 10.5, fontFamily: B.mono, color: B.ter,
                fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', letterSpacing: 0,
              }}>{label} {p}</div>
              <div style={{ position: 'absolute', left: 0, right: 0, top: 0, borderTop: `1px solid ${hr === start ? 'transparent' : B.border}`, opacity: 0.6 }} />
            </div>
          );
        })}

        {/* Shift bars — packed in 2 columns */}
        <ShiftBars shifts={shifts} startHr={start} rowH={rowH} />
      </div>
    </div>
  );
}

function ShiftBars({ shifts, startHr, rowH }) {
  // Simple packing: assign columns greedily to avoid overlaps.
  const withRange = shifts.map(s => {
    const [sh, sm] = s.startTime.split(':').map(Number);
    const [eh, em] = s.endTime.split(':').map(Number);
    return { ...s, startMin: sh * 60 + sm, endMin: eh * 60 + em };
  });
  const cols = [];
  withRange.forEach(s => {
    let placed = false;
    for (let i = 0; i < cols.length; i++) {
      if (cols[i][cols[i].length - 1].endMin <= s.startMin) {
        cols[i].push(s); s.col = i; placed = true; break;
      }
    }
    if (!placed) { cols.push([s]); s.col = cols.length - 1; }
  });
  const colCount = Math.max(cols.length, 1);

  return (
    <>
      {withRange.map(s => {
        const top = ((s.startMin - startHr * 60) / 60) * rowH;
        const h = ((s.endMin - s.startMin) / 60) * rowH;
        const w = `calc(${100 / colCount}% - 4px)`;
        const left = `calc(${(s.col * 100) / colCount}% + 2px)`;
        const m = TEAM.find(x => x.id === s.memberId);
        return (
          <div key={s.id} style={{
            position: 'absolute', top: top + 2, height: Math.max(h - 3, 28),
            left, width: w,
            background: B.bg, border: `1px solid ${B.border}`,
            borderLeft: `2px solid ${B.text}`,
            borderRadius: B.radiusLg,
            padding: '6px 8px', overflow: 'hidden',
            display: 'flex', flexDirection: 'column', gap: 3,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <Avatar name={m.name} size={18} />
              <div style={{ fontSize: 12.5, fontWeight: 600, color: B.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: -0.15 }}>
                {m.name.split(' ')[0]}
              </div>
            </div>
            <div style={{ fontSize: 10.5, fontFamily: B.mono, color: B.sec, fontVariantNumeric: 'tabular-nums', letterSpacing: 0 }}>
              {formatTimeShort(s.startTime)}–{formatTimeShort(s.endTime)}
            </div>
            {h >= 72 && (
              <div style={{ fontSize: 10.5, color: B.sec, marginTop: 'auto' }}>{s.staffRoles.join(', ')}</div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ─── Requests ────────────────────────────────────────────
function RequestsTab() {
  return (
    <div>
      <Section title="Time off" count={TIME_OFF_SEED.length}>
        {TIME_OFF_SEED.map(r => {
          const m = TEAM.find(x => x.id === r.userId);
          const range = r.fullDays
            ? `${shortDate(r.startDate)}${r.startDate !== r.endDate ? ' – ' + shortDate(r.endDate) : ''}`
            : `${shortDate(r.startDate)} · ${formatTimeShort(r.startTime)}–${formatTimeShort(r.endTime)}`;
          return (
            <ListRow key={r.id}
              left={<Avatar name={m.name} size={28} />}
              title={m.name}
              meta={<>{range}{r.comments ? <span style={{ color: B.ter }}>  ·  {r.comments}</span> : null}</>}
              right={<>
                <Badge tone="ok">Approve</Badge>
                <Badge tone="default">Deny</Badge>
              </>}
            />
          );
        })}
      </Section>

      <Section title="Trades & covers" count={TRADES_SEED.length}>
        {TRADES_SEED.map(r => {
          const req = TEAM.find(x => x.id === r.requesterId);
          const tgt = r.targetId ? TEAM.find(x => x.id === r.targetId) : null;
          const sh = SHIFTS_SEED.find(s => s.id === r.shiftId);
          return (
            <ListRow key={r.id}
              left={<IconTile icon={r.type === 'trade' ? 'arrow-left-right' : 'user-plus'} />}
              title={r.type === 'trade' ? `${req.name.split(' ')[0]} ↔ ${tgt.name.split(' ')[0]}` : `${req.name.split(' ')[0]} needs cover`}
              meta={sh ? `${shortDate(sh.date)} · ${formatTimeShort(sh.startTime)}–${formatTimeShort(sh.endTime)} · ${sh.staffRoles.join(', ')}` : null}
              right={<Badge tone="warn">Pending</Badge>}
            />
          );
        })}
      </Section>

      <div style={{ height: 24 }} />
    </div>
  );
}

// ─── Team ───────────────────────────────────────────────
function TeamTab() {
  return (
    <div>
      <div style={{ padding: '10px 14px', display: 'flex', gap: 8, background: B.bg, borderBottom: `1px solid ${B.border}` }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 6,
          height: 30, padding: '0 10px', background: B.muted,
          border: `1px solid ${B.border}`, borderRadius: B.radius,
          fontSize: 12, color: B.sec,
        }}>
          <BIcon name="search" size={13} color={B.sec} />
          Search team
        </div>
        <button style={{
          height: 30, padding: '0 10px', borderRadius: B.radius,
          border: `1px solid ${B.border}`, background: B.bg,
          fontSize: 12, fontWeight: 500, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <BIcon name="plus" size={13} /> Invite
        </button>
      </div>

      {TEAM.map((m, i) => (
        <ListRow key={m.id}
          left={<Avatar name={m.name} size={32} />}
          title={m.name}
          meta={<><span>{m.roleTitle}</span>{m.status === 'invited' ? <Badge tone="outline" style={{ marginLeft: 8 }}>Invited</Badge> : null}</>}
          right={<BIcon name="chevron-right" size={14} color={B.ter} />}
          dense={false}
          last={i === TEAM.length - 1}
        />
      ))}

      <div style={{ height: 24 }} />
    </div>
  );
}

// ─── Shared row primitives ───────────────────────────────
function Section({ title, count, action, children }) {
  return (
    <div style={{ borderBottom: `1px solid ${B.border}` }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 18px 10px', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Label>{title}</Label>
          {typeof count === 'number' && count > 0 && (
            <span style={{
              fontFamily: B.mono, fontSize: 10.5, color: B.sec, fontVariantNumeric: 'tabular-nums',
              padding: '0 5px', height: 16, lineHeight: '16px',
              border: `1px solid ${B.border}`, borderRadius: B.radius,
            }}>{count}</span>
          )}
        </div>
        {action && (
          <button onClick={action.onClick} style={{
            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
            color: B.text2, display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 11.5, fontWeight: 500,
          }}>
            {action.l} <BIcon name={action.i} size={12} />
          </button>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ListRow({ left, title, meta, right, onClick, last }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 18px',
      borderTop: `1px solid ${B.border}`,
      background: B.bg, cursor: onClick ? 'pointer' : 'default',
    }}>
      {left}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: B.text, letterSpacing: -0.15, lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: 6 }}>{title}</div>
        {meta && <div style={{ fontSize: 12, color: B.sec, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{right}</div>
    </div>
  );
}

function EmptyRow({ icon, text }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '14px', borderTop: `1px solid ${B.border}`,
      color: B.sec, fontSize: 12.5,
    }}>
      <BIcon name={icon} size={14} color={B.ter} />
      {text}
    </div>
  );
}

function IconTile({ icon }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: B.radius,
      background: B.muted, border: `1px solid ${B.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: B.text2, flexShrink: 0,
    }}><BIcon name={icon} size={14} /></div>
  );
}

function Kpi({ label, value, suffix, tone, mono, border, topBorder }) {
  return (
    <div style={{
      padding: '18px 18px 16px',
      borderRight: border ? 0 : `1px solid ${B.border}`,
      borderTop: topBorder ? `1px solid ${B.border}` : 0,
    }}>
      <Label>{label}</Label>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
        <div style={{
          fontSize: 26, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1,
          fontFamily: mono ? B.mono : B.font,
          fontVariantNumeric: mono ? 'tabular-nums' : undefined,
          color: tone === 'warn' ? B.warn : B.text,
        }}>{value}</div>
        {suffix && <div style={{ fontSize: 12, color: B.sec, fontFamily: B.mono, fontVariantNumeric: 'tabular-nums' }}>{suffix}</div>}
      </div>
    </div>
  );
}

function StatusDot({ color }) {
  return <span style={{ width: 6, height: 6, borderRadius: 9999, background: color, display: 'inline-block', flexShrink: 0 }} />;
}

Object.assign(window, { BzStaffing });
