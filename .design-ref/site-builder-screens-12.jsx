// Site Builder — 9 screens × 3 variants. Compact (basic / refined / experimental).
// Each screen function returns a Phone() interior; use 375×812.

// ═══════════════ Screen 1 · Overview ═══════════════
function S1_Basic() {
  return (
    <Phone>
      <SBTop title="Website" sub="maple-coffee.shop" right={<><SBIcon icon="eye"/><SBIcon icon="more-horizontal"/></>}/>
      <div style={{ flex: 1, overflow: 'auto', background: SB.surface }}>
        <div style={{ padding: '14px 14px 0' }}>
          <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 12, color: SB.sec, marginBottom: 4 }}>Status</div>
                <PubPill state="live"/>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: SB.ter, letterSpacing: 0.4, fontWeight: 700, textTransform: 'uppercase' }}>Visits · 7d</div>
                <div style={{ fontSize: 22, fontWeight: 600, fontFamily: SB.mono, letterSpacing: -0.5 }}>1,284</div>
              </div>
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${SB.border}`, fontSize: 11.5, color: SB.sec, display: 'flex', justifyContent: 'space-between' }}>
              <span>Last published <span style={{ color: SB.text2 }}>3h ago</span></span>
              <span style={{ color: SB.warn, fontWeight: 600 }}>2 unpublished</span>
            </div>
          </div>
        </div>
        <SBSect title="Pages" count="4" action={{l:'Add', i:'plus'}}>
          <BlockRow icon="globe" title="Home" meta="/" badge={<PubPill state="live" compact/>}/>
          <BlockRow icon="utensils" title="Menu" meta="/menu · 8 sections"/>
          <BlockRow icon="info" title="About" meta="/about"/>
          <BlockRow icon="mail" title="Contact" meta="/contact" badge={<PubPill state="draft" compact/>} last/>
        </SBSect>
        <SBSect title="Theme">
          <BlockRow icon="palette" title="Drip — Cream" meta="Georgia · warm clay" last/>
        </SBSect>
        <SBSect title="Settings">
          <BlockRow icon="link" title="Domain" meta="maple-coffee.shop"/>
          <BlockRow icon="package" title="Live data" meta="Menu, hours, staff" last/>
        </SBSect>
        <div style={{ height: 24 }}/>
      </div>
      <MiniTab/>
    </Phone>
  );
}

function S1_Refined() {
  return (
    <Phone bg={SB.surface}>
      <SBTop title="Website" right={<><SBIcon icon="share"/><SBIcon icon="more-horizontal"/></>}/>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '12px 14px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg }}>
            <BIcon name="globe" size={14} color={SB.sec}/>
            <span style={{ flex: 1, fontFamily: SB.mono, fontSize: 12, color: SB.text2 }}>maple-coffee.shop</span>
            <BIcon name="external-link" size={13} color={SB.ter}/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, padding: 12 }}>
              <SBLab>Status</SBLab>
              <div style={{ marginTop: 6 }}><PubPill state="live"/></div>
              <div style={{ fontSize: 11, color: SB.sec, marginTop: 8 }}>Pub 3h ago</div>
            </div>
            <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, padding: 12 }}>
              <SBLab>Visits 7d</SBLab>
              <div style={{ fontSize: 22, fontWeight: 600, fontFamily: SB.mono, letterSpacing: -0.5, marginTop: 4 }}>1,284</div>
              <div style={{ fontSize: 11, color: SB.ok, marginTop: 4 }}>+18%</div>
            </div>
          </div>
        </div>
        <div style={{ padding: '4px 14px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#fffbeb', border: `1px solid #fde68a`, borderRadius: SB.radiusLg }}>
            <BIcon name="zap" size={13} color={SB.warn}/>
            <span style={{ fontSize: 12, color: '#78350f', flex: 1 }}>2 unpublished changes on Home</span>
            <span style={{ fontSize: 11.5, color: SB.warn, fontWeight: 600 }}>Review</span>
          </div>
        </div>
        <SBSect title="Pages" action={{l:'Add page', i:'plus'}}>
          <BlockRow icon="globe" title="Home" meta="/" badge={<PubPill state="draft" compact/>}/>
          <BlockRow icon="utensils" title="Menu" meta="/menu · 8 sections"/>
          <BlockRow icon="info" title="About" meta="/about"/>
          <BlockRow icon="mail" title="Contact" meta="/contact" last/>
        </SBSect>
        <SBSect title="Setup">
          <BlockRow icon="palette" title="Theme · Drip Cream" meta="Georgia · Warm clay"/>
          <BlockRow icon="link" title="Domain" meta="maple-coffee.shop · Verified"/>
          <BlockRow icon="package" title="Live data sources" meta="Menu, hours, team" last/>
        </SBSect>
        <div style={{ height: 24 }}/>
      </div>
      <MiniTab/>
    </Phone>
  );
}

