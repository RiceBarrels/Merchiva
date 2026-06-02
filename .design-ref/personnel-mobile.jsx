// ═══════════════════════════════════════════════════════════
// 人员管理 · Mobile (iOS)
// Schedule · Team · Roles & Tasks · Training — all in one phone screen
// Reuses bz-shared tokens (B, BIcon, Avatar, Badge, IconBtn, TopBar, Label)
// ═══════════════════════════════════════════════════════════

const { useState: pmUS, useEffect: pmUE, useMemo: pmUM } = React;

// ─── Section meta ───────────────────────────────────────────
const PM_SECTIONS = [
  { id: 'schedule', cn: '排班',   en: 'Schedule', icon: 'calendar-clock' },
  { id: 'team',     cn: '员工',   en: 'Team',     icon: 'users' },
  { id: 'roles',    cn: '角色',   en: 'Roles',    icon: 'shield' },
  { id: 'training', cn: '培训',   en: 'Training', icon: 'graduation-cap' },
];

// ─── Top section pills (scrollable) ─────────────────────────
function PMSectionPills({ section, onChange, requestsCount }) {
  return (
    <div style={{
      display: 'flex', gap: 6, padding: '10px 14px 12px',
      overflowX: 'auto', background: B.bg,
      borderBottom: `1px solid ${B.border}`,
    }} className="no-scrollbar">
      {PM_SECTIONS.map(s => {
        const active = s.id === section;
        const isSched = s.id === 'schedule';
        return (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 32, padding: '0 12px', flexShrink: 0,
              borderRadius: 999,
              border: `1px solid ${active ? B.text : B.border}`,
              background: active ? B.text : B.bg,
              color: active ? B.onPri : B.text2,
              fontSize: 13, fontWeight: active ? 600 : 500, letterSpacing: -0.1,
              cursor: 'pointer', fontFamily: B.font,
              position: 'relative', whiteSpace: 'nowrap',
            }}
          >
            <BIcon name={s.icon} size={13} />
            {s.cn}
            <span style={{ fontSize: 10.5, opacity: 0.6, marginLeft: 1 }}>{s.en}</span>
            {isSched && requestsCount > 0 && (
              <span style={{
                marginLeft: 4,
                minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999,
                background: active ? B.onPri : B.warn, color: active ? B.text : B.onPri,
                fontFamily: B.mono, fontSize: 9.5, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontVariantNumeric: 'tabular-nums',
              }}>{requestsCount}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Shared compact list row ────────────────────────────────
function PMRow({ left, title, meta, right, onClick, sub }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', borderTop: `1px solid ${B.border}`,
      background: B.bg, cursor: onClick ? 'pointer' : 'default',
    }}>
      {left}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: B.text, letterSpacing: -0.15, lineHeight: 1.25, display: 'flex', alignItems: 'center', gap: 6 }}>{title}</div>
        {meta && <div style={{ fontSize: 11.5, color: B.sec, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</div>}
        {sub && <div style={{ fontSize: 11, color: B.ter, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{right}</div>
    </div>
  );
}

function PMSection({ title, count, action, children, kicker }) {
  return (
    <div style={{ borderBottom: `1px solid ${B.border}` }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 16px 8px', gap: 8,
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
          }}>{action.l} <BIcon name={action.i || 'chevron-right'} size={12} /></button>
        )}
      </div>
      {kicker && <div style={{ padding: '0 16px 8px', fontSize: 12, color: B.sec, lineHeight: 1.5 }}>{kicker}</div>}
      <div>{children}</div>
    </div>
  );
}

// ─── 排班 Schedule view (week strip + day timeline) ─────────
function PMScheduleView({ onOpenRequests, pending }) {
  const [selDate, setSelDate] = pmUS(isoDate(TODAY));
  const week = THIS_WEEK;
  const selDay = new Date(selDate + 'T00:00:00');
  const dayShifts = SHIFTS_SEED.filter(s => s.date === selDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const dayHours = dayShifts.reduce((a, s) => {
    const [sh, sm] = s.startTime.split(':').map(Number);
    const [eh, em] = s.endTime.split(':').map(Number);
    return a + ((eh*60+em) - (sh*60+sm)) / 60;
  }, 0);
  const onShiftNow = dayShifts.filter(s => {
    const [sh, sm] = s.startTime.split(':').map(Number);
    const [eh, em] = s.endTime.split(':').map(Number);
    const cur = 10 * 60 + 30;
    return cur >= sh*60+sm && cur < eh*60+em;
  });

  return (
    <div>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: `1px solid ${B.border}` }}>
        <PMKpi label="在岗" value={onShiftNow.length} suffix={`/ ${TEAM.filter(m=>m.status==='active').length}`} />
        <PMKpi label="今日时长" value={dayHours.toFixed(1)} suffix="h" mono border />
        <PMKpi label="待处理" value={pending} tone={pending > 0 ? 'warn' : 'default'} border onClick={onOpenRequests} />
      </div>

      {/* Week strip */}
      <div style={{ borderBottom: `1px solid ${B.border}`, background: B.surface }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 6px' }}>
          <Label>本周 · {week[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Label>
          <div style={{ display: 'flex', gap: 2 }}>
            <IconBtn icon="chevron-left" size={26} />
            <IconBtn icon="chevron-right" size={26} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 10px 12px' }}>
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
                padding: '8px 0 6px', margin: '0 2px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                fontFamily: B.font, position: 'relative',
              }}>
                <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 0.7, textTransform: 'uppercase', opacity: active ? 0.75 : 0.6 }}>
                  {DAY_ABBR[i]}
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, fontFamily: B.mono, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{d.getDate()}</div>
                <div style={{
                  marginTop: 3, fontSize: 9, fontWeight: 600, fontFamily: B.mono,
                  color: active ? B.onPri : B.sec,
                  fontVariantNumeric: 'tabular-nums', opacity: active ? 0.85 : 1,
                }}>{count}</div>
                {isToday && !active && (
                  <span style={{ position: 'absolute', bottom: 2, width: 3, height: 3, borderRadius: 9999, background: B.text }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day header */}
      <div style={{
        padding: '12px 16px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        borderBottom: `1px solid ${B.border}`, background: B.bg,
      }}>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: B.text, letterSpacing: -0.2 }}>
            {selDay.toLocaleDateString('zh-CN', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
          <div style={{ fontSize: 11.5, color: B.sec, marginTop: 2 }}>
            <span style={{ fontFamily: B.mono, fontVariantNumeric: 'tabular-nums' }}>{dayShifts.length}</span> 班次
            {' · '}<span style={{ fontFamily: B.mono, fontVariantNumeric: 'tabular-nums' }}>{dayHours.toFixed(1)}h</span>
          </div>
        </div>
        <button style={{
          height: 28, padding: '0 10px', borderRadius: B.radiusLg,
          border: `1px solid ${B.border}`, background: B.bg,
          fontSize: 12, fontWeight: 500, color: B.text, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: B.font,
          whiteSpace: 'nowrap',
        }}>
          <BIcon name="plus" size={12} /> 添加
        </button>
      </div>

      {/* Day shift list */}
      {dayShifts.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: B.sec, fontSize: 12.5 }}>
          <BIcon name="moon" size={20} color={B.ter} />
          <div style={{ marginTop: 8 }}>当日无排班</div>
        </div>
      ) : dayShifts.map((s, i) => {
        const m = TEAM.find(x => x.id === s.memberId);
        const isOnNow = (() => {
          const [sh, sm] = s.startTime.split(':').map(Number);
          const [eh, em] = s.endTime.split(':').map(Number);
          const cur = 10 * 60 + 30;
          return cur >= sh*60+sm && cur < eh*60+em;
        })();
        return (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px',
            borderBottom: i < dayShifts.length - 1 ? `1px solid ${B.border}` : 'none',
            background: B.bg, position: 'relative',
          }}>
            <div style={{
              width: 3, alignSelf: 'stretch', borderRadius: 1.5,
              background: SHIFT_COLORS[s.shiftType] || B.text,
            }} />
            <Avatar name={m.name} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: B.text, letterSpacing: -0.15 }}>
                {m.name}
                {isOnNow && <span style={{ marginLeft: 6, fontSize: 9.5, color: B.ok, fontWeight: 700, letterSpacing: 0.5 }}>● 在岗</span>}
              </div>
              <div style={{ fontSize: 11, color: B.sec, marginTop: 1.5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {s.staffRoles.map((rn, j) => {
                  const r = ROLES.find(x => x.name === rn);
                  return (
                    <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 9999, background: r?.color || B.ter }} />
                      {rn}
                    </span>
                  );
                })}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: B.mono, fontSize: 12.5, color: B.text, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {formatTimeShort(s.startTime)}
              </div>
              <div style={{ fontFamily: B.mono, fontSize: 10.5, color: B.sec, fontVariantNumeric: 'tabular-nums' }}>
                –{formatTimeShort(s.endTime)}
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ height: 16 }} />
    </div>
  );
}

