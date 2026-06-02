// ═══════════════════════════════════════════════════════════
// BizOps — Auth screens
// Login / Register / Forgot Password / Verification Code
// Desktop layout: split — brand panel (left) + form card (right)
// ═══════════════════════════════════════════════════════════

const { useState: aUS, useRef: aUR, useEffect: aUE } = React;

// ─── Tokens ──────────────────────────────────────────────
const A = {
  bg:       '#ffffff',
  surface:  '#fafaf9',   // stone-50
  muted:    '#f5f5f4',   // stone-100
  border:   '#e7e5e4',   // stone-200
  borderS:  '#d6d3d1',   // stone-300
  ink:      '#1c1917',   // stone-900
  text:     '#1c1917',
  text2:    '#44403c',   // stone-700
  text3:    '#57534e',   // stone-600
  sec:      '#78716c',   // stone-500
  ter:      '#a8a29e',   // stone-400
  danger:   '#dc2626',
  ok:       '#059669',
  warn:     '#d97706',
  font:     "'Inter', ui-sans-serif, system-ui, sans-serif",
  mono:     "'JetBrains Mono', 'Geist Mono', ui-monospace, monospace",
  r:        '0.3rem',
  rLg:      '0.5rem',
};

// ─── Lucide icon ─────────────────────────────────────────
function AIcon({ name, size = 16, color = 'currentColor', sw = 1.75, style }) {
  const ref = aUR(null);
  aUE(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = '';
      const key = name.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('');
      const def = window.lucide.icons[key] || window.lucide.icons.Circle;
      const svg = window.lucide.createElement(def);
      svg.setAttribute('width', size);
      svg.setAttribute('height', size);
      svg.setAttribute('stroke-width', sw);
      svg.setAttribute('stroke', color);
      ref.current.appendChild(svg);
    }
  }, [name, size, sw, color]);
  return <span ref={ref} style={{ display: 'inline-flex', lineHeight: 0, ...style }} aria-hidden />;
}

// ─── Logo mark ───────────────────────────────────────────
function Logo({ size = 28, showText = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: size, height: size, borderRadius: A.r,
        background: A.ink, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: size * 0.42, letterSpacing: -0.5,
        fontFamily: A.font,
      }}>BZ</div>
      {showText && (
        <div style={{ fontSize: 13, fontWeight: 600, color: A.text, letterSpacing: -0.2 }}>
          BizOps
        </div>
      )}
    </div>
  );
}

// ─── Form primitives ─────────────────────────────────────
function FieldLabel({ children, hint, style }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      marginBottom: 6, ...style,
    }}>
      <span style={{
        fontSize: 10.5, fontWeight: 600, color: A.text3,
        letterSpacing: 0.8, textTransform: 'uppercase',
      }}>{children}</span>
      {hint && (
        <span style={{ fontSize: 11, color: A.sec, fontWeight: 500 }}>{hint}</span>
      )}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', icon, trailing, mono, invalid, readOnly, autoComplete }) {
  const [focus, setFocus] = aUS(false);
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      height: 34, borderRadius: A.r,
      background: readOnly ? A.surface : A.bg,
      border: `1px solid ${invalid ? A.danger : focus ? A.ter : A.border}`,
      boxShadow: focus ? `0 0 0 3px ${invalid ? 'rgba(220,38,38,0.12)' : 'rgba(168,162,158,0.22)'}` : 'none',
      transition: 'border-color 160ms ease, box-shadow 160ms ease',
      padding: '0 10px', gap: 8,
    }}>
      {icon && <AIcon name={icon} size={15} color={A.sec} />}
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
        readOnly={readOnly}
        autoComplete={autoComplete}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          flex: 1, minWidth: 0,
          border: 'none', outline: 'none', background: 'transparent',
          fontSize: 13, color: A.text,
          fontFamily: mono ? A.mono : A.font,
          fontVariantNumeric: mono ? 'tabular-nums' : undefined,
          letterSpacing: mono ? 0.3 : 0,
          padding: 0,
        }}
      />
      {trailing}
    </div>
  );
}

