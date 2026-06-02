// ═══════════════════════════════════════════════════════════
// BizOps — Mobile auth screens (iOS)
// Login / Register / Forgot / Verify — fits in IOSDevice frame
// ═══════════════════════════════════════════════════════════

const { useState: maUS } = React;

function MAScreen({ children, title }) {
  return (
    <div style={{
      width: '100%', height: '100%', background: '#fff',
      display: 'flex', flexDirection: 'column', fontFamily: A.font,
      overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

function MAHeader({ back = true, right, onBack }) {
  return (
    <div style={{
      height: 44, padding: '0 12px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: `1px solid ${A.border}`,
    }}>
      <div style={{ width: 60 }}>
        {back && (
          <button onClick={onBack} style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            padding: '6px 0', color: A.text2,
            display: 'inline-flex', alignItems: 'center', gap: 2,
            fontSize: 13, fontWeight: 500,
          }}>
            <AIcon name="chevron-left" size={18} />
            <span>Back</span>
          </button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 22, height: 22, borderRadius: A.r,
          background: A.ink, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 10, letterSpacing: -0.3,
        }}>BZ</div>
        <span style={{ fontSize: 13, fontWeight: 600, color: A.text }}>BizOps</span>
      </div>
      <div style={{ width: 60, textAlign: 'right' }}>{right}</div>
    </div>
  );
}

// 1. Mobile Login
function MLogin() {
  const [email, setEmail] = maUS('owner@bluebottle.sh');
  const [pw, setPw] = maUS('•••••••••');
  const [show, setShow] = maUS(false);

  return (
    <MAScreen>
      <MAHeader back={false} right={<span style={{ fontSize: 13, color: A.text, fontWeight: 500 }}>Help</span>} />
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 20px 24px' }}>
        <div style={{
          fontSize: 22, fontWeight: 600, letterSpacing: -0.4,
          color: A.text, lineHeight: 1.15,
        }}>Sign in</div>
        <div style={{ marginTop: 6, fontSize: 13, color: A.text3, lineHeight: 1.5 }}>
          Welcome back. Pick up where the last register left off.
        </div>

        {/* workspace tile */}
        <div style={{
          marginTop: 18,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 11px', border: `1px solid ${A.border}`,
          borderRadius: A.r, background: A.surface,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: A.r,
            background: A.ink, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700,
          }}>BB</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: A.text }}>Blue Bottle · Xintiandi</div>
            <div style={{ fontSize: 11, color: A.sec, fontFamily: A.mono }}>bb-sh-xt.bizops.app</div>
          </div>
          <AIcon name="chevron-down" size={16} color={A.sec} />
        </div>

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <FieldLabel>Email</FieldLabel>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} icon="mail" />
          </div>
          <div>
            <FieldLabel hint={<span style={{ color: A.text, fontWeight: 500 }}>Forgot?</span>}>Password</FieldLabel>
            <Input
              value={pw} onChange={(e) => setPw(e.target.value)}
              type={show ? 'text' : 'password'}
              icon="lock"
              trailing={
                <button onClick={() => setShow(!show)} style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: A.sec, padding: 2, display: 'flex',
                }}>
                  <AIcon name={show ? 'eye-off' : 'eye'} size={14} />
                </button>
              }
            />
          </div>

          <Btn variant="primary" size="lg" full>Sign in <AIcon name="arrow-right" size={14} /></Btn>

          <Divider>or</Divider>

          <Btn variant="outline" size="lg" full icon="monitor">Sign in as store machine</Btn>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 11px',
            border: `1px solid ${A.border}`, borderRadius: A.r, background: A.surface,
            marginTop: 2,
          }}>
            <AIcon name="fingerprint" size={16} color={A.text2} />
            <div style={{ flex: 1, fontSize: 12, color: A.text3 }}>
              Use <span style={{ color: A.text, fontWeight: 500 }}>Face ID</span> next time
            </div>
            <div style={{
              width: 28, height: 16, borderRadius: 999,
              background: A.ink, position: 'relative',
            }}>
              <div style={{
                width: 12, height: 12, borderRadius: 999, background: '#fff',
                position: 'absolute', top: 2, right: 2,
              }} />
            </div>
          </div>
        </div>
      </div>

      <div style={{
        padding: '14px 20px 22px', borderTop: `1px solid ${A.border}`,
        background: A.surface, textAlign: 'center',
      }}>
        <span style={{ fontSize: 12.5, color: A.sec }}>New to BizOps? </span>
        <span style={{ fontSize: 12.5, color: A.text, fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: 3 }}>
          Register a workspace
        </span>
      </div>
    </MAScreen>
  );
}