function PMKpi({ label, value, suffix, tone, mono, border, onClick }) {
  return (
    <div onClick={onClick} style={{
      padding: '14px 14px 12px',
      borderLeft: border ? `1px solid ${B.border}` : 0,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <Label style={{ fontSize: 10 }}>{label}</Label>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 6 }}>
        <div style={{
          fontSize: 22, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1,
          fontFamily: mono ? B.mono : B.font,
          fontVariantNumeric: mono ? 'tabular-nums' : undefined,
          color: tone === 'warn' ? B.warn : B.text,
        }}>{value}</div>
        {suffix && <div style={{ fontSize: 11, color: B.sec, fontFamily: B.mono, fontVariantNumeric: 'tabular-nums' }}>{suffix}</div>}
      </div>
    </div>
  );
}

// ─── 员工 Team view ─────────────────────────────────────────
function PMTeamView() {
  const [q, setQ] = pmUS('');
  const [filter, setFilter] = pmUS('all'); // all | active | invited
  const list = TEAM.filter(m => {
    if (filter === 'active' && m.status !== 'active') return false;
    if (filter === 'invited' && m.status !== 'invited') return false;
    if (q && !m.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const counts = {
    all: TEAM.length,
    active: TEAM.filter(m => m.status === 'active').length,
    invited: TEAM.filter(m => m.status === 'invited').length,
  };

  return (
    <div>
      {/* Search + invite */}
      <div style={{ padding: '10px 14px', display: 'flex', gap: 8, background: B.bg, borderBottom: `1px solid ${B.border}` }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 6,
          height: 32, padding: '0 10px', background: B.muted,
          border: `1px solid ${B.border}`, borderRadius: B.radius,
        }}>
          <BIcon name="search" size={13} color={B.sec} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索成员"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 12.5, color: B.text, padding: 0, fontFamily: B.font,
            }}
          />
        </div>
        <button style={{
          height: 32, padding: '0 12px', borderRadius: B.radius,
          border: `1px solid ${B.text}`, background: B.text, color: B.onPri,
          fontSize: 12, fontWeight: 500, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 4,
          whiteSpace: 'nowrap',
        }}>
          <BIcon name="plus" size={13} /> 邀请
        </button>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', borderBottom: `1px solid ${B.border}`, background: B.bg }}>
        {[
          { id: 'all',     l: `全部 ${counts.all}` },
          { id: 'active',  l: `在职 ${counts.active}` },
          { id: 'invited', l: `待入职 ${counts.invited}` },
        ].map(f => {
          const active = f.id === filter;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              height: 26, padding: '0 10px', borderRadius: 999,
              border: `1px solid ${active ? B.text : B.border}`,
              background: active ? B.text : B.bg, color: active ? B.onPri : B.text2,
              fontSize: 11.5, fontWeight: active ? 600 : 500, cursor: 'pointer', fontFamily: B.font,
              whiteSpace: 'nowrap',
            }}>{f.l}</button>
          );
        })}
      </div>

      {/* Member list */}
      {list.length === 0 ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: B.sec, fontSize: 12.5 }}>
          没有符合条件的成员
        </div>
      ) : list.map((m, i) => {
        const r = ROLES.find(x => m.roleTitle.toLowerCase().includes(x.name.toLowerCase()));
        const isMe = m.id === 'm1';
        return (
          <PMRow
            key={m.id}
            left={<Avatar name={m.name} size={32} />}
            title={<>{m.name}{isMe && <Badge tone="default" style={{ marginLeft: 6 }}>YOU</Badge>}</>}
            meta={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {r && <span style={{ width: 6, height: 6, borderRadius: 9999, background: r.color, display: 'inline-block' }} />}
                {m.roleTitle}
              </span>
            }
            sub={m.email}
            right={
              <>
                {m.status === 'invited' && <Badge tone="warn">待入职</Badge>}
                <BIcon name="chevron-right" size={13} color={B.ter} />
              </>
            }
          />
        );
      })}
      <div style={{ height: 16 }} />
    </div>
  );
}

