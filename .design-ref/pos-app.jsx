// ─── POS App — canvas of 3 variants + full flow + aux screens ───
const { useState: aUS, useEffect: aUE, useMemo: aUM } = React;

const POS_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "view": "canvas",
  "density": "comfy",
  "cartPosition": "right",
  "showAuxScreens": true
}/*EDITMODE-END*/;

// A "POS instance" frame — one card in the design canvas
function POSFrame({ variant, state, W, H, memberPickerOpen, setMemberPickerOpen, cartPosition, density }) {
  return (
    <div className="relative overflow-hidden bg-white" style={{ width: W, height: H }}>
      {variant === "classic"   && <VariantClassic   state={state} />}
      {variant === "soft"      && <VariantSoft      state={state} cartPos={cartPosition} density={density} />}
      {variant === "editorial" && <VariantEditorial state={state} />}

      {state.stage === "pay" && <PayOverlay state={state} />}
      {state.stage === "receipt" && <ReceiptOverlay state={state} />}
      {state.modalItem && (
        <ModifierModal
          item={state.modalItem}
          onClose={() => state.setModalItem(null)}
          onAdd={(item, opts) => state.addToCart(item, opts)}
        />
      )}
      {state.editLineUid && (() => {
        const line = state.cart.find(l => l.uid === state.editLineUid);
        if (!line) return null;
        return (
          <LineEditor
            line={line}
            onClose={() => state.setEditLineUid(null)}
            onSave={(patch) => state.updateLine(state.editLineUid, patch)}
            onRemove={() => state.removeLine(state.editLineUid)}
          />
        );
      })()}
      {memberPickerOpen && (
        <MemberPicker current={state.member} onPick={state.setMember} onClose={() => setMemberPickerOpen(false)} />
      )}
    </div>
  );
}

