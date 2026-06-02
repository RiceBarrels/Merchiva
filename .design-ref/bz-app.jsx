// BizOps Mobile — single interactive phone.
// Tab bar routes between Staffing, Settings, and placeholders for the rest.

function BzApp() {
  const [route, setRoute] = bzUS(() => {
    try { return localStorage.getItem('bz.route') || 'dashboard'; } catch { return 'dashboard'; }
  });
  const go = (id) => {
    setRoute(id);
    try { localStorage.setItem('bz.route', id); } catch {}
  };

  let screen;
  if (route === 'dashboard') screen = <BzDashboard onGo={go} />;
  else if (route === 'staffing') screen = <BzStaffing />;
  else if (route === 'settings') screen = <BzSettings />;
  else screen = <BzPlaceholder route={route} />;

  return (
    <div style={{
      width: '100%', minHeight: '100vh',
      background: B.surface,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 0',
      fontFamily: B.font,
    }}>
      <IOSDevice width={402} height={874}>
        <div style={{ position: 'relative', width: '100%', height: '100%', background: B.bg, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {screen}
            </div>
            <TabBar current={route} onTab={go} />
          </div>
        </div>
      </IOSDevice>
    </div>
  );
}

function BzPlaceholder({ route }) {
  const labels = {
    dashboard: { title: 'Dashboard', sub: 'Ops overview · not designed yet' },
    inventory: { title: 'Inventory', sub: 'Stock & products · not designed yet' },
    sales:     { title: 'Sales',     sub: 'Revenue & reports · not designed yet' },
  };
  const meta = labels[route] || { title: route, sub: 'Not designed yet' };
  return (
    <div style={{ background: B.bg, color: B.text, fontFamily: B.font, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar title={meta.title} subtitle={meta.sub} right={<IconBtn icon="plus" />} />
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: B.radius,
          background: B.muted, border: `1px solid ${B.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: B.sec,
        }}>
          <BIcon name={route === 'dashboard' ? 'layout-dashboard' : route === 'inventory' ? 'package' : 'trending-up'} size={22} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, color: B.text2 }}>Not yet designed</div>
        <div style={{ fontSize: 12, color: B.sec, maxWidth: 240 }}>
          This prototype focuses on <span style={{ color: B.text, fontWeight: 500 }}>Staffing</span> and{' '}
          <span style={{ color: B.text, fontWeight: 500 }}>Settings</span>. Tap either in the tab bar below.
        </div>
      </div>
    </div>
  );
}

const bzRoot = ReactDOM.createRoot(document.getElementById('root'));
bzRoot.render(<BzApp />);