function S1_Exp() {
  return (
    <Phone bg={SB.surface}>
      <SBTop title="MAPLE.SHOP" sub="Site · v.43 · last edit 3h" right={<><SBIcon icon="undo"/><SBIcon icon="eye"/></>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px 16px' }}>
        {/* Hero card with mini preview */}
        <div style={{ background: SB.text, color: SB.onPri, borderRadius: 10, padding: '14px 14px 0', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 9.5, color: '#a8a29e', letterSpacing: 0.6, fontWeight: 700 }}>YOUR SITE</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>Maple Coffee</div>
              <div style={{ fontSize: 11, color: '#a8a29e', fontFamily: SB.mono, marginTop: 2 }}>maple-coffee.shop</div>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 9px', borderRadius: 999, background: 'rgba(34,197,94,0.18)', color: '#86efac', fontSize: 11, fontWeight: 600 }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: '#22c55e' }}/>Live
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 11, color: '#a8a29e' }}>
            <span>1,284 visits · <span style={{ color: SB.onPri }}>+18%</span></span>
            <span>·</span>
            <span>4 pages</span>
          </div>
          <div style={{ position: 'relative', marginTop: 10, height: 80, marginRight: -14 }}>
            <div style={{ position: 'absolute', right: 0, top: 0, width: 110, height: 130, borderRadius: 6, overflow: 'hidden', boxShadow: '0 6px 20px rgba(0,0,0,0.4)', transform: 'rotate(-3deg) translateY(4px)', border: '1px solid #44403c' }}>
              <SitePreview w={110} h={130} theme="cream"/>
            </div>
            <div style={{ position: 'absolute', right: 96, top: 12, width: 96, height: 116, borderRadius: 6, overflow: 'hidden', opacity: 0.6, transform: 'rotate(2deg)', border: '1px solid #44403c' }}>
              <SitePreview w={96} h={116} theme="forest"/>
            </div>
          </div>
        </div>
        {/* Quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          {[['edit-3','Edit pages'],['palette','Theme'],['sparkles','AI compose'],['link','Domain']].map(([i,l])=>(
            <div key={l} style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 8, padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: i==='sparkles'?SB.accentSoft:SB.muted, border: `1px solid ${i==='sparkles'?SB.accentBorder:SB.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: i==='sparkles'?SB.accentText:SB.text2 }}><BIcon name={i} size={13}/></div>
              <span style={{ fontSize: 12.5, fontWeight: 500 }}>{l}</span>
            </div>
          ))}
        </div>
        {/* Recently edited */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <SBLab>Recent edits</SBLab>
            <span style={{ fontSize: 10.5, color: SB.ter, fontFamily: SB.mono }}>03</span>
          </div>
          <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {[['utensils','Menu · Featured drinks','Section reordered','12m'],['type','Home · Hero copy','"Slow coffee, fast smiles."','1h'],['image','About · Banner photo','Replaced','3h']].map((r,i,a)=>(
              <div key={r[1]} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: i===a.length-1?'none':`1px solid ${SB.border}` }}>
                <div style={{ width: 22, height: 22, borderRadius: 4, background: SB.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', color: SB.sec }}><BIcon name={r[0]} size={11}/></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r[1]}</div>
                  <div style={{ fontSize: 11, color: SB.sec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r[2]}</div>
                </div>
                <span style={{ fontSize: 10.5, color: SB.ter, fontFamily: SB.mono }}>{r[3]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <MiniTab/>
    </Phone>
  );
}

// ═══════════════ Screen 2 · Section List ═══════════════
function S2_Basic() {
  const blocks = [['type','Hero','"Slow coffee, fast smiles."'],['utensils','Menu · Featured','3 items shown'],['clock','Hours','Pulled from BizOps'],['image','Gallery','6 photos'],['mail','Contact','Form + map'],['info','About','280 words']];
  return (
    <Phone>
      <SBTop title="Home" sub="6 sections · /" back right={<SBIcon icon="eye"/>}/>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <SBSect title="Sections" action={{l:'Add', i:'plus'}}>
          {blocks.map((b,i)=>(
            <BlockRow key={b[1]} icon={b[0]} title={b[1]} meta={b[2]} drag last={i===blocks.length-1}/>
          ))}
        </SBSect>
        <div style={{ padding: '20px 14px' }}>
          <button style={{ width: '100%', height: 40, borderRadius: 6, border: `1px dashed ${SB.borderS}`, background: 'transparent', color: SB.sec, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13 }}>
            <BIcon name="plus" size={14}/> Add section
          </button>
        </div>
      </div>
    </Phone>
  );
}

function S2_Refined() {
  const blocks = [['type','Hero','"Slow coffee, fast smiles."',true],['utensils','Featured menu','3 items',false],['clock','Hours','Live · BizOps',false],['image','Gallery','6 photos',true],['mail','Contact','Form + map',false]];
  return (
    <Phone bg={SB.surface}>
      <SBTop title="Home" sub="/" back right={<><SBIcon icon="eye"/><SBIcon icon="more-horizontal"/></>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <SBLab>Sections</SBLab>
          <span style={{ fontSize: 10.5, color: SB.ter, fontFamily: SB.mono }}>05</span>
          <div style={{ flex: 1 }}/>
          <span style={{ fontSize: 11.5, color: SB.text2, fontWeight: 600 }}>Reorder</span>
        </div>
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {blocks.map((b,i,a)=>(
            <div key={b[1]} style={{ display: 'flex', alignItems: 'stretch', gap: 0, borderBottom: i===a.length-1?'none':`1px solid ${SB.border}`, background: i===2?'#fafaf9':SB.bg }}>
              <div style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: SB.ter, borderRight: `1px solid ${SB.border}`, fontFamily: SB.mono, fontSize: 10 }}>{String(i+1).padStart(2,'0')}</div>
              <div style={{ flex: 1, padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 5, background: SB.muted, border: `1px solid ${SB.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: SB.text2 }}><BIcon name={b[0]} size={13}/></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500 }}>{b[1]}</span>
                    {b[3] && <span style={{ width: 5, height: 5, borderRadius: 999, background: SB.warn }}/>}
                  </div>
                  <div style={{ fontSize: 11.5, color: SB.sec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b[2]}</div>
                </div>
                <BIcon name="chevron-right" size={13} color={SB.ter}/>
              </div>
            </div>
          ))}
        </div>
        <button style={{ width: '100%', marginTop: 10, height: 40, borderRadius: 6, border: `1px dashed ${SB.borderS}`, background: 'transparent', color: SB.sec, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13 }}>
          <BIcon name="plus" size={14}/> Add section
        </button>
      </div>
    </Phone>
  );
}

function S2_Exp() {
  // experimental: filmstrip preview rail with drag-state showing
  const blocks = [['Hero','type'],['Featured menu','utensils'],['Hours','clock'],['Gallery','image'],['Contact','mail']];
  return (
    <Phone bg={SB.surface}>
      <SBTop title="Home" sub="Drag to reorder · 3 / 5 selected" back right={<SBIcon icon="check"/>}/>
      <div style={{ flex: 1, display: 'flex' }}>
        {/* index column */}
        <div style={{ width: 28, background: SB.bg, borderRight: `1px solid ${SB.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 10, gap: 2, fontFamily: SB.mono, fontSize: 9.5, color: SB.ter }}>
          {blocks.map((_,i)=><div key={i} style={{ height: 88, display: 'flex', alignItems: 'flex-start', paddingTop: 6 }}>{String(i+1).padStart(2,'0')}</div>)}
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px 16px' }}>
          {blocks.map((b,i)=>(
            <div key={b[0]} style={{ position: 'relative', marginBottom: 8 }}>
              {i===2 && <div style={{ position: 'absolute', inset: '-2px -4px', border: `1.5px dashed ${SB.accent}`, borderRadius: 8, pointerEvents: 'none' }}/>}
              <div style={{ display: 'flex', gap: 10, padding: 10, background: i===2?SB.accentSoft:SB.bg, border: `1px solid ${i===2?SB.accentBorder:SB.border}`, borderRadius: 6, height: 80, alignItems: 'center', boxShadow: i===2?'0 4px 12px rgba(161,101,68,0.15)':'none' }}>
                <div style={{ width: 24, color: SB.ter, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {[0,1,2].map(r=>(<div key={r} style={{ display: 'flex', gap: 2 }}><span style={{ width: 3, height: 3, borderRadius: 999, background: 'currentColor' }}/><span style={{ width: 3, height: 3, borderRadius: 999, background: 'currentColor' }}/></div>))}
                </div>
                <div style={{ width: 60, height: 60, borderRadius: 4, background: SB.muted, border: `1px solid ${SB.border}`, position: 'relative', overflow: 'hidden' }}>
                  {b[0]==='Hero' && <div style={{ padding: 6, fontSize: 7, fontWeight: 700, lineHeight: 1.1 }}>Slow coffee,<br/>fast smiles.</div>}
                  {b[0]==='Featured menu' && <div style={{ padding: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>{['Drip','Cortado','Latte'].map(x=><div key={x} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 6 }}><span>{x}</span><span style={{ fontFamily: SB.mono }}>$5</span></div>)}</div>}
                  {b[0]==='Hours' && <div style={{ padding: 5, fontSize: 6, fontFamily: SB.mono, color: SB.text2 }}>Mon · 7–4<br/>Tue · 7–4<br/>Wed · 7–4</div>}
                  {b[0]==='Gallery' && <div style={{ padding: 4, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>{[0,1,2,3,4,5].map(x=><div key={x} style={{ aspectRatio: '1', background: `hsl(${30+x*20} 20% 75%)` }}/>)}</div>}
                  {b[0]==='Contact' && <div style={{ padding: 5, fontSize: 6, color: SB.sec }}>Name<br/><div style={{ height: 4, background: SB.border, marginTop: 1 }}/>Email<br/><div style={{ height: 4, background: SB.border, marginTop: 1 }}/></div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <BIcon name={b[1]} size={11} color={SB.sec}/>
                    <span style={{ fontSize: 9.5, color: SB.sec, letterSpacing: 0.5, fontWeight: 600, textTransform: 'uppercase' }}>{b[1].replace('-',' ')}</span>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 1 }}>{b[0]}</div>
                  {i===2 && <div style={{ fontSize: 10.5, color: SB.accentText, marginTop: 2, fontWeight: 600 }}>↕ Dragging — drop here</div>}
                </div>
              </div>
            </div>
          ))}
          <button style={{ width: '100%', marginTop: 4, height: 44, borderRadius: 6, border: `1px dashed ${SB.borderS}`, background: 'transparent', color: SB.sec, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13 }}>
            <BIcon name="plus" size={14}/> Add section
          </button>
        </div>
      </div>
    </Phone>
  );
}

Object.assign(window, { S1_Basic, S1_Refined, S1_Exp, S2_Basic, S2_Refined, S2_Exp });
