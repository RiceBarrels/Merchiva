// Site Builder — Experimental v2 (refined version of the *experimental* row)
// Each function returns a Phone() interior; use 375×812.
// Builds on the same DNA as v1 (clay accent, mono labels, dark inspector, AI sparkle)
// but tightens hierarchy, composition density, and detail.

// ═══════════════ S1 · Overview · Exp v2 ═══════════════
function S1_ExpV2() {
  return (
    <Phone bg={SB.surface}>
      <div style={{ padding: '4px 12px 10px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: SB.text, color: SB.onPri, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BIcon name="globe" size={14}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2, lineHeight: 1.1 }}>Maple Coffee</div>
          <div style={{ fontSize: 10.5, color: SB.sec, fontFamily: SB.mono, marginTop: 1 }}>maple-coffee.shop · v.43</div>
        </div>
        <SBIcon icon="undo"/>
        <SBIcon icon="eye"/>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 12px 16px' }}>
        {/* Hero card — quieter, asymmetric grid */}
        <div style={{ background: SB.text, color: SB.onPri, borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
          <div style={{ padding: '14px 14px 12px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px 2px 6px', borderRadius: 999, background: 'rgba(34,197,94,0.14)', color: '#86efac', fontSize: 10.5, fontWeight: 600, letterSpacing: 0.2 }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.18)' }}/> Live
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 28, fontWeight: 600, fontFamily: SB.mono, letterSpacing: -1, lineHeight: 1 }}>1,284</div>
                <div style={{ fontSize: 10.5, color: '#a8a29e', marginTop: 4, letterSpacing: 0.4, fontWeight: 600 }}>VISITS · 7D <span style={{ color: '#86efac' }}>+18%</span></div>
              </div>
            </div>
            {/* Layered preview, tighter */}
            <div style={{ position: 'relative', width: 100, height: 120 }}>
              <div style={{ position: 'absolute', right: 14, top: 10, width: 84, height: 100, borderRadius: 5, overflow: 'hidden', opacity: 0.55, transform: 'rotate(4deg)', border: '1px solid #44403c' }}>
                <SitePreview w={84} h={100} theme="forest"/>
              </div>
              <div style={{ position: 'absolute', right: 0, top: 0, width: 92, height: 110, borderRadius: 5, overflow: 'hidden', boxShadow: '0 8px 22px rgba(0,0,0,0.45)', transform: 'rotate(-2deg)', border: '1px solid #44403c' }}>
                <SitePreview w={92} h={110} theme="cream"/>
              </div>
            </div>
          </div>
          {/* Sparkline / status strip */}
          <div style={{ height: 32, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 1, borderTop: '1px solid #2c2724' }}>
            {[12,18,14,22,28,20,26,32,24,30,28,34,40,36,30,26,32,38,42,38,34,40,46,42].map((h,i)=>(
              <div key={i} style={{ flex: 1, height: h*0.5, background: i>18?SB.accent:'#44403c', borderRadius: 1, opacity: i<6?0.4:1 }}/>
            ))}
          </div>
          <div style={{ padding: '8px 14px 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: '#a8a29e', fontFamily: SB.mono, borderTop: '1px solid #2c2724' }}>
            <span>4 pages</span>
            <span style={{ color: '#57534e' }}>·</span>
            <span>edit 3h ago</span>
            <div style={{ flex: 1 }}/>
            <span style={{ color: SB.accent, fontWeight: 600 }}>2 unpublished →</span>
          </div>
        </div>

        {/* Quick actions — refined: asymmetric 2-col, primary accented */}
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 8 }}>
          <div style={{ background: SB.bg, border: `1px solid ${SB.accentBorder}`, borderRadius: 8, padding: '12px 12px 10px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 88% 12%, rgba(161,101,68,0.10), transparent 55%)' }}/>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <BIcon name="sparkles" size={12} color={SB.accent}/>
                <span style={{ fontSize: 9.5, color: SB.accent, fontWeight: 700, letterSpacing: 0.5 }}>AI COMPOSE</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, letterSpacing: -0.2 }}>Rewrite the hero</div>
              <div style={{ fontSize: 11, color: SB.sec, marginTop: 2 }}>3 variants · 8s</div>
            </div>
          </div>
          <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 8, padding: '12px 12px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <BIcon name="edit-3" size={14} color={SB.text2}/>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.2, marginTop: 14 }}>Edit pages</div>
              <div style={{ fontSize: 11, color: SB.sec, marginTop: 2 }}>4 published</div>
            </div>
          </div>
        </div>

        {/* Pages list — denser, with mini status dots and time */}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <SBLab>Pages</SBLab>
          <span style={{ fontSize: 10.5, color: SB.ter, fontFamily: SB.mono }}>04</span>
        </div>
        <div style={{ marginTop: 8, background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {[
            ['Home','/','live','3h',true],
            ['Menu','/menu','live','2d',false],
            ['About','/about','live','1w',false],
            ['Contact','/contact','draft','12m',false],
          ].map((r,i,a)=>{
            const dotColor = r[2]==='live' ? SB.ok : SB.warn;
            return (
              <div key={r[0]} style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: i===a.length-1?'none':`1px solid ${SB.border}`, background: r[4]?'#fafaf9':SB.bg }}>
                <div style={{ width: 6, height: 6, borderRadius: 999, background: dotColor, flexShrink: 0 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{r[0]}</span>
                    <span style={{ fontSize: 10.5, color: SB.ter, fontFamily: SB.mono }}>{r[1]}</span>
                  </div>
                </div>
                <span style={{ fontSize: 10.5, color: SB.ter, fontFamily: SB.mono }}>{r[3]}</span>
                <BIcon name="chevron-right" size={12} color={SB.ter}/>
              </div>
            );
          })}
        </div>

        {/* Recent edits — with timeline accent */}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <SBLab>Recent edits</SBLab>
          <span style={{ fontSize: 10.5, color: SB.ter, fontFamily: SB.mono }}>03</span>
        </div>
        <div style={{ marginTop: 8, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 11, top: 8, bottom: 8, width: 1, background: SB.border }}/>
          {[['Section reordered','Menu · Featured drinks','12m'],['Hero copy','"Slow coffee, fast smiles."','1h'],['Banner photo','About — replaced','3h']].map((r,i)=>(
            <div key={r[0]} style={{ padding: '8px 0 8px 28px', display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 7, top: 14, width: 9, height: 9, borderRadius: 999, background: SB.bg, border: `1.5px solid ${i===0?SB.accent:SB.borderS}` }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{r[0]}</div>
                <div style={{ fontSize: 10.5, color: SB.sec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r[1]}</div>
              </div>
              <span style={{ fontSize: 10.5, color: SB.ter, fontFamily: SB.mono }}>{r[2]}</span>
            </div>
          ))}
        </div>
      </div>
      <MiniTab/>
    </Phone>
  );
}

// ═══════════════ S2 · Section list · Exp v2 ═══════════════
function S2_ExpV2() {
  const blocks = [
    ['Hero','type','#f5ede4'],
    ['Featured menu','utensils','#fafaf9'],
    ['Hours','clock','#fafaf9'],
    ['Gallery','image','#e7e5e4'],
    ['Contact','mail','#fafaf9'],
  ];
  return (
    <Phone bg={SB.surface}>
      <SBTop title="Home" sub="Drag · 3 of 5 selected" back right={<><span style={{ fontSize: 12, color: SB.text2, fontWeight: 600, padding: '0 8px' }}>Done</span></>}/>
      {/* sticky summary */}
      <div style={{ padding: '8px 12px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${SB.border}`, background: SB.bg, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: SB.sec, fontFamily: SB.mono }}>
          <BIcon name="layout-dashboard" size={11} color={SB.sec}/>
          <span>5 sections</span>
        </div>
        <span style={{ color: SB.ter }}>·</span>
        <span style={{ fontSize: 10.5, color: SB.warn, fontFamily: SB.mono, fontWeight: 600 }}>2 changed</span>
        <div style={{ flex: 1 }}/>
        <button style={{ height: 26, padding: '0 10px', borderRadius: 5, border: `1px solid ${SB.border}`, background: SB.bg, fontSize: 11, color: SB.text2, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
          <BIcon name="eye" size={11}/> Preview
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex' }}>
        {/* index column */}
        <div style={{ width: 32, background: SB.bg, borderRight: `1px solid ${SB.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 14, gap: 0, fontFamily: SB.mono, fontSize: 9.5, color: SB.ter, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 16, top: 30, bottom: 60, width: 1, background: SB.border }}/>
          {blocks.map((_,i)=>(
            <div key={i} style={{ height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
              <div style={{ width: 18, height: 18, borderRadius: 999, background: i===2?SB.accent:SB.bg, color: i===2?'#fff':SB.ter, border: i===2?'none':`1px solid ${SB.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, zIndex: 1 }}>{i+1}</div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px 16px' }}>
          {blocks.map((b,i)=>{
            const isDrag = i===2;
            return (
              <div key={b[0]} style={{ position: 'relative', marginBottom: 8 }}>
                {isDrag && <div style={{ position: 'absolute', inset: '-3px -5px', border: `1.5px dashed ${SB.accent}`, borderRadius: 9, pointerEvents: 'none' }}/>}
                <div style={{ display: 'flex', gap: 10, padding: 10, background: isDrag?SB.accentSoft:SB.bg, border: `1px solid ${isDrag?SB.accentBorder:SB.border}`, borderRadius: 7, height: 84, alignItems: 'center', boxShadow: isDrag?'0 6px 16px rgba(161,101,68,0.18)':'0 1px 0 rgba(0,0,0,0.02)' }}>
                  {/* drag handle */}
                  <div style={{ width: 16, color: SB.ter, display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
                    {[0,1,2].map(r=>(<div key={r} style={{ display: 'flex', gap: 2 }}><span style={{ width: 3, height: 3, borderRadius: 999, background: 'currentColor' }}/><span style={{ width: 3, height: 3, borderRadius: 999, background: 'currentColor' }}/></div>))}
                  </div>
                  {/* thumbnail */}
                  <div style={{ width: 60, height: 64, borderRadius: 4, background: b[2], border: `1px solid ${SB.border}`, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                    {b[0]==='Hero' && (
                      <div style={{ padding: 6, fontFamily: 'Georgia, serif', fontSize: 7.5, fontWeight: 700, lineHeight: 1.05, color: '#3d2c1f' }}>Slow<br/>coffee,<br/>fast smiles.</div>
                    )}
                    {b[0]==='Featured menu' && (
                      <div style={{ padding: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {['Drip','Cortado','Latte'].map((x,j)=>(<div key={x} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 6 }}><span>{x}</span><span style={{ fontFamily: SB.mono, color: SB.sec }}>${4+j}</span></div>))}
                      </div>
                    )}
                    {b[0]==='Hours' && (
                      <div style={{ padding: 5, fontSize: 5.5, fontFamily: SB.mono, color: SB.text2, lineHeight: 1.5 }}>MON · 7–4<br/>TUE · 7–4<br/>WED · 7–4<br/>THU · 7–4</div>
                    )}
                    {b[0]==='Gallery' && (
                      <div style={{ padding: 4, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 2, height: '100%', boxSizing: 'border-box' }}>
                        {[0,1,2,3,4,5].map(x=><div key={x} style={{ background: `linear-gradient(135deg, hsl(${30+x*20} 22% 70%), hsl(${20+x*10} 22% 40%))`, borderRadius: 1 }}/>)}
                      </div>
                    )}
                    {b[0]==='Contact' && (
                      <div style={{ padding: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ fontSize: 5, color: SB.sec }}>Name</div>
                        <div style={{ height: 4, background: SB.border, borderRadius: 1 }}/>
                        <div style={{ fontSize: 5, color: SB.sec }}>Email</div>
                        <div style={{ height: 4, background: SB.border, borderRadius: 1 }}/>
                        <div style={{ height: 8, background: SB.text, borderRadius: 1, marginTop: 1 }}/>
                      </div>
                    )}
                  </div>
                  {/* meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <BIcon name={b[1]} size={10} color={SB.sec}/>
                      <span style={{ fontSize: 9, color: SB.sec, letterSpacing: 0.5, fontWeight: 700, textTransform: 'uppercase' }}>{['HERO','MENU','HOURS','GALLERY','FORM'][i]}</span>
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2, letterSpacing: -0.2 }}>{b[0]}</div>
                    {isDrag ? (
                      <div style={{ fontSize: 10.5, color: SB.accentText, marginTop: 4, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 0.8 }}>↑<br/>↓</span>
                        Drop to position 3
                      </div>
                    ) : (
                      <div style={{ fontSize: 10.5, color: SB.sec, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {['"Slow coffee, fast smiles."','3 items shown','Live · BizOps','6 photos · grid','Form + map'][i]}
                      </div>
                    )}
                  </div>
                  {!isDrag && <BIcon name="chevron-right" size={12} color={SB.ter}/>}
                </div>
              </div>
            );
          })}
          <button style={{ width: '100%', marginTop: 4, height: 44, borderRadius: 7, border: `1px dashed ${SB.borderS}`, background: 'transparent', color: SB.sec, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5, fontWeight: 500 }}>
            <BIcon name="plus" size={13}/> Add section
          </button>
        </div>
      </div>
    </Phone>
  );
}

// ═══════════════ S3 · Section editor · Exp v2 (refined dark inspector) ═══════════════
function S3_ExpV2() {
  return (
    <Phone bg={SB.text}>
      <div style={{ color: SB.onPri }}><StatBar dark/></div>
      {/* top bar */}
      <div style={{ padding: '4px 8px 10px', display: 'flex', alignItems: 'center', gap: 4, color: SB.onPri, borderBottom: `1px solid #2c2724` }}>
        <button style={{ width: 32, height: 32, borderRadius: SB.radius, border: 'none', background: 'transparent', color: SB.onPri, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="chevron-left" size={18}/></button>
        <div style={{ flex: 1, padding: '4px 4px 0', minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Hero</div>
          <div style={{ fontSize: 10.5, color: '#a8a29e', fontFamily: SB.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>home / sections / hero / h1</div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 999, background: 'rgba(34,197,94,0.14)', color: '#86efac', fontSize: 10, fontWeight: 600 }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: '#22c55e' }}/> Saved
        </div>
      </div>

      {/* device-as-canvas preview */}
      <div style={{ padding: '14px 14px 0', flexShrink: 0 }}>
        <div style={{ background: '#f5ede4', borderRadius: 10, overflow: 'hidden', boxShadow: '0 14px 36px rgba(0,0,0,0.5)', position: 'relative', color: '#3d2c1f', fontFamily: 'Georgia, serif' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(61,44,31,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>
            <span>MAPLE COFFEE</span>
            <span style={{ color: '#7a4a2a' }}>Menu · About</span>
          </div>
          <div style={{ padding: '14px 14px 16px', position: 'relative' }}>
            {/* selection on H1 */}
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', inset: '-6px -8px', border: `2px solid ${SB.accent}`, borderRadius: 4 }}/>
              <div style={{ position: 'absolute', top: -22, left: -8, padding: '2px 7px', background: SB.accent, color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: '3px 3px 0 0', fontFamily: SB.font, letterSpacing: 0.4 }}>H1 · headline</div>
              <div style={{ position: 'absolute', top: -22, right: -8, padding: '2px 7px', background: SB.accent, color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: '3px 3px 0 0', fontFamily: SB.mono }}>26 / 60</div>
              {/* corner handles */}
              {[['-3px','-5px'],['-3px',null,'-5px'],[null,'-5px','-3px'],[null,'-5px',null,'-3px']].map((h,j)=>(
                <div key={j} style={{ position: 'absolute', top: h[0], left: h[1], right: h[2], bottom: h[3]==='top'?undefined:h[3], width: 7, height: 7, background: '#fff', border: `2px solid ${SB.accent}`, borderRadius: 1, zIndex: 2 }}/>
              ))}
              <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.05, letterSpacing: -0.6 }}>Slow coffee,<br/>fast smiles.</div>
            </div>
            <div style={{ marginTop: 14, fontSize: 11.5, color: '#7a4a2a', lineHeight: 1.5 }}>Single-origin pour-overs and almond croissants baked daily.</div>
            <div style={{ marginTop: 10, display: 'inline-block', padding: '6px 12px', background: '#3d2c1f', color: '#f5ede4', fontSize: 10.5, fontWeight: 600, borderRadius: 3 }}>See the menu →</div>
          </div>
        </div>
      </div>

      {/* inspector — denser, with inline controls */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px 0', color: SB.onPri }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 9, color: '#a8a29e', letterSpacing: 0.6, fontWeight: 700 }}>INSPECTOR</span>
          <span style={{ width: 1, height: 10, background: '#2c2724' }}/>
          <span style={{ fontSize: 10, color: SB.accent, fontFamily: SB.mono }}>h1.headline</span>
          <div style={{ flex: 1 }}/>
          <span style={{ fontSize: 9.5, color: '#57534e', fontFamily: SB.mono }}>4 props</span>
        </div>
        <div style={{ background: '#1a1614', border: `1px solid #2c2724`, borderRadius: 8, overflow: 'hidden' }}>
          {/* TEXT row — input-feel */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #2c2724', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 60, fontSize: 10.5, color: '#a8a29e', fontFamily: SB.mono }}>text</span>
            <span style={{ flex: 1, fontSize: 11.5, color: SB.onPri, fontFamily: 'Georgia, serif' }}>Slow coffee, fast smiles.</span>
            <BIcon name="edit-3" size={11} color="#a8a29e"/>
          </div>
          {/* FONT row — chip */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #2c2724', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 60, fontSize: 10.5, color: '#a8a29e', fontFamily: SB.mono }}>font</span>
            <span style={{ flex: 1, fontSize: 11.5, color: SB.onPri }}>Editorial New</span>
            <span style={{ fontSize: 10, color: '#a8a29e', fontFamily: SB.mono, padding: '2px 6px', background: '#2c2724', borderRadius: 3 }}>64 / 700</span>
          </div>
          {/* SIZE row — slider */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #2c2724', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 60, fontSize: 10.5, color: '#a8a29e', fontFamily: SB.mono }}>size</span>
            <div style={{ flex: 1, height: 4, borderRadius: 999, background: '#2c2724', position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '62%', background: SB.accent, borderRadius: 999 }}/>
              <div style={{ position: 'absolute', left: '60%', top: -5, width: 14, height: 14, borderRadius: 999, background: SB.onPri, border: `2px solid ${SB.accent}` }}/>
            </div>
            <span style={{ fontSize: 10.5, color: SB.onPri, fontFamily: SB.mono, minWidth: 30, textAlign: 'right' }}>64px</span>
          </div>
          {/* COLOR row — swatches */}
          <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 60, fontSize: 10.5, color: '#a8a29e', fontFamily: SB.mono }}>color</span>
            <div style={{ flex: 1, display: 'flex', gap: 5 }}>
              {['#1c1917','#3d2c1f','#a16544','#7ab091','#fafaf9'].map((c,j)=>(
                <div key={c} style={{ width: 18, height: 18, borderRadius: 999, background: c, border: j===1?`2px solid ${SB.onPri}`:`1px solid #2c2724`, boxShadow: j===1?'0 0 0 1px #1a1614':'none' }}/>
              ))}
            </div>
            <span style={{ fontSize: 10, color: '#a8a29e', fontFamily: SB.mono }}>#3d2c1f</span>
          </div>
        </div>

        {/* AI suggestion strip */}
        <div style={{ marginTop: 12, background: 'linear-gradient(135deg, rgba(161,101,68,0.18), rgba(161,101,68,0.04))', border: `1px solid rgba(161,101,68,0.4)`, borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <BIcon name="sparkles" size={12} color={SB.accent}/>
            <span style={{ fontSize: 9.5, color: SB.accent, letterSpacing: 0.5, fontWeight: 700 }}>AI · 3 REWRITES</span>
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {['Slow coffee,\nfast smiles.','Beans, books,\nbig hellos.','Pour, sip,\nrepeat.'].map((t,j)=>(
              <div key={j} style={{ flex: '0 0 auto', minWidth: 120, padding: '8px 10px', background: j===0?'rgba(161,101,68,0.25)':'#1a1614', border: `1px solid ${j===0?SB.accent:'#2c2724'}`, borderRadius: 5, fontSize: 11, fontFamily: 'Georgia, serif', whiteSpace: 'pre-line', lineHeight: 1.15 }}>{t}</div>
            ))}
          </div>
        </div>
        <div style={{ height: 12 }}/>
      </div>

      {/* dock */}
      <div style={{ padding: '8px 12px 14px', borderTop: '1px solid #2c2724', display: 'flex', gap: 8, flexShrink: 0 }}>
        <button style={{ width: 38, height: 38, borderRadius: 6, border: '1px solid #2c2724', background: '#1a1614', color: SB.onPri, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="undo" size={14}/></button>
        <button style={{ width: 38, height: 38, borderRadius: 6, border: '1px solid #2c2724', background: '#1a1614', color: SB.onPri, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="redo" size={14}/></button>
        <button style={{ flex: 1, height: 38, borderRadius: 6, border: 'none', background: SB.accent, color: '#fff', fontSize: 13, fontWeight: 600 }}>Save & continue</button>
      </div>
    </Phone>
  );
}

// ═══════════════ S4 · Theme picker · Exp v2 (token compose, refined) ═══════════════
function S4_ExpV2() {
  return (
    <Phone bg={SB.surface}>
      <SBTop title="Compose" sub="Mix tokens · live preview" back right={<><SBIcon icon="refresh-cw"/><SBIcon icon="check"/></>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 16px' }}>
        {/* big preview with frame chrome */}
        <div style={{ marginTop: 10, borderRadius: 10, overflow: 'hidden', border: `1px solid ${SB.border}`, background: SB.bg }}>
          <div style={{ height: 22, display: 'flex', alignItems: 'center', padding: '0 10px', borderBottom: `1px solid ${SB.border}`, background: SB.muted, gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: SB.borderS }}/>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: SB.borderS }}/>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: SB.borderS }}/>
            <span style={{ flex: 1, marginLeft: 6, fontSize: 9.5, color: SB.sec, fontFamily: SB.mono }}>maple-coffee.shop · preview</span>
            <span style={{ fontSize: 9, color: SB.accentText, fontFamily: SB.mono, padding: '1px 6px', background: SB.accentSoft, borderRadius: 3, fontWeight: 600 }}>v.43</span>
          </div>
          <div style={{ height: 200 }}>
            <SitePreview w={350} h={200} theme="paper"/>
          </div>
        </div>

        {/* tokens — slider rows w/ live values + roll button */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <SBLab>Tokens</SBLab>
          <span style={{ fontSize: 10.5, color: SB.ter, fontFamily: SB.mono }}>04</span>
          <div style={{ flex: 1 }}/>
          <button style={{ height: 24, padding: '0 9px', fontSize: 10.5, color: SB.accentText, fontWeight: 600, border: `1px solid ${SB.accentBorder}`, background: SB.accentSoft, borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <BIcon name="sparkles" size={10}/> Reroll all
          </button>
        </div>
        <div style={{ marginTop: 8, background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {[
            ['bg','Background','#ffffff','Paper',  18],
            ['fg','Ink',       '#1c1917','Pitch',  92],
            ['ac','Accent',    '#a16544','Clay',   58],
            ['sf','Surface',   '#f5ede4','Cream',  24],
          ].map((r,i,a)=>(
            <div key={r[0]} style={{ padding: '11px 12px', display: 'grid', gridTemplateColumns: '24px 1fr 110px', gap: 10, alignItems: 'center', borderBottom: i===a.length-1?'none':`1px solid ${SB.border}` }}>
              <div style={{ width: 24, height: 24, borderRadius: 5, background: r[2], border: `1px solid ${SB.border}` }}/>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, letterSpacing: -0.1 }}>{r[1]}</div>
                <div style={{ fontSize: 10, color: SB.sec, fontFamily: SB.mono }}>{r[2]} · {r[3]}</div>
              </div>
              <div style={{ position: 'relative' }}>
                <div style={{ height: 4, borderRadius: 999, background: SB.border, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${r[4]}%`, background: SB.text, borderRadius: 999 }}/>
                  <div style={{ position: 'absolute', left: `calc(${r[4]}% - 6px)`, top: -4, width: 12, height: 12, borderRadius: 999, background: SB.bg, border: `2px solid ${SB.text}` }}/>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* type pair + presets */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <SBLab>Type pair</SBLab>
          <span style={{ fontSize: 10.5, color: SB.ter, fontFamily: SB.mono }}>2 of 12</span>
          <div style={{ flex: 1 }}/>
          <span style={{ fontSize: 11, color: SB.text2, fontWeight: 600 }}>Browse →</span>
        </div>
        <div style={{ marginTop: 8, padding: '14px 14px 12px', background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 8 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 26, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1, color: SB.text }}>Slow coffee.</div>
          <div style={{ marginTop: 6, fontSize: 12, color: SB.text2, lineHeight: 1.5 }}>The espresso pulls long, the chairs are wood, and the wifi is fast.</div>
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${SB.border}`, display: 'flex', gap: 0, fontSize: 10, color: SB.sec, fontFamily: SB.mono }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: SB.ter, fontSize: 9, letterSpacing: 0.5, fontWeight: 700 }}>DISPLAY</div>
              <div style={{ color: SB.text, marginTop: 2 }}>Editorial New · 700</div>
            </div>
            <div style={{ width: 1, background: SB.border, margin: '0 10px' }}/>
            <div style={{ flex: 1 }}>
              <div style={{ color: SB.ter, fontSize: 9, letterSpacing: 0.5, fontWeight: 700 }}>BODY</div>
              <div style={{ color: SB.text, marginTop: 2 }}>Inter · 400</div>
            </div>
          </div>
        </div>

        {/* preset row */}
        <div style={{ marginTop: 14 }}><SBLab>Quick presets</SBLab></div>
        <div style={{ marginTop: 8, display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginRight: -12 }}>
          {[['Drip','cream'],['Counter','paper'],['Pour-over','forest'],['Workshop','mono']].map((t,j)=>(
            <div key={t[0]} style={{ flex: '0 0 auto', width: 90, borderRadius: 6, overflow: 'hidden', border: `1px solid ${j===1?SB.text:SB.border}`, background: SB.bg, boxShadow: j===1?'0 0 0 2px rgba(28,25,23,0.06)':'none' }}>
              <div style={{ height: 56 }}><SitePreview w={90} h={56} theme={t[1]}/></div>
              <div style={{ padding: '5px 8px 6px', fontSize: 10.5, fontWeight: 600 }}>{t[0]}</div>
            </div>
          ))}
        </div>
      </div>
    </Phone>
  );
}

// ═══════════════ S5 · Image picker · Exp v2 (AI generate, refined dark) ═══════════════
function S5_ExpV2() {
  return (
    <Phone bg={SB.text}>
      <div style={{ color: SB.onPri, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <StatBar dark/>
        <div style={{ padding: '4px 8px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <button style={{ width: 32, height: 32, borderRadius: SB.radius, border: 'none', background: 'transparent', color: SB.onPri, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="x" size={18}/></button>
          <div style={{ flex: 1, padding: '4px 4px 0' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>AI image</div>
            <div style={{ fontSize: 10.5, color: '#a8a29e', fontFamily: SB.mono }}>generating · v1.43</div>
          </div>
          {/* segmented control: gen / library / upload */}
          <div style={{ display: 'flex', padding: 2, borderRadius: 6, background: '#1a1614', border: '1px solid #2c2724' }}>
            {[['Gen',true],['Lib',false],['Up',false]].map((t,i)=>(
              <span key={t[0]} style={{ padding: '4px 9px', fontSize: 10.5, fontWeight: 600, borderRadius: 4, color: t[1]?SB.text:'#a8a29e', background: t[1]?SB.accent:'transparent' }}>{t[0]}</span>
            ))}
          </div>
        </div>

        {/* prompt with chips */}
        <div style={{ padding: '4px 12px 0' }}>
          <div style={{ background: '#1a1614', border: `1px solid #2c2724`, borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <BIcon name="sparkles" size={11} color={SB.accent}/>
              <span style={{ fontSize: 9, color: '#a8a29e', letterSpacing: 0.5, fontWeight: 700 }}>PROMPT</span>
              <div style={{ flex: 1 }}/>
              <span style={{ fontSize: 9.5, color: '#57534e', fontFamily: SB.mono }}>34 / 240</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.5, color: SB.onPri }}>
              <span style={{ background: 'rgba(161,101,68,0.25)', borderRadius: 2, padding: '0 2px' }}>Pour-over coffee</span>
              {' on a worn wooden counter, '}
              <span style={{ background: 'rgba(122,176,145,0.18)', borderRadius: 2, padding: '0 2px' }}>morning light</span>
              {', shallow depth of field, '}
              <span style={{ background: 'rgba(161,101,68,0.25)', borderRadius: 2, padding: '0 2px' }}>warm tones</span>
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid #2c2724`, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              {[['16:9','aspect'],['Photo','style'],['Warm','mood']].map(c=>(
                <span key={c[0]} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: '#2c2724', color: SB.onPri, fontSize: 10, fontFamily: SB.mono, borderRadius: 999 }}>{c[0]}<span style={{ color: '#57534e' }}>·</span><span style={{ color: '#a8a29e' }}>{c[1]}</span></span>
              ))}
              <div style={{ flex: 1 }}/>
              <button style={{ height: 26, padding: '0 10px', borderRadius: 4, border: 'none', background: SB.accent, color: '#fff', fontSize: 10.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <BIcon name="refresh-cw" size={10}/> Regen
              </button>
            </div>
          </div>
        </div>

        {/* candidates — masonry-feel 2-col with status states */}
        <div style={{ padding: '14px 12px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: '#a8a29e', letterSpacing: 0.5, fontWeight: 700 }}>CANDIDATES</span>
          <span style={{ fontSize: 10, color: '#57534e', fontFamily: SB.mono }}>04</span>
          <div style={{ flex: 1 }}/>
          <span style={{ fontSize: 10.5, color: '#a8a29e', fontFamily: SB.mono }}>seed · 4f3a</span>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              {sel:true, ar: '4/5', ver: 43, label: 'USE'},
              {sel:false, ar: '4/5', ver: 44},
              {sel:false, ar: '4/5', ver: 45, label: '✦'},
              {sel:false, ar: '4/5', ver: 46, gen: true},
            ].map((c,i)=>(
              <div key={i} style={{ aspectRatio: c.ar, borderRadius: 7, background: c.gen ? '#1a1614' : `linear-gradient(${20+i*40}deg, hsl(${25+i*8} 40% ${55+(i%2)*8}%), hsl(${15} 30% 18%))`, position: 'relative', border: c.sel?`2px solid ${SB.accent}`:'2px solid transparent', overflow: 'hidden', boxShadow: c.sel?'0 0 0 4px rgba(161,101,68,0.18)':'none' }}>
                {c.gen && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 999, border: '2px solid #2c2724', borderTopColor: SB.accent }}/>
                    <span style={{ fontSize: 10, color: '#a8a29e', fontFamily: SB.mono }}>generating · 62%</span>
                  </div>
                )}
                {c.sel && <div style={{ position: 'absolute', top: 6, right: 6, padding: '3px 7px', background: SB.accent, color: '#fff', fontSize: 9.5, fontWeight: 700, borderRadius: 3, letterSpacing: 0.4, display: 'inline-flex', alignItems: 'center', gap: 4 }}><BIcon name="check" size={9} strokeWidth={3}/> USE</div>}
                {c.label === '✦' && <div style={{ position: 'absolute', top: 6, right: 6, padding: '3px 6px', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 9.5, borderRadius: 3 }}>✦ Top pick</div>}
                {!c.gen && <div style={{ position: 'absolute', bottom: 6, left: 6, right: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,0.7)', fontFamily: SB.mono }}>
                  <span>v.{c.ver}</span>
                  <span>1920×1080</span>
                </div>}
              </div>
            ))}
          </div>
          {/* hint row */}
          <div style={{ marginTop: 10, padding: '8px 10px', background: '#1a1614', border: '1px dashed #2c2724', borderRadius: 6, fontSize: 10.5, color: '#a8a29e', display: 'flex', alignItems: 'center', gap: 6 }}>
            <BIcon name="info" size={11} color="#57534e"/>
            <span>Tap any candidate to refine its prompt independently</span>
          </div>
        </div>
        <div style={{ padding: '10px 12px 14px', borderTop: '1px solid #2c2724', display: 'flex', gap: 8 }}>
          <button style={{ width: 42, height: 42, borderRadius: 6, border: '1px solid #2c2724', background: '#1a1614', color: SB.onPri, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="edit-3" size={14}/></button>
          <button style={{ flex: 1, height: 42, borderRadius: 6, border: 'none', background: SB.accent, color: '#fff', fontSize: 13, fontWeight: 600 }}>Use selected · v.43</button>
        </div>
      </div>
    </Phone>
  );
}

// ═══════════════ S6 · Inline canvas · Exp v2 (full-bleed device, refined toolbar) ═══════════════
function S6_ExpV2() {
  return (
    <Phone bg={SB.text}>
      <div style={{ color: SB.onPri }}><StatBar dark/></div>
      {/* compact toolbar */}
      <div style={{ padding: '0 8px 8px', display: 'flex', alignItems: 'center', gap: 6, color: SB.onPri, borderBottom: '1px solid #2c2724' }}>
        <button style={{ width: 28, height: 28, borderRadius: 5, border: 'none', background: 'transparent', color: SB.onPri, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="x" size={16}/></button>
        <div style={{ display: 'flex', padding: 2, borderRadius: 5, background: '#1a1614', border: '1px solid #2c2724' }}>
          {[['Edit',true],['Preview',false]].map(t=>(
            <span key={t[0]} style={{ padding: '3px 9px', fontSize: 10.5, fontWeight: 600, borderRadius: 3, color: t[1]?SB.text:'#a8a29e', background: t[1]?SB.onPri:'transparent' }}>{t[0]}</span>
          ))}
        </div>
        <div style={{ flex: 1 }}/>
        <button style={{ width: 28, height: 28, borderRadius: 5, border: 'none', background: 'transparent', color: '#a8a29e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="undo" size={14}/></button>
        <button style={{ width: 28, height: 28, borderRadius: 5, border: 'none', background: 'transparent', color: '#a8a29e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="redo" size={14}/></button>
        <button style={{ height: 28, padding: '0 10px', borderRadius: 5, border: 'none', background: SB.accent, color: '#fff', fontSize: 11, fontWeight: 600 }}>Done</button>
      </div>

      {/* breadcrumb */}
      <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#a8a29e', fontFamily: SB.mono, flexShrink: 0 }}>
        <span>home</span><BIcon name="chevron-right" size={9} color="#57534e"/>
        <span>hero</span><BIcon name="chevron-right" size={9} color="#57534e"/>
        <span style={{ color: SB.accent }}>h1.headline</span>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: '0 8px 0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: '#f5ede4', borderRadius: '12px 12px 0 0', overflow: 'hidden', flex: 1, position: 'relative', fontFamily: 'Georgia, serif', color: '#3d2c1f', boxShadow: '0 -8px 24px rgba(0,0,0,0.4)' }}>
            {/* page chrome */}
            <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(61,44,31,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>
              <span>MAPLE COFFEE</span>
              <span style={{ color: '#7a4a2a' }}>Menu · About</span>
            </div>
            <div style={{ padding: '24px 16px 16px' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', inset: '-6px -10px', border: `2px solid ${SB.accent}`, borderRadius: 4 }}/>
                {/* corner handles */}
                {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(h=>(
                  <div key={h.join('')} style={{ position: 'absolute', [h[0]]: -10, [h[1]]: -14, width: 8, height: 8, background: '#fff', border: `2px solid ${SB.accent}`, borderRadius: 1, zIndex: 2 }}/>
                ))}
                <div style={{ position: 'absolute', top: -22, left: -10, padding: '2px 8px', background: SB.accent, color: '#fff', fontSize: 9.5, fontWeight: 700, borderRadius: '3px 3px 0 0', fontFamily: SB.font, letterSpacing: 0.4 }}>HERO · H1</div>
                <div style={{ position: 'absolute', top: -22, right: -14, padding: '2px 7px', background: SB.accent, color: '#fff', fontSize: 9.5, fontWeight: 700, borderRadius: '3px 3px 0 0', fontFamily: SB.mono }}>26ch</div>
                <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.05, letterSpacing: -0.7 }}>Slow coffee,<br/>fast smiles.</div>
              </div>
              <div style={{ marginTop: 18, fontSize: 12.5, color: '#7a4a2a', lineHeight: 1.5, padding: '4px 6px', border: '1px dashed rgba(61,44,31,0.2)', borderRadius: 3 }}>Single-origin pour-overs and almond croissants baked daily on 4th Ave.</div>
              <div style={{ marginTop: 12, display: 'inline-block', padding: '8px 14px', background: '#3d2c1f', color: '#f5ede4', fontSize: 12, fontWeight: 600, borderRadius: 3 }}>See the menu →</div>
            </div>
          </div>
        </div>

        {/* floating contextual toolbar — anchored above the dock */}
        <div style={{ position: 'absolute', left: 24, right: 24, bottom: 14, background: 'rgba(20,15,10,0.94)', backdropFilter: 'blur(12px)', borderRadius: 10, padding: '6px 6px 6px', display: 'flex', alignItems: 'center', gap: 2, color: SB.onPri, boxShadow: '0 12px 28px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {/* font size mini */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 4px' }}>
            <button style={{ width: 24, height: 28, borderRadius: 4, border: 'none', background: 'transparent', color: '#a8a29e' }}>A−</button>
            <span style={{ fontSize: 10.5, color: SB.onPri, fontFamily: SB.mono, padding: '0 4px' }}>30</span>
            <button style={{ width: 24, height: 28, borderRadius: 4, border: 'none', background: 'transparent', color: SB.onPri, fontWeight: 600 }}>A+</button>
          </div>
          <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.15)' }}/>
          <button style={{ width: 28, height: 28, borderRadius: 4, border: 'none', background: 'rgba(255,255,255,0.08)', color: SB.onPri, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="bold" size={12}/></button>
          <button style={{ width: 28, height: 28, borderRadius: 4, border: 'none', background: 'transparent', color: '#a8a29e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="italic" size={12}/></button>
          <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.15)' }}/>
          {/* color swatch row */}
          <div style={{ display: 'flex', gap: 3, padding: '0 4px' }}>
            {['#1c1917','#3d2c1f','#a16544','#7ab091'].map((c,i)=>(
              <span key={c} style={{ width: 14, height: 14, borderRadius: 999, background: c, border: i===1?`2px solid ${SB.accent}`:'1px solid rgba(255,255,255,0.2)' }}/>
            ))}
          </div>
          <div style={{ flex: 1 }}/>
          <button style={{ height: 28, padding: '0 10px', borderRadius: 5, border: 'none', background: SB.accent, color: '#fff', fontSize: 10.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><BIcon name="sparkles" size={11}/> AI</button>
        </div>
      </div>

      {/* dock */}
      <div style={{ background: '#1a1614', color: SB.onPri, padding: '8px 12px 14px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid #2c2724', flexShrink: 0 }}>
        <div style={{ width: 6, height: 6, borderRadius: 999, background: SB.accent, boxShadow: '0 0 0 3px rgba(161,101,68,0.25)' }}/>
        <div style={{ flex: 1, fontSize: 10.5, color: '#a8a29e' }}>Editing <span style={{ color: SB.onPri, fontFamily: SB.mono }}>h1.headline</span></div>
        <span style={{ fontSize: 9.5, color: '#57534e', fontFamily: SB.mono }}>auto-save · 12s</span>
      </div>
    </Phone>
  );
}

// ═══════════════ S7 · Publish · Exp v2 (refined build console) ═══════════════
function S7_ExpV2() {
  return (
    <Phone bg={SB.text}>
      <div style={{ color: SB.onPri, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <StatBar dark/>
        <div style={{ padding: '4px 8px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <button style={{ width: 32, height: 32, borderRadius: SB.radius, border: 'none', background: 'transparent', color: SB.onPri, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="x" size={18}/></button>
          <div style={{ flex: 1, padding: '4px 4px 0', minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Publishing</div>
            <div style={{ fontSize: 10.5, color: '#a8a29e', fontFamily: SB.mono }}>v.43 → v.44 · 4f3a · prod</div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 999, background: 'rgba(161,101,68,0.18)', color: SB.accent, fontSize: 10, fontWeight: 600 }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: SB.accent, animation: 'p 1s' }}/> live
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px 12px' }}>
          {/* version chip — refined: side-by-side w/ progress arc */}
          <div style={{ background: '#1a1614', border: '1px solid #2c2724', borderRadius: 10, padding: '14px 14px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
              <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="32" cy="32" r="26" fill="none" stroke="#2c2724" strokeWidth="4"/>
                <circle cx="32" cy="32" r="26" fill="none" stroke={SB.accent} strokeWidth="4" strokeDasharray="163" strokeDashoffset="65" strokeLinecap="round"/>
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, fontFamily: SB.mono, color: SB.onPri }}>60%</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9.5, color: '#a8a29e', letterSpacing: 0.6, fontWeight: 700 }}>VERSION</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 12, color: '#57534e', fontFamily: SB.mono, textDecoration: 'line-through' }}>v.43</span>
                <BIcon name="chevron-right" size={11} color="#57534e"/>
                <span style={{ fontSize: 32, fontWeight: 700, fontFamily: SB.mono, letterSpacing: -1.2, color: SB.accent, lineHeight: 0.9 }}>v.44</span>
              </div>
              <div style={{ fontSize: 10, color: '#a8a29e', fontFamily: SB.mono, marginTop: 4 }}>2 edits · 1 image · 0 broken</div>
            </div>
          </div>

          {/* steps timeline */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: '#a8a29e', letterSpacing: 0.5, fontWeight: 700 }}>BUILD STEPS</span>
              <span style={{ fontSize: 10, color: '#57534e', fontFamily: SB.mono }}>3 / 6 · 2.4s</span>
            </div>
            <div style={{ background: '#1a1614', border: '1px solid #2c2724', borderRadius: 8, fontFamily: SB.mono, fontSize: 11, position: 'relative' }}>
              {[
                ['done','Build assets','420kb · 18 files','1.2s'],
                ['done','Optimize images','6 webp · −1.2mb','0.8s'],
                ['done','Validate sections','OK · 0 broken','0.4s'],
                ['live','Deploy edge','3 of 6 regions','—'],
                ['pend','Warm cache','—',''],
                ['pend','Verify','—',''],
              ].map((s,i,a)=>(
                <div key={s[1]} style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: i===a.length-1?'none':'1px solid #2c2724', position: 'relative' }}>
                  <div style={{ width: 16, height: 16, borderRadius: 999, background: s[0]==='done'?SB.ok:s[0]==='live'?'transparent':'transparent', border: s[0]==='live'?`2px solid ${SB.accent}`:s[0]==='pend'?'1.5px solid #2c2724':'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {s[0]==='done' && <BIcon name="check" size={9} color="#fff" strokeWidth={3}/>}
                    {s[0]==='live' && <span style={{ width: 6, height: 6, borderRadius: 999, background: SB.accent }}/>}
                  </div>
                  <span style={{ flex: 1, color: s[0]==='pend'?'#57534e':SB.onPri, fontFamily: SB.font, fontSize: 12 }}>{s[1]}</span>
                  <span style={{ color: '#a8a29e', fontSize: 10 }}>{s[2]}</span>
                  <span style={{ color: '#57534e', fontSize: 9.5, minWidth: 24, textAlign: 'right' }}>{s[3]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* console output */}
          <div style={{ marginTop: 12, padding: 12, background: '#0d0a08', border: '1px solid #2c2724', borderRadius: 8, fontFamily: SB.mono, fontSize: 10, lineHeight: 1.6 }}>
            <div style={{ color: '#57534e' }}>$ bizops site publish --target=prod</div>
            <div style={{ color: SB.ok }}>✓ assets compiled in 1.2s</div>
            <div style={{ color: SB.ok }}>✓ images optimized · 6/6</div>
            <div style={{ color: SB.ok }}>✓ sections validated · 0 errors</div>
            <div style={{ color: SB.accent }}>→ deploying edge nodes…</div>
            <div style={{ color: '#a8a29e', paddingLeft: 14 }}>· iad1 · ok (412ms)</div>
            <div style={{ color: '#a8a29e', paddingLeft: 14 }}>· sfo1 · ok (380ms)</div>
            <div style={{ color: SB.accent, paddingLeft: 14 }}>· lhr1 · pushing<span style={{ animation: 'b 1s', display: 'inline-block', width: 6, background: SB.accent, height: 8, marginLeft: 2, verticalAlign: 'middle' }}/></div>
          </div>
        </div>

        <div style={{ padding: '10px 12px 14px', borderTop: '1px solid #2c2724', display: 'flex', gap: 8, flexShrink: 0 }}>
          <button style={{ flex: 1, height: 42, borderRadius: 6, border: '1px solid #2c2724', background: '#1a1614', color: SB.onPri, fontSize: 12.5, fontWeight: 500 }}>View logs</button>
          <button style={{ width: 42, height: 42, borderRadius: 6, border: '1px solid #2c2724', background: '#1a1614', color: SB.danger, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="x" size={14}/></button>
        </div>
      </div>
    </Phone>
  );
}

// ═══════════════ S8 · Empty state · Exp v2 (guided picker, refined) ═══════════════
function S8_ExpV2() {
  return (
    <Phone bg={SB.surface}>
      <div style={{ flex: 1, padding: '20px 18px 14px', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        {/* progress dots */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <span style={{ fontSize: 9.5, color: SB.sec, letterSpacing: 0.6, fontWeight: 700 }}>STEP 1 OF 3</span>
          <div style={{ flex: 1, display: 'flex', gap: 4 }}>
            <div style={{ flex: 1, height: 3, borderRadius: 999, background: SB.accent }}/>
            <div style={{ flex: 1, height: 3, borderRadius: 999, background: SB.border }}/>
            <div style={{ flex: 1, height: 3, borderRadius: 999, background: SB.border }}/>
          </div>
        </div>

        <div style={{ fontSize: 11, color: SB.sec, letterSpacing: 0.6, fontWeight: 700 }}>BIZOPS · SITE</div>
        <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1, marginTop: 6, color: SB.text }}>What kind of<br/>site<span style={{ color: SB.accent }}>?</span></div>
        <div style={{ fontSize: 12.5, color: SB.sec, marginTop: 8, lineHeight: 1.5, maxWidth: 290 }}>We'll fill in pages, copy and a starter theme. You edit from there — takes about 5 minutes.</div>

        {/* choices — refined: with mini preview rail per item, selection state */}
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['Café / restaurant','Menu · hours · gallery · contact','utensils', 'cream', true,'5 sections'],
            ['Retail shop','Catalog · hours · story · map','package', 'paper', false,'6 sections'],
            ['Service business','Booking · services · team','users', 'forest', false,'4 sections'],
            ['One-pager','Hero · contact · that\'s it','file', 'mono', false,'2 sections'],
          ].map((c,i)=>{
            const sel = c[4];
            return (
              <div key={c[0]} style={{ position: 'relative', padding: 0, background: sel?SB.text:SB.bg, color: sel?SB.onPri:SB.text, border: `1px solid ${sel?SB.text:SB.border}`, borderRadius: 9, display: 'flex', alignItems: 'stretch', overflow: 'hidden', boxShadow: sel?'0 6px 16px rgba(0,0,0,0.18)':'0 1px 0 rgba(0,0,0,0.02)' }}>
                {/* mini preview slab on left */}
                <div style={{ width: 56, flexShrink: 0, borderRight: `1px solid ${sel?'#2c2724':SB.border}`, overflow: 'hidden' }}>
                  <SitePreview w={56} h={70} theme={c[3]}/>
                </div>
                <div style={{ flex: 1, padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <BIcon name={c[2]} size={11} color={sel?SB.accent:SB.text2}/>
                      <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: -0.2 }}>{c[0]}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: sel?'#a8a29e':SB.sec, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c[1]}</div>
                    <div style={{ fontSize: 9.5, color: sel?'#a8a29e':SB.ter, marginTop: 3, fontFamily: SB.mono, letterSpacing: 0.3 }}>{c[5]}</div>
                  </div>
                  {sel ? (
                    <div style={{ width: 22, height: 22, borderRadius: 999, background: SB.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <BIcon name="check" size={11} color="#fff" strokeWidth={3}/>
                    </div>
                  ) : (
                    <BIcon name="chevron-right" size={13} color={SB.ter}/>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* describe-it row */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', borderRadius: 8, background: SB.accentSoft, border: `1px solid ${SB.accentBorder}` }}>
            <BIcon name="sparkles" size={13} color={SB.accentText}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9.5, color: SB.accentText, fontWeight: 700, letterSpacing: 0.5 }}>OR DESCRIBE IT</div>
              <div style={{ fontSize: 11.5, color: SB.accentText, marginTop: 2, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"wine bar, dim, hand-lettered…"</div>
            </div>
            <BIcon name="chevron-right" size={13} color={SB.accentText}/>
          </div>
        </div>

        <div style={{ flex: 1 }}/>
        <button style={{ marginTop: 14, width: '100%', height: 46, borderRadius: 7, border: 'none', background: SB.text, color: SB.onPri, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>Continue · Café <BIcon name="chevron-right" size={14} color={SB.onPri}/></button>
      </div>
    </Phone>
  );
}

// ═══════════════ S9 · Domain · Exp v2 (refined connect flow) ═══════════════
function S9_ExpV2() {
  return (
    <Phone bg={SB.surface}>
      <SBTop title="Connect domain" sub="Step 2 of 3" back right={<SBIcon icon="x"/>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px 16px' }}>
        {/* progress strip */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          <div style={{ flex: 1, height: 3, borderRadius: 999, background: SB.text }}/>
          <div style={{ flex: 1, height: 3, borderRadius: 999, background: SB.text }}/>
          <div style={{ flex: 1, height: 3, borderRadius: 999, background: SB.border }}/>
        </div>

        {/* domain input */}
        <div style={{ background: SB.bg, border: `2px solid ${SB.text}`, borderRadius: 10, padding: '14px 14px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <BIcon name="globe" size={11} color={SB.sec}/>
            <span style={{ fontSize: 9.5, color: SB.sec, letterSpacing: 0.6, fontWeight: 700 }}>YOUR DOMAIN</span>
            <div style={{ flex: 1 }}/>
            <span style={{ fontSize: 9.5, color: SB.ok, fontWeight: 600, fontFamily: SB.mono, display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 5, height: 5, borderRadius: 999, background: SB.ok }}/>checking</span>
          </div>
          <div style={{ marginTop: 8, fontFamily: SB.mono, fontSize: 22, fontWeight: 600, letterSpacing: -0.5, color: SB.text, display: 'flex', alignItems: 'baseline' }}>
            <span>maple-coffee</span>
            <span style={{ color: SB.accent }}>.shop</span>
            <span style={{ width: 2, height: 22, background: SB.text, marginLeft: 2 }}/>
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${SB.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: SB.ok, fontWeight: 600 }}>
              <BIcon name="check" size={11} strokeWidth={3}/> Available
            </span>
            <span style={{ color: SB.ter }}>·</span>
            <span style={{ fontSize: 11, color: SB.text2, fontFamily: SB.mono, fontWeight: 600 }}>$14<span style={{ color: SB.sec, fontWeight: 400 }}>/yr</span></span>
            <div style={{ flex: 1 }}/>
            <span style={{ fontSize: 10, color: SB.sec, fontFamily: SB.mono }}>~30s setup</span>
          </div>
        </div>

        {/* TLD chips */}
        <div style={{ marginTop: 10, display: 'flex', gap: 5, overflowX: 'auto', marginRight: -12, paddingBottom: 4 }}>
          {[['.shop',true,'$14'],['.coffee',false,'$32'],['.cafe',false,'$28'],['.com',false,'$12'],['.co',false,'$24']].map(t=>(
            <span key={t[0]} style={{ flex: '0 0 auto', padding: '6px 10px', borderRadius: 999, fontSize: 11, fontFamily: SB.mono, fontWeight: 600, background: t[1]?SB.text:SB.bg, color: t[1]?SB.onPri:SB.text2, border: `1px solid ${t[1]?SB.text:SB.border}`, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {t[0]}<span style={{ color: t[1]?'#a8a29e':SB.ter, fontWeight: 400 }}>{t[2]}</span>
            </span>
          ))}
        </div>

        {/* alt suggestions — now richer, each shows status */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <SBLab>Also available</SBLab>
          <span style={{ fontSize: 10.5, color: SB.ter, fontFamily: SB.mono }}>4 of 12</span>
        </div>
        <div style={{ marginTop: 8, background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {[
            ['maple.coffee','$32','premium'],
            ['hellomaple.com','$12','popular'],
            ['maple-co.fee','$24',null],
            ['maple.cafe','$28',null],
          ].map((s,i,a)=>(
            <div key={s[0]} style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: i===a.length-1?'none':`1px solid ${SB.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontFamily: SB.mono, fontWeight: 500, color: SB.text2 }}>{s[0]}</div>
                {s[2] && <div style={{ fontSize: 9.5, color: SB.accent, marginTop: 2, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>{s[2]}</div>}
              </div>
              <span style={{ fontSize: 11, color: SB.text2, fontFamily: SB.mono, fontWeight: 600 }}>{s[1]}<span style={{ color: SB.sec, fontWeight: 400 }}>/yr</span></span>
              <BIcon name="plus" size={12} color={SB.ter}/>
            </div>
          ))}
        </div>

        {/* What happens next */}
        <div style={{ marginTop: 16 }}><SBLab>What happens next</SBLab></div>
        <div style={{ marginTop: 8, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 11, top: 14, bottom: 14, width: 1, background: SB.border }}/>
          {[
            ['1','We register the domain','30s · auto', SB.accent],
            ['2','DNS records configured','BizOps managed', null],
            ['3','SSL certificate issued','~5 min · automatic', null],
            ['4','Site goes live','at maple-coffee.shop', null],
          ].map((r,i)=>(
            <div key={r[0]} style={{ padding: '6px 0 6px 32px', display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 3, top: 12, width: 17, height: 17, borderRadius: 999, background: r[3]||SB.bg, color: r[3]?'#fff':SB.sec, border: r[3]?'none':`1.5px solid ${SB.borderS}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, fontFamily: SB.mono }}>{r[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r[1]}</div>
                <div style={{ fontSize: 10.5, color: SB.sec }}>{r[2]}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '10px 12px 14px', borderTop: `1px solid ${SB.border}`, background: SB.bg, display: 'flex', gap: 8 }}>
        <button style={{ flex: 1, height: 46, borderRadius: 7, border: `1px solid ${SB.borderS}`, background: SB.bg, fontSize: 12.5, color: SB.text2, fontWeight: 500 }}>I have a domain</button>
        <button style={{ flex: 1.6, height: 46, borderRadius: 7, border: 'none', background: SB.text, color: SB.onPri, fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          Buy · $14/yr <BIcon name="chevron-right" size={13} color={SB.onPri}/>
        </button>
      </div>
    </Phone>
  );
}

Object.assign(window, {
  S1_ExpV2, S2_ExpV2, S3_ExpV2, S4_ExpV2, S5_ExpV2, S6_ExpV2, S7_ExpV2, S8_ExpV2, S9_ExpV2,
});
