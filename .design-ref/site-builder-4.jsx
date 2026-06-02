// ═══════════════════════════════════════════════════════════
// BizOps · Site Builder — screens 8 + 9 + AI gen menu
// ═══════════════════════════════════════════════════════════

// ───── Screen 8: Empty / first-run ─────
function Empty_Basic() {
  return (
    <Phone>
      <SBTop title="Site" />
      <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 16 }}>
        <div style={{ width: 56, height: 56, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, display: 'flex', alignItems: 'center', justifyContent: 'center', background: SB.muted }}>
          <BIcon name="globe" size={24} color={SB.text2} />
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.3 }}>No site yet</div>
          <div style={{ fontSize: 12.5, color: SB.sec, marginTop: 6, lineHeight: 1.5, maxWidth: 240 }}>Your menu, hours, and team are already in BizOps. We can turn them into a site in seconds.</div>
        </div>
        <button style={{ height: 40, padding: '0 18px', borderRadius: SB.radius, background: SB.text, color: SB.onPri, border: 'none', fontSize: 13, fontWeight: 600 }}>Create site</button>
        <button style={{ background: 'none', border: 'none', color: SB.sec, fontSize: 12 }}>I have a domain →</button>
      </div>
      <MiniTab />
    </Phone>
  );
}

function Empty_Refined() {
  const tpl = [{ n: 'Café', t: 'cream', s: 'Menu · Hours · Photos' }, { n: 'Studio', t: 'mono', s: 'Services · Booking' }, { n: 'Shop', t: 'paper', s: 'Products · Cart' }];
  return (
    <Phone bg={SB.surface}>
      <SBTop title="Choose a starting point" sub="You can change everything later" />
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <div style={{ background: SB.accentSoft, border: `1px solid ${SB.accentBorder || '#e6d4c0'}`, borderRadius: SB.radiusLg, padding: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <BIcon name="sparkles" size={16} color={SB.accent} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: SB.accentText }}>Build from BizOps data</div>
            <div style={{ fontSize: 11, color: '#7a5a40', marginTop: 1 }}>Menu · Hours · Team · 3 photos</div>
          </div>
          <BIcon name="chevron-right" size={14} color={SB.accent} />
        </div>
        <SBLab>Or pick a template</SBLab>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          {tpl.map((p,i)=>(
            <div key={p.n} style={{ background: SB.bg, border: `${i===0?2:1}px solid ${i===0?SB.text:SB.border}`, borderRadius: SB.radiusLg, overflow: 'hidden' }}>
              <SitePreview theme={p.t} w={150} h={170} />
              <div style={{ padding: '8px 10px', borderTop: `1px solid ${SB.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{p.n}</div>
                <div style={{ fontSize: 10, color: SB.sec, marginTop: 1 }}>{p.s}</div>
              </div>
            </div>
          ))}
          <div style={{ background: SB.bg, border: `1px dashed ${SB.borderS}`, borderRadius: SB.radiusLg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: SB.sec, fontSize: 11.5, fontWeight: 500, minHeight: 218 }}>
            <BIcon name="plus" size={18} /> Blank
          </div>
        </div>
      </div>
    </Phone>
  );
}

function Empty_Experimental() {
  return (
    <Phone bg="#1c1917">
      <div style={{ color: '#fff' }}><StatBar dark /></div>
      <div style={{ flex: 1, padding: '24px 20px', color: '#fff', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 11, color: SB.accent, letterSpacing: 0.8, fontWeight: 700, textTransform: 'uppercase' }}>New site</div>
        <div style={{ fontSize: 28, fontWeight: 600, marginTop: 8, letterSpacing: -0.6, lineHeight: 1.1 }}>Describe your<br/>shop. AI does the rest.</div>
        <div style={{ marginTop: 22, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: '#fff' }}>A quiet third-wave coffee shop on Maple Street. We roast beans on site and bake our own croissants every morning.</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <BIcon name="paperclip" size={13} color="rgba(255,255,255,0.5)" />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>3 logos · 1 photo</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10, fontFamily: SB.mono, color: 'rgba(255,255,255,0.4)' }}>198 / 500</span>
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['Pull from BizOps menu', 'Use brand colors', 'Generate photos'].map(c=>(
            <span key={c} style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 999, padding: '5px 10px', background: 'rgba(255,255,255,0.03)' }}>+ {c}</span>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button style={{ height: 46, borderRadius: 8, background: SB.accent, color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <BIcon name="sparkles" size={15} /> Generate site
        </button>
        <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>~ 30 seconds · 4 pages</div>
      </div>
    </Phone>
  );
}

// ───── Screen 9: Domain ─────
function Domain_Basic() {
  return (
    <Phone>
      <SBTop back title="Domain" />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <SBSect title="Current">
          <div style={{ padding: '14px 14px', borderTop: `1px solid ${SB.border}`, borderBottom: `1px solid ${SB.border}`, display: 'flex', alignItems: 'center', gap: 10, background: SB.bg }}>
            <BIcon name="globe" size={16} color={SB.text2} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, fontFamily: SB.mono }}>maplecoffee.shop</div>
              <div style={{ fontSize: 11, color: SB.ok, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: SB.ok }} /> Connected · SSL active
              </div>
            </div>
          </div>
        </SBSect>
        <SBSect title="Default">
          <BlockRow icon="link" title="maple-coffee.bizops.shop" meta="Always available" last />
        </SBSect>
        <SBSect title="DNS">
          <div style={{ padding: '12px 14px', borderTop: `1px solid ${SB.border}`, fontFamily: SB.mono, fontSize: 11, color: SB.text2, lineHeight: 1.7 }}>
            <div>A      192.0.2.42</div>
            <div>CNAME  www → maplecoffee.shop</div>
            <div>TXT    bizops-verify=8a4f…</div>
          </div>
        </SBSect>
        <div style={{ padding: 14 }}>
          <button style={{ width: '100%', height: 38, borderRadius: SB.radius, background: SB.bg, border: `1px solid ${SB.border}`, fontSize: 13, fontWeight: 500, color: SB.text2 }}>+ Add another domain</button>
        </div>
      </div>
    </Phone>
  );
}

function Domain_Refined() {
  return (
    <Phone bg={SB.surface}>
      <SBTop back title="Domain" sub="maplecoffee.shop" />
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: SB.radius, background: '#f0fdf4', border: `1px solid #bbf7d0`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: SB.ok }}>
              <BIcon name="check" size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, fontFamily: SB.mono, letterSpacing: -0.2 }}>maplecoffee.shop</div>
              <div style={{ fontSize: 11, color: SB.ok, marginTop: 2 }}>Connected · auto-renews Jan 2027</div>
            </div>
            <BIcon name="more-horizontal" size={16} color={SB.sec} />
          </div>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: SB.border, borderRadius: 4, overflow: 'hidden' }}>
            {[['SSL','Active',SB.ok],['DNS','Verified',SB.ok],['CDN','3 regions',SB.text2]].map(([l,v,c])=>(
              <div key={l} style={{ padding: '8px 10px', background: SB.bg, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: SB.sec, fontWeight: 700, letterSpacing: 0.6 }}>{l}</div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: c, marginTop: 3 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ padding: '10px 14px', background: SB.surface, borderBottom: `1px solid ${SB.border}` }}>
            <SBLab>Records</SBLab>
          </div>
          {[['A','@','192.0.2.42'],['CNAME','www','maplecoffee.shop'],['TXT','_bizops','verify=8a4f…']].map((r,i)=>(
            <div key={i} style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '60px 70px 1fr', gap: 8, fontFamily: SB.mono, fontSize: 11.5, alignItems: 'center', borderTop: i?`1px solid ${SB.border}`:'none' }}>
              <span style={{ color: SB.sec, fontWeight: 600 }}>{r[0]}</span>
              <span style={{ color: SB.text }}>{r[1]}</span>
              <span style={{ color: SB.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r[2]}</span>
            </div>
          ))}
        </div>
        <button style={{ width: '100%', height: 40, borderRadius: SB.radius, background: SB.bg, border: `1px solid ${SB.border}`, fontSize: 13, fontWeight: 500, color: SB.text2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <BIcon name="plus" size={14} /> Add another domain
        </button>
      </div>
    </Phone>
  );
}

function Domain_Experimental() {
  return (
    <Phone bg="#1c1917">
      <div style={{ color: '#fff' }}><StatBar dark /></div>
      <div style={{ padding: '6px 14px 8px', display: 'flex', alignItems: 'center', gap: 10, color: '#fff', flexShrink: 0 }}>
        <button style={{ width: 32, height: 32, background: 'transparent', border: 'none', color: '#fff' }}><BIcon name="x" size={18} /></button>
        <div style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Connect domain</div>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: SB.mono }}>2 / 3</span>
      </div>
      <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
        <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '66%', background: SB.accent, borderRadius: 2 }} />
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 14px 14px', color: '#fff' }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Update DNS at your registrar</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6, lineHeight: 1.5 }}>Add these two records. We'll detect them automatically.</div>
        {[['A','@','192.0.2.42','done'],['CNAME','www','maplecoffee.shop','waiting']].map((r,i)=>(
          <div key={i} style={{ marginTop: 14, background: 'rgba(255,255,255,0.04)', border: `1px solid ${r[3]==='done'?'rgba(52,211,153,0.4)':'rgba(255,255,255,0.12)'}`, borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: r[3]==='done'?'#34d399':SB.accent, letterSpacing: 0.8 }}>{r[3]==='done'?'VERIFIED':'WAITING'}</span>
              {r[3]==='waiting' && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 5, height: 5, borderRadius: 999, background: SB.accent }} />checking…</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '60px 60px 1fr auto', gap: 8, fontFamily: SB.mono, fontSize: 12 }}>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>{r[0]}</span>
              <span>{r[1]}</span>
              <span style={{ color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r[2]}</span>
              <BIcon name="copy" size={13} color="rgba(255,255,255,0.5)" />
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: 12, flexShrink: 0 }}>
        <button style={{ width: '100%', height: 44, borderRadius: 8, background: SB.accent, color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 600 }}>Check now</button>
      </div>
    </Phone>
  );
}

