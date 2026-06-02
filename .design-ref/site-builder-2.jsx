// ═══════════════════════════════════════════════════════════
// BizOps · Site Builder — screens 2-5: Section list / Editor / Theme / Image
// ═══════════════════════════════════════════════════════════

// ───── Screen 2: Section list (reorder + add) ─────
function Sections_Basic() {
  const rows = [
    ['Hero','Slow coffee, fast smiles','image'],
    ['Menu','Linked · 18 items','utensils'],
    ['Hours','Mon–Fri · 7–6','clock'],
    ['Gallery','6 photos','image'],
    ['Contact','Form + map','mail'],
    ['Footer','Social · Legal','minus'],
  ];
  return (
    <Phone>
      <SBTop back title="Home page" sub="6 sections" right={<><SBIcon icon="eye" /><SBIcon icon="plus" /></>} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        {rows.map((r,i)=>(
          <BlockRow key={r[0]} drag icon={r[2]} title={r[0]} meta={r[1]} last={i===rows.length-1} />
        ))}
        <div style={{ padding: 14 }}>
          <button style={{ width: '100%', height: 38, borderRadius: SB.radius, border: `1px dashed ${SB.borderS}`, background: SB.bg, fontSize: 13, fontWeight: 500, color: SB.text2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <BIcon name="plus" size={14} /> Add section
          </button>
        </div>
      </div>
      <MiniTab />
    </Phone>
  );
}

function Sections_Refined() {
  const rows = [
    ['Hero','Slow coffee, fast smiles','type','published'],
    ['Menu','Linked · 18 items','utensils','published'],
    ['Hours','Mon–Fri · 7–6','clock','published'],
    ['Gallery','6 photos · 2 hidden','image','draft'],
    ['Contact','Form + map','mail','published'],
    ['Footer','Social · Legal','minus','published'],
  ];
  return (
    <Phone bg={SB.surface}>
      <SBTop back title="Home" sub="6 sections · 1 draft" right={<><SBIcon icon="eye" /><SBIcon icon="plus" /></>} />
      {/* Page tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', overflow: 'auto', background: SB.surface, borderBottom: `1px solid ${SB.border}`, flexShrink: 0 }}>
        {['Home','Menu','About','Contact'].map((p,i)=>(
          <span key={p} style={{ height: 26, padding: '0 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', background: i===0?SB.text:SB.bg, color: i===0?SB.onPri:SB.text2, border: i===0?'none':`1px solid ${SB.border}`, flexShrink: 0 }}>{p}</span>
        ))}
        <span style={{ height: 26, width: 26, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: SB.bg, border: `1px solid ${SB.border}`, color: SB.sec, flexShrink: 0 }}>+</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, overflow: 'hidden' }}>
          {rows.map((r,i)=>(
            <BlockRow key={r[0]} drag icon={r[2]} title={r[0]} meta={r[1]}
              badge={r[3]==='draft'?<span style={{ fontSize: 10, fontWeight: 600, color: SB.warn, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '1px 5px' }}>DRAFT</span>:null}
              last={i===rows.length-1} />
          ))}
        </div>
        <button style={{ width: '100%', marginTop: 10, height: 40, borderRadius: SB.radius, border: `1px dashed ${SB.borderS}`, background: SB.bg, fontSize: 13, fontWeight: 500, color: SB.text2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <BIcon name="plus" size={14} /> Add section
        </button>
        <div style={{ marginTop: 10, padding: 10, background: SB.accentSoft, border: `1px solid ${SB.accentBorder}`, borderRadius: SB.radiusLg, display: 'flex', gap: 9, alignItems: 'flex-start' }}>
          <BIcon name="sparkles" size={14} color={SB.accent} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: SB.accentText, fontWeight: 600 }}>AI suggests adding a Testimonials section</div>
            <div style={{ fontSize: 11, color: '#7a5a40', marginTop: 2 }}>Based on your Yelp reviews · 4.7★</div>
          </div>
          <button style={{ background: SB.accent, color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, padding: '4px 10px', cursor: 'pointer' }}>Add</button>
        </div>
      </div>
      <MiniTab />
    </Phone>
  );
}

function Sections_Experimental() {
  // Side-rail with reorder dots + tap to focus
  const rows = [
    ['Hero','type'],['Menu','utensils'],['Hours','clock'],
    ['Gallery','image'],['Contact','mail'],['Footer','minus'],
  ];
  return (
    <Phone bg="#1c1917">
      <div style={{ color: '#fff' }}><StatBar dark /></div>
      <div style={{ padding: '6px 14px 8px', display: 'flex', alignItems: 'center', gap: 10, color: '#fff', flexShrink: 0 }}>
        <button style={{ width: 32, height: 32, borderRadius: SB.radius, border: 'none', background: 'transparent', color: '#fff' }}><BIcon name="chevron-left" size={18} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Home</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Tap to focus · drag to reorder</div>
        </div>
        <button style={{ height: 28, padding: '0 11px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 12, fontWeight: 600 }}>Done</button>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left: scrollable section spine */}
        <div style={{ width: 56, padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, borderRight: '1px solid rgba(255,255,255,0.08)' }}>
          {rows.map((r,i)=>(
            <div key={r[0]} style={{ width: 40, height: 40, borderRadius: 8, background: i===0?'rgba(161,101,68,0.18)':'rgba(255,255,255,0.05)', border: i===0?`1px solid ${SB.accent}`:'1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: i===0?SB.accent:'rgba(255,255,255,0.55)' }}>
              <BIcon name={r[1]} size={15} />
            </div>
          ))}
          <div style={{ width: 40, height: 40, borderRadius: 8, border: `1px dashed rgba(255,255,255,0.18)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)' }}>
            <BIcon name="plus" size={14} />
          </div>
        </div>
        {/* Right: live preview */}
        <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
          {rows.map((r,i)=>(
            <div key={r[0]} style={{ background: 'rgba(255,255,255,0.04)', border: i===0?`1px solid ${SB.accent}`:'1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 12px', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{r[0]}</div>
                {i===0 && <span style={{ fontSize: 9, color: SB.accent, fontWeight: 700, letterSpacing: 0.5 }}>FOCUSED</span>}
              </div>
              <div style={{ height: i===0?60:24, marginTop: 6, borderRadius: 4, background: 'rgba(255,255,255,0.05)' }} />
            </div>
          ))}
        </div>
      </div>
    </Phone>
  );
}

// ───── Screen 3: Section editor (Hero) ─────
function Editor_Basic() {
  return (
    <Phone>
      <SBTop back title="Hero" right={<><SBIcon icon="eye" /><span style={{ fontSize: 12, fontWeight: 600, color: SB.text, padding: '0 6px' }}>Save</span></>} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <SBSect title="Headline">
          <div style={{ padding: '0 14px 14px' }}>
            <div style={{ border: `1px solid ${SB.border}`, borderRadius: SB.radius, padding: '10px 12px', background: SB.bg, fontSize: 16, fontWeight: 500, letterSpacing: -0.3 }}>Slow coffee, fast smiles.</div>
          </div>
        </SBSect>
        <SBSect title="Subhead">
          <div style={{ padding: '0 14px 14px' }}>
            <div style={{ border: `1px solid ${SB.border}`, borderRadius: SB.radius, padding: '10px 12px', background: SB.bg, fontSize: 13, color: SB.text2, minHeight: 60 }}>
              Single-origin pour-overs and pastries baked daily on Maple Street.
            </div>
          </div>
        </SBSect>
        <SBSect title="Primary CTA">
          <BlockRow icon="external-link" title="See the menu" meta="→ /menu" />
        </SBSect>
        <SBSect title="Background">
          <BlockRow icon="image" title="storefront-morning.jpg" meta="2400 × 1600 · 312 KB" />
        </SBSect>
        <SBSect title="Layout">
          <div style={{ padding: '0 14px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {['Centered','Split','Full bleed'].map((l,i)=>(
              <div key={l} style={{ aspectRatio: '1', border: `1px solid ${i===0?SB.text:SB.border}`, borderRadius: SB.radius, background: i===0?SB.muted:SB.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, color: SB.text2 }}>
                <div style={{ width: 28, height: 18, background: SB.borderS, borderRadius: 2 }} />
                {l}
              </div>
            ))}
          </div>
        </SBSect>
      </div>
    </Phone>
  );
}

function Editor_Refined() {
  return (
    <Phone bg={SB.surface}>
      <SBTop back title="Hero" sub="Home / Section 1" right={<button style={{ height: 28, padding: '0 11px', borderRadius: 6, border: 'none', background: SB.text, color: SB.onPri, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Save</button>} />
      <div style={{ padding: '10px 12px 0', borderBottom: `1px solid ${SB.border}`, background: SB.surface, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 200, height: 130, borderRadius: 6, overflow: 'hidden', border: `1px solid ${SB.border}`, position: 'relative' }}>
            <SitePreview w={200} h={130} />
            <div style={{ position: 'absolute', inset: 0, border: `2px solid ${SB.accent}`, borderRadius: 6, pointerEvents: 'none' }} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, padding: '8px 0 6px' }}>
          {['Content','Style','Layout'].map((t,i)=>(
            <span key={t} style={{ height: 26, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: i===0?SB.text:SB.sec, background: i===0?SB.bg:'transparent', border: i===0?`1px solid ${SB.border}`:'none', display: 'inline-flex', alignItems: 'center' }}>{t}</span>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, padding: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <SBLab>Headline</SBLab>
            <span style={{ fontSize: 10, color: SB.accent, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}><BIcon name="sparkles" size={10} /> Rewrite</span>
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.4, lineHeight: 1.2 }}>Slow coffee, fast smiles.</div>
        </div>
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, padding: 12, marginBottom: 10 }}>
          <SBLab>Subhead</SBLab>
          <div style={{ fontSize: 13, color: SB.text2, marginTop: 6, lineHeight: 1.45 }}>Single-origin pour-overs and pastries baked daily on Maple Street.</div>
        </div>
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, overflow: 'hidden' }}>
          <BlockRow icon="external-link" title="Primary CTA" meta="See the menu → /menu" />
          <BlockRow icon="image" title="Background image" meta="storefront-morning.jpg" last />
        </div>
      </div>
    </Phone>
  );
}

function Editor_Experimental() {
  // Inline tap-to-edit on a live phone-within-phone preview
  return (
    <Phone bg={SB.surface}>
      <SBTop back title="Live edit" sub="Tap any element" right={<><SBIcon icon="undo" /><SBIcon icon="redo" /></>} />
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {/* live canvas */}
        <div style={{ flex: 1, padding: '14px 14px 0', overflow: 'auto', background: SB.surface }}>
          <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${SB.border}` }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>MAPLE COFFEE</span>
              <span style={{ fontSize: 9, color: SB.sec }}>Menu · About · Visit</span>
            </div>
            {/* selected hero */}
            <div style={{ position: 'relative', padding: '20px 16px 22px', border: `2px solid ${SB.accent}`, margin: -1 }}>
              <span style={{ position: 'absolute', top: -10, left: 8, background: SB.accent, color: '#fff', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, padding: '1px 6px', borderRadius: 3 }}>HERO · h1</span>
              <div style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.05, letterSpacing: -0.6, position: 'relative' }}>
                Slow coffee,<br/>fast smiles.
                <span style={{ position: 'absolute', right: -8, top: -2, width: 2, height: 26, background: SB.accent, animation: 'none' }} />
              </div>
              <div style={{ fontSize: 11, color: SB.sec, marginTop: 8, lineHeight: 1.45 }}>Single-origin pour-overs and pastries baked daily on Maple Street.</div>
              <div style={{ marginTop: 10 }}>
                <span style={{ display: 'inline-flex', height: 28, padding: '0 12px', borderRadius: 4, background: SB.text, color: SB.onPri, fontSize: 11, fontWeight: 600, alignItems: 'center' }}>See the menu →</span>
              </div>
            </div>
            <div style={{ padding: '14px 16px', borderTop: `1px solid ${SB.border}`, fontSize: 10, letterSpacing: 0.5, color: SB.sec, fontWeight: 600 }}>TODAY</div>
            <div style={{ padding: '0 16px 14px', display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 5, fontSize: 10.5, color: SB.text2 }}>
              <span>Drip · 12oz</span><span style={{ fontFamily: SB.mono }}>$4</span>
              <span>Cortado</span><span style={{ fontFamily: SB.mono }}>$5</span>
            </div>
          </div>
        </div>
        {/* Floating contextual edit bar */}
        <div style={{ margin: 12, padding: '10px 12px', background: '#1c1917', color: '#fff', borderRadius: SB.radiusLg, display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.18)' }}>
          <span style={{ fontSize: 9, color: SB.accent, fontWeight: 700, letterSpacing: 0.5, padding: '2px 5px', background: 'rgba(161,101,68,0.18)', borderRadius: 3 }}>H1</span>
          <BIcon name="bold" size={14} color="rgba(255,255,255,0.85)" />
          <BIcon name="italic" size={14} color="rgba(255,255,255,0.5)" />
          <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
          <BIcon name="align-left" size={14} color="rgba(255,255,255,0.5)" />
          <BIcon name="align-center" size={14} color="rgba(255,255,255,0.85)" />
          <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
          <BIcon name="sparkles" size={14} color={SB.accent} />
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, fontWeight: 600 }}>Done</span>
        </div>
      </div>
    </Phone>
  );
}

// ───── Screen 4: Theme picker ─────
function Theme_Basic() {
  const themes = [
    ['Mono','mono','Inter · Mono'],
    ['Cream','cream','Georgia · serif'],
    ['Forest','forest','Inter · sans'],
    ['Paper','paper','Mix · accent'],
  ];
  return (
    <Phone>
      <SBTop back title="Theme" right={<span style={{ fontSize: 12, fontWeight: 600, padding: '0 6px' }}>Apply</span>} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <SBSect title="Presets">
          <div style={{ padding: '0 14px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {themes.map(([n,t,f],i)=>(
              <div key={n} style={{ border: `${i===0?2:1}px solid ${i===0?SB.text:SB.border}`, borderRadius: SB.radiusLg, overflow: 'hidden', background: SB.bg }}>
                <SitePreview theme={t} w={150} h={170} />
                <div style={{ padding: '8px 10px', borderTop: `1px solid ${SB.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{n}</div>
                  <div style={{ fontSize: 10, color: SB.sec, marginTop: 1 }}>{f}</div>
                </div>
              </div>
            ))}
          </div>
        </SBSect>
      </div>
    </Phone>
  );
}

function Theme_Refined() {
  return (
    <Phone bg={SB.surface}>
      <SBTop back title="Theme" sub="Cream · Georgia" right={<button style={{ height: 28, padding: '0 11px', borderRadius: 6, border: 'none', background: SB.text, color: SB.onPri, fontSize: 12, fontWeight: 600 }}>Apply</button>} />
      {/* large preview */}
      <div style={{ padding: '14px 14px 10px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        <div style={{ border: `1px solid ${SB.border}`, padding: 6, borderRadius: 8, background: SB.bg }}>
          <SitePreview theme="cream" w={200} h={250} />
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 12px' }}>
        <div style={{ display: 'flex', gap: 6, padding: '4px 0 12px', justifyContent: 'center' }}>
          {['mono','cream','forest','paper'].map((t,i)=>(
            <div key={t} style={{ width: 32, height: 32, borderRadius: 999, border: i===1?`2px solid ${SB.text}`:`1px solid ${SB.border}`, background: t==='mono'?'#fafaf9':t==='cream'?'#f5ede4':t==='forest'?'#1f2a23':'#ffffff' }} />
          ))}
        </div>
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, padding: 12, marginBottom: 10 }}>
          <SBLab>Palette</SBLab>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {['#f5ede4','#3d2c1f','#7a4a2a','#e8d8c8','#1c1917'].map(c=>(
              <div key={c} style={{ flex: 1, aspectRatio: '1', borderRadius: 4, background: c, border: `1px solid ${SB.border}` }} />
            ))}
          </div>
        </div>
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, padding: 12 }}>
          <SBLab>Type</SBLab>
          <div style={{ marginTop: 8, fontFamily: 'Georgia, serif' }}>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Headline · Georgia</div>
            <div style={{ fontSize: 12, color: SB.sec, marginTop: 4 }}>Body · Georgia 14/22</div>
          </div>
        </div>
      </div>
    </Phone>
  );
}

function Theme_Experimental() {
  // Generative — sliders mutate the theme in real time
  return (
    <Phone bg="#1c1917">
      <div style={{ color: '#fff' }}><StatBar dark /></div>
      <div style={{ padding: '6px 14px 8px', display: 'flex', alignItems: 'center', gap: 10, color: '#fff', flexShrink: 0 }}>
        <button style={{ width: 32, height: 32, borderRadius: SB.radius, background: 'transparent', border: 'none', color: '#fff' }}><BIcon name="chevron-left" size={18} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Generate theme</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Cmd-Z to undo</div>
        </div>
        <BIcon name="sparkles" size={16} color={SB.accent} />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 14px 14px' }}>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <SitePreview theme="paper" w={170} h={210} />
          </div>
        </div>
        {[
          ['Warmth', 0.7],
          ['Density', 0.45],
          ['Contrast', 0.85],
          ['Roundness', 0.2],
        ].map(([l,v])=>(
          <div key={l} style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              <span>{l}</span><span style={{ fontFamily: SB.mono, color: SB.accent }}>{(v*100).toFixed(0)}</span>
            </div>
            <div style={{ height: 4, marginTop: 7, background: 'rgba(255,255,255,0.1)', borderRadius: 2, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${v*100}%`, background: SB.accent, borderRadius: 2 }} />
              <div style={{ position: 'absolute', left: `calc(${v*100}% - 7px)`, top: -5, width: 14, height: 14, borderRadius: 999, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </div>
          </div>
        ))}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, height: 38, borderRadius: 6, background: SB.accent, border: 'none', color: '#fff', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><BIcon name="refresh-cw" size={14} /> Re-roll</button>
          <button style={{ flex: 1, height: 38, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontWeight: 600, fontSize: 13 }}>Apply</button>
        </div>
      </div>
    </Phone>
  );
}

// ───── Screen 5: Image picker sheet ─────
function Image_Basic() {
  const tiles = ['#d6d3d1','#e7e5e4','#a8a29e','#78716c','#d6d3d1','#e7e5e4','#a8a29e','#78716c','#d6d3d1'];
  return (
    <Phone bg={SB.surface}>
      <SBTop back title="Choose image" right={<SBIcon icon="search" />} />
      <div style={{ display: 'flex', borderBottom: `1px solid ${SB.border}`, background: SB.bg, flexShrink: 0 }}>
        {['Library','BizOps','Unsplash','Upload'].map((t,i)=>(
          <div key={t} style={{ flex: 1, padding: '12px 0', textAlign: 'center', fontSize: 12.5, fontWeight: i===0?600:500, color: i===0?SB.text:SB.sec, borderBottom: i===0?`2px solid ${SB.text}`:'2px solid transparent' }}>{t}</div>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 6 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          {tiles.map((c,i)=>(
            <div key={i} style={{ aspectRatio: '1', background: c, borderRadius: 3, position: 'relative' }}>
              {i===0 && <div style={{ position: 'absolute', inset: 0, border: `2px solid ${SB.text}`, borderRadius: 3 }}><span style={{ position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 999, background: SB.text, color: SB.onPri, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span></div>}
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: 12, borderTop: `1px solid ${SB.border}`, background: SB.bg, flexShrink: 0 }}>
        <button style={{ width: '100%', height: 40, borderRadius: SB.radius, background: SB.text, color: SB.onPri, border: 'none', fontSize: 13, fontWeight: 600 }}>Use selected</button>
      </div>
    </Phone>
  );
}

function Image_Refined() {
  return (
    <Phone bg={SB.surface}>
      <SBTop back title="Library" sub="42 images · 12 MB" right={<><SBIcon icon="search" /><SBIcon icon="upload" /></>} />
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', overflow: 'auto', background: SB.surface, borderBottom: `1px solid ${SB.border}`, flexShrink: 0 }}>
        {['All','Hero','Product','Team','Food'].map((t,i)=>(
          <span key={t} style={{ height: 26, padding: '0 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', background: i===0?SB.text:SB.bg, color: i===0?SB.onPri:SB.text2, border: i===0?'none':`1px solid ${SB.border}`, flexShrink: 0 }}>{t}</span>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <div style={{ aspectRatio: '16/10', background: '#a8a29e', borderRadius: 6, marginBottom: 4, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #a8a29e, #78716c)' }} />
          <div style={{ position: 'absolute', top: 8, left: 8, padding: '3px 7px', borderRadius: 4, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', color: '#fff', fontSize: 10, fontWeight: 600 }}>USING IN HERO</div>
        </div>
        <div style={{ fontSize: 11, color: SB.sec, marginBottom: 10, fontFamily: SB.mono }}>storefront-morning.jpg · 2400×1600</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {Array.from({length: 12}).map((_,i)=>{
            const colors = ['#d6d3d1','#e7e5e4','#a8a29e','#78716c'];
            return <div key={i} style={{ aspectRatio: '1', background: colors[i%4], borderRadius: 4 }} />;
          })}
        </div>
      </div>
    </Phone>
  );
}

function Image_Experimental() {
  // AI prompt → generated images
  return (
    <Phone bg="#1c1917">
      <div style={{ color: '#fff' }}><StatBar dark /></div>
      <div style={{ padding: '6px 14px 8px', display: 'flex', alignItems: 'center', gap: 10, color: '#fff', flexShrink: 0 }}>
        <button style={{ width: 32, height: 32, borderRadius: SB.radius, background: 'transparent', border: 'none', color: '#fff' }}><BIcon name="x" size={18} /></button>
        <div style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Generate</div>
        <BIcon name="sparkles" size={16} color={SB.accent} />
      </div>
      <div style={{ padding: '0 14px 12px', flexShrink: 0 }}>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 13, color: '#fff', lineHeight: 1.4 }}>Sun-drenched coffee shop interior with warm wood tones and morning light through large windows</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999, padding: '2px 7px' }}>16:10</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999, padding: '2px 7px' }}>Photo</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999, padding: '2px 7px' }}>+ Brand</span>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 14px 14px' }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.6, fontWeight: 700, marginBottom: 8 }}>4 RESULTS</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            'linear-gradient(135deg,#c9a87a,#7a4a2a)',
            'linear-gradient(160deg,#e8d8c8,#a16544)',
            'linear-gradient(120deg,#5a3a25,#a16544)',
            'linear-gradient(180deg,#f5ede4,#c9a87a)',
          ].map((g,i)=>(
            <div key={i} style={{ aspectRatio: '1', borderRadius: 6, background: g, position: 'relative', border: i===0?`1.5px solid ${SB.accent}`:'1px solid rgba(255,255,255,0.1)' }}>
              {i===0 && <div style={{ position: 'absolute', top: 5, right: 5, width: 18, height: 18, borderRadius: 999, background: SB.accent, color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>}
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: 12, flexShrink: 0 }}>
        <button style={{ width: '100%', height: 40, borderRadius: 6, background: SB.accent, border: 'none', color: '#fff', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><BIcon name="sparkles" size={14} /> Generate 4 more</button>
      </div>
    </Phone>
  );
}

Object.assign(window, {
  Sections_Basic, Sections_Refined, Sections_Experimental,
  Editor_Basic, Editor_Refined, Editor_Experimental,
  Theme_Basic, Theme_Refined, Theme_Experimental,
  Image_Basic, Image_Refined, Image_Experimental,
});
