// ═══════════════════════════════════════════════════════════
// BizOps — Mobile post-creation onboarding (iOS)
// Welcome / Features / Invite — fits in IOSDevice frame.
// Reuses A, AIcon, Btn, Input, FieldLabel, Checkbox, Divider.
// ═══════════════════════════════════════════════════════════

const { useState: moUS } = React;

// Header — like MAHeader but tuned for setup
function MOHeader({ step, total, onBack, onSkip }) {
  return (
    <div style={{
      padding: '8px 14px 10px',
      borderBottom: `1px solid ${A.border}`,
      background: '#fff',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 32,
      }}>
        <button onClick={onBack} style={{
          border: 'none', background: 'transparent', cursor: 'pointer',
          padding: 0, color: A.text2, display: 'inline-flex', alignItems: 'center', gap: 2,
          fontSize: 13, fontWeight: 500,
        }}>
          <AIcon name="chevron-left" size={18} />
          <span>Back</span>
        </button>
        <span style={{
          fontSize: 11, fontFamily: A.mono, color: A.sec, letterSpacing: 0.4,
        }}>STEP {step} / {total}</span>
        {onSkip ? (
          <button onClick={onSkip} style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            padding: 0, color: A.text2, fontSize: 13, fontWeight: 500,
          }}>Skip</button>
        ) : <span style={{ width: 36 }} />}
      </div>
      {/* Progress bar */}
      <div style={{
        marginTop: 8, height: 3, borderRadius: 999,
        background: A.muted, overflow: 'hidden',
      }}>
        <div style={{
          width: `${(step / total) * 100}%`, height: '100%',
          background: A.ink, transition: 'width 240ms ease',
        }} />
      </div>
    </div>
  );
}

