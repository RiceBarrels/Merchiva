// ═══════════════════════════════════════════════════════════
// BizOps Mobile · Site Builder — screens (9 × 3 variants)
// All artboards 375×812. Renders with src/site-builder-base.jsx primitives.
// ═══════════════════════════════════════════════════════════

const { useState: sbUS } = React;

// Phone shell helper
function Phone({ children, bg = SB.bg }) {
  return (
    <div style={{ width: '100%', height: '100%', background: bg, color: SB.text, fontFamily: SB.font, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <StatBar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</div>
    </div>
  );
}

// Generic mini bottom bar (BizOps tab look — kept narrow so artboard reads as a screen)
function MiniTab({ current = 'site' }) {
  const items = [
    { id: 'dash', i: 'layout-dashboard' },
    { id: 'site', i: 'globe' },
    { id: 'inv',  i: 'package' },
    { id: 'team', i: 'users' },
    { id: 'set',  i: 'settings' },
  ];
  return (
    <div style={{ borderTop: `1px solid ${SB.border}`, background: SB.bg, display: 'flex', padding: '6px 4px 14px', flexShrink: 0 }}>
      {items.map(it => {
        const active = current === it.id;
        return (
          <div key={it.id} style={{ flex: 1, padding: '6px 0 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, color: active ? SB.text : SB.ter }}>
            <div style={{ width: 36, height: 22, borderRadius: 999, background: active ? SB.muted : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BIcon name={it.i} size={15} strokeWidth={active ? 2 : 1.6} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Screen 1: Builder home / overview
// ═══════════════════════════════════════════════════════════
function Home_Basic() {
  return (
    <Phone>
      <SBTop title="Site" sub="maplecoffee.shop" right={<><SBIcon icon="eye" /><SBIcon icon="more-horizontal" /></>} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '14px 14px 12px', borderBottom: `1px solid ${SB.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <PubPill state="live" />
          <span style={{ fontSize: 11, color: SB.sec, fontFamily: SB.mono }}>v.42 · Apr 22</span>
          <div style={{ flex: 1 }} />
          <button style={{ height: 28, padding: '0 10px', borderRadius: SB.radius, border: `1px solid ${SB.border}`, background: SB.bg, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Edit</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${SB.border}` }}>
          {[['Pages','4'],['Sections','12'],['Visitors 7d','428'],['Last edit','2h']].map(([l,v],i) => (
            <div key={l} style={{ padding: '14px 14px 12px', borderRight: i%2===0?`1px solid ${SB.border}`:'none', borderTop: i>1?`1px solid ${SB.border}`:'none' }}>
              <SBLab>{l}</SBLab>
              <div style={{ fontSize: 22, fontWeight: 600, fontFamily: i===3?SB.font:SB.mono, fontVariantNumeric: 'tabular-nums', marginTop: 6, letterSpacing: -0.5 }}>{v}</div>
            </div>
          ))}
        </div>
        <SBSect title="Pages" count={4} action={{ l: 'Manage', i: 'chevron-right' }}>
          {[
            ['home','Home','Hero · Menu · Hours · Map','file'],
            ['menu','Menu','Linked to BizOps inventory','utensils'],
            ['about','About','Story · Team','book-open'],
            ['contact','Contact','Form · Hours · Map','mail'],
          ].map(([id,t,m,i],idx) => <BlockRow key={id} icon={i} title={t} meta={m} last={idx===3} />)}
        </SBSect>
        <SBSect title="Recent activity">
          <BlockRow icon="edit-3" title="Hero copy edited" meta="Today · 2:14 PM" />
          <BlockRow icon="image" title="Gallery photo added" meta="Today · 11:08 AM" />
          <BlockRow icon="upload-cloud" title="Published v.42" meta="Apr 22" last />
        </SBSect>
        <div style={{ height: 16 }} />
      </div>
      <MiniTab />
    </Phone>
  );
}

function Home_Refined() {
  return (
    <Phone bg={SB.surface}>
      <SBTop title="Site" sub="maplecoffee.shop · Live" right={<SBIcon icon="more-horizontal" />} />
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {/* Live preview card */}
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <PubPill state="live" compact />
            <span style={{ fontSize: 11.5, color: SB.sec, fontFamily: SB.mono }}>maplecoffee.shop</span>
            <div style={{ flex: 1 }} />
            <BIcon name="external-link" size={13} color={SB.sec} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 4px' }}>
            <div style={{ border: `1px solid ${SB.border}`, padding: 6, borderRadius: 8, background: SB.surface }}>
              <SitePreview w={172} h={250} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            <button style={{ height: 36, borderRadius: SB.radius, border: 'none', background: SB.text, color: SB.onPri, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <BIcon name="edit-3" size={13} /> Edit
            </button>
            <button style={{ height: 36, borderRadius: SB.radius, border: `1px solid ${SB.border}`, background: SB.bg, fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <BIcon name="upload-cloud" size={13} /> Publish
            </button>
          </div>
        </div>
        {/* Quick stats */}
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, padding: '4px 0', marginBottom: 12 }}>
          {[['Visitors · 7d','428','+12%'],['Conversions','38','+4'],['Avg session','1:24','-3s']].map(([l,v,d],i) => (
            <div key={l} style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: i?`1px solid ${SB.border}`:'none' }}>
              <span style={{ fontSize: 13, color: SB.text2 }}>{l}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: SB.mono, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                <span style={{ fontSize: 11, color: d.startsWith('-')?SB.danger:SB.ok, fontFamily: SB.mono }}>{d}</span>
              </div>
            </div>
          ))}
        </div>
        {/* Pages */}
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${SB.border}`, background: SB.surface }}>
            <SBLab>Pages</SBLab>
            <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11.5, color: SB.text2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>+ Add</button>
          </div>
          {[['Home','/','12 sections'],['Menu','/menu','linked'],['About','/about','3 sections'],['Contact','/contact','form + map']].map(([t,p,m],i,a) => (
            <BlockRow key={t} icon="file" title={t} meta={<><span style={{ fontFamily: SB.mono, color: SB.text2 }}>{p}</span> · {m}</>} last={i===a.length-1} />
          ))}
        </div>
        <div style={{ height: 12 }} />
      </div>
      <MiniTab />
    </Phone>
  );
}

function Home_Experimental() {
  return (
    <Phone bg="#1c1917">
      <div style={{ color: '#fff' }}><StatBar dark /></div>
      {/* dark builder canvas */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {/* Grid bg */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)`, backgroundSize: '14px 14px', opacity: 0.6 }} />
        <div style={{ position: 'relative', padding: '8px 14px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, color: SB.ter, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 600 }}>Site</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: '#fff', letterSpacing: -0.4, marginTop: 2 }}>Maple Coffee</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ width: 34, height: 34, borderRadius: SB.radius, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BIcon name="sparkles" size={15} color={SB.accent} />
              </button>
              <button style={{ width: 34, height: 34, borderRadius: SB.radius, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BIcon name="more-horizontal" size={16} />
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 8px', borderRadius: 999, background: 'rgba(5,150,105,0.15)', color: '#34d399', fontSize: 11, fontWeight: 600 }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: '#34d399' }} />Live
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: SB.mono }}>maplecoffee.shop</span>
          </div>
        </div>
        {/* floating preview */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', padding: '8px 0 18px' }}>
          <div style={{ width: 200, height: 290, borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)' }}>
            <SitePreview w={200} h={290} theme="paper" />
          </div>
          {/* floating annotations */}
          <div style={{ position: 'absolute', left: 18, top: 60, background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '5px 8px', fontSize: 10, color: '#fff', display: 'flex', alignItems: 'center', gap: 5 }}>
            <BIcon name="sparkles" size={11} color={SB.accent} /> 3 AI suggestions
          </div>
          <div style={{ position: 'absolute', right: 18, top: 130, background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '5px 8px', fontSize: 10, color: '#fff', fontFamily: SB.mono }}>
            +12% wk
          </div>
        </div>
        {/* AI command bar */}
        <div style={{ position: 'relative', padding: '0 14px 14px' }}>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: SB.radiusLg, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <BIcon name="sparkles" size={15} color={SB.accent} />
            <div style={{ flex: 1, fontSize: 12.5, color: 'rgba(255,255,255,0.55)' }}>Tell AI what to change…</div>
            <span style={{ fontFamily: SB.mono, fontSize: 10, color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.15)', padding: '1px 5px', borderRadius: 3 }}>⌘K</span>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['Make hero punchier', 'Refresh copy', 'Try new theme', 'Add testimonials'].map(c => (
              <span key={c} style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, padding: '4px 9px', background: 'rgba(255,255,255,0.02)' }}>{c}</span>
            ))}
          </div>
        </div>
        {/* dark sections */}
        <div style={{ position: 'relative', padding: '0 14px 14px' }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Pages</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[['Home','/'],['Menu','/menu'],['About','/about'],['Contact','/contact']].map(([t,p]) => (
              <div key={t} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: SB.radius, padding: '10px 12px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{t}</div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', fontFamily: SB.mono, marginTop: 2 }}>{p}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Phone>
  );
}

Object.assign(window, { Home_Basic, Home_Refined, Home_Experimental, Phone, MiniTab });
