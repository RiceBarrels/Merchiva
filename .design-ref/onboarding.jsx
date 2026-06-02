// ═══════════════════════════════════════════════════════════
// BizOps — Post-creation onboarding screens
// After workspace is created: pick features, invite teammates.
// Reuses A tokens, AIcon, Btn, Input, FieldLabel, Checkbox,
// FormShell, BrandPanel from auth.jsx.
// ═══════════════════════════════════════════════════════════

const { useState: oUS, useMemo: oUM } = React;

// ─── Stepper (4 steps now: account → workspace → features → invite) ──
function OnbStepper({ step }) {
  const steps = ['Account', 'Workspace', 'Features', 'Invite'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 22 }}>
      {steps.map((l, i, arr) => {
        const done = i < step;
        const active = i === step;
        return (
          <React.Fragment key={l}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 18, height: 18, borderRadius: 999,
                background: active || done ? A.ink : A.muted,
                color: active || done ? '#fff' : A.sec,
                fontSize: 10, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: A.mono,
              }}>
                {done ? <AIcon name="check" size={11} color="#fff" sw={3} /> : i + 1}
              </div>
              <span style={{
                fontSize: 11.5, fontWeight: active ? 600 : 500,
                color: active ? A.text : done ? A.text3 : A.sec,
              }}>{l}</span>
            </div>
            {i < arr.length - 1 && (
              <div style={{ flex: 1, height: 1, background: i < step ? A.text3 : A.border, margin: '0 2px' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Catalog of features the owner can toggle on ─────────
const FEATURES = [
  {
    id: 'pos',         icon: 'monitor',      label: 'Point of Sale',
    desc: 'Run registers, take payments, print receipts.',
    badge: 'Recommended', recommended: true, defaultOn: true,
    meta: 'Connects to Stripe Terminal · iPad / Android',
  },
  {
    id: 'inventory',   icon: 'package',      label: 'Inventory',
    desc: 'Track SKUs, stock counts, low-stock alerts, suppliers.',
    badge: 'Recommended', recommended: true, defaultOn: true,
    meta: 'Sync with shipments · barcode scanner',
  },
  {
    id: 'staffing',    icon: 'users',        label: 'Staffing & Schedules',
    desc: 'Shifts, time-off, punch-in / punch-out, payroll export.',
    badge: 'Recommended', recommended: true, defaultOn: true,
    meta: 'Gusto · Deputy · CSV',
  },
  {
    id: 'sales',       icon: 'trending-up',  label: 'Sales Reporting',
    desc: 'Daily / weekly revenue, SKU performance, tax summaries.',
    defaultOn: true,
    meta: 'Daily digest email · CSV exports',
  },
  {
    id: 'products',    icon: 'shopping-bag', label: 'Products Catalog',
    desc: 'Pricing, variants, modifiers, photos, kitchen display.',
    defaultOn: true,
    meta: 'Required for POS',
  },
  {
    id: 'sitebuilder', icon: 'layout',       label: 'Online Storefront',
    desc: 'Public site, menu, online ordering, pickup & delivery.',
    badge: 'Beta', defaultOn: false,
    meta: 'Custom domain support · v2.4 beta',
  },
  {
    id: 'kds',         icon: 'chef-hat',     label: 'Kitchen Display',
    desc: 'Route tickets to bar / kitchen screens, course timing.',
    defaultOn: false,
    meta: 'Restaurants only',
  },
  {
    id: 'loyalty',     icon: 'heart',        label: 'Loyalty & Marketing',
    desc: 'Points, member tiers, SMS / email campaigns.',
    badge: 'Add-on', defaultOn: false, addon: true,
    meta: '¥ 99 / month after 30-day trial',
  },
];

const INITIAL_INVITES = [
  { id: 1, email: 'maya@bluebottle.sh',   role: 'Manager', state: 'ready' },
  { id: 2, email: 'devon@bluebottle.sh',  role: 'Cashier', state: 'ready' },
  { id: 3, email: '',                     role: 'Cashier', state: 'empty' },
];

// ═══════════════════════════════════════════════════════════
// 5. WELCOME — workspace just created
// ═══════════════════════════════════════════════════════════
function WelcomeScreen() {
  return (
    <div style={{ display: 'flex', height: '100%', background: A.bg, fontFamily: A.font }}>
      <BrandPanel screen="welcome" />
      <FormShell
        title={<>Workspace ready,<br/>let's wire it up.</>}
        subtitle={<>Two short steps left — choose what BizOps should do for you, then bring your team in.</>}
        footer={<>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: A.sec }}>
            <AIcon name="check-circle-2" size={13} color={A.ok} />
            <span>Workspace <span style={{ fontFamily: A.mono, color: A.text2 }}>bb-sh-xt.bizops.app</span> is live</span>
          </span>
          <span style={{ fontFamily: A.mono }}>Step 3 / 4</span>
        </>}
      >
        <OnbStepper step={2} />

        {/* Big confirmation tile */}
        <div style={{
          border: `1px solid ${A.border}`, borderRadius: A.rLg,
          background: A.surface, padding: '18px 18px 16px',
          display: 'flex', gap: 14, marginBottom: 18,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: A.r,
            background: A.ink, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, letterSpacing: -0.6, flexShrink: 0,
          }}>BB</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: A.text }}>Blue Bottle · Xintiandi</div>
            <div style={{ fontSize: 11.5, color: A.sec, fontFamily: A.mono, marginTop: 2 }}>
              bb-sh-xt.bizops.app · Café · Shanghai
            </div>
            <div style={{
              marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6,
            }}>
              {[
                ['shield-check', 'SSL provisioned'],
                ['database', 'Storage seeded'],
                ['credit-card', 'Stripe linked'],
                ['mail-check', 'Owner verified'],
              ].map(([ic, l]) => (
                <span key={l} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  height: 22, padding: '0 7px',
                  border: `1px solid ${A.border}`, borderRadius: A.r,
                  background: A.bg, fontSize: 11, color: A.text3, fontWeight: 500,
                }}>
                  <AIcon name={ic} size={12} color={A.ok} />
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14,
        }}>
          {[
            { ic: 'sliders-horizontal', t: 'Pick features',  d: 'Toggle the modules you actually need. Change later in Settings.' },
            { ic: 'user-plus',          t: 'Invite the team', d: 'Send invite emails to managers and cashiers. Skippable.' },
          ].map(c => (
            <div key={c.t} style={{
              border: `1px solid ${A.border}`, borderRadius: A.r,
              padding: 12, background: A.bg,
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: A.r,
                background: A.muted, color: A.text2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 8,
              }}>
                <AIcon name={c.ic} size={14} />
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: A.text }}>{c.t}</div>
              <div style={{ fontSize: 11.5, color: A.text3, lineHeight: 1.45, marginTop: 3 }}>{c.d}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" size="lg" style={{ flex: '0 0 auto' }}>Skip setup</Btn>
          <Btn variant="primary" size="lg" full trailing="arrow-right">Start setup</Btn>
        </div>

        <div style={{
          marginTop: 14, fontSize: 11, color: A.sec, textAlign: 'center',
        }}>
          Estimated time <span style={{ fontFamily: A.mono, color: A.text3 }}>~ 90 seconds</span>
        </div>
      </FormShell>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 6. FEATURES — choose what to enable
// ═══════════════════════════════════════════════════════════
function FeaturesScreen() {
  const [enabled, setEnabled] = oUS(() =>
    Object.fromEntries(FEATURES.map(f => [f.id, f.defaultOn]))
  );
  const [preset, setPreset] = oUS('cafe');

  const PRESETS = [
    { id: 'cafe',   icon: 'coffee',       label: 'Café / Bakery',   desc: 'POS + inventory + staffing + KDS' },
    { id: 'retail', icon: 'shopping-bag', label: 'Retail Shop',     desc: 'POS + inventory + sales + storefront' },
    { id: 'svc',    icon: 'wrench',       label: 'Service & Repair', desc: 'Staffing + sales + loyalty' },
    { id: 'custom', icon: 'sliders-horizontal', label: 'Custom',     desc: 'Pick everything yourself' },
  ];

  function applyPreset(id) {
    setPreset(id);
    if (id === 'cafe')   setEnabled({ pos:1, inventory:1, staffing:1, sales:1, products:1, sitebuilder:0, kds:1, loyalty:0 });
    if (id === 'retail') setEnabled({ pos:1, inventory:1, staffing:1, sales:1, products:1, sitebuilder:1, kds:0, loyalty:0 });
    if (id === 'svc')    setEnabled({ pos:0, inventory:0, staffing:1, sales:1, products:0, sitebuilder:0, kds:0, loyalty:1 });
  }

  function toggle(id) {
    setPreset('custom');
    setEnabled(s => ({ ...s, [id]: !s[id] }));
  }

  const onCount = oUM(() => Object.values(enabled).filter(Boolean).length, [enabled]);

  return (
    <div style={{ display: 'flex', height: '100%', background: A.bg, fontFamily: A.font }}>
      <BrandPanel screen="features" />
      <FormShell
        title="What should BizOps do for you?"
        subtitle="Turn on the modules you'll actually use today. You can flip these on or off any time in Settings → Features."
        footer={<>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span>{onCount} of {FEATURES.length} enabled</span>
            <span style={{ color: A.ter }}>·</span>
            <span style={{ fontFamily: A.mono }}>billed on usage</span>
          </span>
          <span style={{ fontFamily: A.mono }}>Step 3 / 4</span>
        </>}
        width={460}
      >
        <OnbStepper step={2} />

        {/* Presets */}
        <div style={{
          fontSize: 10.5, fontWeight: 600, color: A.text3,
          letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
        }}>Start from a preset</div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 18,
        }}>
          {PRESETS.map(p => {
            const active = preset === p.id;
            return (
              <button key={p.id} onClick={() => applyPreset(p.id)} style={{
                textAlign: 'left', cursor: 'pointer',
                padding: '9px 10px',
                border: `1px solid ${active ? A.ink : A.border}`,
                boxShadow: active ? `0 0 0 3px rgba(168,162,158,0.22)` : 'none',
                borderRadius: A.r,
                background: active ? A.bg : A.surface,
                display: 'flex', flexDirection: 'column', gap: 4,
                transition: 'all 160ms ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <AIcon name={p.icon} size={13} color={active ? A.text : A.text3} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: A.text }}>{p.label}</span>
                </div>
                <span style={{ fontSize: 10.5, color: A.sec, lineHeight: 1.35 }}>{p.desc}</span>
              </button>
            );
          })}
        </div>

        {/* Feature list */}
        <div style={{
          fontSize: 10.5, fontWeight: 600, color: A.text3,
          letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <span>Modules</span>
          <span style={{ fontWeight: 500, color: A.sec, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>
            Tap a row to toggle
          </span>
        </div>

        <div style={{
          border: `1px solid ${A.border}`, borderRadius: A.r,
          background: A.bg, overflow: 'hidden',
        }}>
          {FEATURES.map((f, i) => {
            const on = !!enabled[f.id];
            return (
              <button key={f.id} onClick={() => toggle(f.id)} style={{
                width: '100%', textAlign: 'left',
                border: 'none', background: on ? A.bg : A.surface,
                borderBottom: i < FEATURES.length - 1 ? `1px solid ${A.border}` : 'none',
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '11px 12px', cursor: 'pointer',
                transition: 'background 140ms ease',
                fontFamily: A.font,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: A.r,
                  background: on ? A.ink : A.muted,
                  color: on ? '#fff' : A.text3,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 160ms ease',
                }}>
                  <AIcon name={f.icon} size={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: A.text }}>{f.label}</span>
                    {f.badge && (
                      <span style={{
                        height: 16, padding: '0 5px', borderRadius: 3,
                        fontSize: 9.5, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase',
                        background: f.recommended ? A.text : f.addon ? '#fef3c7' : A.muted,
                        color: f.recommended ? '#fff' : f.addon ? '#92400e' : A.text3,
                        display: 'inline-flex', alignItems: 'center',
                      }}>{f.badge}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: A.text3, marginTop: 2, lineHeight: 1.45 }}>{f.desc}</div>
                  <div style={{
                    fontSize: 10.5, color: A.sec, fontFamily: A.mono, marginTop: 4,
                    letterSpacing: 0.2,
                  }}>{f.meta}</div>
                </div>
                {/* Toggle */}
                <div style={{
                  width: 32, height: 18, borderRadius: 999,
                  background: on ? A.ink : A.borderS,
                  position: 'relative', flexShrink: 0,
                  transition: 'background 200ms ease', marginTop: 4,
                }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: 999, background: '#fff',
                    position: 'absolute', top: 2,
                    left: on ? 16 : 2,
                    transition: 'left 200ms cubic-bezier(0.4,0,0.2,1)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                  }} />
                </div>
              </button>
            );
          })}
        </div>

        <div style={{
          marginTop: 14, padding: '10px 11px',
          border: `1px solid ${A.border}`, borderRadius: A.r,
          background: A.surface, display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <AIcon name="info" size={13} color={A.sec} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: A.text3, lineHeight: 1.5 }}>
            Disabled modules stay hidden from the sidebar but keep their data. Re-enable any time —
            no re-import needed.
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <Btn variant="outline" size="lg" icon="arrow-left">Back</Btn>
          <Btn variant="primary" size="lg" full trailing="arrow-right">
            Continue · {onCount} module{onCount === 1 ? '' : 's'}
          </Btn>
        </div>
      </FormShell>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 7. INVITE — bring teammates in (skippable)
// ═══════════════════════════════════════════════════════════
function InviteScreen() {
  const [rows, setRows] = oUS(INITIAL_INVITES);
  const [linkCopied, setLinkCopied] = oUS(false);
  const [bcc, setBcc] = oUS(true);

  const addRow = () => setRows(r => [...r, { id: Date.now(), email: '', role: 'Cashier', state: 'empty' }]);
  const remove = (id) => setRows(r => r.filter(x => x.id !== id));
  const setEmail = (id, v) => setRows(r => r.map(x => x.id === id ? { ...x, email: v, state: v ? 'ready' : 'empty' } : x));
  const setRole = (id, v) => setRows(r => r.map(x => x.id === id ? { ...x, role: v } : x));

  const filled = rows.filter(r => r.email).length;

  const ROLES = [
    { id: 'Owner',   desc: 'Everything · billing · delete workspace' },
    { id: 'Manager', desc: 'Most things, except billing & destructive ops' },
    { id: 'Cashier', desc: 'POS · clock in/out · own sales' },
    { id: 'Kitchen', desc: 'KDS only · no pricing or inventory edits' },
    { id: 'View',    desc: 'Read-only · reports & schedules' },
  ];

  return (
    <div style={{ display: 'flex', height: '100%', background: A.bg, fontFamily: A.font }}>
      <BrandPanel screen="invite" />
      <FormShell
        title="Bring your team in"
        subtitle={<>Send invites now, or skip and add people later from <span style={{ fontFamily: A.mono, color: A.text2 }}>Team → Members</span>. Invites expire after 7 days.</>}
        footer={<>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: A.sec }}>
            <AIcon name="users" size={13} color={A.sec} />
            <span>{filled} {filled === 1 ? 'invite' : 'invites'} ready · 4 free seats remaining</span>
          </span>
          <span style={{ fontFamily: A.mono }}>Step 4 / 4</span>
        </>}
        width={500}
      >
        <OnbStepper step={3} />

        {/* Invite link (always available, copyable) */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: 8,
          border: `1px solid ${A.border}`, borderRadius: A.r,
          background: A.surface, marginBottom: 16,
        }}>
          <AIcon name="link-2" size={14} color={A.text2} style={{ marginLeft: 4 }} />
          <span style={{
            flex: 1, minWidth: 0,
            fontSize: 12, color: A.text2, fontFamily: A.mono,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            letterSpacing: 0.2,
          }}>
            bizops.app/join/bb-sh-xt?t=k7•••••••••2nQ
          </span>
          <Btn
            variant={linkCopied ? 'ghost' : 'outline'} size="sm"
            icon={linkCopied ? 'check' : 'copy'}
            onClick={() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1400); }}
          >
            {linkCopied ? 'Copied' : 'Copy link'}
          </Btn>
        </div>

        {/* Email rows */}
        <div style={{
          fontSize: 10.5, fontWeight: 600, color: A.text3,
          letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <span>Email invites</span>
          <button onClick={addRow} style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: A.text, fontWeight: 600, fontSize: 11,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: 0, fontFamily: A.font, letterSpacing: 0,
            textTransform: 'none',
          }}>
            <AIcon name="plus" size={12} /> Add another
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {rows.map((row) => (
            <InviteRow
              key={row.id}
              row={row}
              roles={ROLES}
              onEmail={(v) => setEmail(row.id, v)}
              onRole={(v) => setRole(row.id, v)}
              onRemove={() => remove(row.id)}
              canRemove={rows.length > 1}
            />
          ))}
        </div>

        {/* Bulk import + options */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
        }}>
          <Btn variant="outline" size="sm" icon="upload">Import CSV</Btn>
          <Btn variant="outline" size="sm" icon="contact">From contacts</Btn>
          <div style={{ flex: 1 }} />
          <Checkbox checked={bcc} onChange={setBcc} label="BCC owner on each invite" />
        </div>

        {/* Permissions hint */}
        <div style={{
          padding: '10px 12px',
          border: `1px solid ${A.border}`, borderRadius: A.r,
          background: A.surface, marginBottom: 18,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: A.text2,
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
          }}>
            <AIcon name="shield" size={12} color={A.text3} />
            What each role can do
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '90px 1fr', rowGap: 4, columnGap: 12,
            fontSize: 11.5, color: A.text3,
          }}>
            {ROLES.slice(0, 4).map(r => (
              <React.Fragment key={r.id}>
                <span style={{ color: A.text2, fontWeight: 600, fontFamily: A.mono, fontSize: 11 }}>{r.id}</span>
                <span>{r.desc}</span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Action row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between',
        }}>
          <Btn variant="ghost" size="lg">
            <AIcon name="skip-forward" size={13} color={A.text3} />
            <span style={{ marginLeft: 4 }}>Skip for now</span>
          </Btn>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="outline" size="lg" icon="arrow-left">Back</Btn>
            <Btn variant="primary" size="lg" trailing="send">
              Send {filled} invite{filled === 1 ? '' : 's'} & finish
            </Btn>
          </div>
        </div>
      </FormShell>
    </div>
  );
}

function InviteRow({ row, roles, onEmail, onRole, onRemove, canRemove }) {
  const [open, setOpen] = oUS(false);
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 138px 28px', gap: 6, alignItems: 'center',
    }}>
      <Input
        value={row.email}
        onChange={(e) => onEmail(e.target.value)}
        placeholder="name@yourshop.com"
        icon="mail"
      />
      {/* Role select */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            width: '100%', height: 34,
            border: `1px solid ${open ? A.ter : A.border}`,
            boxShadow: open ? `0 0 0 3px rgba(168,162,158,0.22)` : 'none',
            borderRadius: A.r,
            background: A.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 8px 0 10px',
            fontSize: 12.5, color: A.text, fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 160ms ease',
            fontFamily: A.font,
          }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <AIcon name="user-cog" size={12} color={A.sec} />
            {row.role}
          </span>
          <AIcon name={open ? 'chevron-up' : 'chevron-down'} size={13} color={A.sec} />
        </button>
        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0,
            width: 240, background: A.bg, border: `1px solid ${A.border}`, borderRadius: A.r,
            boxShadow: '0 8px 24px rgba(28,25,23,0.08), 0 1px 2px rgba(28,25,23,0.04)',
            zIndex: 30, padding: 4,
          }}>
            {roles.map(r => {
              const active = r.id === row.role;
              return (
                <button key={r.id} onClick={() => { onRole(r.id); setOpen(false); }} style={{
                  width: '100%', textAlign: 'left',
                  padding: '8px 10px', border: 'none',
                  background: active ? A.muted : 'transparent',
                  borderRadius: A.r, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', gap: 2,
                  fontFamily: A.font,
                }}>
                  <span style={{
                    fontSize: 12.5, fontWeight: 600, color: A.text,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {r.id}
                    {active && <AIcon name="check" size={12} color={A.text} sw={2.5} style={{ marginLeft: 'auto' }} />}
                  </span>
                  <span style={{ fontSize: 10.5, color: A.sec, lineHeight: 1.35 }}>{r.desc}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button
        onClick={onRemove}
        disabled={!canRemove}
        style={{
          width: 28, height: 28, border: `1px solid ${A.border}`,
          borderRadius: A.r, background: A.bg, cursor: canRemove ? 'pointer' : 'not-allowed',
          color: A.sec, opacity: canRemove ? 1 : 0.4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        <AIcon name="x" size={13} />
      </button>
    </div>
  );
}

Object.assign(window, { WelcomeScreen, FeaturesScreen, InviteScreen, OnbStepper, FEATURES });
