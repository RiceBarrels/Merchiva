// Site Builder — Screens 6 (inline canvas), 7 (publish), 8 (empty state), 9 (domain)

// ═══════════════ Screen 6 · Inline canvas editor ═══════════════
function S6_Basic() {
  return (
    <Phone bg={SB.surface}>
      <SBTop title="Edit · Home" sub="Tap any element" back right={<><SBIcon icon="undo"/><SBIcon icon="check"/></>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <div style={{ background: SB.bg, borderRadius: 8, border: `1px solid ${SB.border}`, overflow: 'hidden' }}>
          {/* Mini browser chrome */}
          <div style={{ height: 22, background: SB.muted, borderBottom: `1px solid ${SB.border}`, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: SB.borderS }}/>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: SB.borderS }}/>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: SB.borderS }}/>
            <div style={{ flex: 1, marginLeft: 8, fontSize: 9.5, color: SB.sec, fontFamily: SB.mono }}>maple-coffee.shop</div>
          </div>
          {/* Page content with tap targets */}
          <div style={{ padding: '20px 16px 16px', position: 'relative' }}>
            <div style={{ position: 'relative', padding: 4, border: `1.5px solid ${SB.text}`, borderRadius: 4, background: SB.bg }}>
              <div style={{ position: 'absolute', top: -10, left: -1, padding: '1px 6px', background: SB.text, color: SB.onPri, fontSize: 9, fontWeight: 700, borderRadius: 3 }}>SELECTED · h1</div>
              <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.05, letterSpacing: -0.6 }}>Slow coffee,<br/>fast smiles.</div>
            </div>
            <div style={{ marginTop: 10, padding: 4, border: `1px dashed transparent`, borderRadius: 4, fontSize: 12, color: SB.text2, lineHeight: 1.5 }}>Single-origin pour-overs and almond croissants baked daily.</div>
            <div style={{ marginTop: 12, display: 'inline-block', padding: '7px 14px', background: SB.text, color: SB.onPri, fontSize: 12, fontWeight: 600, borderRadius: 4 }}>See the menu →</div>
            <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
              {[0,1].map(i=>(<div key={i} style={{ flex: 1, height: 70, borderRadius: 4, background: `linear-gradient(135deg, hsl(${30+i*20} 25% 70%), hsl(${20+i*10} 25% 35%))` }}/>))}
            </div>
          </div>
        </div>
      </div>
      {/* contextual edit bar — anchored to selected element */}
      <div style={{ background: SB.text, color: SB.onPri, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {[['type','Edit text'],['palette','Color'],['align-left','Align'],['copy','Copy'],['trash-2','Delete']].map((b,i)=>(
          <button key={b[1]} style={{ flex: 1, height: 40, borderRadius: 6, border: 'none', background: i===0?'rgba(255,255,255,0.12)':'transparent', color: SB.onPri, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <BIcon name={b[0]} size={14}/>
            <span style={{ fontSize: 9, fontWeight: 500 }}>{b[1]}</span>
          </button>
        ))}
      </div>
    </Phone>
  );
}

function S6_Refined() {
  return (
    <Phone bg={SB.surface}>
      <div style={{ padding: '4px 8px 8px', display: 'flex', alignItems: 'center', gap: 4, borderBottom: `1px solid ${SB.border}`, background: SB.bg, flexShrink: 0 }}>
        <button style={{ width: 32, height: 32, borderRadius: 6, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="chevron-left" size={18} color={SB.text2}/></button>
        <div style={{ display: 'flex', gap: 0, padding: 2, background: SB.muted, borderRadius: 6 }}>
          {['Edit','Preview'].map((t,i)=>(<div key={t} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 4, background: i===0?SB.bg:'transparent', color: i===0?SB.text:SB.sec, boxShadow: i===0?'0 1px 2px rgba(0,0,0,0.05)':'none' }}>{t}</div>))}
        </div>
        <div style={{ flex: 1 }}/>
        <SBIcon icon="undo"/>
        <SBIcon icon="redo"/>
      </div>
      {/* Selected breadcrumb */}
      <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: SB.sec, background: SB.bg, borderBottom: `1px solid ${SB.border}`, fontFamily: SB.mono, flexShrink: 0 }}>
        <span>home</span><BIcon name="chevron-right" size={9}/>
        <span>hero</span><BIcon name="chevron-right" size={9}/>
        <span style={{ color: SB.text, fontWeight: 600 }}>h1.headline</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <div style={{ background: SB.bg, borderRadius: 8, border: `1px solid ${SB.border}`, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '20px 16px 18px' }}>
            <div style={{ position: 'relative', padding: 6, border: `2px solid ${SB.text}`, borderRadius: 4, marginBottom: 12 }}>
              <div style={{ position: 'absolute', top: -1, left: -1, padding: '2px 7px', background: SB.text, color: SB.onPri, fontSize: 9, fontWeight: 700, borderRadius: '0 0 3px 0', fontFamily: SB.mono }}>H1</div>
              {[['nw','-4px','-4px'],['ne','-4px',null,'-4px'],['sw',null,'-4px','-4px'],['se',null,'-4px',null,'-4px']].map(h=>(
                <div key={h[0]} style={{ position: 'absolute', top: h[1], bottom: h[2], left: h[3], right: h[4], width: 8, height: 8, background: SB.bg, border: `2px solid ${SB.text}`, borderRadius: 1 }}/>
              ))}
              <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.05, letterSpacing: -0.6, paddingTop: 8 }}>Slow coffee,<br/>fast smiles.</div>
            </div>
            <div style={{ padding: 4, border: `1px dashed ${SB.border}`, borderRadius: 4, fontSize: 12, color: SB.text2, lineHeight: 1.5 }}>Single-origin pour-overs and almond croissants baked daily on 4th Ave.</div>
            <div style={{ marginTop: 12, display: 'inline-block', padding: '7px 14px', background: SB.text, color: SB.onPri, fontSize: 12, fontWeight: 600, borderRadius: 4 }}>See the menu →</div>
            <div style={{ marginTop: 18, height: 64, borderRadius: 4, background: 'linear-gradient(135deg, #c9a98c, #6b4e3c)' }}/>
            <div style={{ height: 12 }}/>
            <div style={{ padding: 4, border: `1px dashed ${SB.border}`, borderRadius: 4, fontSize: 11, color: SB.sec, fontStyle: 'italic' }}>+ tap to add a section</div>
          </div>
        </div>
      </div>
      {/* Floating mini-inspector */}
      <div style={{ position: 'absolute', left: 12, right: 12, bottom: 14, background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${SB.border}` }}>
          <div style={{ width: 22, height: 22, borderRadius: 4, background: SB.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="type" size={12} color={SB.text2}/></div>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>Heading</span>
          <span style={{ fontSize: 10.5, color: SB.sec, fontFamily: SB.mono }}>26 / 60</span>
          <div style={{ flex: 1 }}/>
          <BIcon name="more-horizontal" size={14} color={SB.sec}/>
        </div>
        <div style={{ padding: '10px 12px', display: 'flex', gap: 6, fontSize: 11.5 }}>
          {[['B','bold'],['I','italic'],['L','align-left']].map(b=>(
            <button key={b[0]} style={{ width: 36, height: 32, borderRadius: 5, border: `1px solid ${SB.border}`, background: SB.bg, fontWeight: 700, color: SB.text2 }}>{b[0]}</button>
          ))}
          <div style={{ flex: 1 }}/>
          <button style={{ height: 32, padding: '0 10px', borderRadius: 5, border: 'none', background: SB.text, color: SB.onPri, fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}><BIcon name="sparkles" size={11}/> Rewrite</button>
        </div>
      </div>
      <div style={{ height: 140, flexShrink: 0 }}/>
    </Phone>
  );
}

function S6_Exp() {
  // experimental: device-as-canvas, large preview with edit overlay anchored to a tapped element
  return (
    <Phone bg={SB.text}>
      <div style={{ color: SB.onPri }}><StatBar dark/></div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* full-bleed preview sized to a phone */}
        <div style={{ position: 'absolute', inset: 0, padding: '8px 8px 0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: '#f5ede4', borderRadius: 12, overflow: 'hidden', flex: 1, position: 'relative', fontFamily: 'Georgia, serif', color: '#3d2c1f' }}>
            <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid rgba(61,44,31,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, fontWeight: 700, letterSpacing: 0.6 }}>
              <span>MAPLE COFFEE</span>
              <span>Menu · About</span>
            </div>
            <div style={{ padding: '20px 14px' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', inset: '-4px -8px', border: `2px solid ${SB.accent}`, borderRadius: 4 }}/>
                <div style={{ position: 'absolute', top: -16, left: -8, padding: '2px 8px', background: SB.accent, color: '#fff', fontSize: 9.5, fontWeight: 700, borderRadius: 3, fontFamily: SB.font, letterSpacing: 0.4 }}>HERO · H1</div>
                <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.05, letterSpacing: -0.6 }}>Slow coffee,<br/>fast smiles.</div>
              </div>
              <div style={{ marginTop: 18, fontSize: 13, color: '#7a4a2a', lineHeight: 1.5 }}>Single-origin pour-overs and almond croissants baked daily on 4th Ave.</div>
              <div style={{ marginTop: 14, display: 'inline-block', padding: '8px 14px', background: '#3d2c1f', color: '#f5ede4', fontSize: 12, fontWeight: 600, borderRadius: 3 }}>See the menu →</div>
            </div>
          </div>
          {/* Floating contextual toolbar */}
          <div style={{ position: 'absolute', left: 24, right: 24, top: 96, background: 'rgba(20,15,10,0.92)', backdropFilter: 'blur(8px)', borderRadius: 8, padding: '8px 6px', display: 'flex', alignItems: 'center', gap: 2, color: SB.onPri, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', border: `1px solid rgba(255,255,255,0.08)` }}>
            <button style={{ height: 30, padding: '0 10px', borderRadius: 5, border: 'none', background: 'transparent', color: SB.onPri, fontSize: 11.5, fontWeight: 600, fontFamily: SB.mono }}>Aa</button>
            <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.15)' }}/>
            <button style={{ width: 30, height: 30, borderRadius: 5, border: 'none', background: 'transparent', color: SB.onPri, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="bold" size={13}/></button>
            <button style={{ width: 30, height: 30, borderRadius: 5, border: 'none', background: 'transparent', color: SB.onPri, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="italic" size={13}/></button>
            <button style={{ width: 30, height: 30, borderRadius: 5, border: 'none', background: 'transparent', color: SB.onPri, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="align-left" size={13}/></button>
            <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.15)' }}/>
            <div style={{ flex: 1 }}/>
            <button style={{ height: 30, padding: '0 10px', borderRadius: 5, border: 'none', background: SB.accent, color: '#fff', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><BIcon name="sparkles" size={11}/> AI</button>
          </div>
        </div>
      </div>
      {/* dock */}
      <div style={{ background: SB.text, color: SB.onPri, padding: '10px 14px 16px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid #2c2724', flexShrink: 0 }}>
        <div style={{ width: 8, height: 8, borderRadius: 999, background: SB.accent }}/>
        <div style={{ flex: 1, fontSize: 11, color: '#a8a29e' }}>Editing <span style={{ color: SB.onPri, fontFamily: SB.mono }}>h1.headline</span></div>
        <button style={{ height: 32, padding: '0 14px', borderRadius: 6, border: 'none', background: SB.onPri, color: SB.text, fontSize: 12, fontWeight: 600 }}>Done</button>
      </div>
    </Phone>
  );
}

// ═══════════════ Screen 7 · Publish flow ═══════════════
function S7_Basic() {
  return (
    <Phone>
      <SBTop title="Publish" sub="2 changes · ready" back right={<SBIcon icon="x"/>}/>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: 14 }}>
          <div style={{ background: '#f0fdf4', border: `1px solid #bbf7d0`, borderRadius: 8, padding: 12, display: 'flex', gap: 10 }}>
            <div style={{ width: 24, height: 24, borderRadius: 999, background: SB.ok, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><BIcon name="check" size={14}/></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#14532d' }}>Site is healthy</div>
              <div style={{ fontSize: 11.5, color: '#166534', marginTop: 2 }}>All sections valid · domain verified</div>
            </div>
          </div>
        </div>
        <SBSect title="Changes" count="02">
          <BlockRow icon="type" title="Home · Hero" meta="Headline copy updated"/>
          <BlockRow icon="image" title="About · Banner" meta="Photo replaced" last/>
        </SBSect>
        <SBSect title="When">
          <div style={{ borderTop: `1px solid ${SB.border}`, borderBottom: `1px solid ${SB.border}`, background: SB.bg }}>
            {[['Now','Goes live in ~30s', true],['Schedule','Pick a time', false]].map(o=>(
              <div key={o[0]} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, borderTop: o[0]==='Schedule'?`1px solid ${SB.border}`:'none' }}>
                <div style={{ width: 18, height: 18, borderRadius: 999, border: `2px solid ${o[2]?SB.text:SB.borderS}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {o[2] && <div style={{ width: 8, height: 8, borderRadius: 999, background: SB.text }}/>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{o[0]}</div>
                  <div style={{ fontSize: 11.5, color: SB.sec }}>{o[1]}</div>
                </div>
              </div>
            ))}
          </div>
        </SBSect>
        <div style={{ height: 80 }}/>
      </div>
      <div style={{ padding: '10px 14px 14px', borderTop: `1px solid ${SB.border}`, background: SB.bg }}>
        <button style={{ width: '100%', height: 46, borderRadius: 6, border: 'none', background: SB.text, color: SB.onPri, fontSize: 14, fontWeight: 600 }}>Publish to maple-coffee.shop</button>
      </div>
    </Phone>
  );
}

function S7_Refined() {
  return (
    <Phone bg={SB.surface}>
      <SBTop title="Review & publish" back right={<SBIcon icon="x"/>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px 16px' }}>
        {/* Diff summary */}
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 600, fontFamily: SB.mono }}>v.43</span>
            <BIcon name="chevron-right" size={12} color={SB.ter}/>
            <span style={{ fontSize: 18, fontWeight: 600, fontFamily: SB.mono, color: SB.text }}>v.44</span>
            <div style={{ flex: 1 }}/>
            <PubPill state="draft" compact/>
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${SB.border}`, fontSize: 11, color: SB.sec, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div><div style={{ color: SB.text2, fontWeight: 600, fontSize: 13, fontFamily: SB.mono }}>2</div>edits</div>
            <div><div style={{ color: SB.text2, fontWeight: 600, fontSize: 13, fontFamily: SB.mono }}>1</div>image</div>
            <div><div style={{ color: SB.text2, fontWeight: 600, fontSize: 13, fontFamily: SB.mono }}>0</div>broken</div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}><SBLab>Diff</SBLab></div>
        <div style={{ marginTop: 8, background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${SB.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <BIcon name="type" size={11} color={SB.sec}/>
              <span style={{ fontSize: 10.5, color: SB.sec, letterSpacing: 0.4, fontWeight: 700 }}>HOME · HERO · H1</span>
            </div>
            <div style={{ fontSize: 12, color: SB.danger, textDecoration: 'line-through', fontFamily: SB.mono, opacity: 0.7 }}>− Slow coffee, smaller egos.</div>
            <div style={{ fontSize: 12, color: SB.ok, fontFamily: SB.mono, marginTop: 2 }}>+ Slow coffee, fast smiles.</div>
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <BIcon name="image" size={11} color={SB.sec}/>
              <span style={{ fontSize: 10.5, color: SB.sec, letterSpacing: 0.4, fontWeight: 700 }}>ABOUT · BANNER</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ width: 50, height: 36, borderRadius: 3, background: '#a8a29e', opacity: 0.5 }}/>
              <BIcon name="chevron-right" size={11} color={SB.ter}/>
              <div style={{ width: 50, height: 36, borderRadius: 3, background: 'linear-gradient(135deg, #c9a98c, #6b4e3c)' }}/>
              <div style={{ flex: 1, fontSize: 11, color: SB.sec, fontFamily: SB.mono }}>shop-front.jpg</div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}><SBLab>When</SBLab></div>
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ background: SB.text, color: SB.onPri, borderRadius: 8, padding: 12, position: 'relative' }}>
            <BIcon name="zap" size={13}/>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>Now</div>
            <div style={{ fontSize: 10.5, color: '#a8a29e', marginTop: 1 }}>Live in ~30s</div>
          </div>
          <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 8, padding: 12 }}>
            <BIcon name="calendar" size={13} color={SB.sec}/>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>Schedule</div>
            <div style={{ fontSize: 10.5, color: SB.sec, marginTop: 1 }}>Tue · 8 AM</div>
          </div>
        </div>
      </div>
      <div style={{ padding: '10px 14px 14px', borderTop: `1px solid ${SB.border}`, background: SB.bg, display: 'flex', gap: 8 }}>
        <button style={{ flex: 1, height: 46, borderRadius: 6, border: `1px solid ${SB.borderS}`, background: SB.bg, fontSize: 13, color: SB.text2, fontWeight: 500 }}>Save draft</button>
        <button style={{ flex: 1.6, height: 46, borderRadius: 6, border: 'none', background: SB.text, color: SB.onPri, fontSize: 14, fontWeight: 600 }}>Publish v.44</button>
      </div>
    </Phone>
  );
}