// ─── 5m. Welcome ─────────────────────────────────────────
function MWelcome() {
  return (
    <div style={{
      width: '100%', height: '100%', background: '#fff',
      display: 'flex', flexDirection: 'column', fontFamily: A.font, overflow: 'hidden',
    }}>
      <MOHeader step={3} total={4} />

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 18px 18px' }}>
        {/* Big check */}
        <div style={{
          width: 56, height: 56, borderRadius: 999,
          background: A.ink, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          <AIcon name="check" size={26} sw={2.5} />
        </div>
        <div style={{
          fontSize: 22, fontWeight: 600, letterSpacing: -0.4, color: A.text, lineHeight: 1.15,
        }}>Workspace ready.</div>
        <div style={{ marginTop: 6, fontSize: 13.5, color: A.text3, lineHeight: 1.5 }}>
          Two short steps left — pick what BizOps should do for you, then bring your team.
        </div>

        <div style={{
          marginTop: 18, padding: '12px 12px',
          border: `1px solid ${A.border}`, borderRadius: A.r, background: A.surface,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: A.r,
            background: A.ink, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, letterSpacing: -0.4, flexShrink: 0,
          }}>BB</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: A.text }}>Blue Bottle · Xintiandi</div>
            <div style={{ fontSize: 11, color: A.sec, fontFamily: A.mono, marginTop: 2 }}>
              bb-sh-xt.bizops.app
            </div>
          </div>
          <span style={{
            fontSize: 10, fontFamily: A.mono, color: A.ok,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: A.ok }} />
            LIVE
          </span>
        </div>

        {/* What's next list */}
        <div style={{
          marginTop: 18, fontSize: 10.5, fontWeight: 600, color: A.text3,
          letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
        }}>What's next</div>
        <div style={{ border: `1px solid ${A.border}`, borderRadius: A.r, overflow: 'hidden' }}>
          {[
            ['sliders-horizontal', 'Pick features', '~ 30 sec'],
            ['user-plus',          'Invite team',   'Skippable'],
            ['rocket',             'Open dashboard','Done'],
          ].map(([ic, t, m], i, a) => (
            <div key={t} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 12px',
              borderBottom: i < a.length - 1 ? `1px solid ${A.border}` : 'none',
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: A.r,
                background: i === 0 ? A.ink : A.muted,
                color: i === 0 ? '#fff' : A.text3,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <AIcon name={ic} size={13} />
              </div>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: A.text }}>{t}</span>
              <span style={{ fontSize: 10.5, fontFamily: A.mono, color: A.sec }}>{m}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        padding: '12px 18px 22px', borderTop: `1px solid ${A.border}`,
        background: '#fff', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <Btn variant="primary" size="lg" full trailing="arrow-right">Start setup</Btn>
        <Btn variant="ghost" size="lg" full>I'll do this later</Btn>
      </div>
    </div>
  );
}

// ─── 6m. Features ────────────────────────────────────────
const M_FEATS = [
  { id: 'pos',         icon: 'monitor',      label: 'Point of Sale',       defaultOn: true,  badge: 'Recommended' },
  { id: 'inventory',   icon: 'package',      label: 'Inventory',           defaultOn: true,  badge: 'Recommended' },
  { id: 'staffing',    icon: 'users',        label: 'Staffing & Schedules', defaultOn: true, badge: 'Recommended' },
  { id: 'sales',       icon: 'trending-up',  label: 'Sales Reporting',     defaultOn: true },
  { id: 'products',    icon: 'shopping-bag', label: 'Products',            defaultOn: true },
  { id: 'sitebuilder', icon: 'layout',       label: 'Online Storefront',   defaultOn: false, badge: 'Beta' },
  { id: 'kds',         icon: 'chef-hat',     label: 'Kitchen Display',     defaultOn: false },
  { id: 'loyalty',     icon: 'heart',        label: 'Loyalty & Marketing', defaultOn: false, badge: 'Add-on', addon: true },
];

function MFeatures() {
  const [enabled, setEnabled] = moUS(() =>
    Object.fromEntries(M_FEATS.map(f => [f.id, f.defaultOn]))
  );
  const [preset, setPreset] = moUS('cafe');

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

  const PRESETS = [
    { id: 'cafe',   icon: 'coffee',       label: 'Café' },
    { id: 'retail', icon: 'shopping-bag', label: 'Retail' },
    { id: 'svc',    icon: 'wrench',       label: 'Service' },
    { id: 'custom', icon: 'sliders-horizontal', label: 'Custom' },
  ];

  const onCount = Object.values(enabled).filter(Boolean).length;

  return (
    <div style={{
      width: '100%', height: '100%', background: '#fff',
      display: 'flex', flexDirection: 'column', fontFamily: A.font, overflow: 'hidden',
    }}>
      <MOHeader step={3} total={4} />

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 18px 18px' }}>
        <div style={{
          fontSize: 20, fontWeight: 600, letterSpacing: -0.4, color: A.text, lineHeight: 1.2,
        }}>Choose features</div>
        <div style={{ marginTop: 6, fontSize: 12.5, color: A.text3, lineHeight: 1.5 }}>
          Turn on what you'll use today. Change any time in Settings.
        </div>

        {/* Preset chips */}
        <div style={{
          display: 'flex', gap: 6, marginTop: 14, overflowX: 'auto', paddingBottom: 4,
          marginLeft: -2, marginRight: -2, paddingLeft: 2, paddingRight: 2,
        }}>
          {PRESETS.map(p => {
            const active = preset === p.id;
            return (
              <button key={p.id} onClick={() => applyPreset(p.id)} style={{
                flex: '0 0 auto',
                padding: '7px 11px',
                border: `1px solid ${active ? A.ink : A.border}`,
                background: active ? A.ink : A.bg,
                color: active ? '#fff' : A.text,
                borderRadius: 999, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 600,
                whiteSpace: 'nowrap',
                fontFamily: A.font,
              }}>
                <AIcon name={p.icon} size={12} color={active ? '#fff' : A.text3} />
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Module list */}
        <div style={{
          marginTop: 14, border: `1px solid ${A.border}`, borderRadius: A.r,
          overflow: 'hidden', background: A.bg,
        }}>
          {M_FEATS.map((f, i) => {
            const on = !!enabled[f.id];
            return (
              <button key={f.id} onClick={() => toggle(f.id)} style={{
                width: '100%', textAlign: 'left',
                border: 'none', background: on ? A.bg : A.surface,
                borderBottom: i < M_FEATS.length - 1 ? `1px solid ${A.border}` : 'none',
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 12px', cursor: 'pointer',
                fontFamily: A.font,
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: A.r,
                  background: on ? A.ink : A.muted,
                  color: on ? '#fff' : A.text3,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
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
                        background: f.addon ? '#fef3c7' : f.badge === 'Beta' ? A.muted : A.text,
                        color: f.addon ? '#92400e' : f.badge === 'Beta' ? A.text3 : '#fff',
                      }}>{f.badge}</span>
                    )}
                  </div>
                </div>
                <div style={{
                  width: 32, height: 18, borderRadius: 999,
                  background: on ? A.ink : A.borderS,
                  position: 'relative', flexShrink: 0,
                  transition: 'background 200ms ease',
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
          marginTop: 12, fontSize: 11, color: A.sec, textAlign: 'center', fontFamily: A.mono,
        }}>
          {onCount} of {M_FEATS.length} enabled
        </div>
      </div>

      <div style={{
        padding: '12px 18px 22px', borderTop: `1px solid ${A.border}`,
        background: '#fff',
      }}>
        <Btn variant="primary" size="lg" full trailing="arrow-right">Continue</Btn>
      </div>
    </div>
  );
}

// ─── 7m. Invite ──────────────────────────────────────────
function MInvite() {
  const [rows, setRows] = moUS([
    { id: 1, email: 'maya@bluebottle.sh',  role: 'Manager' },
    { id: 2, email: 'devon@bluebottle.sh', role: 'Cashier' },
  ]);
  const [openRole, setOpenRole] = moUS(null);
  const [linkCopied, setLinkCopied] = moUS(false);

  const ROLES = ['Owner', 'Manager', 'Cashier', 'Kitchen', 'View'];

  const addRow = () => setRows(r => [...r, { id: Date.now(), email: '', role: 'Cashier' }]);
  const remove = (id) => setRows(r => r.filter(x => x.id !== id));
  const setEmail = (id, v) => setRows(r => r.map(x => x.id === id ? { ...x, email: v } : x));
  const setRole = (id, v) => setRows(r => r.map(x => x.id === id ? { ...x, role: v } : x));

  const filled = rows.filter(r => r.email).length;

  return (
    <div style={{
      width: '100%', height: '100%', background: '#fff',
      display: 'flex', flexDirection: 'column', fontFamily: A.font, overflow: 'hidden',
    }}>
      <MOHeader step={4} total={4} onSkip={() => {}} />

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 18px 18px' }}>
        <div style={{
          fontSize: 20, fontWeight: 600, letterSpacing: -0.4, color: A.text, lineHeight: 1.2,
        }}>Invite teammates</div>
        <div style={{ marginTop: 6, fontSize: 12.5, color: A.text3, lineHeight: 1.5 }}>
          Send invites now, or skip and add people later from <span style={{ fontFamily: A.mono, color: A.text2 }}>Team → Members</span>.
        </div>

        {/* Share link card */}
        <div style={{
          marginTop: 14, padding: 10,
          border: `1px solid ${A.border}`, borderRadius: A.r, background: A.surface,
        }}>
          <div style={{
            fontSize: 10.5, fontWeight: 600, color: A.text3, letterSpacing: 0.8,
            textTransform: 'uppercase', marginBottom: 6,
          }}>Or share link</div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 8px',
            background: A.bg, border: `1px solid ${A.border}`, borderRadius: A.r,
          }}>
            <AIcon name="link-2" size={13} color={A.text2} style={{ flexShrink: 0 }} />
            <span style={{
              flex: 1, minWidth: 0, fontSize: 11.5, color: A.text2, fontFamily: A.mono,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              bizops.app/join/bb-sh-xt?t=k7•••2nQ
            </span>
            <button
              onClick={() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1400); }}
              style={{
                border: 'none', background: A.ink, color: '#fff',
                padding: '5px 9px', borderRadius: A.r, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: A.font,
              }}>
              <AIcon name={linkCopied ? 'check' : 'copy'} size={11} color="#fff" />
              {linkCopied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Email rows */}
        <div style={{
          marginTop: 16, marginBottom: 8,
          fontSize: 10.5, fontWeight: 600, color: A.text3,
          letterSpacing: 0.8, textTransform: 'uppercase',
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <span>Email invites</span>
          <span style={{
            fontSize: 11, fontWeight: 500, color: A.sec, textTransform: 'none', letterSpacing: 0,
          }}>4 free seats</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((row) => (
            <div key={row.id} style={{
              border: `1px solid ${A.border}`, borderRadius: A.r,
              background: A.bg, padding: 8, position: 'relative',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Input
                  value={row.email}
                  onChange={(e) => setEmail(row.id, e.target.value)}
                  placeholder="name@yourshop.com"
                  icon="mail"
                />
                {rows.length > 1 && (
                  <button onClick={() => remove(row.id)} style={{
                    width: 30, height: 30, flexShrink: 0,
                    border: `1px solid ${A.border}`, borderRadius: A.r, background: A.surface,
                    color: A.sec, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <AIcon name="x" size={13} />
                  </button>
                )}
              </div>
              {/* Role chips */}
              <div style={{
                marginTop: 8, display: 'flex', gap: 4, overflowX: 'auto',
                marginLeft: -2, marginRight: -2, paddingLeft: 2, paddingRight: 2,
              }}>
                {ROLES.map(r => {
                  const active = r === row.role;
                  return (
                    <button key={r} onClick={() => setRole(row.id, r)} style={{
                      flex: '0 0 auto',
                      height: 24, padding: '0 9px',
                      border: `1px solid ${active ? A.ink : A.border}`,
                      background: active ? A.ink : A.bg,
                      color: active ? '#fff' : A.text2,
                      borderRadius: 999, cursor: 'pointer',
                      fontSize: 11, fontWeight: 600, fontFamily: A.font,
                      whiteSpace: 'nowrap',
                    }}>{r}</button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <button onClick={addRow} style={{
          marginTop: 10, width: '100%',
          border: `1px dashed ${A.borderS}`, background: A.surface,
          borderRadius: A.r, padding: '10px 12px',
          color: A.text2, fontSize: 12.5, fontWeight: 600, fontFamily: A.font,
          cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <AIcon name="plus" size={13} /> Add another
        </button>

        {/* Bulk import */}
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <Btn variant="outline" size="sm" icon="upload">CSV</Btn>
          <Btn variant="outline" size="sm" icon="contact">Contacts</Btn>
        </div>
      </div>

      <div style={{
        padding: '12px 18px 22px', borderTop: `1px solid ${A.border}`,
        background: '#fff', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <Btn variant="primary" size="lg" full trailing="send">
          Send {filled} invite{filled === 1 ? '' : 's'} & finish
        </Btn>
        <Btn variant="ghost" size="lg" full>Skip — I'll invite later</Btn>
      </div>
    </div>
  );
}

Object.assign(window, { MWelcome, MFeatures, MInvite });