// ───── Screen 10: AI Generate Menu ─────
function AIMenu_Basic() {
  return (
    <Phone>
      <SBTop back title="AI · Generate menu" right={<SBIcon icon="sparkles" />} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: 14, borderBottom: `1px solid ${SB.border}` }}>
          <SBLab>Prompt</SBLab>
          <div style={{ marginTop: 6, padding: 10, border: `1px solid ${SB.border}`, borderRadius: SB.radius, fontSize: 13, color: SB.text2, lineHeight: 1.5 }}>
            Coffee + pastries. 12 items. Friendly. Show prices in USD.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {['12 items','USD','Friendly','+ Allergens'].map(c=>(
              <span key={c} style={{ fontSize: 11, color: SB.text2, border: `1px solid ${SB.border}`, borderRadius: 999, padding: '3px 8px', background: SB.bg }}>{c}</span>
            ))}
          </div>
        </div>
        <SBSect title="Generated">
          {[['Drip Coffee','Single-origin, brewed slow','$4'],['Cortado','2oz espresso · steamed milk','$5'],['Croissant','Hand-laminated, 81 layers','$4.5'],['Almond Latte','House almond, no syrup','$6']].map((r,i,a)=>(
            <div key={r[0]} style={{ padding: '12px 14px', borderTop: `1px solid ${SB.border}`, borderBottom: i===a.length-1?`1px solid ${SB.border}`:'none', background: SB.bg, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <BIcon name="sparkles" size={13} color={SB.accent} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{r[0]}</span>
                  <span style={{ fontFamily: SB.mono, fontSize: 12.5 }}>{r[2]}</span>
                </div>
                <div style={{ fontSize: 11.5, color: SB.sec, marginTop: 2 }}>{r[1]}</div>
              </div>
            </div>
          ))}
        </SBSect>
        <div style={{ padding: 14, display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, height: 38, borderRadius: SB.radius, border: `1px solid ${SB.border}`, background: SB.bg, fontSize: 13, fontWeight: 500 }}>Regenerate</button>
          <button style={{ flex: 1, height: 38, borderRadius: SB.radius, background: SB.text, color: SB.onPri, border: 'none', fontSize: 13, fontWeight: 600 }}>Use this</button>
        </div>
      </div>
    </Phone>
  );
}

