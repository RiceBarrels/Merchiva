// Site Builder — Screens 3 (section editor) + 4 (theme picker) + 5 (image picker sheet)

// ═══════════════ Screen 3 · Section editor (Hero) ═══════════════
function S3_Basic() {
  return (
    <Phone>
      <SBTop title="Hero" sub="Home · section 1" back right={<><SBIcon icon="undo"/><SBIcon icon="check"/></>}/>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <SBSect title="Headline">
          <div style={{ padding: '10px 14px 14px', borderTop: `1px solid ${SB.border}`, borderBottom: `1px solid ${SB.border}`, background: SB.bg }}>
            <textarea defaultValue={'Slow coffee, fast smiles.'} rows={2} style={{ width: '100%', border: `1px solid ${SB.borderS}`, borderRadius: 6, padding: 10, fontSize: 17, fontWeight: 600, lineHeight: 1.2, color: SB.text, fontFamily: SB.font, resize: 'none', outline: 'none', letterSpacing: -0.4 }} readOnly/>
            <div style={{ fontSize: 11, color: SB.sec, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}><span>Max 60 chars</span><span style={{ fontFamily: SB.mono }}>26 / 60</span></div>
          </div>
        </SBSect>
        <SBSect title="Sub-headline">
          <div style={{ padding: '10px 14px 14px', borderTop: `1px solid ${SB.border}`, borderBottom: `1px solid ${SB.border}`, background: SB.bg }}>
            <div style={{ border: `1px solid ${SB.borderS}`, borderRadius: 6, padding: 10, fontSize: 13, color: SB.text2, lineHeight: 1.5 }}>Single-origin pour-overs and almond croissants baked daily on 4th Ave.</div>
          </div>
        </SBSect>
        <SBSect title="Image">
          <div style={{ padding: '12px 14px 14px', borderTop: `1px solid ${SB.border}`, borderBottom: `1px solid ${SB.border}`, background: SB.bg }}>
            <div style={{ height: 110, borderRadius: 6, background: 'linear-gradient(135deg, #c9a98c, #6b4e3c)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 8, right: 8, padding: '4px 8px', background: 'rgba(0,0,0,0.5)', borderRadius: 999, fontSize: 10.5, color: '#fff', fontWeight: 600 }}>Replace</div>
              <div style={{ position: 'absolute', bottom: 8, left: 8, fontSize: 10, color: 'rgba(255,255,255,0.7)', fontFamily: SB.mono }}>hero-pour.jpg · 1920×1080</div>
            </div>
          </div>
        </SBSect>
        <SBSect title="Call to action">
          <BlockRow icon="link" title="Button label" meta="See the menu →"/>
          <BlockRow icon="external-link" title="Links to" meta="/menu" last/>
        </SBSect>
        <div style={{ height: 80 }}/>
      </div>
      <div style={{ padding: '10px 14px 14px', borderTop: `1px solid ${SB.border}`, background: SB.bg, display: 'flex', gap: 8 }}>
        <button style={{ flex: 1, height: 44, borderRadius: 6, border: `1px solid ${SB.borderS}`, background: SB.bg, fontSize: 14, color: SB.text2, fontWeight: 500 }}>Cancel</button>
        <button style={{ flex: 1.6, height: 44, borderRadius: 6, border: 'none', background: SB.text, color: SB.onPri, fontSize: 14, fontWeight: 600 }}>Save section</button>
      </div>
    </Phone>
  );
}

function S3_Refined() {
  return (
    <Phone bg={SB.surface}>
      <SBTop title="Hero" sub="Slow coffee, fast smiles." back right={<><SBIcon icon="sparkles"/><SBIcon icon="more-horizontal"/></>}/>
      {/* live mini-preview rail */}
      <div style={{ padding: '10px 12px 0', flexShrink: 0 }}>
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 8, padding: 10, display: 'flex', gap: 10 }}>
          <div style={{ width: 70, flexShrink: 0, height: 90, borderRadius: 4, overflow: 'hidden', border: `1px solid ${SB.border}` }}>
            <SitePreview w={70} h={90} theme="paper"/>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 9.5, color: SB.sec, letterSpacing: 0.5, fontWeight: 700 }}>LIVE PREVIEW</div>
            <div style={{ fontSize: 12, color: SB.text2, marginTop: 4, lineHeight: 1.4 }}>Updates as you edit.</div>
            <div style={{ flex: 1 }}/>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ fontSize: 11, color: SB.text2, fontWeight: 600 }}>Mobile</span>
              <span style={{ fontSize: 11, color: SB.ter }}>·</span>
              <span style={{ fontSize: 11, color: SB.ter, fontWeight: 500 }}>Desktop</span>
            </div>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', paddingTop: 4 }}>
        <SBSect title="Content">
          <div style={{ background: SB.bg, borderTop: `1px solid ${SB.border}`, borderBottom: `1px solid ${SB.border}` }}>
            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${SB.border}` }}>
              <div style={{ fontSize: 10.5, color: SB.sec, fontWeight: 600, marginBottom: 6 }}>Headline</div>
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.4, lineHeight: 1.25 }}>Slow coffee,<br/>fast smiles.</div>
            </div>
            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${SB.border}` }}>
              <div style={{ fontSize: 10.5, color: SB.sec, fontWeight: 600, marginBottom: 6 }}>Sub-headline</div>
              <div style={{ fontSize: 13, color: SB.text2, lineHeight: 1.5 }}>Single-origin pour-overs and almond croissants baked daily on 4th Ave.</div>
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 64, height: 44, borderRadius: 4, background: 'linear-gradient(135deg, #c9a98c, #6b4e3c)', flexShrink: 0 }}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>hero-pour.jpg</div>
                <div style={{ fontSize: 11, color: SB.sec, fontFamily: SB.mono }}>1920 × 1080 · 420kb</div>
              </div>
              <span style={{ fontSize: 11.5, color: SB.text2, fontWeight: 600 }}>Replace</span>
            </div>
          </div>
        </SBSect>
        <SBSect title="Style">
          <BlockRow icon="align-left" title="Alignment" meta="Left"/>
          <BlockRow icon="palette" title="Background" meta="Cream · #f5ede4"/>
          <BlockRow icon="type" title="Heading size" meta="XL · 64px → 36px" last/>
        </SBSect>
        <SBSect title="Call to action">
          <BlockRow icon="link" title="See the menu →" meta="/menu · primary"/>
          <BlockRow icon="plus" title="Add secondary button" last/>
        </SBSect>
        <div style={{ height: 84 }}/>
      </div>
      <div style={{ padding: '10px 14px 14px', borderTop: `1px solid ${SB.border}`, background: SB.bg, display: 'flex', gap: 8 }}>
        <button style={{ width: 44, height: 44, borderRadius: 6, border: `1px solid ${SB.borderS}`, background: SB.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="trash-2" size={15} color={SB.text2}/></button>
        <button style={{ flex: 1, height: 44, borderRadius: 6, border: 'none', background: SB.text, color: SB.onPri, fontSize: 14, fontWeight: 600 }}>Save & continue</button>
      </div>
    </Phone>
  );
}