function Btn({ children, variant = 'primary', size = 'md', icon, trailing, full, onClick, disabled, loading, style }) {
  const sizes = {
    sm: { h: 28, px: 10, fs: 12 },
    md: { h: 34, px: 12, fs: 13 },
    lg: { h: 38, px: 14, fs: 13 },
  }[size];
  const variants = {
    primary: { bg: A.ink, fg: '#fff', bd: A.ink, hbg: '#2a2724' },
    outline: { bg: A.bg, fg: A.text, bd: A.border, hbg: A.muted },
    ghost:   { bg: 'transparent', fg: A.text2, bd: 'transparent', hbg: A.muted },
    link:    { bg: 'transparent', fg: A.text, bd: 'transparent', hbg: 'transparent' },
  }[variant];
  const [hover, setHover] = aUS(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        height: sizes.h, padding: `0 ${sizes.px}px`,
        borderRadius: A.r,
        background: hover && !disabled ? variants.hbg : variants.bg,
        color: variants.fg,
        border: `1px solid ${variants.bd}`,
        fontFamily: A.font, fontSize: sizes.fs, fontWeight: 500,
        letterSpacing: -0.1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        transition: 'background 160ms ease',
        textDecoration: variant === 'link' ? 'none' : undefined,
        width: full ? '100%' : undefined,
        ...style,
      }}>
      {loading ? <AIcon name="loader-2" size={14} sw={2} style={{ animation: 'spin 0.9s linear infinite' }} /> : icon && <AIcon name={icon} size={14} />}
      {children}
      {trailing && <AIcon name={trailing} size={14} />}
    </button>
  );
}

function Divider({ children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0',
    }}>
      <div style={{ flex: 1, height: 1, background: A.border }} />
      <span style={{
        fontSize: 10, fontWeight: 600, color: A.ter,
        letterSpacing: 1.2, textTransform: 'uppercase',
      }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: A.border }} />
    </div>
  );
}

// ─── Phone input with country-code dropdown ──────────────
const PHONE_COUNTRIES = [
  { code: 'CN', dial: '+86',  flag: '🇨🇳', name: 'China',          mask: '138 0000 0000' },
  { code: 'HK', dial: '+852', flag: '🇭🇰', name: 'Hong Kong',      mask: '6000 0000' },
  { code: 'TW', dial: '+886', flag: '🇹🇼', name: 'Taiwan',         mask: '900 000 000' },
  { code: 'US', dial: '+1',   flag: '🇺🇸', name: 'United States',  mask: '(415) 000-0000' },
  { code: 'GB', dial: '+44',  flag: '🇬🇧', name: 'United Kingdom', mask: '7000 000000' },
  { code: 'JP', dial: '+81',  flag: '🇯🇵', name: 'Japan',          mask: '90 0000 0000' },
  { code: 'KR', dial: '+82',  flag: '🇰🇷', name: 'South Korea',    mask: '10 0000 0000' },
  { code: 'SG', dial: '+65',  flag: '🇸🇬', name: 'Singapore',      mask: '8000 0000' },
  { code: 'AU', dial: '+61',  flag: '🇦🇺', name: 'Australia',      mask: '400 000 000' },
  { code: 'DE', dial: '+49',  flag: '🇩🇪', name: 'Germany',        mask: '151 00000000' },
];