// 2. Mobile Register
function MRegister() {
  const [name, setName] = maUS('Chen Wei');
  const [email, setEmail] = maUS('');
  const [pw, setPw] = maUS('bizops-2026');
  const pwScore = Math.min(4, Math.floor(pw.length / 3));

  return (
    <MAScreen>
      <MAHeader />
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 24px' }}>
        <div style={{
          fontSize: 22, fontWeight: 600, letterSpacing: -0.4,
          color: A.text, lineHeight: 1.15,
        }}>Create workspace</div>
        <div style={{ marginTop: 6, fontSize: 13, color: A.text3, lineHeight: 1.5 }}>
          Step 1 of 3 · Owner account
        </div>

        {/* Stepper dots */}
        <div style={{ display: 'flex', gap: 4, marginTop: 14 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i === 0 ? A.ink : A.muted,
            }} />
          ))}
        </div>

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <FieldLabel>Full name</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} icon="user" />
          </div>
          <div>
            <FieldLabel>Work email</FieldLabel>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@yourshop.com" icon="mail" />
          </div>
          <div>
            <FieldLabel hint={<span style={{ fontFamily: A.mono, color: pwScore >= 3 ? A.ok : A.warn }}>
              {['short', 'weak', 'fair', 'strong', 'excellent'][pwScore]}
            </span>}>Password</FieldLabel>
            <Input value={pw} onChange={(e) => setPw(e.target.value)} type="password" icon="lock" />
            <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{
                  flex: 1, height: 3, borderRadius: 2,
                  background: i < pwScore ? (pwScore >= 3 ? A.ok : A.warn) : A.muted,
                }} />
              ))}
            </div>
            <ul style={{
              marginTop: 8, padding: 0, listStyle: 'none',
              fontSize: 11, color: A.sec, display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              {[
                ['At least 10 characters', pw.length >= 10],
                ['Mix of letters & numbers', /\d/.test(pw) && /[a-z]/i.test(pw)],
                ['No common words', !/password|bizops/i.test(pw)],
              ].map(([t, ok]) => (
                <li key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AIcon name={ok ? 'check' : 'circle'} size={11} color={ok ? A.ok : A.ter} sw={ok ? 3 : 1.75} />
                  <span style={{ color: ok ? A.text2 : A.sec }}>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <Btn variant="primary" size="lg" full trailing="arrow-right">Continue</Btn>

          <div style={{
            fontSize: 11, color: A.sec, textAlign: 'center', lineHeight: 1.5,
          }}>
            By continuing you agree to the <span style={{ color: A.text2, textDecoration: 'underline', textUnderlineOffset: 2 }}>Terms</span>
            {' '}&amp;{' '}
            <span style={{ color: A.text2, textDecoration: 'underline', textUnderlineOffset: 2 }}>Privacy Policy</span>.
          </div>
        </div>
      </div>
    </MAScreen>
  );
}

// 3. Mobile Forgot
function MForgot() {
  const [method, setMethod] = maUS('email');
  return (
    <MAScreen>
      <MAHeader />
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 24px' }}>
        <div style={{
          width: 40, height: 40, borderRadius: A.r,
          border: `1px solid ${A.border}`, background: A.surface,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 14,
        }}>
          <AIcon name="key-round" size={18} color={A.text2} />
        </div>
        <div style={{
          fontSize: 22, fontWeight: 600, letterSpacing: -0.4,
          color: A.text, lineHeight: 1.15,
        }}>Reset password</div>
        <div style={{ marginTop: 6, fontSize: 13, color: A.text3, lineHeight: 1.5 }}>
          Choose where to send your 6-digit code. It expires in 10 minutes.
        </div>

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['email', 'Email', 'ow***@bluebottle.sh', 'mail'],
            ['sms',   'SMS',   '+86 138 **** 4421', 'smartphone'],
          ].map(([id, label, masked, icon]) => {
            const active = method === id;
            return (
              <button key={id} onClick={() => setMethod(id)} style={{
                textAlign: 'left', cursor: 'pointer',
                padding: '12px', display: 'flex', alignItems: 'center', gap: 12,
                border: `1px solid ${active ? A.ink : A.border}`,
                boxShadow: active ? `0 0 0 3px rgba(168,162,158,0.22)` : 'none',
                borderRadius: A.r, background: active ? A.bg : A.surface,
                transition: 'all 180ms ease',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: A.r,
                  background: active ? A.ink : A.muted,
                  color: active ? '#fff' : A.text2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <AIcon name={icon} size={15} color={active ? '#fff' : A.text2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: A.text }}>{label}</div>
                  <div style={{ fontSize: 11.5, color: A.sec, fontFamily: A.mono, marginTop: 2 }}>{masked}</div>
                </div>
                <div style={{
                  width: 16, height: 16, borderRadius: 999,
                  border: `1px solid ${active ? A.ink : A.borderS}`,
                  background: active ? A.ink : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {active && <div style={{ width: 6, height: 6, borderRadius: 999, background: '#fff' }} />}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 18 }}>
          <Btn variant="primary" size="lg" full icon="send">Send reset code</Btn>
        </div>

        <div style={{
          marginTop: 14, padding: '10px 11px',
          border: `1px solid ${A.border}`, borderRadius: A.r, background: A.surface,
          fontSize: 11.5, color: A.text3, lineHeight: 1.5,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <AIcon name="info" size={13} color={A.sec} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>Can't access either? Ask your workspace owner to resend an invite from
            {' '}<span style={{ fontFamily: A.mono, color: A.text2 }}>Team → Members</span>.</span>
        </div>
      </div>
    </MAScreen>
  );
}

// 4. Mobile Verify
function MVerify() {
  const code = ['4', '2', '9', '1', '', ''];
  const seconds = 87;
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <MAScreen>
      <MAHeader right={<span style={{ fontSize: 13, color: A.text, fontWeight: 500 }}>Help</span>} />
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 0' }}>
        <div style={{
          fontSize: 22, fontWeight: 600, letterSpacing: -0.4,
          color: A.text, lineHeight: 1.15,
        }}>Enter code</div>
        <div style={{ marginTop: 6, fontSize: 13, color: A.text3, lineHeight: 1.5 }}>
          6-digit code sent to <span style={{ fontFamily: A.mono, color: A.text2 }}>ow***@bluebottle.sh</span>
        </div>

        <div style={{ marginTop: 22, display: 'flex', gap: 8 }}>
          {code.map((d, i) => {
            const filled = !!d;
            const active = code.findIndex(c => !c) === i;
            return (
              <div key={i} style={{
                flex: 1, height: 54,
                borderRadius: A.r,
                border: `1px solid ${active ? A.ink : filled ? A.borderS : A.border}`,
                boxShadow: active ? `0 0 0 3px rgba(168,162,158,0.22)` : 'none',
                background: filled ? A.bg : A.surface,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: A.mono,
                fontSize: 22, fontWeight: 500,
                color: filled ? A.text : A.ter,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {d || (active && <span style={{
                  width: 1, height: 20, background: A.text, animation: 'blink 1s steps(2) infinite',
                }} />)}
              </div>
            );
          })}
        </div>

        <div style={{
          marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 11.5,
        }}>
          <span style={{ color: A.sec }}>Expires in <span style={{ fontFamily: A.mono, color: A.text2 }}>{mm}:{ss}</span></span>
          <span style={{ color: A.ter, fontWeight: 500, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <AIcon name="rotate-cw" size={11} />
            <span>Resend</span>
          </span>
        </div>

        <div style={{ marginTop: 18 }}>
          <Btn variant="primary" size="lg" full trailing="arrow-right">Verify &amp; continue</Btn>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{
            fontSize: 10.5, fontWeight: 600, color: A.sec,
            letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
          }}>Other methods</div>
          <div style={{
            border: `1px solid ${A.border}`, borderRadius: A.r,
            background: A.surface, overflow: 'hidden',
          }}>
            {[
              ['Authenticator app', 'key-round'],
              ['SMS to +86 138 **** 4421', 'smartphone'],
              ['Recovery code', 'life-buoy'],
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
        </div>
      </div>
    </MAScreen>
  );
}

Object.assign(window, { MLogin, MRegister, MForgot, MVerify });