function S7_Exp() {
  // confirmation state — terminal-feel
  return (
    <Phone bg={SB.text}>
      <div style={{ color: SB.onPri, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <StatBar dark/>
        <div style={{ padding: '4px 8px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <button style={{ width: 32, height: 32, borderRadius: SB.radius, border: 'none', background: 'transparent', color: SB.onPri, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="x" size={18}/></button>
          <div style={{ flex: 1, padding: '4px 4px 0' }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Publishing…</div>
            <div style={{ fontSize: 11, color: '#a8a29e', fontFamily: SB.mono }}>v.43 → v.44</div>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
          {/* Big version chip */}
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 9.5, color: '#a8a29e', letterSpacing: 0.6, fontWeight: 700 }}>VERSION</div>
            <div style={{ fontSize: 56, fontWeight: 700, fontFamily: SB.mono, letterSpacing: -2, marginTop: 4, color: SB.accent }}>v.44</div>
            <div style={{ fontSize: 11, color: SB.sec, fontFamily: SB.mono }}>4f3a · sat 2:14 pm</div>
          </div>
          {/* Build steps */}
          <div style={{ background: '#1a1614', border: '1px solid #2c2724', borderRadius: 8, padding: 0, fontFamily: SB.mono, fontSize: 11 }}>
            {[
              ['done','Build assets','420kb · 18 files'],
              ['done','Optimize images','6 webp · 1.2mb saved'],
              ['done','Validate sections','OK · 0 broken links'],
              ['live','Deploy edge','3 of 6 regions'],
              ['pend','Warm cache','—'],
              ['pend','Verify','—'],
            ].map((s,i,a)=>(
              <div key={s[1]} style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: i===a.length-1?'none':'1px solid #2c2724' }}>
                <div style={{ width: 14, height: 14, borderRadius: 999, background: s[0]==='done'?SB.ok:s[0]==='live'?SB.accent:'transparent', border: s[0]==='pend'?`1.5px solid #44403c`:'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {s[0]==='done' && <BIcon name="check" size={9} color="#fff" strokeWidth={3}/>}
                  {s[0]==='live' && <span style={{ width: 5, height: 5, borderRadius: 999, background: '#fff' }}/>}
                </div>
                <span style={{ flex: 1, color: s[0]==='pend'?'#57534e':SB.onPri }}>{s[1]}</span>
                <span style={{ color: '#a8a29e', fontSize: 10 }}>{s[2]}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, fontSize: 10, color: '#57534e', fontFamily: SB.mono, lineHeight: 1.6 }}>
            <div>$ bizops site publish --target=prod</div>
            <div style={{ color: SB.ok }}>✓ assets compiled in 1.2s</div>
            <div style={{ color: SB.ok }}>✓ images optimized · 6/6</div>
            <div style={{ color: SB.accent }}>→ deploying edge…</div>
          </div>
        </div>
      </div>
    </Phone>
  );
}

// ═══════════════ Screen 8 · Empty state (first-run) ═══════════════
function S8_Basic() {
  return (
    <Phone>
      <SBTop title="Website" right={<SBIcon icon="more-horizontal"/>}/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 18px', background: SB.surface }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 8px' }}>
          <div style={{ width: 72, height: 72, borderRadius: 16, background: SB.bg, border: `1px solid ${SB.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <BIcon name="globe" size={32} color={SB.text2} strokeWidth={1.4}/>
          </div>
          <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: -0.4 }}>You don't have a site yet.</div>
          <div style={{ fontSize: 13, color: SB.sec, marginTop: 8, lineHeight: 1.5, maxWidth: 280 }}>Build a public page for Maple Coffee in a few minutes — pick a template, plug in your menu and hours, publish.</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button style={{ height: 46, borderRadius: 6, border: 'none', background: SB.text, color: SB.onPri, fontSize: 14, fontWeight: 600 }}>Start from template</button>
          <button style={{ height: 46, borderRadius: 6, border: `1px solid ${SB.borderS}`, background: SB.bg, color: SB.text2, fontSize: 14, fontWeight: 500 }}>Start from blank</button>
        </div>
      </div>
      <MiniTab/>
    </Phone>
  );
}

function S8_Refined() {
  return (
    <Phone bg={SB.surface}>
      <SBTop title="Build your site" sub="3 quick steps · ~5 min"/>
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px 16px' }}>
        {/* Hero card */}
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 10, padding: '16px 14px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 20%, rgba(161,101,68,0.07), transparent 60%)' }}/>
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'inline-flex', padding: 14, borderRadius: 999, background: SB.muted, marginBottom: 12 }}>
              <BIcon name="globe" size={28} color={SB.text} strokeWidth={1.4}/>
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.4 }}>Maple Coffee, online.</div>
            <div style={{ fontSize: 12.5, color: SB.sec, marginTop: 6, lineHeight: 1.5 }}>Pick a template, connect your data, publish in minutes.</div>
          </div>
        </div>
        {/* Steps */}
        <div style={{ marginTop: 14 }}><SBLab>Steps</SBLab></div>
        <div style={{ marginTop: 8, background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {[['1','Pick a template','4 layouts to start',true],['2','Connect data','Pull menu, hours, team',false],['3','Publish','To maple-coffee.shop',false]].map((s,i,a)=>(
            <div key={s[0]} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: i===a.length-1?'none':`1px solid ${SB.border}` }}>
              <div style={{ width: 26, height: 26, borderRadius: 999, background: s[3]?SB.text:SB.muted, color: s[3]?SB.onPri:SB.sec, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, fontFamily: SB.mono, flexShrink: 0 }}>{s[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{s[1]}</div>
                <div style={{ fontSize: 11.5, color: SB.sec }}>{s[2]}</div>
              </div>
              <BIcon name="chevron-right" size={13} color={SB.ter}/>
            </div>
          ))}
        </div>
        {/* Templates preview */}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <SBLab>Templates</SBLab>
          <span style={{ fontSize: 11, color: SB.text2, fontWeight: 600 }}>See all 8</span>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, overflowX: 'auto', padding: '0 0 4px', marginRight: -12 }}>
          {['cream','paper','forest','mono'].map(t=>(
            <div key={t} style={{ width: 130, flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${SB.border}`, background: SB.bg }}>
              <SitePreview w={130} h={170} theme={t}/>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '10px 14px 14px', borderTop: `1px solid ${SB.border}`, background: SB.bg }}>
        <button style={{ width: '100%', height: 46, borderRadius: 6, border: 'none', background: SB.text, color: SB.onPri, fontSize: 14, fontWeight: 600 }}>Start with Drip · Cream</button>
      </div>
    </Phone>
  );
}