function PhoneInput() {
  const [open, setOpen] = aUS(false);
  const [country, setCountry] = aUS(PHONE_COUNTRIES[0]);
  const [value, setValue] = aUS('');
  const [focus, setFocus] = aUS(false);
  const [q, setQ] = aUS('');
  const ref = aUR(null);
  aUE(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const filtered = PHONE_COUNTRIES.filter(c =>
    !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.dial.includes(q) || c.code.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'stretch',
        height: 34, borderRadius: A.r,
        background: A.bg,
        border: `1px solid ${focus || open ? A.ter : A.border}`,
        boxShadow: focus || open ? `0 0 0 3px rgba(168,162,158,0.22)` : 'none',
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
        overflow: 'hidden',
      }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '0 8px 0 10px',
            border: 'none', borderRight: `1px solid ${A.border}`,
            background: open ? A.muted : A.surface,
            cursor: 'pointer', color: A.text,
            fontSize: 13, fontFamily: A.font, fontWeight: 500,
            transition: 'background 140ms ease',
          }}>
          <span style={{ fontSize: 14, lineHeight: 1 }}>{country.flag}</span>
          <span style={{
            fontFamily: A.mono, fontSize: 12.5,
            fontVariantNumeric: 'tabular-nums', color: A.text,
          }}>{country.dial}</span>
          <AIcon name={open ? 'chevron-up' : 'chevron-down'} size={13} color={A.sec} />
        </button>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          placeholder={country.mask}
          inputMode="tel"
          style={{
            flex: 1, minWidth: 0,
            border: 'none', outline: 'none', background: 'transparent',
            padding: '0 10px',
            fontSize: 13, color: A.text,
            fontFamily: A.mono, fontVariantNumeric: 'tabular-nums',
            letterSpacing: 0.3,
          }}
        />
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0,
          width: 280, maxHeight: 280,
          background: A.bg, border: `1px solid ${A.border}`,
          borderRadius: A.r,
          boxShadow: '0 8px 24px rgba(28,25,23,0.08), 0 1px 2px rgba(28,25,23,0.04)',
          zIndex: 50, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: 8, borderBottom: `1px solid ${A.border}`,
            display: 'flex', alignItems: 'center', gap: 6,
            background: A.surface,
          }}>
            <AIcon name="search" size={13} color={A.sec} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search country or code"
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: 12.5, color: A.text, fontFamily: A.font, padding: 0,
              }}
            />
            {q && (
              <button onClick={() => setQ('')} style={{
                border: 'none', background: 'transparent', cursor: 'pointer',
                padding: 2, display: 'flex', color: A.sec,
              }}><AIcon name="x" size={12} /></button>
            )}
          </div>
          <div style={{ overflowY: 'auto', flex: 1, padding: 4 }}>
            {filtered.length === 0 && (
              <div style={{ padding: '12px', fontSize: 12, color: A.sec, textAlign: 'center' }}>No matches</div>
            )}
            {filtered.map(c => {
              const active = c.code === country.code;
              return (
                <button
                  key={c.code}
                  onClick={() => { setCountry(c); setOpen(false); setQ(''); }}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 8px', border: 'none', borderRadius: 3,
                    background: active ? A.muted : 'transparent',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background 120ms ease',
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = A.surface; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 15, lineHeight: 1 }}>{c.flag}</span>
                  <span style={{ fontSize: 12.5, color: A.text, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <span style={{
                    fontFamily: A.mono, fontSize: 11.5,
                    color: A.sec, fontVariantNumeric: 'tabular-nums',
                    minWidth: 36, textAlign: 'right',
                  }}>{c.dial}</span>
                  {active && <AIcon name="check" size={12} color={A.ink} sw={2.5} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Checkbox({ checked, onChange, label }) {
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      cursor: 'pointer', userSelect: 'none',
    }}>
      <span style={{
        width: 14, height: 14, borderRadius: 2,
        border: `1px solid ${checked ? A.ink : A.borderS}`,
        background: checked ? A.ink : A.bg,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 160ms ease',
      }}>
        {checked && <AIcon name="check" size={10} color="#fff" sw={3} />}
      </span>
      <span style={{ fontSize: 12.5, color: A.text2, fontWeight: 500 }}>{label}</span>
    </label>
  );
}

// ─── Brand panel (left side) ─────────────────────────────
function BrandPanel({ screen }) {
  // Show a small product-preview mock: a table with bizops-style data.
  // Different screens highlight different tiles for variety.
  return (
    <div style={{
      flex: 1, minWidth: 0, height: '100%',
      background: A.surface,
      borderRight: `1px solid ${A.border}`,
      display: 'flex', flexDirection: 'column',
      padding: '28px 32px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Top row: logo + env tag */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Logo size={28} />
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 22, padding: '0 8px',
          border: `1px solid ${A.border}`, borderRadius: A.r,
          background: A.bg,
          fontSize: 10.5, fontFamily: A.mono, color: A.text2,
          letterSpacing: 0.4,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: A.ok }} />
          v2.4.1 · ONLINE
        </div>
      </div>

      {/* Mid: dense tagline */}
      <div style={{ marginTop: 44, maxWidth: 360 }}>
        <div style={{
          fontSize: 10.5, fontWeight: 600, color: A.text3,
          letterSpacing: 1, textTransform: 'uppercase',
        }}>Small Business · Daily Ops</div>
        <div style={{
          marginTop: 10, fontSize: 26, lineHeight: 1.15,
          fontWeight: 600, letterSpacing: -0.5, color: A.text,
        }}>
          Run the shop, not<br/>the spreadsheet.
        </div>
        <div style={{
          marginTop: 10, fontSize: 13, lineHeight: 1.55, color: A.text3,
        }}>
          POS, inventory, staffing, and sales — one workspace, one login, every register.
        </div>
      </div>

      {/* Preview mock: inventory table snippet */}
      <div style={{
        marginTop: 32,
        border: `1px solid ${A.border}`,
        borderRadius: A.rLg,
        background: A.bg,
        overflow: 'hidden',
        maxWidth: 440,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: `1px solid ${A.border}`,
          background: A.bg,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AIcon name="package" size={14} color={A.text2} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: A.text }}>Inventory</span>
            <span style={{
              fontSize: 10, fontFamily: A.mono, color: A.sec,
              background: A.muted, padding: '2px 5px', borderRadius: 3,
            }}>24 SKU</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: 999, background: A.ter }} />
            <div style={{ width: 6, height: 6, borderRadius: 999, background: A.ter }} />
            <div style={{ width: 6, height: 6, borderRadius: 999, background: A.ter }} />
          </div>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 88px 58px',
          fontSize: 10, fontWeight: 600,
          color: A.sec, letterSpacing: 0.6, textTransform: 'uppercase',
          padding: '7px 12px',
          borderBottom: `1px solid ${A.border}`,
          background: A.surface,
        }}>
          <span>Item</span>
          <span style={{ textAlign: 'right' }}>Price</span>
          <span style={{ textAlign: 'right' }}>Qty</span>
        </div>
        {[
          ['Oat Milk 1L',      '¥ 42.00',  '128', false],
          ['House Espresso',   '¥ 38.00',  '64',  false],
          ['Croissant, plain', '¥ 24.00',  '9',   true],
          ['Cold Brew Bottle', '¥ 52.00',  '42',  false],
        ].map(([n, p, q, low], i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 88px 58px',
            padding: '9px 12px',
            borderBottom: i < 3 ? `1px solid ${A.border}` : 'none',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 12.5, color: A.text, fontWeight: 500 }}>{n}</span>
            <span style={{
              fontSize: 12, fontFamily: A.mono,
              fontVariantNumeric: 'tabular-nums',
              color: A.text2, textAlign: 'right',
            }}>{p}</span>
            <span style={{
              fontSize: 12, fontFamily: A.mono,
              fontVariantNumeric: 'tabular-nums',
              textAlign: 'right',
              color: low ? A.warn : A.text2, fontWeight: low ? 600 : 400,
            }}>{q}</span>
          </div>
        ))}
      </div>

      {/* Footer meta */}
      <div style={{
        marginTop: 'auto', paddingTop: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 11, color: A.sec, fontFamily: A.mono,
      }}>
        <span>© 2026 BizOps</span>
        <span style={{ display: 'flex', gap: 14 }}>
          <span style={{ cursor: 'pointer' }}>Privacy</span>
          <span style={{ cursor: 'pointer' }}>Terms</span>
          <span style={{ cursor: 'pointer' }}>Status</span>
        </span>
      </div>
    </div>
  );
}

