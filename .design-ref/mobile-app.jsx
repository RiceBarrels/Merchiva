// Mobile.html entry — single interactive iPhone app.
// Bottom tab bar drives routing: Staffing (AB variant) and More (Settings A variant).

function MobileApp() {
  const [route, setRoute] = mstUS('staffing'); // 'home' | 'staffing' | 'sales' | 'chat' | 'more'

  // Render the selected screen WITHOUT its internal MTabBar (we render one shared bar below).
  let screen;
  if (route === 'staffing') {
    screen = <MobileStaffingAB __hideTabBar />;
  } else if (route === 'more') {
    screen = <MobileSettingsA __hideTabBar />;
  } else {
    screen = <PlaceholderScreen route={route} />;
  }

  const tabItems = [
    { id: 'home',     icon: 'building', label: 'Home' },
    { id: 'staffing', icon: 'calendar', label: 'Staffing' },
    { id: 'sales',    icon: 'zap',      label: 'Sales' },
    { id: 'chat',     icon: 'msgs',     label: 'Chat' },
    { id: 'more',     icon: 'more',     label: 'More' },
  ];

  return (
    <div style={{
      width: '100%', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f0eee9',
      padding: '40px 0',
    }}>
      <IOSDevice width={402} height={874}>
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: M.bg }}>
          <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }} className="no-scrollbar">
            {screen}
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
            <MTabBar current={route} onTab={setRoute} items={tabItems} />
          </div>
        </div>
      </IOSDevice>
    </div>
  );
}

// Stub for tabs we haven't designed.
function PlaceholderScreen({ route }) {
  const labels = { home: 'Home', sales: 'Sales', chat: 'Chat' };
  return (
    <div style={{
      background: M.bg, minHeight: '100%', paddingBottom: 100, fontFamily: M.font,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ paddingTop: 54 }}>
        <div style={{ padding: '6px 20px 6px', fontSize: 34, fontWeight: 700, letterSpacing: 0.37, lineHeight: '41px' }}>
          {labels[route] || route}
        </div>
      </div>
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: M.sec, fontSize: 15, padding: 40, textAlign: 'center',
      }}>
        Not yet designed. Tap <span style={{ color: M.tint, fontWeight: 600 }}>&nbsp;Staffing&nbsp;</span> or <span style={{ color: M.tint, fontWeight: 600 }}>&nbsp;More&nbsp;</span> below.
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<MobileApp />);
