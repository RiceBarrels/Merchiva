// Mobile Settings — 3 variants. Each renders inside IOSDevice (402×874).
// Deliberately *not* stock iOS grouped-list — more branded, custom UI.

const { useState: msetUS } = React;

// ═══════════════════════════════════════════════════════════
// A — "Card stack" — editorial cards per section, strong hierarchy
// ═══════════════════════════════════════════════════════════
function MobileSettingsA({ __hideTabBar } = {}) {
  const me = TEAM[0];

  const Section = ({ kicker, title, rows, trailing }) => (
    <div style={{ margin: '0 16px 14px', background: M.surface, borderRadius: 20, padding: '18px 18px 6px', border: '0.5px solid rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: M.sec, textTransform: 'uppercase' }}>{kicker}</div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, marginTop: 2 }}>{title}</div>
        </div>
        {trailing}
      </div>
      <div>
        {rows.map((r, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '13px 0',
            borderBottom: i < rows.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
            cursor: 'pointer',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: -0.24 }}>{r.t}</div>
              {r.d && <div style={{ fontSize: 12, color: M.sec, marginTop: 2 }}>{r.d}</div>}
            </div>
            {r.v && <div style={{ fontSize: 13, color: M.sec, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{r.v}</div>}
            {r.pill && (
              <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 9999, background: r.pill.bg, color: r.pill.fg, letterSpacing: 0.2 }}>{r.pill.t}</div>
            )}
            <svg width="7" height="12" viewBox="0 0 7 12"><path d="M1 1l5 5-5 5" stroke={M.ter} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ background: M.bg, minHeight: '100%', paddingBottom: 100, fontFamily: M.font }}>
      {/* Header */}
      <div style={{ paddingTop: 54, paddingBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 20px' }}>
          <div style={{ fontSize: 13, color: M.sec, letterSpacing: -0.08, fontWeight: 500 }}>Workspace</div>
          <MIcon name="search" size={22} color={M.tint} />
        </div>
        <div style={{ padding: '2px 20px 14px', fontSize: 34, fontWeight: 700, letterSpacing: -0.8, lineHeight: '38px' }}>Settings</div>
      </div>

      {/* Business hero */}
      <div style={{ margin: '0 16px 16px', background: M.label, color: '#fff', borderRadius: 22, padding: '20px 20px 18px', position: 'relative', overflow: 'hidden' }}>
        {/* decorative */}
        <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: 9999, background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', bottom: -50, right: 20, width: 100, height: 100, borderRadius: 9999, background: 'rgba(255,255,255,0.03)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: '#f5f5f4', color: '#1c1917', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 20, letterSpacing: -0.4 }}>M</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.3 }}>Maple Coffee Co.</div>
            <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>Oakland · 1 location</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.12)', padding: '5px 9px', borderRadius: 9999, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>PLUS</div>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 16, paddingTop: 14, borderTop: '0.5px solid rgba(255,255,255,0.1)', position: 'relative' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, opacity: 0.55, letterSpacing: 1, fontWeight: 600, textTransform: 'uppercase' }}>Staff</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2, letterSpacing: -0.5 }}>12</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, opacity: 0.55, letterSpacing: 1, fontWeight: 600, textTransform: 'uppercase' }}>Roles</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2, letterSpacing: -0.5 }}>5</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, opacity: 0.55, letterSpacing: 1, fontWeight: 600, textTransform: 'uppercase' }}>Integrations</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2, letterSpacing: -0.5 }}>3</div>
          </div>
        </div>
      </div>

      <Section kicker="Business" title="Company"
        rows={[
          { t: 'Business profile', d: 'Name, contact, timezone', v: 'Maple Coffee Co.' },
          { t: 'Locations', d: 'Storefronts & service areas', v: '1' },
          { t: 'Operating hours', v: 'Tue–Sun' },
          { t: 'Plan & billing', d: 'Next charge Apr 30', pill: { t: 'ACTIVE', bg: 'rgba(52,199,89,0.18)', fg: '#1f7a3a' } },
        ]}
      />

      <Section kicker="People" title="Team & roles"
        rows={[
          { t: 'Team members', v: '12' },
          { t: 'Roles & permissions', d: 'Barista, Shift Lead, Kitchen…', v: '5' },
          { t: 'Payroll sync', d: 'Connected to Gusto', pill: { t: 'SYNCED', bg: 'rgba(0,122,255,0.14)', fg: '#0053b3' } },
        ]}
      />

      <Section kicker="Tools" title="Operations"
        rows={[
          { t: 'POS & payments', d: 'Square', v: 'Square' },
          { t: 'Inventory rules', d: 'Auto-deduct, reorder thresholds' },
          { t: 'Notifications', d: 'Email + Slack + push' },
          { t: 'Integrations', v: '3' },
        ]}
      />

      <Section kicker="Account" title={me.name}
        trailing={<MAvatar name={me.name} size={40} color={me.color} />}
        rows={[
          { t: 'Your profile', d: 'amelia@maplecoffee.co' },
          { t: 'Security', d: 'Password, 2FA', pill: { t: '2FA ON', bg: 'rgba(52,199,89,0.18)', fg: '#1f7a3a' } },
          { t: 'API & webhooks', v: '2 keys' },
        ]}
      />

      <div style={{ margin: '4px 16px 16px' }}>
        <div style={{ background: 'rgba(255,59,48,0.08)', color: M.red, borderRadius: 14, padding: '14px 16px', textAlign: 'center', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
          Sign out
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: M.ter, padding: '6px 0 16px' }}>
        bizops · v4.2.1
      </div>

      {!__hideTabBar && (
      <MTabBar current="more" onTab={()=>{}} items={[
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
// B — "Command surface" — search-first, colorful stat tiles, custom list
// ═══════════════════════════════════════════════════════════
function MobileSettingsB() {
  const me = TEAM[0];

  const quickStats = [
    { l: 'Staff',       v: '12', d: '+1 this week', tone: '#1c1917', kicker: 'PEOPLE' },
    { l: 'Pending',     v: '3',  d: 'Requests',     tone: '#a16207', kicker: 'REVIEW' },
    { l: 'Integrations',v: '3',  d: '2 healthy',    tone: '#0e7490', kicker: 'TOOLS' },
  ];

  const navRows = [
    { group: 'BUSINESS', items: [
      { t: 'Business profile', d: 'Maple Coffee Co. · Oakland', icon: 'building', tone: '#1c1917' },
      { t: 'Operating hours',  d: 'Tue–Sun · 7a–8p',           icon: 'clock',    tone: '#ea580c' },
      { t: 'Locations',        d: '1 active',                   icon: 'mappin',   tone: '#dc2626' },
      { t: 'Plan & billing',   d: 'Business Plus · $89/mo',     icon: 'card',     tone: '#0891b2', badge: { t: 'ACTIVE', tone: 'green' } },
    ]},
    { group: 'TEAM', items: [
      { t: 'Team members',      d: '12 staff · 1 invited',        icon: 'users',    tone: '#7c3aed' },
      { t: 'Roles & permissions', d: '5 roles configured',         icon: 'shield',   tone: '#4f46e5' },
      { t: 'Payroll',           d: 'Synced with Gusto · 2h ago',   icon: 'banknote', tone: '#16a34a' },
    ]},
    { group: 'OPERATIONS', items: [
      { t: 'POS & payments',    d: 'Square · 2 terminals',        icon: 'card',     tone: '#1c1917' },
      { t: 'Inventory rules',   d: 'Auto-deduct on',              icon: 'package',  tone: '#a16207' },
      { t: 'Notifications',     d: 'Email + Slack + push',        icon: 'bell',     tone: '#dc2626', badge: { t: '3 NEW', tone: 'red' } },
      { t: 'Integrations',      d: 'Slack, Gusto, Stripe',        icon: 'plug',     tone: '#4f46e5' },
    ]},
    { group: 'ACCOUNT', items: [
      { t: 'Security',          d: 'Password, 2FA, sessions',      icon: 'lock',     tone: '#1f7a3a' },
      { t: 'API keys',          d: '2 active',                     icon: 'key',      tone: '#6d28d9' },
      { t: 'Developer',         d: 'Webhooks & logs',              icon: 'code',     tone: '#0891b2' },
    ]},
  ];

  const badgeTones = {
    green: { bg: 'rgba(52,199,89,0.15)', fg: '#1f7a3a' },
    red:   { bg: 'rgba(255,59,48,0.15)', fg: '#a01c17' },
    blue:  { bg: 'rgba(0,122,255,0.14)', fg: '#0053b3' },
  };

  return (
    <div style={{ background: M.bg, minHeight: '100%', paddingBottom: 100, fontFamily: M.font }}>
      {/* Header */}
      <div style={{ paddingTop: 54 }}>
        <div style={{ padding: '8px 20px 4px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <MAvatar name={me.name} size={34} color={me.color} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: M.sec, letterSpacing: -0.08 }}>{me.name.split(' ')[0]} · Owner</div>
          </div>
          <div style={{ width: 36, height: 36, borderRadius: 9999, background: M.surface, border: '0.5px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MIcon name="bell" size={17} color={M.tint} />
          </div>
        </div>
        <div style={{ padding: '12px 20px 10px', fontSize: 34, fontWeight: 700, letterSpacing: -0.8, lineHeight: '38px' }}>Settings</div>
        <div style={{ padding: '2px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: M.surface, borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.06)' }}>
            <MIcon name="search" size={17} color={M.sec} />
            <div style={{ fontSize: 15, color: M.sec, letterSpacing: -0.24, flex: 1 }}>Jump to anything…</div>
            <div style={{ padding: '2px 7px', borderRadius: 5, background: M.bg, fontSize: 11, fontWeight: 600, color: M.sec, letterSpacing: 0.2 }}>⌘K</div>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: 'flex', gap: 10, padding: '0 16px 20px', overflow: 'hidden' }}>
        {quickStats.map(s => (
          <div key={s.l} style={{ flex: 1, background: M.surface, borderRadius: 16, padding: '14px 14px 12px', border: '0.5px solid rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: s.tone, textTransform: 'uppercase' }}>{s.kicker}</div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.6, marginTop: 5, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
            <div style={{ fontSize: 11, color: M.sec, marginTop: 4 }}>{s.d}</div>
          </div>
        ))}
      </div>

      {/* Nav rows */}
      {navRows.map(group => (
        <div key={group.group} style={{ marginBottom: 16 }}>
          <div style={{ padding: '0 24px 8px', fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: M.sec }}>{group.group}</div>
          <div style={{ margin: '0 16px', background: M.surface, borderRadius: 16, overflow: 'hidden', border: '0.5px solid rgba(0,0,0,0.05)' }}>
            {group.items.map((it, i, arr) => (
              <div key={it.t} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 14px',
                borderBottom: i < arr.length - 1 ? '0.5px solid rgba(0,0,0,0.05)' : 'none',
                cursor: 'pointer', position: 'relative',
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 11,
                  background: `${it.tone}14`,
                  color: it.tone,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <MIcon name={it.icon} size={18} color={it.tone} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: -0.24 }}>{it.t}</div>
                  <div style={{ fontSize: 12, color: M.sec, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.d}</div>
                </div>
                {it.badge && (
                  <div style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
                    padding: '3px 7px', borderRadius: 9999,
                    background: badgeTones[it.badge.tone].bg,
                    color: badgeTones[it.badge.tone].fg,
                  }}>{it.badge.t}</div>
                )}
                <svg width="6" height="10" viewBox="0 0 6 10"><path d="M1 1l4 4-4 4" stroke={M.ter} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ padding: '8px 16px 20px' }}>
        <div style={{
          background: 'rgba(255,59,48,0.06)',
          border: '0.5px dashed rgba(255,59,48,0.35)',
          color: M.red, borderRadius: 12,
          padding: '12px 16px', textAlign: 'center',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
          Sign out of Maple Coffee Co.
        </div>
      </div>

      <MTabBar current="more" onTab={()=>{}} items={[
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
// C — "Detail view" — Notifications settings, custom toggles + radio
// ═══════════════════════════════════════════════════════════
function MobileSettingsC() {
  const [vals, setVals] = msetUS({
    shift: true,
    autoPublish: true,
    trade: true,
    email: true,
    slack: false,
    lowStock: true,
  });
  const [breakRule, setBreakRule] = msetUS('auto');
  const set = (k) => (v) => setVals(p => ({ ...p, [k]: v }));

  const ToggleRow = ({ title, sub, k }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: -0.24 }}>{title}</div>
        <div style={{ fontSize: 12, color: M.sec, marginTop: 3, lineHeight: 1.4 }}>{sub}</div>
      </div>
      <div style={{ paddingTop: 2 }}>
        <MSwitch on={vals[k]} onChange={set(k)} />
      </div>
    </div>
  );

  const Card = ({ kicker, title, children, footer }) => (
    <div style={{ margin: '0 16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 6px 10px' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: M.sec, textTransform: 'uppercase' }}>{kicker}</div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.4, marginTop: 2 }}>{title}</div>
        </div>
      </div>
      <div style={{ background: M.surface, borderRadius: 16, overflow: 'hidden', border: '0.5px solid rgba(0,0,0,0.05)' }}>
        {children}
      </div>
      {footer && <div style={{ padding: '8px 8px 0', fontSize: 12, color: M.sec, lineHeight: 1.4 }}>{footer}</div>}
    </div>
  );

  return (
    <div style={{ background: M.bg, minHeight: '100%', paddingBottom: 100, fontFamily: M.font }}>
      {/* Nav — custom back pill instead of stock iOS chevron-title */}
      <div style={{ paddingTop: 54 }}>
        <div style={{ padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px 6px 8px', background: M.surface, borderRadius: 9999, border: '0.5px solid rgba(0,0,0,0.06)' }}>
            <svg width="10" height="14" viewBox="0 0 10 14"><path d="M8 1L2 7l6 6" stroke={M.tint} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <div style={{ fontSize: 13, fontWeight: 500, color: M.tint }}>Settings</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: M.tint }}>Done</div>
        </div>
        <div style={{ padding: '10px 20px 4px', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: M.sec, textTransform: 'uppercase' }}>Settings / Notifications</div>
        <div style={{ padding: '2px 20px 16px', fontSize: 30, fontWeight: 700, letterSpacing: -0.6, lineHeight: '34px' }}>What should we ping you about?</div>
      </div>

      <Card kicker="Shift activity" title="Schedule changes" footer="Urgent items always push to mobile, regardless of channel settings.">
        <ToggleRow k="shift" title="When admins publish"
          sub="Push + email when a new schedule goes live." />
        <div style={{ height: 0.5, background: M.sep, marginLeft: 18 }} />
        <ToggleRow k="autoPublish" title="Auto-publish drafts"
          sub="Publish next week's draft automatically each Monday at 9 AM." />
        <div style={{ height: 0.5, background: M.sep, marginLeft: 18 }} />
        <ToggleRow k="trade" title="Trade & cover requests"
          sub="Admins must approve swaps before they're final." />
      </Card>

      <Card kicker="Delivery" title="Where it lands">
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#1c1917', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>@</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Email</div>
            <div style={{ fontSize: 12, color: M.sec, marginTop: 2 }}>amelia@maplecoffee.co</div>
          </div>
          <MSwitch on={vals.email} onChange={set('email')} />
        </div>
        <div style={{ height: 0.5, background: M.sep, marginLeft: 18 }} />
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#4A154B', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
            <MIcon name="msgs" size={16} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Slack</div>
            <div style={{ fontSize: 12, color: M.sec, marginTop: 2 }}>#ops · maple-coffee.slack.com</div>
          </div>
          <MSwitch on={vals.slack} onChange={set('slack')} />
        </div>
      </Card>

      <Card kicker="Break rule" title="How we track breaks">
        {[
          { v: 'auto',   t: 'Auto-deduct 30 min',   d: 'Recommended for hourly staff with shifts over 5 hours' },
          { v: 'manual', t: 'Require clock-out',    d: 'Most accurate for compliance (CA, NY, OR)' },
          { v: 'none',   t: 'No deductions',        d: 'Use for salaried teams' },
        ].map((opt, i, arr) => {
          const selected = opt.v === breakRule;
          return (
            <div key={opt.v} onClick={() => setBreakRule(opt.v)}
              style={{
                padding: '14px 18px', display: 'flex', gap: 14, cursor: 'pointer',
                background: selected ? 'rgba(28,25,23,0.03)' : 'transparent',
                borderBottom: i < arr.length - 1 ? '0.5px solid rgba(0,0,0,0.05)' : 'none',
              }}>
              <div style={{
                width: 22, height: 22, borderRadius: 9999, flexShrink: 0, marginTop: 1,
                border: `2px solid ${selected ? M.tint : '#d6d3d1'}`,
                background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'border-color .15s',
              }}>
                {selected && <div style={{ width: 10, height: 10, borderRadius: 9999, background: M.tint }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: selected ? 600 : 500, letterSpacing: -0.24 }}>{opt.t}</div>
                <div style={{ fontSize: 12, color: M.sec, marginTop: 3, lineHeight: 1.4 }}>{opt.d}</div>
              </div>
            </div>
          );
        })}
      </Card>

      <Card kicker="Quiet hours" title="Don't ping me when">
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: M.sec, marginBottom: 2 }}>From</div>
            <div style={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.4 }}>10:00 PM</div>
          </div>
          <div style={{ color: M.ter, fontSize: 18 }}>→</div>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ fontSize: 13, color: M.sec, marginBottom: 2 }}>To</div>
            <div style={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.4 }}>7:00 AM</div>
          </div>
        </div>
        <div style={{ height: 0.5, background: M.sep, marginLeft: 18 }} />
        <div style={{ padding: '12px 18px', display: 'flex', gap: 6 }}>
          {['M','T','W','T','F','S','S'].map((d, i) => {
            const on = i < 5;
            return (
              <div key={i} style={{
                flex: 1, height: 34, borderRadius: 9999,
                background: on ? M.label : 'transparent',
                color: on ? '#fff' : M.sec,
                border: on ? 'none' : '1px solid #d6d3d1',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600,
              }}>{d}</div>
            );
          })}
        </div>
      </Card>

      <div style={{ padding: '8px 16px 20px' }}>
        <div style={{
          background: M.label, color: '#fff', borderRadius: 14,
          padding: '14px 16px', textAlign: 'center',
          fontSize: 15, fontWeight: 600, cursor: 'pointer',
        }}>
          Save changes
        </div>
      </div>

      <MTabBar current="more" onTab={()=>{}} items={[
        { id: 'home', icon: 'building', label: 'Home' },
        { id: 'staffing', icon: 'calendar', label: 'Staffing' },
        { id: 'sales', icon: 'zap', label: 'Sales' },
        { id: 'chat', icon: 'msgs', label: 'Chat' },
        { id: 'more', icon: 'more', label: 'More' },
      ]} />
    </div>
  );
}

Object.assign(window, { MobileSettingsA, MobileSettingsB, MobileSettingsC });