function S3_Exp() {
  return (
    <Phone bg={SB.text}>
      <div style={{ color: SB.onPri }}>
        <StatBar dark/>
      </div>
      <div style={{ padding: '4px 8px 12px', display: 'flex', alignItems: 'center', gap: 4, color: SB.onPri, borderBottom: `1px solid #2c2724` }}>
        <button style={{ width: 32, height: 32, borderRadius: SB.radius, border: 'none', background: 'transparent', color: SB.onPri, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="chevron-left" size={18}/></button>
        <div style={{ flex: 1, padding: '4px 4px 0' }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Hero · editing</div>
          <div style={{ fontSize: 11, color: '#a8a29e', fontFamily: SB.mono }}>home / sections[0]</div>
        </div>
        <span style={{ fontSize: 11, color: '#a8a29e' }}>Auto-saved</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 12px 12px', color: SB.onPri }}>
        {/* Live phone preview at top, edit-overlays */}
        <div style={{ background: '#fafaf9', borderRadius: 8, overflow: 'hidden', boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}>
          <div style={{ padding: '20px 14px 16px', position: 'relative', color: SB.text }}>
            <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 5, padding: '3px 7px', background: SB.accent, color: '#fff', borderRadius: 4, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4 }}>EDITING</div>
            <div style={{ position: 'absolute', top: 12, right: 12, fontSize: 9, color: SB.sec, fontFamily: SB.mono }}>HERO</div>
            <div style={{ marginTop: 16, position: 'relative', padding: 6, border: `1.5px dashed ${SB.accent}`, borderRadius: 4 }}>
              <div style={{ position: 'absolute', top: -10, left: -1, padding: '1px 6px', background: SB.accent, color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 3 }}>H1</div>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.05, letterSpacing: -0.6 }}>Slow coffee,<br/>fast smiles.</div>
            </div>
            <div style={{ marginTop: 8, padding: '4px 6px', border: `1px dashed ${SB.borderS}`, borderRadius: 4, fontSize: 11, color: SB.text2, lineHeight: 1.5 }}>Single-origin pour-overs and almond croissants baked daily.</div>
            <div style={{ marginTop: 10, display: 'inline-block', padding: '6px 12px', background: SB.text, color: SB.onPri, fontSize: 11, fontWeight: 600, borderRadius: 4 }}>See the menu →</div>
          </div>
        </div>
        {/* Inspector */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a8a29e', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6 }}>
            <span>SELECTED</span>
            <span style={{ color: SB.onPri }}>·</span>
            <span style={{ color: SB.onPri, fontFamily: SB.mono }}>h1.headline</span>
          </div>
          <div style={{ marginTop: 10, background: '#1a1614', border: `1px solid #2c2724`, borderRadius: 8, padding: '4px 0' }}>
            {[['Text','Slow coffee, fast smiles.'],['Font','Editorial New · 64'],['Weight','700 · Bold'],['Tracking','-0.6'],['Color','#1c1917']].map((r,i,a)=>(
              <div key={r[0]} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', borderBottom: i===a.length-1?'none':`1px solid #2c2724` }}>
                <span style={{ width: 80, fontSize: 11.5, color: '#a8a29e' }}>{r[0]}</span>
                <span style={{ flex: 1, fontSize: 12.5, color: SB.onPri, fontFamily: r[0]==='Text'?SB.font:SB.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r[1]}</span>
                <BIcon name="chevron-right" size={11} color="#57534e"/>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button style={{ flex: 1, height: 38, borderRadius: 6, border: '1px solid #2c2724', background: '#1a1614', color: SB.onPri, fontSize: 12.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><BIcon name="sparkles" size={13} color={SB.accent}/> AI rewrite</button>
            <button style={{ flex: 1, height: 38, borderRadius: 6, border: '1px solid #2c2724', background: '#1a1614', color: SB.onPri, fontSize: 12.5 }}>Variants</button>
          </div>
        </div>
      </div>
    </Phone>
  );
}

// ═══════════════ Screen 4 · Theme picker ═══════════════
const themes = [
  { id: 'mono',   name: 'Workshop',  sub: 'Inter · Achromatic',     swatches: ['#fafaf9','#1c1917','#78716c'], theme: 'mono' },
  { id: 'cream',  name: 'Drip',      sub: 'Georgia · Warm clay',    swatches: ['#f5ede4','#3d2c1f','#a16544'], theme: 'cream' },
  { id: 'forest', name: 'Pour-over', sub: 'IBM Plex · Forest',      swatches: ['#1f2a23','#e8f0ea','#7ab091'], theme: 'forest' },
  { id: 'paper',  name: 'Counter',   sub: 'Editorial · Paper',      swatches: ['#ffffff','#1c1917','#a16544'], theme: 'paper' },
];

function S4_Basic() {
  return (
    <Phone>
      <SBTop title="Theme" back right={<SBIcon icon="check"/>}/>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <SBSect title="Presets" count="04">
          {themes.map((t,i)=>(
            <div key={t.id} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, borderTop: `1px solid ${SB.border}`, borderBottom: i===themes.length-1?`1px solid ${SB.border}`:'none', background: i===1?SB.muted:SB.bg }}>
              <div style={{ display: 'flex' }}>
                {t.swatches.map((s,j)=>(
                  <div key={j} style={{ width: 18, height: 36, background: s, marginLeft: j===0?0:-3, border: `1px solid ${SB.border}`, borderRadius: j===0?'4px 0 0 4px':j===t.swatches.length-1?'0 4px 4px 0':0 }}/>
                ))}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</div>
                <div style={{ fontSize: 11.5, color: SB.sec, marginTop: 1 }}>{t.sub}</div>
              </div>
              {i===1 && <BIcon name="check" size={16} color={SB.text}/>}
            </div>
          ))}
        </SBSect>
        <SBSect title="Customize">
          <BlockRow icon="palette" title="Colors" meta="3 tokens"/>
          <BlockRow icon="type" title="Typography" meta="Georgia · Inter" last/>
        </SBSect>
      </div>
    </Phone>
  );
}

function S4_Refined() {
  return (
    <Phone bg={SB.surface}>
      <SBTop title="Theme" sub="Drip · Cream" back right={<SBIcon icon="check"/>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {themes.map((t,i)=>(
            <div key={t.id} style={{ background: SB.bg, border: `1.5px solid ${i===1?SB.text:SB.border}`, borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
              {i===1 && <div style={{ position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 999, background: SB.text, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}><BIcon name="check" size={11} color={SB.onPri}/></div>}
              <div style={{ height: 110, overflow: 'hidden', borderBottom: `1px solid ${SB.border}` }}>
                <SitePreview w={150} h={110} theme={t.theme}/>
              </div>
              <div style={{ padding: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t.name}</div>
                <div style={{ fontSize: 10.5, color: SB.sec, marginTop: 1 }}>{t.sub}</div>
                <div style={{ display: 'flex', marginTop: 8, gap: 0 }}>
                  {t.swatches.map((s,j)=>(<div key={j} style={{ width: 14, height: 14, background: s, marginLeft: j===0?0:-3, border: `1px solid ${SB.border}`, borderRadius: 999 }}/>))}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <SBLab>Customize</SBLab>
        </div>
        <div style={{ marginTop: 8, background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <BlockRow icon="palette" title="Color tokens" meta="Background, ink, accent"/>
          <BlockRow icon="type" title="Type pair" meta="Georgia → Inter"/>
          <BlockRow icon="layout-dashboard" title="Spacing scale" meta="Comfortable · 1.25" last/>
        </div>
      </div>
    </Phone>
  );
}

function S4_Exp() {
  return (
    <Phone bg={SB.surface}>
      <SBTop title="Compose" sub="Mix tokens · drag to reroll" back right={<><SBIcon icon="refresh-cw"/><SBIcon icon="check"/></>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 16px' }}>
        {/* full-bleed preview */}
        <div style={{ height: 200, borderRadius: 8, overflow: 'hidden', border: `1px solid ${SB.border}`, marginTop: 10 }}>
          <SitePreview w={350} h={200} theme="paper"/>
        </div>
        {/* tokens — interactive-feel */}
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
          <SBLab>Tokens · drag</SBLab>
          <span style={{ fontSize: 10.5, color: SB.accentText, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><BIcon name="sparkles" size={11}/> AI suggest</span>
        </div>
        <div style={{ marginTop: 8, background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {[['Background','#ffffff','Paper'],['Ink','#1c1917','Pitch'],['Accent','#a16544','Clay'],['Surface','#f5ede4','Cream']].map((r,i,a)=>(
            <div key={r[0]} style={{ padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: i===a.length-1?'none':`1px solid ${SB.border}` }}>
              <div style={{ width: 24, height: 24, borderRadius: 4, background: r[1], border: `1px solid ${SB.border}` }}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r[0]}</div>
                <div style={{ fontSize: 10.5, color: SB.sec, fontFamily: SB.mono }}>{r[1]} · {r[2]}</div>
              </div>
              <div style={{ width: 80, height: 4, borderRadius: 999, background: SB.border, position: 'relative' }}>
                <div style={{ position: 'absolute', left: `${20+i*20}%`, top: -4, width: 12, height: 12, borderRadius: 999, background: SB.bg, border: `2px solid ${SB.text}` }}/>
              </div>
            </div>
          ))}
        </div>
        {/* type pair */}
        <div style={{ marginTop: 14 }}>
          <SBLab>Type pair</SBLab>
        </div>
        <div style={{ marginTop: 8, padding: 12, background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 8 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700, letterSpacing: -0.4, lineHeight: 1 }}>Slow coffee.</div>
          <div style={{ fontSize: 11.5, color: SB.text2, marginTop: 6, lineHeight: 1.5 }}>The espresso pulls long, the chairs are wood, and the wifi is fast.</div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${SB.border}`, display: 'flex', gap: 8, fontSize: 10.5, color: SB.sec, fontFamily: SB.mono }}>
            <span>Display · <span style={{ color: SB.text }}>Editorial New</span></span>
            <span>·</span>
            <span>Body · <span style={{ color: SB.text }}>Inter</span></span>
          </div>
        </div>
      </div>
    </Phone>
  );
}

// ═══════════════ Screen 5 · Image picker sheet ═══════════════
function S5_Basic() {
  // Sheet over a blurred parent — render a faint phone behind
  return (
    <Phone bg={SB.surface}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: SB.surface, opacity: 0.5, filter: 'blur(2px)' }}>
          <SBTop title="Hero" back/>
          <div style={{ padding: 14 }}><div style={{ height: 100, background: SB.muted, borderRadius: 6 }}/></div>
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }}/>
        {/* sheet */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: SB.bg, borderRadius: '14px 14px 0 0', boxShadow: '0 -8px 32px rgba(0,0,0,0.15)', maxHeight: '80%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 0', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 36, height: 4, borderRadius: 999, background: SB.borderS }}/>
          </div>
          <div style={{ padding: '4px 14px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Replace image</span>
            <BIcon name="x" size={18} color={SB.sec}/>
          </div>
          <div style={{ padding: '0 14px', display: 'flex', gap: 8 }}>
            <button style={{ flex: 1, height: 40, borderRadius: 6, border: `1px solid ${SB.borderS}`, background: SB.bg, fontSize: 12.5, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><BIcon name="upload" size={13}/> Upload</button>
            <button style={{ flex: 1, height: 40, borderRadius: 6, border: `1px solid ${SB.borderS}`, background: SB.bg, fontSize: 12.5, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><BIcon name="link" size={13}/> URL</button>
            <button style={{ flex: 1, height: 40, borderRadius: 6, border: `1px solid ${SB.borderS}`, background: SB.bg, fontSize: 12.5, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><BIcon name="sparkles" size={13}/> AI</button>
          </div>
          <div style={{ padding: '14px 14px 8px' }}>
            <SBLab>Library · 12</SBLab>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '0 14px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {Array.from({length:9}).map((_,i)=>(
                <div key={i} style={{ aspectRatio: '1', background: `linear-gradient(${i*40}deg, hsl(${30+i*15} 35% ${55+(i%3)*5}%), hsl(${20+i*15} 25% 35%))`, borderRadius: 4, position: 'relative', border: i===2?`2px solid ${SB.text}`:'none' }}>
                  {i===2 && <div style={{ position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 999, background: SB.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="check" size={10} color={SB.onPri}/></div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Phone>
  );
}

function S5_Refined() {
  const tabs = ['Library','Unsplash','Brand','AI'];
  return (
    <Phone bg="rgba(0,0,0,0.4)">
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,15,10,0.55)', backdropFilter: 'blur(8px)' }}/>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 60, background: SB.bg, borderRadius: '14px 14px 0 0', boxShadow: '0 -8px 32px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 0', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 36, height: 4, borderRadius: 999, background: SB.borderS }}/>
          </div>
          <div style={{ padding: '0 14px 8px', display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Choose image</span>
            <span style={{ fontSize: 11, color: SB.sec, marginLeft: 8 }}>· hero-pour.jpg</span>
            <div style={{ flex: 1 }}/>
            <BIcon name="x" size={18} color={SB.sec}/>
          </div>
          <div style={{ padding: '4px 14px', display: 'flex', alignItems: 'center', gap: 8, height: 40, background: SB.muted, margin: '0 14px', borderRadius: 6 }}>
            <BIcon name="search" size={14} color={SB.sec}/>
            <span style={{ fontSize: 13, color: SB.sec }}>Search images…</span>
          </div>
          <div style={{ padding: '12px 14px 0', display: 'flex', gap: 16, borderBottom: `1px solid ${SB.border}` }}>
            {tabs.map((t,i)=>(
              <div key={t} style={{ paddingBottom: 10, fontSize: 13, color: i===0?SB.text:SB.sec, fontWeight: i===0?600:500, borderBottom: i===0?`2px solid ${SB.text}`:'2px solid transparent', marginBottom: -1 }}>{t}</div>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {Array.from({length:15}).map((_,i)=>(
                <div key={i} style={{ aspectRatio: '1', background: `linear-gradient(${i*40}deg, hsl(${30+i*12} 35% ${55+(i%3)*5}%), hsl(${20+i*8} 25% 30%))`, borderRadius: 4, position: 'relative', border: i===4?`2px solid ${SB.text}`:'none', overflow: 'hidden' }}>
                  {i===4 && <div style={{ position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 999, background: SB.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="check" size={10} color={SB.onPri}/></div>}
                  {i===0 && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '2px 4px', background: 'rgba(0,0,0,0.5)', fontSize: 8.5, color: '#fff', fontFamily: SB.mono }}>1920×1280</div>}
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: 12, borderTop: `1px solid ${SB.border}`, display: 'flex', gap: 8 }}>
            <button style={{ flex: 1, height: 40, borderRadius: 6, border: `1px solid ${SB.borderS}`, background: SB.bg, fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><BIcon name="upload" size={13}/> Upload</button>
            <button style={{ flex: 1.4, height: 40, borderRadius: 6, border: 'none', background: SB.text, color: SB.onPri, fontSize: 13, fontWeight: 600 }}>Use selection</button>
          </div>
        </div>
      </div>
    </Phone>
  );
}

function S5_Exp() {
  return (
    <Phone bg={SB.text}>
      <div style={{ color: SB.onPri, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <StatBar dark/>
        <div style={{ padding: '4px 8px 12px', display: 'flex', alignItems: 'center', gap: 4, color: SB.onPri }}>
          <button style={{ width: 32, height: 32, borderRadius: SB.radius, border: 'none', background: 'transparent', color: SB.onPri, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="x" size={18}/></button>
          <div style={{ flex: 1, padding: '4px 4px 0' }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>AI image</div>
            <div style={{ fontSize: 11, color: '#a8a29e' }}>Generate · v1.43</div>
          </div>
          <span style={{ fontSize: 11, color: SB.accent, fontWeight: 600 }}>4 of 50</span>
        </div>
        {/* prompt */}
        <div style={{ padding: '4px 12px 0' }}>
          <div style={{ background: '#1a1614', border: `1px solid #2c2724`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 9.5, color: '#a8a29e', letterSpacing: 0.5, fontWeight: 700 }}>PROMPT</div>
            <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5, color: SB.onPri }}>Pour-over coffee on a worn wooden counter, morning light, shallow depth of field, warm tones</div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid #2c2724`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10.5, color: SB.sec, fontFamily: SB.mono }}>16:9</span>
              <span style={{ fontSize: 10.5, color: SB.sec }}>·</span>
              <span style={{ fontSize: 10.5, color: SB.sec, fontFamily: SB.mono }}>Photo</span>
              <div style={{ flex: 1 }}/>
              <button style={{ height: 30, padding: '0 12px', borderRadius: 5, border: 'none', background: SB.accent, color: '#fff', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}><BIcon name="sparkles" size={11}/> Regenerate</button>
            </div>
          </div>
        </div>
        {/* candidates */}
        <div style={{ padding: '14px 12px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9.5, color: '#a8a29e', letterSpacing: 0.5, fontWeight: 700 }}>CANDIDATES</span>
          <span style={{ fontSize: 10.5, color: '#57534e', fontFamily: SB.mono }}>04</span>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[0,1,2,3].map(i=>(
              <div key={i} style={{ aspectRatio: '4/5', borderRadius: 6, background: `linear-gradient(${20+i*40}deg, hsl(${25+i*8} 40% ${55+(i%2)*8}%), hsl(${15} 30% 20%))`, position: 'relative', border: i===0?`2px solid ${SB.accent}`:'2px solid transparent', overflow: 'hidden' }}>
                {i===0 && <div style={{ position: 'absolute', top: 6, right: 6, padding: '3px 7px', background: SB.accent, color: '#fff', fontSize: 9.5, fontWeight: 700, borderRadius: 3, letterSpacing: 0.4 }}>USE</div>}
                <div style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 9, color: 'rgba(255,255,255,0.7)', fontFamily: SB.mono }}>v.{43+i}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: 12, borderTop: '1px solid #2c2724', display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, height: 42, borderRadius: 6, border: '1px solid #2c2724', background: '#1a1614', color: SB.onPri, fontSize: 12.5 }}>Edit prompt</button>
          <button style={{ flex: 1.4, height: 42, borderRadius: 6, border: 'none', background: SB.accent, color: '#fff', fontSize: 13, fontWeight: 600 }}>Use selected</button>
        </div>
      </div>
    </Phone>
  );
}

Object.assign(window, { S3_Basic, S3_Refined, S3_Exp, S4_Basic, S4_Refined, S4_Exp, S5_Basic, S5_Refined, S5_Exp });
