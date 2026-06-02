// ═══════════════════════════════════════════════════════════
// BizOps Mobile — Settings
// Dense, bordered rows — not iOS grouped blocks. Mono for data.
// ═══════════════════════════════════════════════════════════

function BzSettings() {
  const [darkMode, setDarkMode] = bzUS(false);
  const [lowStock, setLowStock] = bzUS(true);
  const [shiftReminders, setShiftReminders] = bzUS(true);
  const [weeklyReport, setWeeklyReport] = bzUS(false);
  const me = TEAM[0];

  return (
    <div style={{ background: B.bg, color: B.text, fontFamily: B.font, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar
        title="Settings"
        subtitle="Maple Coffee · 3 locations"
        right={<IconBtn icon="search" />}
      />

      <div style={{ flex: 1, overflow: 'auto' }} className="no-scrollbar">
        {/* Signed in user */}
        <div style={{
          padding: '20px 18px', borderBottom: `1px solid ${B.border}`,
          display: 'flex', alignItems: 'center', gap: 14, background: B.surface,
        }}>
          <Avatar name={me.name} size={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: B.text, letterSpacing: -0.2 }}>{me.name}</div>
            <div style={{ fontSize: 12, color: B.sec, marginTop: 3, fontFamily: B.mono }}>{me.email}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <Badge tone="default">{me.roleTitle}</Badge>
              <Badge tone="outline" mono>ID · {me.id}</Badge>
            </div>
          </div>
          <BIcon name="chevron-right" size={15} color={B.ter} />
        </div>

        {/* Workspace */}
        <SGroup title="Workspace">
          <SRow icon="building-2" label="Business profile" meta="Maple Coffee Roasters" />
          <SRow icon="map-pin" label="Locations" trailing={<Badge mono>3</Badge>} />
          <SRow icon="credit-card" label="Billing" meta="Pro · renews May 1" trailing={<Badge tone="ok">Active</Badge>} />
          <SRow icon="receipt" label="Tax & compliance" meta="CA · Resale permit" />
        </SGroup>

        {/* Team */}
        <SGroup title="Team & access">
          <SRow icon="users" label="Members" trailing={<KV n={12} />} />
          <SRow icon="shield" label="Roles & permissions" meta="4 roles · Owner/Manager/Lead/Staff" />
          <SRow icon="clock" label="Schedule rules" meta="Min 8h between shifts" />
          <SRow icon="key-round" label="API & integrations" trailing={<Badge tone="ok">3 healthy</Badge>} />
        </SGroup>

        {/* Notifications */}
        <SGroup title="Notifications">
          <SToggleRow icon="bell-ring" label="Shift reminders" meta="30 min before clock-in" checked={shiftReminders} onChange={setShiftReminders} />
          <SToggleRow icon="package" label="Low stock alerts" meta="When on-hand ≤ reorder point" checked={lowStock} onChange={setLowStock} />
          <SToggleRow icon="mail" label="Weekly summary email" meta="Every Monday 9:00 AM" checked={weeklyReport} onChange={setWeeklyReport} />
        </SGroup>

        {/* Preferences */}
        <SGroup title="Preferences">
          <SToggleRow icon="moon" label="Dark appearance" checked={darkMode} onChange={setDarkMode} />
          <SRow icon="globe" label="Language" meta="English (US)" trailing={<BIcon name="chevron-right" size={14} color={B.ter} />} />
          <SRow icon="calendar" label="Week starts on" meta="Monday" trailing={<BIcon name="chevron-right" size={14} color={B.ter} />} />
          <SRow icon="printer" label="Receipt printer" meta="Star TSP143 · Connected" trailing={<StatusDot color={B.ok} />} />
        </SGroup>

        {/* Data */}
        <SGroup title="Data">
          <SRow icon="download" label="Export data" meta="CSV, JSON" />
          <SRow icon="history" label="Activity log" meta="Last 30 days" />
          <SRow icon="database" label="Storage" trailing={<KV text="2.4 GB" />} />
        </SGroup>

        {/* About */}
        <SGroup title="About">
          <SRow icon="info" label="Version" trailing={<KV text="v2.4.1" />} />
          <SRow icon="file-text" label="Terms" />
          <SRow icon="shield-check" label="Privacy policy" />
          <SRow icon="life-buoy" label="Help & support" />
        </SGroup>

        {/* Sign out — destructive */}
        <div style={{ padding: '20px 18px', borderBottom: `1px solid ${B.border}` }}>
          <button style={{
            width: '100%', height: 44, borderRadius: B.radiusLg,
            background: '#fef2f2', color: B.danger,
            border: `1px solid #fecaca`,
            fontSize: 14, fontWeight: 500, fontFamily: B.font,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            cursor: 'pointer',
          }}>
            <BIcon name="log-out" size={15} /> Sign out
          </button>
        </div>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// ─── Settings primitives ────────────────────────────────
function SGroup({ title, children }) {
  return (
    <div style={{ borderBottom: `1px solid ${B.border}` }}>
      <div style={{ padding: '20px 18px 8px' }}><Label>{title}</Label></div>
      <div>{children}</div>
    </div>
  );
}

function SRow({ icon, label, meta, trailing, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 18px',
      borderTop: `1px solid ${B.border}`,
      background: B.bg, cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: B.radiusLg,
        background: B.muted, border: `1px solid ${B.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: B.text2, flexShrink: 0,
      }}><BIcon name={icon} size={15} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: B.text, letterSpacing: -0.15, lineHeight: 1.3 }}>{label}</div>
        {meta && <div style={{ fontSize: 12, color: B.sec, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {trailing || <BIcon name="chevron-right" size={15} color={B.ter} />}
      </div>
    </div>
  );
}

function SToggleRow({ icon, label, meta, checked, onChange }) {
  return (
    <SRow
      icon={icon}
      label={label}
      meta={meta}
      trailing={<Toggle checked={checked} onChange={() => onChange(!checked)} />}
    />
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button onClick={onChange} style={{
      width: 34, height: 20, borderRadius: 9999,
      background: checked ? B.text : B.muted,
      border: `1px solid ${checked ? B.text : B.borderS}`,
      padding: 0, position: 'relative', cursor: 'pointer',
      transition: 'background 160ms ease, border-color 160ms ease',
      flexShrink: 0,
    }}>
      <span style={{
        position: 'absolute', top: 1, left: checked ? 15 : 1,
        width: 16, height: 16, borderRadius: 9999,
        background: B.bg, boxShadow: '0 0 0 0.5px rgba(0,0,0,0.1)',
        transition: 'left 160ms ease',
      }} />
    </button>
  );
}

function KV({ n, text }) {
  return (
    <span style={{
      fontFamily: B.mono, fontVariantNumeric: 'tabular-nums',
      fontSize: 11.5, color: B.sec, letterSpacing: 0,
    }}>{text ?? n}</span>
  );
}

Object.assign(window, { BzSettings });
