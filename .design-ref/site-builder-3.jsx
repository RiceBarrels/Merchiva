// ═══════════════════════════════════════════════════════════
// BizOps · Site Builder — screens 6 + 7 (Inline editor, Publish)
// ═══════════════════════════════════════════════════════════

// ───── Screen 6: Inline canvas editor ─────
function Inline_Basic() {
  return (
    <Phone>
      <div style={{ padding: '6px 12px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${SB.border}`, flexShrink: 0 }}>
        <BIcon name="x" size={18} color={SB.text2} />
        <div style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 600 }}>Live edit · Home</div>
        <BIcon name="check" size={18} color={SB.text} />
      </div>
      <div style={{ flex: 1, overflow: 'auto', background: SB.surface, padding: 12 }}>
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 4 }}>
          <div style={{ padding: '14px 14px 8px', borderBottom: `1px solid ${SB.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>MAPLE COFFEE</span>
            <span style={{ fontSize: 9, color: SB.sec }}>Menu · About · Visit</span>
          </div>
          <div style={{ padding: '20px 16px', position: 'relative', outline: `2px solid ${SB.text}`, outlineOffset: -2 }}>
            <div style={{ position: 'absolute', top: -10, left: 6, background: SB.text, color: SB.onPri, fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 2 }}>H1</div>
            <div style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.05, letterSpacing: -0.6 }}>Slow coffee,<br/>fast smiles.</div>
          </div>
          <div style={{ padding: '14px 16px 16px' }}>
            <div style={{ fontSize: 11, color: SB.sec, lineHeight: 1.45 }}>Single-origin pour-overs and pastries baked daily.</div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', borderTop: `1px solid ${SB.border}`, padding: '8px 4px', gap: 4, justifyContent: 'space-around', flexShrink: 0 }}>
        {['type','image','palette','sparkles','more-horizontal'].map((i,k)=>(
          <button key={k} style={{ width: 44, height: 38, borderRadius: 6, border: 'none', background: k===0?SB.muted:'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BIcon name={i} size={16} color={SB.text2} />
          </button>
        ))}
      </div>
    </Phone>
  );
}

function Inline_Refined() {
  return (
    <Phone bg={SB.surface}>
      <div style={{ padding: '6px 10px 8px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button style={{ height: 30, padding: '0 10px', borderRadius: 6, border: `1px solid ${SB.border}`, background: SB.bg, fontSize: 12, color: SB.text2, display: 'inline-flex', alignItems: 'center', gap: 4 }}><BIcon name="chevron-left" size={13}/> Done</button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 11.5, color: SB.sec, fontFamily: SB.mono }}>maplecoffee.shop</div>
        <button style={{ height: 30, width: 30, borderRadius: 6, border: `1px solid ${SB.border}`, background: SB.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="undo" size={13}/></button>
        <button style={{ height: 30, width: 30, borderRadius: 6, border: `1px solid ${SB.border}`, background: SB.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name="redo" size={13}/></button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 12px 12px' }}>
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px 8px', borderBottom: `1px solid ${SB.border}`, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>MAPLE COFFEE</span>
            <span style={{ fontSize: 9, color: SB.sec }}>Menu · About · Visit</span>
          </div>
          <div style={{ padding: '20px 16px', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: '8px 8px', border: `1.5px solid ${SB.accent}`, borderRadius: 4, pointerEvents: 'none' }}>
              {['nw','ne','sw','se'].map(c=><span key={c} style={{ position: 'absolute', width: 8, height: 8, background: '#fff', border: `1.5px solid ${SB.accent}`, borderRadius: 2, top: c[0]==='n'?-4:'auto', bottom: c[0]==='s'?-4:'auto', left: c[1]==='w'?-4:'auto', right: c[1]==='e'?-4:'auto' }} />)}
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1, letterSpacing: -0.5 }}>Slow coffee,<br/>fast smiles.</div>
          </div>
          <div style={{ padding: '14px 16px 14px', borderTop: `1px solid ${SB.border}`, fontSize: 11, color: SB.sec, lineHeight: 1.45 }}>Single-origin pour-overs and pastries baked daily on Maple Street.</div>
        </div>
      </div>
      <div style={{ background: SB.bg, borderTop: `1px solid ${SB.border}`, borderRadius: '12px 12px 0 0', padding: '8px 14px 12px', flexShrink: 0 }}>
        <div style={{ width: 32, height: 3, background: SB.borderS, borderRadius: 2, margin: '0 auto 10px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: SB.accent, padding: '2px 5px', background: SB.accentSoft, borderRadius: 3 }}>H1</span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Heading · 2 lines</span>
          </div>
          <span style={{ fontSize: 10, color: SB.sec, fontFamily: SB.mono }}>32px / 1.05</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['type','bold','italic','align-left','align-center','sparkles'].map((i,k)=>(
            <div key={k} style={{ flex: 1, height: 34, borderRadius: 5, border: `1px solid ${SB.border}`, background: k===5?SB.accentSoft:SB.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: k===5?SB.accent:SB.text2 }}>
              <BIcon name={i} size={14} />
            </div>
          ))}
        </div>
      </div>
    </Phone>
  );
}

function Inline_Experimental() {
  return (
    <Phone bg="#1c1917">
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{ position: 'absolute', inset: 0, padding: 20, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ background: SB.bg, borderRadius: 10, padding: '24px 18px', boxShadow: '0 30px 80px rgba(0,0,0,0.4), 0 0 0 2px rgba(161,101,68,0.6)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: -28, left: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: SB.accent, background: 'rgba(161,101,68,0.2)', padding: '3px 7px', borderRadius: 3 }}>HERO · h1</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>Tap to edit</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.05, letterSpacing: -0.6, color: SB.text }}>Slow coffee,<br/>fast smiles.</div>
            <div style={{ position: 'absolute', bottom: -28, right: 0 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: SB.mono }}>w 343 · h 76</span>
            </div>
          </div>
        </div>
        <div style={{ background: 'rgba(28,25,23,0.85)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999, padding: 6, display: 'flex', gap: 4, alignSelf: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
          {[{i:'sparkles',a:true},{i:'type'},{i:'palette'},{i:'image'},{i:'copy'},{i:'trash-2'}].map((b,k)=>(
            <button key={k} style={{ width: 38, height: 38, borderRadius: 999, background: b.a?SB.accent:'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: b.a?'#fff':'rgba(255,255,255,0.85)' }}>
              <BIcon name={b.i} size={15} />
            </button>
          ))}
        </div>
        <div style={{ marginTop: 10, alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
          <BIcon name="sparkles" size={11} color={SB.accent} /> Hold for AI rewrite
        </div>
      </div>
    </Phone>
  );
}

// ───── Screen 7: Publish ─────
function Pub_Basic() {
  return (
    <Phone>
      <SBTop back title="Publish" />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '20px 16px', borderBottom: `1px solid ${SB.border}` }}>
          <SBLab>You're publishing</SBLab>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6, letterSpacing: -0.5 }}>v.43 · 7 changes</div>
          <div style={{ fontSize: 12, color: SB.sec, marginTop: 4, fontFamily: SB.mono }}>maplecoffee.shop</div>
        </div>
        <SBSect title="Changes since v.42">
          <BlockRow icon="edit-3" title="Hero copy" meta="Headline + subhead" />
          <BlockRow icon="image" title="Gallery · 3 photos added" meta="" />
          <BlockRow icon="utensils" title="Menu prices synced" meta="From BizOps · 4 items" />
          <BlockRow icon="clock" title="Hours updated" meta="Sun: closed → 9–4" last />
        </SBSect>
        <SBSect title="When">
          <BlockRow icon="zap" title="Publish now" meta="Live in ~10s" />
          <BlockRow icon="calendar" title="Schedule…" meta="Sat, Apr 26 · 8:00 AM" last />
        </SBSect>
      </div>
      <div style={{ padding: 14, borderTop: `1px solid ${SB.border}`, flexShrink: 0 }}>
        <button style={{ width: '100%', height: 44, borderRadius: SB.radius, background: SB.text, color: SB.onPri, border: 'none', fontSize: 14, fontWeight: 600 }}>Publish to maplecoffee.shop</button>
      </div>
    </Phone>
  );
}

function Pub_Refined() {
  return (
    <Phone bg={SB.surface}>
      <SBTop back title="Publish v.43" right={<SBIcon icon="more-horizontal" />} />
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, padding: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 60, height: 80, border: `1px solid ${SB.border}`, borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
            <SitePreview w={60} h={80} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>maplecoffee.shop</div>
            <div style={{ fontSize: 11, color: SB.sec, marginTop: 2, fontFamily: SB.mono }}>v.42 → v.43 · 7 changes</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              <PubPill state="live" compact /><span style={{ fontSize: 11, color: SB.sec, alignSelf: 'center' }}>→</span><PubPill state="live" compact />
            </div>
          </div>
        </div>
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ padding: '10px 14px', background: SB.surface, borderBottom: `1px solid ${SB.border}`, display: 'flex', justifyContent: 'space-between' }}>
            <SBLab>Diff</SBLab><span style={{ fontSize: 11, color: SB.sec, fontFamily: SB.mono }}>+24 −9</span>
          </div>
          {[['+','Hero subhead — added',SB.ok],['~','Hero h1 — changed',SB.warn],['+','Gallery · 3 photos',SB.ok],['~','Menu prices · 4 items',SB.warn],['−','Footer "Subscribe" block',SB.danger]].map(([s,t,c],i)=>(
            <div key={i} style={{ padding: '10px 14px', borderTop: i?`1px solid ${SB.border}`:'none', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 18, height: 18, borderRadius: 4, background: c+'1A', color: c, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: SB.mono }}>{s}</span>
              <span style={{ fontSize: 12.5, color: SB.text2 }}>{t}</span>
            </div>
          ))}
        </div>
        <div style={{ background: SB.bg, border: `1px solid ${SB.border}`, borderRadius: SB.radiusLg, padding: 12 }}>
          <SBLab>When</SBLab>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ padding: 12, border: `2px solid ${SB.text}`, borderRadius: 6 }}>
              <BIcon name="zap" size={14} />
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>Now</div>
              <div style={{ fontSize: 10.5, color: SB.sec, marginTop: 1 }}>~10s</div>
            </div>
            <div style={{ padding: 12, border: `1px solid ${SB.border}`, borderRadius: 6 }}>
              <BIcon name="calendar" size={14} color={SB.sec} />
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, color: SB.text2 }}>Schedule</div>
              <div style={{ fontSize: 10.5, color: SB.sec, marginTop: 1 }}>Sat 8 AM</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ padding: 12, borderTop: `1px solid ${SB.border}`, background: SB.bg, flexShrink: 0 }}>
        <button style={{ width: '100%', height: 44, borderRadius: SB.radius, background: SB.text, color: SB.onPri, border: 'none', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><BIcon name="upload-cloud" size={15}/> Publish now</button>
      </div>
    </Phone>
  );
}

function Pub_Experimental() {
  return (
    <Phone bg="#1c1917">
      <div style={{ color: '#fff' }}><StatBar dark /></div>
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, color: '#fff' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(ellipse at 50% 30%, rgba(161,101,68,0.25) 0%, transparent 60%)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ width: 72, height: 72, borderRadius: 999, background: SB.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 8px rgba(161,101,68,0.15), 0 0 0 16px rgba(161,101,68,0.07)' }}>
            <BIcon name="check" size={32} color="#fff" />
          </div>
        </div>
        <div style={{ position: 'relative', fontSize: 26, fontWeight: 600, marginTop: 24, letterSpacing: -0.5 }}>You're live.</div>
        <div style={{ position: 'relative', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 6, fontFamily: SB.mono }}>maplecoffee.shop · v.43</div>
        <div style={{ position: 'relative', display: 'flex', gap: 8, marginTop: 28 }}>
          <button style={{ height: 40, padding: '0 16px', borderRadius: 6, background: '#fff', color: SB.text, border: 'none', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}><BIcon name="external-link" size={14}/> Open site</button>
          <button style={{ height: 40, padding: '0 16px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}><BIcon name="share" size={14}/> Share</button>
        </div>
        <div style={{ position: 'relative', marginTop: 36, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12, color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <BIcon name="sparkles" size={13} color={SB.accent} />
          AI is generating an Instagram post about your update…
        </div>
      </div>
    </Phone>
  );
}

Object.assign(window, { Inline_Basic, Inline_Refined, Inline_Experimental, Pub_Basic, Pub_Refined, Pub_Experimental });