// ─── Form shell (right side) ─────────────────────────────
function FormShell({ title, subtitle, children, footer, width = 380 }) {
  return (
    <div style={{
      width: 480, flexShrink: 0, height: '100%',
      background: A.bg,
      display: 'flex', flexDirection: 'column',
      padding: '28px 40px',
      position: 'relative',
    }}>
      {/* Top-right auxiliary link */}
      <div style={{
        position: 'absolute', top: 28, right: 40,
        fontSize: 12, color: A.sec, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span>Need help?</span>
        <Btn variant="outline" size="sm" icon="life-buoy">Support</Btn>
      </div>

      {/* Centered column */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
      }}>
        <div style={{ width, maxWidth: '100%' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 22, fontWeight: 600, color: A.text,
              letterSpacing: -0.4, lineHeight: 1.15,
            }}>{title}</div>
            {subtitle && (
              <div style={{
                marginTop: 6, fontSize: 13, color: A.text3, lineHeight: 1.5,
              }}>{subtitle}</div>
            )}
          </div>

          {children}
        </div>
      </div>

      {/* Footer */}
      {footer && (
        <div style={{
          paddingTop: 16, borderTop: `1px solid ${A.border}`,
          fontSize: 12, color: A.sec,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {footer}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 1. LOGIN
// ═══════════════════════════════════════════════════════════
function LoginScreen() {
  const [email, setEmail] = aUS('owner@bluebottle.sh');
  const [pw, setPw] = aUS('••••••••••');
  const [remember, setRemember] = aUS(true);
  const [showPw, setShowPw] = aUS(false);

  return (
    <div style={{ display: 'flex', height: '100%', background: A.bg, fontFamily: A.font }}>
      <BrandPanel screen="login" />
      <FormShell
        title="Sign in to BizOps"
        subtitle="Use the email your owner registered with this workspace."
        footer={<>
          <span>No account? <span style={{ color: A.text, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>Register a workspace</span></span>
          <span style={{ fontFamily: A.mono }}>EN · 中文</span>
        </>}
      >
        {/* workspace tile */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 11px', border: `1px solid ${A.border}`,
          borderRadius: A.r, background: A.surface, marginBottom: 16,
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: A.r,
            background: A.ink, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700,
          }}>BB</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: A.text }}>Blue Bottle · Shanghai Xintiandi</div>
            <div style={{ fontSize: 11, color: A.sec, fontFamily: A.mono }}>workspace-bb-sh-xt</div>
          </div>
          <Btn variant="ghost" size="sm" icon="refresh-cw">Switch</Btn>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <FieldLabel>Email</FieldLabel>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} icon="mail" autoComplete="email" />
          </div>
          <div>
            <FieldLabel hint={<span style={{ color: A.text, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>Forgot?</span>}>Password</FieldLabel>
            <Input
              value={pw}
              type={showPw ? 'text' : 'password'}
              onChange={(e) => setPw(e.target.value)}
              icon="lock"
              autoComplete="current-password"
              trailing={
                <button onClick={() => setShowPw(!showPw)} style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: A.sec, padding: 2, display: 'flex',
                }}>
                  <AIcon name={showPw ? 'eye-off' : 'eye'} size={14} />
                </button>
              }
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
            <Checkbox checked={remember} onChange={setRemember} label="Keep me signed in for 30 days" />
          </div>

          <Btn variant="primary" size="lg" full>Sign in <AIcon name="arrow-right" size={14} /></Btn>
        </div>

        <div style={{ marginTop: 20 }}><Divider>or continue with</Divider></div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
          <Btn variant="outline" icon="building-2">SSO</Btn>
          <Btn variant="outline" icon="smartphone">Store machine</Btn>
        </div>

        <div style={{
          marginTop: 16, padding: '8px 10px',
          border: `1px solid ${A.border}`, borderRadius: A.r,
          background: A.surface,
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 11.5, color: A.text3,
        }}>
          <AIcon name="shield-check" size={14} color={A.sec} />
          <span>Secured with two-factor auth · last sign-in
            <span style={{ fontFamily: A.mono, color: A.text2, marginLeft: 4 }}>Apr 21, 09:12 · 上海</span>
          </span>
        </div>
      </FormShell>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 2. REGISTER
// ═══════════════════════════════════════════════════════════
function RegisterScreen() {
  const [step] = aUS(1);
  const [name, setName] = aUS('');
  const [email, setEmail] = aUS('');
  const [pw, setPw] = aUS('');
  const [workspace, setWorkspace] = aUS('blue-bottle-sh');
  const [agree, setAgree] = aUS(false);

  const pwScore = Math.min(4, Math.floor(pw.length / 3));
  const pwMeter = ['Too short', 'Weak', 'Fair', 'Strong', 'Excellent'][pwScore];

  return (
    <div style={{ display: 'flex', height: '100%', background: A.bg, fontFamily: A.font }}>
      <BrandPanel screen="register" />
      <FormShell
        title="Create your workspace"
        subtitle="One owner, one workspace — add staff and registers after."
        footer={<>
          <span>Already have an account? <span style={{ color: A.text, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>Sign in</span></span>
          <span style={{ fontFamily: A.mono }}>Step 1 / 3</span>
        </>}
      >
        {/* Stepper */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18,
        }}>
          {[
            ['Account', true, true],
            ['Workspace', false, false],
            ['Invite staff', false, false],
          ].map(([l, active, done], i, arr) => (
            <React.Fragment key={l}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 999,
                  background: active ? A.ink : A.muted,
                  color: active ? '#fff' : A.sec,
                  fontSize: 10, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: A.mono,
                }}>{i + 1}</div>
                <span style={{
                  fontSize: 11.5, fontWeight: active ? 600 : 500,
                  color: active ? A.text : A.sec,
                }}>{l}</span>
              </div>
              {i < arr.length - 1 && (
                <div style={{ flex: 1, height: 1, background: A.border, margin: '0 2px' }} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <FieldLabel>Full name</FieldLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Chen Wei" icon="user" />
            </div>
            <div>
              <FieldLabel>Phone</FieldLabel>
              <PhoneInput />
            </div>
          </div>

          <div>
            <FieldLabel>Work email</FieldLabel>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@yourshop.com" icon="mail" />
          </div>

          <div>
            <FieldLabel hint={<span style={{ fontFamily: A.mono, color: pwScore >= 3 ? A.ok : pwScore >= 2 ? A.warn : A.sec }}>{pw.length ? pwMeter : '—'}</span>}>Password</FieldLabel>
            <Input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="At least 10 characters" icon="lock" />
            {/* strength bar */}
            <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{
                  flex: 1, height: 3, borderRadius: 2,
                  background: i < pwScore ? (pwScore >= 3 ? A.ok : pwScore >= 2 ? A.warn : A.ter) : A.muted,
                  transition: 'background 220ms ease',
                }} />
              ))}
            </div>
          </div>

          <div>
            <FieldLabel hint={<span style={{ fontFamily: A.mono, color: A.sec }}>.bizops.app</span>}>Workspace URL</FieldLabel>
            <div style={{ display: 'flex', gap: 6 }}>
              <Input value={workspace} onChange={(e) => setWorkspace(e.target.value)} icon="store" mono />
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: A.sec, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AIcon name="check-circle-2" size={12} color={A.ok} />
              <span style={{ fontFamily: A.mono }}>{workspace}.bizops.app</span>
              <span>is available</span>
            </div>
          </div>

          <div style={{ marginTop: 4 }}>
            <Checkbox
              checked={agree}
              onChange={setAgree}
              label={<>I agree to the <u style={{ textUnderlineOffset: 2 }}>Terms</u> and <u style={{ textUnderlineOffset: 2 }}>Privacy Policy</u>.</>}
            />
          </div>

          <Btn variant="primary" size="lg" full trailing="arrow-right">Continue</Btn>
        </div>
      </FormShell>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 3. FORGOT PASSWORD
// ═══════════════════════════════════════════════════════════
function ForgotScreen() {
  const [email, setEmail] = aUS('owner@bluebottle.sh');
  const [method, setMethod] = aUS('email');

  return (
    <div style={{ display: 'flex', height: '100%', background: A.bg, fontFamily: A.font }}>
      <BrandPanel screen="forgot" />
      <FormShell
        title="Reset your password"
        subtitle="We'll send a 6-digit code to your registered address. It expires in 10 minutes."
        footer={<>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: A.text }}>
            <AIcon name="arrow-left" size={13} color={A.text} />
            <span style={{ fontWeight: 500 }}>Back to sign in</span>
          </span>
          <span style={{ fontFamily: A.mono }}>Step 1 / 3</span>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <FieldLabel>Delivery method</FieldLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                ['email', 'Email', 'mail', 'ow***@bluebottle.sh'],
                ['sms', 'SMS', 'smartphone', '+86 138 **** 4421'],
              ].map(([id, label, icon, masked]) => {
                const active = method === id;
                return (
                  <button key={id} onClick={() => setMethod(id)} style={{
                    textAlign: 'left', cursor: 'pointer',
                    padding: '10px 11px',
                    border: `1px solid ${active ? A.ink : A.border}`,
                    boxShadow: active ? `0 0 0 3px rgba(168,162,158,0.22)` : 'none',
                    borderRadius: A.r,
                    background: active ? A.bg : A.surface,
                    display: 'flex', flexDirection: 'column', gap: 4,
                    transition: 'all 180ms ease',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AIcon name={icon} size={14} color={A.text2} />
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: A.text }}>{label}</span>
                      {active && <AIcon name="check-circle-2" size={12} color={A.ink} style={{ marginLeft: 'auto' }} />}
                    </div>
                    <span style={{ fontSize: 11, color: A.sec, fontFamily: A.mono }}>{masked}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <FieldLabel>{method === 'email' ? 'Email address' : 'Phone number'}</FieldLabel>
            <Input
              value={method === 'email' ? email : '+86 138 0000 4421'}
              onChange={(e) => setEmail(e.target.value)}
              icon={method === 'email' ? 'mail' : 'phone'}
              mono={method === 'sms'}
            />
          </div>

          <Btn variant="primary" size="lg" full icon="send">Send reset code</Btn>

          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '10px 11px', borderRadius: A.r,
            border: `1px solid ${A.border}`, background: A.surface,
          }}>
            <AIcon name="info" size={14} color={A.sec} style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 11.5, color: A.text3, lineHeight: 1.55 }}>
              If you don't receive a code in 2 minutes, check spam or try SMS. Still stuck?
              Contact your workspace owner at
              <span style={{ fontFamily: A.mono, color: A.text2 }}> owner@bluebottle.sh</span>.
            </div>
          </div>
        </div>
      </FormShell>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 4. VERIFICATION CODE
// ═══════════════════════════════════════════════════════════
function VerifyScreen() {
  const [code, setCode] = aUS(['4', '2', '9', '1', '', '']);
  const [seconds, setSeconds] = aUS(87);

  const mm = String(Math.floor(seconds / 60)).padStart(1, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div style={{ display: 'flex', height: '100%', background: A.bg, fontFamily: A.font }}>
      <BrandPanel screen="verify" />
      <FormShell
        title="Enter verification code"
        subtitle={<>We sent a 6-digit code to <span style={{ fontFamily: A.mono, color: A.text2 }}>ow***@bluebottle.sh</span>.</>}
        footer={<>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: A.text }}>
            <AIcon name="arrow-left" size={13} color={A.text} />
            <span style={{ fontWeight: 500 }}>Use a different method</span>
          </span>
          <span style={{ fontFamily: A.mono }}>Step 2 / 3</span>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <FieldLabel hint={<span style={{ fontFamily: A.mono, color: seconds < 20 ? A.danger : A.sec }}>expires in {mm}:{ss}</span>}>Code</FieldLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              {code.map((d, i) => {
                const filled = !!d;
                const active = code.findIndex(c => !c) === i;
                return (
                  <div key={i} style={{
                    flex: 1, height: 56,
                    borderRadius: A.r,
                    border: `1px solid ${active ? A.ink : filled ? A.borderS : A.border}`,
                    boxShadow: active ? `0 0 0 3px rgba(168,162,158,0.22)` : 'none',
                    background: filled ? A.bg : A.surface,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: A.mono,
                    fontSize: 24, fontWeight: 500,
                    color: filled ? A.text : A.ter,
                    fontVariantNumeric: 'tabular-nums',
                    position: 'relative',
                    transition: 'all 180ms ease',
                  }}>
                    {d || (active && <span style={{
                      width: 1, height: 22, background: A.text, animation: 'blink 1s steps(2) infinite',
                    }} />)}
                  </div>
                );
              })}
            </div>
            <div style={{
              marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: 11.5,
            }}>
              <span style={{ color: A.sec }}>Didn't get a code?</span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                color: A.text, fontWeight: 500, cursor: 'pointer',
              }}>
                <AIcon name="rotate-cw" size={12} />
                <span>Resend in <span style={{ fontFamily: A.mono }}>{mm}:{ss}</span></span>
              </span>
            </div>
          </div>

          <Btn variant="primary" size="lg" full trailing="arrow-right">Verify & continue</Btn>

          {/* Alt options */}
          <div style={{
            border: `1px solid ${A.border}`, borderRadius: A.r,
            background: A.surface, overflow: 'hidden',
          }}>
            {[
              ['Use authenticator app', 'key-round'],
              ['Send code via SMS instead', 'smartphone'],
              ['Use recovery backup code', 'life-buoy'],
            ].map(([l, ic], i, arr) => (
              <div key={l} style={{
                padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
                cursor: 'pointer',
                borderBottom: i < arr.length - 1 ? `1px solid ${A.border}` : 'none',
                fontSize: 12.5, color: A.text2,
              }}>
                <AIcon name={ic} size={14} color={A.sec} />
                <span style={{ flex: 1 }}>{l}</span>
                <AIcon name="chevron-right" size={14} color={A.ter} />
              </div>
            ))}
          </div>

          <div style={{
            fontSize: 11, color: A.sec,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <AIcon name="shield" size={12} color={A.sec} />
            <span>We'll ask again if we see a new device or location.</span>
          </div>
        </div>
      </FormShell>
    </div>
  );
}

Object.assign(window, {
  LoginScreen, RegisterScreen, ForgotScreen, VerifyScreen,
  A, AIcon, Logo, Input, Btn, FieldLabel, Divider, Checkbox, PhoneInput, BrandPanel, FormShell,
});