function App() {
  const [tweaks, setTweaks] = aUS(POS_TWEAK_DEFAULTS);
  const [editMode, setEditMode] = aUS(false);
  const [memberPickerOpen, setMemberPickerOpen] = aUS(false);
  const [focus, setFocus] = aUS("soft"); // which variant to show in single-view
  const [auxPage, setAuxPage] = aUS(null); // null | "kitchen" | "refunds" | "eod"

  // Independent state per variant so cart state is separable in the canvas
  const classicState = usePOSState();
  const softState    = usePOSState();
  const editorialState = usePOSState();
  const mobileState  = usePOSState();

  aUE(() => {
    const handler = (e) => {
      const d = e.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "__activate_edit_mode")   setEditMode(true);
      if (d.type === "__deactivate_edit_mode") setEditMode(false);
    };
    window.addEventListener("message", handler);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", handler);
  }, []);

  // Prime each variant's cart with a couple items so previews look populated
  aUE(() => {
    if (softState.cart.length === 0) {
      softState.addToCart(POS_PRODUCTS.find(p => p.id === "p5"), { size: POS_MODIFIERS.size[1], milk: POS_MODIFIERS.milk[1], shots: POS_MODIFIERS.shots[0], temp: POS_MODIFIERS.temp[0], notes: null });
      softState.addToCart(POS_PRODUCTS.find(p => p.id === "p22"), {});
      softState.setMember(POS_MEMBERS[1]);
    }
    if (classicState.cart.length === 0) {
      classicState.addToCart(POS_PRODUCTS.find(p => p.id === "p14"), { size: POS_MODIFIERS.size[2], milk: POS_MODIFIERS.milk[1], shots: POS_MODIFIERS.shots[0], temp: POS_MODIFIERS.temp[0], notes: null });
      classicState.addToCart(POS_PRODUCTS.find(p => p.id === "p28"), {});
    }
    if (editorialState.cart.length === 0) {
      editorialState.addToCart(POS_PRODUCTS.find(p => p.id === "p6"), { size: POS_MODIFIERS.size[1], milk: POS_MODIFIERS.milk[0], shots: POS_MODIFIERS.shots[0], temp: POS_MODIFIERS.temp[0], notes: null });
      editorialState.addToCart(POS_PRODUCTS.find(p => p.id === "p23"), {});
      editorialState.setMember(POS_MEMBERS[3]);
    }
    if (mobileState.cart.length === 0) {
      mobileState.addToCart(POS_PRODUCTS.find(p => p.id === "p5"),  { size: POS_MODIFIERS.size[1], milk: POS_MODIFIERS.milk[1], shots: POS_MODIFIERS.shots[0], temp: POS_MODIFIERS.temp[0], notes: "Extra hot" });
      mobileState.addToCart(POS_PRODUCTS.find(p => p.id === "p22"), {});
      mobileState.setMember(POS_MEMBERS[2]);
    }
    // eslint-disable-next-line
  }, []);

  const setTweak = (k, v) => {
    setTweaks(prev => ({ ...prev, [k]: v }));
    try { window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [k]: v } }, "*"); } catch {}
  };

  const IPAD_W = 1180;
  const IPAD_H = 820;

  const stateByVariant = { classic: classicState, soft: softState, editorial: editorialState };

  if (tweaks.view === "single") {
    const s = stateByVariant[focus];
    return (
      <div className="fixed inset-0 flex flex-col bg-stone-200">
        <div className="h-12 bg-white border-b border-stone-300 flex items-center px-4 gap-2 shrink-0">
          <div className="text-[13px] font-semibold">POS · Fullscreen preview</div>
          <div className="text-[11.5px] text-stone-500">{{classic:"Classic grid",soft:"Soft cards (default)",editorial:"Editorial menu"}[focus]}</div>
          <div className="ml-auto inline-flex gap-1 rounded-lg border border-stone-300 overflow-hidden">
            {["classic","soft","editorial"].map(v => (
              <button key={v} onClick={() => setFocus(v)} className={`px-3 py-1.5 text-[11.5px] font-medium ${focus === v ? "bg-stone-900 text-white" : "bg-white hover:bg-stone-50"}`}>{v}</button>
            ))}
          </div>
          <button onClick={() => setTweak("view", "canvas")} className="h-8 px-3 rounded-lg border border-stone-300 text-[11.5px] font-medium bg-white hover:bg-stone-50 inline-flex items-center gap-1.5"><Icon name="layout-grid" size={13}/>Back to canvas</button>
        </div>
        <div className="flex-1 overflow-hidden flex items-center justify-center p-8">
          <div className="rounded-2xl overflow-hidden shadow-2xl">
            <POSFrame variant={focus} state={s} W={IPAD_W} H={IPAD_H} memberPickerOpen={memberPickerOpen} setMemberPickerOpen={setMemberPickerOpen} cartPosition={tweaks.cartPosition} density={tweaks.density}/>
          </div>
        </div>
        {editMode && <TweaksPanel tweaks={tweaks} setTweak={setTweak} />}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden">
      <DesignCanvas>
        <DCSection id="flow" title="POS · Soft variant" subtitle="Interactive flow — click through Order → Pay → Receipt">
          <DCArtboard id="flow-single" label="Full flow" subtitle="Single page · all three stages in one artboard" width={IPAD_W} height={IPAD_H}>
            <POSFrame variant="soft" state={softState} W={IPAD_W} H={IPAD_H} memberPickerOpen={memberPickerOpen} setMemberPickerOpen={setMemberPickerOpen} cartPosition={tweaks.cartPosition} density={tweaks.density}/>
          </DCArtboard>
        </DCSection>
        <DCSection id="mobile" title="POS · Mobile" subtitle="iPhone-style register for handhelds, table-side, and pop-ups">
          <DCArtboard id="mobile-iphone" label="iPhone register" subtitle="Tap menu → cart → charge" width={460} height={920}>
            <div className="absolute inset-0 flex items-center justify-center bg-stone-100">
              <IOSDevice width={402} height={874} dark={false}>
                <MobileFrame state={mobileState}/>
              </IOSDevice>
            </div>
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      {editMode && <TweaksPanel tweaks={tweaks} setTweak={setTweak} />}
    </div>
  );
}