// ─── 角色 Roles view (list + drill-down to tasks) ───────────
const PM_ROLE_TASKS = {
  r1: [
    { id: 'b1', title: '清洁咖啡机', t: '07:00–07:15' },
    { id: 'b2', title: '检查冰箱牛奶库存', t: '07:15–07:25' },
    { id: 'b3', title: '补充糕点展示', t: '07:30–07:45' },
    { id: 'b4', title: '反冲冲泡头', t: '14:00–14:15' },
    { id: 'b5', title: '清洁蒸汽棒', t: '14:15–14:20' },
  ],
  r2: [
    { id: 'l1', title: '开店清单', t: '06:45–07:05' },
    { id: 'l2', title: '清点零钱开收银', t: '07:05–07:15' },
    { id: 'l3', title: '员工早会 · 促销', t: '07:15–07:25' },
    { id: 'l4', title: '日间存款', t: '13:00–13:10' },
  ],
  r3: [
    { id: 'c1', title: '准备零钱袋 · 开机', t: '08:00–08:10' },
    { id: 'c2', title: '补充袋子与杯子', t: '10:00–10:15' },
  ],
  r4: [
    { id: 'k1', title: '点火 · 醒面团', t: '10:00–10:20' },
    { id: 'k2', title: '三明治备料 · 20 份', t: '10:20–11:00' },
  ],
  r5: [
    { id: 'x1', title: '检查卫生间', t: '随时' },
    { id: 'x2', title: '拖地', t: '21:30–21:45' },
  ],
};