function AIMenu_Refined() {
  return (
    <Phone bg={SB.surface}>
      <SBTop back title="Generate menu" sub="From your inventory" right={<SBIcon icon="more-horizontal" />} />
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <BIcon name="sparkles" size={14} color={SB.accent} />
            <SBLab>Tone</SBLab>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['Friendly',true],['Minimal',false],['Playful',false],['Refined',false]].map(([t,a])=>(
              <span key={t} style={{ height: 26, padding: '0 11px', borderRadius: 999, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', background: a?SB.text:SB.bg, color: a?SB.onPri:SB.text2, border: a?'none':`1px solid ${SB.border}` }}>{t}</span>
            ))}
          </div>
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[['Items','12'],['Sections','3'],['Prices','USD']].map(([l,v])=>(
              <div key={l} style={{ padding: '8px 10px', background: SB.surface, borderRadius: 6, border: `1px solid ${SB.border}` }}>
                <div style={{ fontSize: 9, color: SB.sec, fontWeight: 700, letterSpacing: 0.5 }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2, fontFamily: l==='Items'?SB.mono:SB.font }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ padding: '10px 14px', background: SB.surface, borderBottom: `1px solid ${SB.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: SB.accent, padding: '2px 5px', background: SB.accentSoft, borderRadius: 3 }}>AI</span>
              <SBLab>Coffee · 4 items</SBLab>
            </div>
            <span style={{ fontSize: 10, color: SB.sec, fontFamily: SB.mono }}>4.2s · gpt-4</span>
          </div>
          {[['Drip','Brewed slow, single-origin','$4',true],['Cortado','2oz espresso, steamed milk','$5',false],['Almond Latte','House almond milk','$6',false],['Cold Brew','24-hour steep','$5',true]].map((r,i,a)=>(
            <div key={r[0]} style={{ padding: '11px 14px', borderTop: i?`1px solid ${SB.border}`:'none', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 18, height: 18, borderRadius: 4, border: r[3]?'none':`1.5px solid ${SB.borderS}`, background: r[3]?SB.text:'transparent', color: SB.onPri, fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{r[3]?'✓':''}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r[0]}</div>
                <div style={{ fontSize: 11.5, color: SB.sec, marginTop: 1 }}>{r[1]}</div>
              </div>
              <span style={{ fontFamily: SB.mono, fontSize: 13, fontWeight: 600 }}>{r[2]}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: 10, background: SB.accentSoft, border: `1px solid ${SB.accentBorder || '#e6d4c0'}`, borderRadius: SB.radiusLg, display: 'flex', gap: 8, alignItems: 'center', fontSize: 11.5, color: SB.accentText }}>
          <BIcon name="info" size={13} color={SB.accent} />
          Prices pulled from BizOps inventory · last sync 2h ago
        </div>
      </div>
      <div style={{ padding: 12, borderTop: `1px solid ${SB.border}`, background: SB.bg, flexShrink: 0, display: 'flex', gap: 8 }}>
        <button style={{ flex: 1, height: 42, borderRadius: 6, border: `1px solid ${SB.border}`, background: SB.bg, fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><BIcon name="refresh-cw" size={13}/> Regenerate</button>
        <button style={{ flex: 1.4, height: 42, borderRadius: 6, background: SB.text, color: SB.onPri, border: 'none', fontSize: 13, fontWeight: 600 }}>Apply 9 selected</button>
      </div>
    </Phone>
  );
}

function AIMenu_Experimental() {
  // Streaming generation — shows tokens flowing in
  return (
    <Phone bg="#1c1917">
      <div style={{ color: '#fff' }}><StatBar dark /></div>
      <div style={{ padding: '6px 14px 8px', display: 'flex', alignItems: 'center', gap: 10, color: '#fff', flexShrink: 0 }}>
        <button style={{ width: 32, height: 32, background: 'transparent', border: 'none', color: '#fff' }}><BIcon name="chevron-left" size={18} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Generating menu</div>
          <div style={{ fontSize: 11, color: SB.accent, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: SB.accent }} /> writing · 2.1s
          </div>
        </div>
        <BIcon name="sparkles" size={16} color={SB.accent} />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 14px 14px', color: '#fff' }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.6, fontWeight: 700, marginBottom: 8 }}>COFFEE · 4 ITEMS</div>
        {[
          ['Drip','Brewed slow, single-origin','$4',1],
          ['Cortado','2oz espresso, steamed milk','$5',1],
          ['Almond Latte','House almond, no syrup','$6',1],
          ['Cold Brew','Twenty-four hour st','',0.4],
        ].map((r,i)=>(
          <div key={i} style={{ marginBottom: 10, padding: 12, background: 'rgba(255,255,255,0.04)', border: `1px solid ${r[3]<1?SB.accent+'80':'rgba(255,255,255,0.1)'}`, borderRadius: 8, opacity: r[3] }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{r[0]}</span>
              <span style={{ fontFamily: SB.mono, fontSize: 13 }}>{r[2]}</span>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 3, lineHeight: 1.5 }}>
              {r[1]}{r[3]<1 && <span style={{ display: 'inline-block', width: 7, height: 13, background: SB.accent, marginLeft: 2, verticalAlign: -1 }} />}
            </div>
          </div>
        ))}
        <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-flex', gap: 3 }}>
            <span style={{ width: 4, height: 4, background: 'rgba(255,255,255,0.6)', borderRadius: 999 }}/>
            <span style={{ width: 4, height: 4, background: 'rgba(255,255,255,0.4)', borderRadius: 999 }}/>
            <span style={{ width: 4, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 999 }}/>
          </span>
          generating Pastries…
        </div>
      </div>
      <div style={{ padding: 12, flexShrink: 0, display: 'flex', gap: 8 }}>
        <button style={{ flex: 1, height: 40, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 13, fontWeight: 600 }}>Stop</button>
        <button style={{ flex: 1.4, height: 40, borderRadius: 6, background: SB.accent, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600 }}>Apply as it writes</button>
      </div>
    </Phone>
  );
}

Object.assign(window, {
  Empty_Basic, Empty_Refined, Empty_Experimental,
  Domain_Basic, Domain_Refined, Domain_Experimental,
  AIMenu_Basic, AIMenu_Refined, AIMenu_Experimental,
});