function S8_Exp() {
  return (
    <Phone bg={SB.surface}>
      <div style={{ flex: 1, padding: '24px 18px 16px', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ fontSize: 10, color: SB.sec, letterSpacing: 0.6, fontWeight: 700 }}>BIZOPS · SITE</div>
        <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1, marginTop: 6, color: SB.text }}>What kind of<br/>site<span style={{ color: SB.accent }}>?</span></div>
        <div style={{ fontSize: 13, color: SB.sec, marginTop: 10, lineHeight: 1.5, maxWidth: 280 }}>We'll fill in pages, copy and a starter theme. You edit from there.</div>
        {/* Big choices */}
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            ['Café / restaurant','Menu, hours, gallery, contact','utensils', true],
            ['Retail shop','Catalog, hours, story, map','package', false],
            ['Service business','Booking, services, team, contact','users', false],
            ['Just a one-pager','Hero, contact, that\'s it','file', false],
          ].map((c,i)=>(
            <div key={c[0]} style={{ position: 'relative', padding: '14px 14px', background: c[3]?SB.text:SB.bg, color: c[3]?SB.onPri:SB.text, border: `1px solid ${c[3]?SB.text:SB.border}`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: c[3]?'rgba(255,255,255,0.1)':SB.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <BIcon name={c[2]} size={15} color={c[3]?SB.onPri:SB.text2}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>{c[0]}</div>
                <div style={{ fontSize: 11, color: c[3]?'#a8a29e':SB.sec, marginTop: 1 }}>{c[1]}</div>
              </div>
              {c[3] ? <div style={{ width: 22, height: 22, borderRadius: 999, background: SB.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="check" size={11} color="#fff" strokeWidth={3}/></div> : <BIcon name="chevron-right" size={14} color={SB.ter}/>}
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '10px 12px', borderRadius: 8, background: SB.accentSoft, border: `1px solid ${SB.accentBorder}` }}>
          <BIcon name="sparkles" size={13} color={SB.accentText}/>
          <span style={{ fontSize: 12, color: SB.accentText, flex: 1 }}>Or describe it: "wine bar, dim, hand-lettered"</span>
        </div>
        <button style={{ marginTop: 10, width: '100%', height: 46, borderRadius: 6, border: 'none', background: SB.text, color: SB.onPri, fontSize: 14, fontWeight: 600 }}>Continue with Café →</button>
      </div>
    </Phone>
  );
}

// ═══════════════ Screen 9 · Domain settings ═══════════════
function S9_Basic() {
  return (
    <Phone>
      <SBTop title="Domain" back/>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <SBSect title="Primary">
          <div style={{ padding: '14px', borderTop: `1px solid ${SB.border}`, borderBottom: `1px solid ${SB.border}`, background: SB.bg }}>
            <div style={{ fontFamily: SB.mono, fontSize: 16, fontWeight: 600 }}>maple-coffee.shop</div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#f0fdf4', color: SB.ok, fontSize: 11, fontWeight: 600, borderRadius: 999, border: `1px solid #bbf7d0` }}><span style={{ width: 5, height: 5, borderRadius: 999, background: SB.ok }}/>Verified</span>
              <span style={{ fontSize: 11, color: SB.sec }}>· SSL active</span>
            </div>
          </div>
        </SBSect>
        <SBSect title="DNS records" count="04">
          {[['A','@','76.76.21.21'],['A','www','76.76.21.21'],['TXT','_acme','v=DMARC1…'],['MX','@','10 mx.bizops.com']].map((r,i,a)=>(
            <div key={r[0]+r[1]} style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, borderTop: `1px solid ${SB.border}`, borderBottom: i===a.length-1?`1px solid ${SB.border}`:'none', background: SB.bg }}>
              <span style={{ fontSize: 10, fontFamily: SB.mono, fontWeight: 700, color: SB.text2, padding: '2px 5px', background: SB.muted, borderRadius: 3, minWidth: 30, textAlign: 'center' }}>{r[0]}</span>
              <span style={{ fontSize: 12, fontFamily: SB.mono, color: SB.text2, minWidth: 50 }}>{r[1]}</span>
              <span style={{ flex: 1, fontSize: 11.5, fontFamily: SB.mono, color: SB.sec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r[2]}</span>
              <BIcon name="check" size={13} color={SB.ok}/>
            </div>
          ))}
        </SBSect>
        <SBSect title="Aliases">
          <BlockRow icon="link" title="Add alias" meta="e.g. www.maple-coffee.shop" last/>
        </SBSect>
      </div>
    </Phone>
  );
}

function S9_Refined() {
  return (
    <Phone bg={SB.surface}>
      <SBTop title="Domain" sub="maple-coffee.shop" back right={<SBIcon icon="more-horizontal"/>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px 16px' }}>
        {/* Status card */}
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 14px 12px' }}>
            <div style={{ fontSize: 9.5, color: SB.sec, letterSpacing: 0.6, fontWeight: 700 }}>PRIMARY</div>
            <div style={{ marginTop: 4, fontFamily: SB.mono, fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>maple-coffee.shop</div>
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: '#f0fdf4', color: SB.ok, fontSize: 10.5, fontWeight: 600, borderRadius: 999, border: `1px solid #bbf7d0` }}><BIcon name="check" size={9} strokeWidth={3}/> Verified</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: SB.muted, color: SB.text2, fontSize: 10.5, fontWeight: 600, borderRadius: 999, border: `1px solid ${SB.border}` }}>SSL · Auto-renew</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: SB.muted, color: SB.text2, fontSize: 10.5, fontWeight: 600, borderRadius: 999, border: `1px solid ${SB.border}` }}>Renews 2027-04</span>
            </div>
          </div>
          <div style={{ padding: '10px 14px', borderTop: `1px solid ${SB.border}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, fontSize: 11 }}>
            <div><div style={{ color: SB.sec }}>Registrar</div><div style={{ color: SB.text, fontWeight: 500, marginTop: 2 }}>BizOps Domains</div></div>
            <div><div style={{ color: SB.sec }}>Nameservers</div><div style={{ color: SB.text, fontWeight: 500, marginTop: 2, fontFamily: SB.mono }}>ns1, ns2 ↗</div></div>
          </div>
        </div>
        {/* DNS */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <SBLab>DNS records · 04</SBLab>
          <span style={{ fontSize: 11, color: SB.text2, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>Add <BIcon name="plus" size={11}/></span>
        </div>
        <div style={{ marginTop: 8, background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {[['A','@','76.76.21.21','OK'],['A','www','76.76.21.21','OK'],['TXT','_acme-challenge','v=DMARC1; p=none','OK'],['MX','@','10 mx.bizops.com','OK']].map((r,i,a)=>(
            <div key={r[0]+r[1]} style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: i===a.length-1?'none':`1px solid ${SB.border}` }}>
              <span style={{ fontSize: 10, fontFamily: SB.mono, fontWeight: 700, color: SB.text2, padding: '2px 6px', background: SB.muted, borderRadius: 3, minWidth: 32, textAlign: 'center' }}>{r[0]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontFamily: SB.mono, color: SB.text, fontWeight: 500 }}>{r[1]}</div>
                <div style={{ fontSize: 10.5, fontFamily: SB.mono, color: SB.sec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r[2]}</div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: SB.ok, fontSize: 10.5, fontWeight: 600 }}><BIcon name="check" size={10} strokeWidth={3}/> {r[3]}</span>
            </div>
          ))}
        </div>
        {/* Aliases */}
        <div style={{ marginTop: 14 }}><SBLab>Aliases</SBLab></div>
        <div style={{ marginTop: 8, background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <BlockRow icon="link" title="www.maple-coffee.shop" meta="Redirects to apex"/>
          <BlockRow icon="plus" title="Add alias" meta="Custom redirect" last/>
        </div>
      </div>
    </Phone>
  );
}

function S9_Exp() {
  return (
    <Phone bg={SB.surface}>
      <SBTop title="Connect domain" sub="Step 2 of 3" back right={<SBIcon icon="x"/>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px 16px' }}>
        {/* Big domain input — pretend-active */}
        <div style={{ background: SB.bg, border: `2px solid ${SB.text}`, borderRadius: 10, padding: '14px 14px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 9.5, color: SB.sec, letterSpacing: 0.6, fontWeight: 700 }}>YOUR DOMAIN</div>
          <div style={{ marginTop: 6, fontFamily: SB.mono, fontSize: 22, fontWeight: 600, letterSpacing: -0.5, color: SB.text, display: 'flex', alignItems: 'baseline', gap: 0 }}>
            <span>maple-coffee</span><span style={{ color: SB.accent }}>.shop</span>
            <span style={{ width: 2, height: 22, background: SB.text, marginLeft: 2, animation: 'blink 1s' }}/>
          </div>
          <div style={{ marginTop: 8, paddingTop: 10, borderTop: `1px dashed ${SB.border}`, fontSize: 11, color: SB.ok, display: 'flex', alignItems: 'center', gap: 6 }}>
            <BIcon name="check" size={11} strokeWidth={3}/> Available · $14/yr
          </div>
        </div>
        {/* Suggestions */}
        <div style={{ marginTop: 14 }}><SBLab>Also available</SBLab></div>
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[['maple.coffee','$32'],['maple-co.fee','$24'],['hellomaple.com','$12'],['maple.cafe','$28']].map(s=>(
            <div key={s[0]} style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 12, fontFamily: SB.mono, fontWeight: 500, color: SB.text2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s[0]}</div>
              <div style={{ fontSize: 10.5, color: SB.sec, marginTop: 2 }}>{s[1]}/yr</div>
            </div>
          ))}
        </div>
        {/* What happens next */}
        <div style={{ marginTop: 16 }}><SBLab>What happens next</SBLab></div>
        <div style={{ marginTop: 8, background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 8, padding: 0, overflow: 'hidden' }}>
          {[
            ['1','We register the domain','30s · auto'],
            ['2','DNS records configured','BizOps managed'],
            ['3','SSL certificate issued','~5 min · automatic'],
            ['4','Site goes live','at maple-coffee.shop'],
          ].map((r,i,a)=>(
            <div key={r[0]} style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: i===a.length-1?'none':`1px solid ${SB.border}`, position: 'relative' }}>
              <div style={{ width: 22, height: 22, borderRadius: 999, border: `1.5px solid ${SB.borderS}`, color: SB.sec, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, fontFamily: SB.mono, flexShrink: 0 }}>{r[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r[1]}</div>
                <div style={{ fontSize: 10.5, color: SB.sec }}>{r[2]}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '10px 14px 14px', borderTop: `1px solid ${SB.border}`, background: SB.bg, display: 'flex', gap: 8 }}>
        <button style={{ flex: 1, height: 46, borderRadius: 6, border: `1px solid ${SB.borderS}`, background: SB.bg, fontSize: 13, color: SB.text2, fontWeight: 500 }}>I have a domain</button>
        <button style={{ flex: 1.4, height: 46, borderRadius: 6, border: 'none', background: SB.text, color: SB.onPri, fontSize: 14, fontWeight: 600 }}>Buy · $14/yr</button>
      </div>
    </Phone>
  );
}

Object.assign(window, { S6_Basic, S6_Refined, S6_Exp, S7_Basic, S7_Refined, S7_Exp, S8_Basic, S8_Refined, S8_Exp, S9_Basic, S9_Refined, S9_Exp });