function PMRolesView() {
  const [selRole, setSelRole] = pmUS(null);

  if (selRole) {
    const r = ROLES.find(x => x.id === selRole);
    const tasks = PM_ROLE_TASKS[selRole] || [];
    const members = TEAM.filter(m => m.status === 'active' && m.roleTitle.toLowerCase().includes(r.name.toLowerCase()));
    return (
      <div>
        {/* Role detail header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 14px', borderBottom: `1px solid ${B.border}`,
          background: B.bg,
        }}>
          <button onClick={() => setSelRole(null)} style={{
            width: 32, height: 32, borderRadius: B.radius,
            border: `1px solid ${B.border}`, background: B.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <BIcon name="chevron-left" size={15} />
          </button>
          <span style={{
            width: 32, height: 32, borderRadius: B.radius,
            background: r.color, color: B.onPri,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BIcon name={r.icon} size={15} color={B.onPri} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>{r.name}</div>
            <div style={{ fontSize: 11, color: B.sec, marginTop: 1 }}>{members.length} 名成员 · {tasks.length} 项任务</div>
          </div>
          <BIcon name="pencil" size={14} color={B.sec} />
        </div>

        {/* Members chips */}
        <div style={{ padding: '12px 14px 4px', background: B.bg, borderBottom: `1px solid ${B.border}` }}>
          <Label style={{ marginBottom: 8 }}>成员 · {members.length}</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {members.length === 0 ? (
              <div style={{ fontSize: 12, color: B.ter, padding: '4px 0 8px' }}>暂无成员</div>
            ) : members.map(m => (
              <div key={m.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px 4px 4px', borderRadius: 999,
                border: `1px solid ${B.border}`, background: B.bg,
              }}>
                <Avatar name={m.name} size={20} />
                <span style={{ fontSize: 12, fontWeight: 500 }}>{m.name.split(' ')[0]}</span>
              </div>
            ))}
          </div>
          <div style={{ paddingBottom: 12 }} />
        </div>

        {/* Tasks */}
        <PMSection title={`任务清单 · ${tasks.length}`} action={{ l: '新增', i: 'plus' }}>
          {tasks.map(t => (
            <PMRow
              key={t.id}
              left={<span style={{
                width: 18, height: 18, borderRadius: 4,
                border: `1.5px solid ${B.borderS}`, background: B.bg, flexShrink: 0,
              }} />}
              title={t.title}
              meta={<span style={{ fontFamily: B.mono, fontVariantNumeric: 'tabular-nums' }}>{t.t}</span>}
              right={<BIcon name="more-vertical" size={13} color={B.ter} />}
            />
          ))}
        </PMSection>
        <div style={{ height: 16 }} />
      </div>
    );
  }

  return (
    <div>
      <PMSection title={`角色 · ${ROLES.length}`} action={{ l: '新增', i: 'plus' }} kicker="点击角色查看其任务清单与成员分配">
        {ROLES.map(r => {
          const members = TEAM.filter(m => m.status === 'active' && m.roleTitle.toLowerCase().includes(r.name.toLowerCase()));
          const tasks = (PM_ROLE_TASKS[r.id] || []).length;
          return (
            <PMRow
              key={r.id}
              onClick={() => setSelRole(r.id)}
              left={
                <span style={{
                  width: 36, height: 36, borderRadius: B.radius,
                  background: r.color, color: B.onPri,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <BIcon name={r.icon} size={16} color={B.onPri} />
                </span>
              }
              title={r.name}
              meta={<><span style={{ fontFamily: B.mono, fontVariantNumeric: 'tabular-nums' }}>{members.length}</span> 名成员 · <span style={{ fontFamily: B.mono, fontVariantNumeric: 'tabular-nums' }}>{tasks}</span> 项任务</>}
              right={<BIcon name="chevron-right" size={14} color={B.ter} />}
            />
          );
        })}
      </PMSection>
      <div style={{ height: 16 }} />
    </div>
  );
}

// ─── 培训 Training view ─────────────────────────────────────
function PMTrainingView() {
  const [role, setRole] = pmUS(() => {
    try { return localStorage.getItem('bz_pm_train_role') || 'intern'; } catch { return 'intern'; }
  });
  pmUE(() => {
    try { localStorage.setItem('bz_pm_train_role', role); } catch {}
  }, [role]);

  const roleMeta = [
    { id: 'intern',  cn: '实习员工', en: 'Intern',  icon: 'graduation-cap' },
    { id: 'trainer', cn: '培训师',   en: 'Trainer', icon: 'award' },
    { id: 'manager', cn: '经理',     en: 'Manager', icon: 'pencil-ruler' },
  ];

  return (
    <div>
      {/* Role switcher (compact) */}
      <div style={{
        display: 'flex', gap: 6, padding: '10px 14px',
        background: B.bg, borderBottom: `1px solid ${B.border}`,
      }}>
        <span style={{ fontSize: 10.5, color: B.sec, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600, alignSelf: 'center' }}>
          视角
        </span>
        <div style={{ flex: 1, display: 'flex', gap: 4 }}>
          {roleMeta.map(r => {
            const active = r.id === role;
            return (
              <button key={r.id} onClick={() => setRole(r.id)} style={{
                flex: 1, height: 30, borderRadius: B.radius,
                border: `1px solid ${active ? B.text : B.border}`,
                background: active ? B.text : B.bg, color: active ? B.onPri : B.text2,
                fontSize: 12, fontWeight: active ? 600 : 500, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                fontFamily: B.font, whiteSpace: 'nowrap',
              }}>
                <BIcon name={r.icon} size={12} />
                {r.cn}
              </button>
            );
          })}
        </div>
      </div>

      {role === 'intern'  && <PMTrainingIntern />}
      {role === 'trainer' && <PMTrainingTrainer />}
      {role === 'manager' && <PMTrainingManager />}
      <div style={{ height: 16 }} />
    </div>
  );
}

function PMTrainingIntern() {
  const [tasks, setTasks] = pmUS([
    { id: 't1', title: '观看示范视频 · 萃取浓缩咖啡', done: true,  t: '5 min', kind: 'video' },
    { id: 't2', title: '阅读: 浓缩咖啡基础', done: true, t: '10 min', kind: 'read' },
    { id: 't3', title: '现场练习 · 拉 5 杯',  done: false, t: '30 min', kind: 'practice' },
    { id: 't4', title: '小测验 · 浓缩参数',    done: false, t: '8 min',  kind: 'quiz' },
  ]);
  const day = CURRICULUM.find(d => d.id === 'd03');
  const doneCount = tasks.filter(t => t.done).length;
  const pct = Math.round((doneCount / tasks.length) * 100);

  const kindIcon = { video: 'play', read: 'book-open', practice: 'hand', quiz: 'help-circle' };

  return (
    <div>
      {/* Today's module hero card */}
      <div style={{ padding: '16px 14px', background: B.bg, borderBottom: `1px solid ${B.border}` }}>
        <div style={{
          padding: 14, borderRadius: B.radiusLg, border: `1px solid ${B.border}`,
          background: B.surface,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Badge tone="default" mono>DAY 3 / 12</Badge>
            <Badge tone="warn">必修</Badge>
            <span style={{ marginLeft: 'auto', fontFamily: B.mono, fontSize: 11, color: B.sec, fontVariantNumeric: 'tabular-nums' }}>
              {day.mins} 分钟
            </span>
          </div>
          <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: -0.4, color: B.text }}>萃取浓缩咖啡</div>
          <div style={{ fontSize: 12, color: B.sec, marginTop: 4 }}>Espresso Pull · 实操训练</div>

          {/* Progress */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, color: B.sec }}>进度</span>
              <span style={{ fontFamily: B.mono, fontSize: 12.5, color: B.text, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {doneCount}/{tasks.length} · {pct}%
              </span>
            </div>
            <div style={{ height: 6, background: B.muted, borderRadius: 9999, overflow: 'hidden', border: `1px solid ${B.border}` }}>
              <div style={{ width: `${pct}%`, height: '100%', background: B.text, transition: 'width 200ms' }} />
            </div>
          </div>

          <button style={{
            marginTop: 12, height: 36, width: '100%',
            borderRadius: B.radius, border: 'none',
            background: B.text, color: B.onPri,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontFamily: B.font, whiteSpace: 'nowrap',
          }}>
            <BIcon name="play" size={13} color={B.onPri} />
            继续学习
          </button>
        </div>
      </div>

      {/* Today's tasks */}
      <PMSection title={`今日任务 · ${tasks.length}`}>
        {tasks.map(t => (
          <div key={t.id} onClick={() => setTasks(ts => ts.map(x => x.id === t.id ? { ...x, done: !x.done } : x))} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px', borderTop: `1px solid ${B.border}`,
            background: B.bg, cursor: 'pointer',
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: 4, flexShrink: 0,
              background: t.done ? B.text : B.bg,
              border: `1.5px solid ${t.done ? B.text : B.borderS}`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {t.done && <BIcon name="check" size={12} color={B.onPri} />}
            </span>
            <span style={{
              width: 26, height: 26, borderRadius: B.radius,
              background: B.muted, border: `1px solid ${B.border}`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <BIcon name={kindIcon[t.kind]} size={13} color={B.text2} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13.5, fontWeight: 500, color: t.done ? B.ter : B.text,
                textDecoration: t.done ? 'line-through' : 'none',
                letterSpacing: -0.1,
              }}>{t.title}</div>
            </div>
            <span style={{ fontFamily: B.mono, fontSize: 11, color: B.sec, fontVariantNumeric: 'tabular-nums' }}>{t.t}</span>
          </div>
        ))}
      </PMSection>

      {/* Course progress */}
      <PMSection title="课程进度 · 12 天">
        <div style={{ padding: '8px 16px 12px', display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {CURRICULUM.map(d => {
            const done = d.day < 3;
            const active = d.day === 3;
            return (
              <div key={d.id} style={{
                width: 26, height: 26, borderRadius: B.radius,
                background: active ? B.text : (done ? B.ok : B.muted),
                color: active ? B.onPri : (done ? B.onPri : B.sec),
                border: `1px solid ${active ? B.text : (done ? B.ok : B.border)}`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: B.mono, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
              }} title={d.title}>
                {done ? '✓' : d.day}
              </div>
            );
          })}
        </div>
      </PMSection>
    </div>
  );
}

function PMTrainingTrainer() {
  return (
    <div>
      <PMSection title={`实习员工 · ${TRAINEES.length}`} kicker="查看每位实习员工的进度，评分今日实操">
        {TRAINEES.map(t => {
          const pct = Math.round((t.dayProgress / 12) * 100);
          const statusMeta = {
            'in-progress':    { label: '进行中', tone: 'default' },
            'review-pending': { label: '待评估', tone: 'warn' },
            'completed':      { label: '已完成', tone: 'ok' },
            'blocked':        { label: '受阻',   tone: 'danger' },
          }[t.status] || { label: t.status, tone: 'default' };
          return (
            <PMRow
              key={t.id}
              left={<Avatar name={t.name} size={32} />}
              title={t.name}
              meta={<>
                <span>{t.role} · 第 <span style={{ fontFamily: B.mono, fontVariantNumeric: 'tabular-nums' }}>{t.dayProgress}</span> 天 · </span>
                <span style={{ fontFamily: B.mono, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
              </>}
              right={<>
                <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                <BIcon name="chevron-right" size={13} color={B.ter} />
              </>}
            />
          );
        })}
      </PMSection>

      <PMSection title="今日待评估" kicker="打开打分表，对照评分项给出反馈">
        <PMRow
          left={<span style={{ width: 32, height: 32, borderRadius: B.radius, background: B.muted, border: `1px solid ${B.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <BIcon name="clipboard-check" size={14} color={B.text2} />
          </span>}
          title="Maya Wu · 浓缩咖啡萃取"
          meta="共 5 项评分点 · 上次评分 2 天前"
          right={<Badge tone="warn">待评分</Badge>}
        />
        <PMRow
          left={<span style={{ width: 32, height: 32, borderRadius: B.radius, background: B.muted, border: `1px solid ${B.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <BIcon name="clipboard-check" size={14} color={B.text2} />
          </span>}
          title="Devon Ray · 浓缩咖啡萃取"
          meta="共 5 项评分点"
          right={<Badge tone="default">待评分</Badge>}
        />
      </PMSection>
    </div>
  );
}

function PMTrainingManager() {
  return (
    <div>
      <PMSection title={`课程模块 · ${CURRICULUM.length} 天`} action={{ l: '新增', i: 'plus' }}>
        {CURRICULUM.slice(0, 6).map(d => (
          <PMRow
            key={d.id}
            left={<span style={{
              width: 32, height: 32, borderRadius: B.radius,
              background: d.day === 3 ? B.text : B.muted,
              color: d.day === 3 ? B.onPri : B.text2,
              border: `1px solid ${d.day === 3 ? B.text : B.border}`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: B.mono, fontWeight: 600, fontSize: 13, fontVariantNumeric: 'tabular-nums',
            }}>D{d.day}</span>}
            title={d.title}
            meta={<><span style={{ fontFamily: B.mono, fontVariantNumeric: 'tabular-nums' }}>{d.mins}</span> 分钟 · {d.req ? '必修' : '选修'}</>}
            right={<>
              {d.day === 3 && <Badge tone="warn">编辑中</Badge>}
              <BIcon name="chevron-right" size={13} color={B.ter} />
            </>}
          />
        ))}
        <div style={{ padding: '8px 16px 12px' }}>
          <button style={{
            width: '100%', height: 32, borderRadius: B.radius,
            border: `1px solid ${B.border}`, background: B.bg,
            fontSize: 12, color: B.text2, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            whiteSpace: 'nowrap',
          }}>
            <BIcon name="chevron-down" size={12} /> 展开剩余 {CURRICULUM.length - 6} 天
          </button>
        </div>
      </PMSection>

      <PMSection title="发布状态">
        <PMRow
          left={<span style={{ width: 32, height: 32, borderRadius: B.radius, background: '#fffbeb', border: `1px solid #fde68a`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <BIcon name="file-edit" size={14} color={B.warn} />
          </span>}
          title="Day 3 · Espresso Pull · v2.4"
          meta="未发布 · 3 处改动"
          right={<button style={{
            height: 26, padding: '0 10px', borderRadius: B.radius,
            border: 'none', background: B.text, color: B.onPri,
            fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>发布</button>}
        />
      </PMSection>
    </div>
  );
}

// ─── Requests bottom sheet ──────────────────────────────────
function PMRequestsSheet({ open, onClose }) {
  if (!open) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(28,25,23,0.4)',
      display: 'flex', alignItems: 'flex-end', zIndex: 50,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: B.bg, width: '100%', maxHeight: '80%',
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        animation: 'pm-up 220ms ease-out',
      }}>
        <div style={{
          padding: '8px 0 4px', display: 'flex', justifyContent: 'center',
        }}>
          <div style={{ width: 36, height: 4, borderRadius: 999, background: B.borderS }} />
        </div>
        <div style={{
          padding: '6px 16px 14px', display: 'flex', alignItems: 'center',
          borderBottom: `1px solid ${B.border}`,
        }}>
          <BIcon name="inbox" size={16} color={B.text2} />
          <div style={{ marginLeft: 8, fontSize: 16, fontWeight: 600, letterSpacing: -0.3 }}>请求</div>
          <span style={{ marginLeft: 'auto', fontFamily: B.mono, fontSize: 11, color: B.sec }}>
            待处理 · {TIME_OFF_SEED.filter(r => r.status === 'pending').length + TRADES_SEED.filter(t => t.status === 'pending').length}
          </span>
          <button onClick={onClose} style={{
            marginLeft: 8, width: 28, height: 28, borderRadius: B.radius,
            border: 'none', background: 'transparent', cursor: 'pointer',
          }}>
            <BIcon name="x" size={14} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }} className="no-scrollbar">
          <PMSection title="请假">
            {TIME_OFF_SEED.filter(r => r.status === 'pending').map(r => {
              const m = TEAM.find(x => x.id === r.userId);
              return (
                <div key={r.id} style={{
                  borderTop: `1px solid ${B.border}`, padding: '12px 16px', background: B.bg,
                }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Avatar name={m?.name || r.staffName} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.staffName}</div>
                      <div style={{ fontSize: 11, color: B.sec, marginTop: 2 }}>
                        {shortDate(r.startDate)}{r.endDate !== r.startDate ? ` – ${shortDate(r.endDate)}` : ''}
                        {!r.fullDays && r.startTime && ` · ${formatTimeShort(r.startTime)}–${formatTimeShort(r.endTime)}`}
                      </div>
                      {r.comments && <div style={{ fontSize: 11.5, color: B.text2, marginTop: 4, fontStyle: 'italic' }}>"{r.comments}"</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button style={{
                      flex: 1, height: 30, borderRadius: B.radius,
                      border: `1px solid ${B.border}`, background: B.bg,
                      fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      color: B.ok, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}><BIcon name="check" size={12} color={B.ok} /> 批准</button>
                    <button style={{
                      flex: 1, height: 30, borderRadius: B.radius,
                      border: `1px solid ${B.border}`, background: B.bg,
                      fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      color: B.danger, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}><BIcon name="x" size={12} color={B.danger} /> 拒绝</button>
                  </div>
                </div>
              );
            })}
          </PMSection>

          <PMSection title="换班 / 代班">
            {TRADES_SEED.filter(t => t.status === 'pending').map(t => {
              const req = TEAM.find(m => m.id === t.requesterId);
              const tgt = t.targetId ? TEAM.find(m => m.id === t.targetId) : null;
              const sh = SHIFTS_SEED.find(s => s.id === t.shiftId);
              return (
                <div key={t.id} style={{
                  borderTop: `1px solid ${B.border}`, padding: '12px 16px', background: B.bg,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Badge tone={t.type === 'trade' ? 'default' : 'warn'}>{t.type === 'trade' ? '换班' : '代班'}</Badge>
                    {sh && <span style={{ fontFamily: B.mono, fontSize: 11, color: B.sec, fontVariantNumeric: 'tabular-nums' }}>
                      {shortDate(sh.date)} · {formatTimeShort(sh.startTime)}–{formatTimeShort(sh.endTime)}
                    </span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <Avatar name={req.name} size={22} />
                    <span style={{ fontWeight: 500 }}>{req.name.split(' ')[0]}</span>
                    <BIcon name="arrow-right" size={11} color={B.ter} />
                    {tgt ? (<>
                      <Avatar name={tgt.name} size={22} />
                      <span style={{ fontWeight: 500 }}>{tgt.name.split(' ')[0]}</span>
                    </>) : <span style={{ color: B.sec, fontStyle: 'italic', fontSize: 11.5 }}>任意可用人员</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button style={{
                      flex: 1, height: 30, borderRadius: B.radius,
                      border: `1px solid ${B.border}`, background: B.bg,
                      fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      color: B.ok, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}><BIcon name="check" size={12} color={B.ok} /> 接受</button>
                    <button style={{
                      flex: 1, height: 30, borderRadius: B.radius,
                      border: `1px solid ${B.border}`, background: B.bg,
                      fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      color: B.danger, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}><BIcon name="x" size={12} color={B.danger} /> 拒绝</button>
                  </div>
                </div>
              );
            })}
          </PMSection>
        </div>
      </div>
    </div>
  );
}

// ─── Bottom tab bar (Personnel highlighted) ─────────────────
function PMTabBar() {
  const items = [
    { id: 'dashboard', icon: 'layout-dashboard', l: '仪表盘' },
    { id: 'personnel', icon: 'users-round',      l: '人员' },
    { id: 'inventory', icon: 'package',          l: '库存' },
    { id: 'sales',     icon: 'trending-up',      l: '销售' },
    { id: 'settings',  icon: 'settings',         l: '设置' },
  ];
  return (
    <div style={{
      borderTop: `1px solid ${B.border}`, background: B.bg,
      display: 'flex', alignItems: 'stretch',
      padding: '8px 6px 24px', gap: 2,
    }}>
      {items.map(it => {
        const active = it.id === 'personnel';
        return (
          <button key={it.id} style={{
            flex: 1, padding: '6px 0 4px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: active ? B.text : B.ter,
          }}>
            <div style={{
              width: 40, height: 26, borderRadius: 999,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: active ? B.muted : 'transparent',
            }}>
              <BIcon name={it.icon} size={18} strokeWidth={active ? 2 : 1.6} />
            </div>
            <div style={{ fontSize: 10, fontWeight: active ? 600 : 500 }}>{it.l}</div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Root ───────────────────────────────────────────────────
function PersonnelMobile() {
  const [section, setSection] = pmUS(() => {
    try { return localStorage.getItem('bz_pm_section') || 'schedule'; } catch { return 'schedule'; }
  });
  const [sheetOpen, setSheetOpen] = pmUS(false);
  pmUE(() => {
    try { localStorage.setItem('bz_pm_section', section); } catch {}
  }, [section]);

  const pending = TIME_OFF_SEED.filter(r => r.status === 'pending').length
                + TRADES_SEED.filter(t => t.status === 'pending').length;

  return (
    <div style={{
      width: '100%', minHeight: '100vh',
      background: B.surface,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 0', fontFamily: B.font,
    }}>
      <style>{`
        @keyframes pm-up { from { transform: translateY(20%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
      <IOSDevice width={402} height={874}>
        <div style={{ position: 'relative', width: '100%', height: '100%', background: B.bg, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Top bar */}
            <TopBar
              title="人员管理"
              subtitle="Maple Coffee · Oakland"
              right={<>
                <IconBtn icon="search" />
                <div style={{ position: 'relative' }}>
                  <IconBtn icon="inbox" onClick={() => setSheetOpen(true)} />
                  {pending > 0 && (
                    <span style={{
                      position: 'absolute', top: 2, right: 2,
                      minWidth: 14, height: 14, padding: '0 3px', borderRadius: 999,
                      background: B.warn, color: B.onPri,
                      fontFamily: B.mono, fontSize: 9, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontVariantNumeric: 'tabular-nums', border: `1.5px solid ${B.bg}`,
                    }}>{pending}</span>
                  )}
                </div>
              </>}
            />

            <PMSectionPills section={section} onChange={setSection} requestsCount={pending} />

            {/* Body */}
            <div style={{ flex: 1, overflow: 'auto' }} className="no-scrollbar">
              {section === 'schedule' && <PMScheduleView pending={pending} onOpenRequests={() => setSheetOpen(true)} />}
              {section === 'team'     && <PMTeamView />}
              {section === 'roles'    && <PMRolesView />}
              {section === 'training' && <PMTrainingView />}
            </div>

            <PMTabBar />
          </div>

          <PMRequestsSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
        </div>
      </IOSDevice>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PersonnelMobile />);