// Pre-seeded flow states (one per stage) so the 3 flow artboards are self-contained
function useFlowState(stage) {
  const s = usePOSState();
  aUE(() => {
    if (s.cart.length === 0) {
      s.addToCart(POS_PRODUCTS.find(p => p.id === "p5"),  { size: POS_MODIFIERS.size[1], milk: POS_MODIFIERS.milk[1], shots: POS_MODIFIERS.shots[0], temp: POS_MODIFIERS.temp[0], notes: "Extra hot" });
      s.addToCart(POS_PRODUCTS.find(p => p.id === "p14"), { size: POS_MODIFIERS.size[2], milk: POS_MODIFIERS.milk[1], shots: POS_MODIFIERS.shots[0], temp: POS_MODIFIERS.temp[0], notes: null });
      s.addToCart(POS_PRODUCTS.find(p => p.id === "p24"), {});
      s.setMember(POS_MEMBERS[1]);
      if (stage === "pay") s.setStage("pay");
      if (stage === "receipt") s.setStage("receipt");
    }
  // eslint-disable-next-line
  }, []);
  return s;
}

// ─── Tweaks panel ───
function TweaksPanel({ tweaks, setTweak }) {
  const [collapsed, setCollapsed] = aUS(false);
  return (
    <div className="fixed bottom-4 right-4 z-50 bg-stone-900 text-stone-100 rounded-xl shadow-2xl border border-stone-800 w-[280px]">
      <div className="px-3 py-2.5 border-b border-stone-800 flex items-center gap-2">
        <Icon name="sliders-horizontal" size={13} className="text-stone-400" />
        <div className="text-[12px] font-semibold">Tweaks</div>
        <button onClick={() => setCollapsed(c => !c)} className="ml-auto p-1 hover:bg-stone-800 rounded text-stone-400">
          <Icon name={collapsed ? "chevron-up" : "chevron-down"} size={13} />
        </button>
      </div>
      {!collapsed && (
        <div className="p-3 space-y-4 text-[12px]">
          <TweakRow label="View">
            <div className="grid grid-cols-2 gap-1">
              {[{v:"canvas",l:"Canvas"},{v:"single",l:"Single"}].map(o => (
                <button key={o.v} onClick={() => setTweak("view", o.v)}
                  className={`px-2 py-1.5 rounded text-[11.5px] font-medium ${tweaks.view === o.v ? "bg-white text-stone-900" : "bg-stone-800 text-stone-300 hover:bg-stone-700"}`}>{o.l}</button>
              ))}
            </div>
          </TweakRow>
          <TweakRow label="Cart position" hint="Soft variant only">
            <div className="grid grid-cols-3 gap-1">
              {[{v:"left",l:"Left"},{v:"right",l:"Right"},{v:"bottom",l:"Bottom"}].map(o => (
                <button key={o.v} onClick={() => setTweak("cartPosition", o.v)}
                  className={`px-2 py-1.5 rounded text-[11.5px] font-medium ${tweaks.cartPosition === o.v ? "bg-white text-stone-900" : "bg-stone-800 text-stone-300 hover:bg-stone-700"}`}>{o.l}</button>
              ))}
            </div>
          </TweakRow>
          <TweakRow label="Grid density" hint="Soft variant only">
            <div className="grid grid-cols-2 gap-1">
              {[{v:"comfy",l:"Comfy · 4 cols"},{v:"dense",l:"Dense · 6 cols"}].map(o => (
                <button key={o.v} onClick={() => setTweak("density", o.v)}
                  className={`px-2 py-1.5 rounded text-[11.5px] font-medium ${tweaks.density === o.v ? "bg-white text-stone-900" : "bg-stone-800 text-stone-300 hover:bg-stone-700"}`}>{o.l}</button>
              ))}
            </div>
          </TweakRow>
          <TweakRow label="Supporting screens">
            <button onClick={() => setTweak("showAuxScreens", !tweaks.showAuxScreens)}
              className={`w-full px-2 py-1.5 rounded text-[11.5px] font-medium ${tweaks.showAuxScreens ? "bg-white text-stone-900" : "bg-stone-800 text-stone-300 hover:bg-stone-700"}`}>
              {tweaks.showAuxScreens ? "Shown" : "Hidden"}
            </button>
          </TweakRow>
        </div>
      )}
    </div>
  );
}
function TweakRow({ label, hint, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <div className="text-[10.5px] uppercase tracking-wider font-semibold text-stone-400">{label}</div>
        {hint && <div className="text-[10.5px] text-stone-500">· {hint}</div>}
      </div>
      {children}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
