// Design canvas for Mobile Punch-In variants.
// Three iOS-frame artboards side-by-side in one section, each independently
// steppable through the states (off duty → on shift → on break → day closed).

function MobilePunchCanvas() {
  return (
    <DesignCanvas bg="#f0eee9" initialScale={0.62}>
      <DCSection
        id="punch"
        title="Mobile Punch-In"
        subtitle="Three directions. Each frame steps through off-duty → on shift → on break → day closed using the chips under the phone."
      >
        <DCArtboard id="a" label="A · Hero Clock" width={402} height={920}>
          <PunchArtboard Variant={PunchVariantA} initialState="out" />
        </DCArtboard>

        <DCArtboard id="b" label="B · Status Card" width={402} height={920}>
          <PunchArtboard Variant={PunchVariantB} initialState="in" />
        </DCArtboard>

        <DCArtboard id="c" label="C · Hold-to-Punch" width={402} height={920}>
          <PunchArtboard Variant={PunchVariantC} initialState="out" />
        </DCArtboard>
      </DCSection>

      <DCPostIt top={40} left={40} rotate={-3} width={210}>
        Commits to the existing bizops stone-tone + iOS-grouped aesthetic. Shift context (Amelia, Shift Lead, 7a–3p) is shared across all three.
      </DCPostIt>
    </DesignCanvas>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<MobilePunchCanvas />);
