// ═══════════════════════════════════════════════════════════
// 组织图 · Data
// • Person nodes have absolute (x,y) on the canvas
// • Group nodes have (x,y,w,h) — a dashed frame containing their members
// • A person belongs to a group via `groupId` (or null for floating)
// • Edges represent "manages" relationships, free-form between any nodes
// • Each node (person OR group) has its own permission set
// ═══════════════════════════════════════════════════════════

const ORG_STORES = [
  { id: 's-oak', name: 'Oakland',    cn: '奥克兰店',   color: '#0891b2' },
  { id: 's-bk',  name: 'Berkeley',   cn: '伯克利店',   color: '#7c3aed' },
  { id: 's-sf',  name: 'SF Mission', cn: '旧金山店',   color: '#ea580c' },
];

// ─── Permissions catalog ────────────────────────────────────
const ORG_PERMS = [
  { group: '人员',  items: [
    { id: 'people.view',     cn: '查看成员',     desc: '查看团队列表与个人资料' },
    { id: 'people.edit',     cn: '编辑成员',     desc: '修改资料、添加 / 移除' },
    { id: 'people.perms',    cn: '管理权限',     desc: '为他人分配权限', sensitive: true },
    { id: 'people.payroll',  cn: '工资 & 合同', desc: '查看与发起工资', sensitive: true },
  ]},
  { group: '排班',  items: [
    { id: 'schedule.view',   cn: '查看排班',     desc: '本店与个人排班' },
    { id: 'schedule.edit',   cn: '编辑排班',     desc: '创建 / 调整班次' },
    { id: 'schedule.approve',cn: '审批请假',     desc: '处理请假 / 调班' },
  ]},
  { group: '门店',  items: [
    { id: 'store.sales',     cn: '销售数据',     desc: '营业额与销售报表' },
    { id: 'store.pos',       cn: 'POS 操作',     desc: '收银、退款、关班' },
    { id: 'store.inventory', cn: '库存',         desc: '盘点、订货、调拨' },
    { id: 'store.settings',  cn: '门店设置',     desc: '营业时间、价格', sensitive: true },
  ]},
  { group: '培训',  items: [
    { id: 'train.author',    cn: '编写课程',     desc: '创建与发布培训' },
    { id: 'train.evaluate',  cn: '评估学员',     desc: '观察、打分、决定上岗' },
    { id: 'train.take',      cn: '参加培训',     desc: '完成分配的任务' },
  ]},
];
const ORG_PERMS_FLAT = ORG_PERMS.flatMap(g => g.items.map(i => ({ ...i, group: g.group })));

// ─── Role presets ──────────────────────────────────────────
const ORG_ROLES = {
  admin:    { cn: '老板',     en: 'Owner',    color: '#1c1917', tone: 'bg-stone-900 text-white',         perms: ORG_PERMS_FLAT.map(p => p.id) },
  ops:      { cn: '运营总监', en: 'Ops',      color: '#44403c', tone: 'bg-stone-700 text-white',         perms: ['people.view','people.edit','people.perms','people.payroll','schedule.view','schedule.edit','schedule.approve','store.sales','store.inventory','store.settings','train.author','train.evaluate'] },
  manager:  { cn: '门店经理', en: 'Manager',  color: '#7c3aed', tone: 'bg-violet-100 text-violet-800',   perms: ['people.view','people.edit','schedule.view','schedule.edit','schedule.approve','store.sales','store.pos','store.inventory','train.author','train.evaluate'] },
  lead:     { cn: '领班',     en: 'Lead',     color: '#0891b2', tone: 'bg-cyan-100 text-cyan-800',       perms: ['people.view','schedule.view','schedule.edit','store.sales','store.pos','store.inventory','train.evaluate','train.take'] },
  staff:    { cn: '员工',     en: 'Staff',    color: '#78716c', tone: 'bg-stone-200 text-stone-800',     perms: ['schedule.view','store.pos','train.take'] },
  intern:   { cn: '实习生',   en: 'Intern',   color: '#a8a29e', tone: 'bg-stone-100 text-stone-600',     perms: ['schedule.view','train.take'] },
};

const ORG_GROUP_PRESETS = {
  store:   { cn: '门店团队', icon: 'store',       color: '#0891b2' },
  region:  { cn: '区域团队', icon: 'map',         color: '#7c3aed' },
  ops:     { cn: '总部',     icon: 'building',    color: '#44403c' },
  custom:  { cn: '自定义',   icon: 'users-round', color: '#78716c' },
};

// Card dims (also used in canvas)
const CARD_W = 220;
const CARD_H = 78;
const GROUP_HEADER_H = 52;   // header strip on top of each group frame
const GROUP_PAD_X = 18;
const GROUP_PAD_Y = 14;

// ─── Seed ──────────────────────────────────────────────────
// Helper to lay out people in a grid inside a group
function layoutInGroup(groupX, groupY, members, cols = 2) {
  const COL_GAP = 16;
  const ROW_GAP = 16;
  return members.map((m, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      ...m,
      x: groupX + GROUP_PAD_X + col * (CARD_W + COL_GAP),
      y: groupY + GROUP_HEADER_H + GROUP_PAD_Y + row * (CARD_H + ROW_GAP),
    };
  });
}
function groupSize(memberCount, cols = 2) {
  const COL_GAP = 16;
  const ROW_GAP = 16;
  const rows = Math.max(1, Math.ceil(memberCount / cols));
  return {
    w: GROUP_PAD_X * 2 + cols * CARD_W + (cols - 1) * COL_GAP,
    h: GROUP_HEADER_H + GROUP_PAD_Y * 2 + rows * CARD_H + (rows - 1) * ROW_GAP,
  };
}

// HQ group + people
const HQ_X = 540, HQ_Y = 40;
const hqSize = groupSize(2, 2);
const hqPeople = layoutInGroup(HQ_X, HQ_Y, [
  { id: 'n-owner',  kind: 'person', groupId: 'g-hq', name: '李志强',      en: 'Zhiqiang Li',  role: 'admin', storeId: null, email: 'zhiqiang@maple.co', phone: '+1 510 555 0100', status: 'active',  joined: '2019-03-01', payType: 'salary', wage: 12500, currency: 'USD', perms: ORG_ROLES.admin.perms },
  { id: 'n-ops',    kind: 'person', groupId: 'g-hq', name: 'Amelia Chen', en: 'Amelia Chen',  role: 'ops',   storeId: null, email: 'amelia@maple.co',   phone: '+1 510 555 0101', status: 'active',  joined: '2021-06-15', payType: 'salary', wage:  8200, currency: 'USD', perms: ORG_ROLES.ops.perms },
]);

// Oakland
const OAK_X = 60, OAK_Y = 320;
const oakSize = groupSize(5, 2);
const oakPeople = layoutInGroup(OAK_X, OAK_Y, [
  { id: 'n-oak-mgr',  kind: 'person', groupId: 'g-oak', name: 'Priya Nair',   en: 'Priya Nair',  role: 'manager', storeId: 's-oak', email: 'priya@maple.co',  phone: '+1 510 555 0110', status: 'active',  joined: '2022-01-10', payType: 'salary', wage: 6400, currency: 'USD', perms: ORG_ROLES.manager.perms },
  { id: 'n-oak-lead', kind: 'person', groupId: 'g-oak', name: 'Marcus Lee',   en: 'Marcus Lee',  role: 'lead',    storeId: 's-oak', email: 'marcus@maple.co', phone: '+1 510 555 0111', status: 'active',  joined: '2022-05-04', payType: 'hourly', wage:   28, currency: 'USD', perms: [...ORG_ROLES.lead.perms, 'schedule.approve'] },
  { id: 'n-oak-s1',   kind: 'person', groupId: 'g-oak', name: 'Sofia Rossi',  en: 'Sofia Rossi', role: 'staff',   storeId: 's-oak', email: 'sofia@maple.co',  phone: '+1 510 555 0112', status: 'active',  joined: '2023-05-25', payType: 'hourly', wage:   22, currency: 'USD', perms: ORG_ROLES.staff.perms },
  { id: 'n-oak-s2',   kind: 'person', groupId: 'g-oak', name: 'Noah Becker',  en: 'Noah Becker', role: 'staff',   storeId: 's-oak', email: 'noah@maple.co',   phone: '+1 510 555 0113', status: 'active',  joined: '2024-02-12', payType: 'hourly', wage:   21, currency: 'USD', perms: ORG_ROLES.staff.perms },
  { id: 'n-oak-i1',   kind: 'person', groupId: 'g-oak', name: 'Devon Ray',    en: 'Devon Ray',   role: 'intern',  storeId: 's-oak', email: 'devon@maple.co',  phone: '+1 510 555 0114', status: 'invited', joined: '2026-05-22', payType: 'hourly', wage:   17, currency: 'USD', perms: ORG_ROLES.intern.perms },
]);

// Berkeley
const BK_X = 60 + oakSize.w + 40, BK_Y = 320;
const bkSize = groupSize(5, 2);
const bkPeople = layoutInGroup(BK_X, BK_Y, [
  { id: 'n-bk-mgr',  kind: 'person', groupId: 'g-bk', name: '王雪',         en: 'Xue Wang',    role: 'manager', storeId: 's-bk', email: 'xue@maple.co',     phone: '+1 510 555 0120', status: 'active', joined: '2022-08-01', payType: 'salary', wage: 6500, currency: 'USD', perms: ORG_ROLES.manager.perms },
  { id: 'n-bk-lead', kind: 'person', groupId: 'g-bk', name: 'Jordan Pham',  en: 'Jordan Pham', role: 'lead',    storeId: 's-bk', email: 'jordan@maple.co',  phone: '+1 510 555 0121', status: 'active', joined: '2023-01-10', payType: 'hourly', wage:   27, currency: 'USD', perms: ORG_ROLES.lead.perms },
  { id: 'n-bk-s1',   kind: 'person', groupId: 'g-bk', name: 'Elena Park',   en: 'Elena Park',  role: 'staff',   storeId: 's-bk', email: 'elena@maple.co',   phone: '+1 510 555 0122', status: 'active', joined: '2023-09-12', payType: 'hourly', wage:   22, currency: 'USD', perms: ORG_ROLES.staff.perms },
  { id: 'n-bk-s2',   kind: 'person', groupId: 'g-bk', name: '陈小雨',       en: 'Xiaoyu Chen', role: 'staff',   storeId: 's-bk', email: 'xiaoyu@maple.co',  phone: '+1 510 555 0123', status: 'active', joined: '2024-07-08', payType: 'hourly', wage:   21, currency: 'USD', perms: ORG_ROLES.staff.perms },
  { id: 'n-bk-s3',   kind: 'person', groupId: 'g-bk', name: 'Hana Sato',    en: 'Hana Sato',   role: 'staff',   storeId: 's-bk', email: 'hana@maple.co',    phone: '+1 510 555 0124', status: 'active', joined: '2025-02-18', payType: 'hourly', wage:   20, currency: 'USD', perms: ORG_ROLES.staff.perms },
]);

// SF Mission
const SF_X = BK_X + bkSize.w + 40, SF_Y = 320;
const sfSize = groupSize(5, 2);
const sfPeople = layoutInGroup(SF_X, SF_Y, [
  { id: 'n-sf-mgr',  kind: 'person', groupId: 'g-sf', name: '陈建华',       en: 'Jianhua Chen', role: 'manager', storeId: 's-sf', email: 'jianhua@maple.co', phone: '+1 415 555 0130', status: 'active', joined: '2022-03-01', payType: 'salary', wage: 6800, currency: 'USD', perms: ORG_ROLES.manager.perms },
  { id: 'n-sf-lead', kind: 'person', groupId: 'g-sf', name: 'Maya Patel',   en: 'Maya Patel',   role: 'lead',    storeId: 's-sf', email: 'maya@maple.co',    phone: '+1 415 555 0131', status: 'active', joined: '2023-04-20', payType: 'hourly', wage:   29, currency: 'USD', perms: ORG_ROLES.lead.perms },
  { id: 'n-sf-s1',   kind: 'person', groupId: 'g-sf', name: 'Theo Brun',    en: 'Theo Brun',    role: 'staff',   storeId: 's-sf', email: 'theo@maple.co',    phone: '+1 415 555 0132', status: 'active', joined: '2024-01-15', payType: 'hourly', wage:   23, currency: 'USD', perms: ORG_ROLES.staff.perms },
  { id: 'n-sf-s2',   kind: 'person', groupId: 'g-sf', name: 'Linh Tran',    en: 'Linh Tran',    role: 'staff',   storeId: 's-sf', email: 'linh@maple.co',    phone: '+1 415 555 0133', status: 'active', joined: '2024-09-02', payType: 'hourly', wage:   22, currency: 'USD', perms: ORG_ROLES.staff.perms },
  { id: 'n-sf-i1',   kind: 'person', groupId: 'g-sf', name: 'Omar Khalil',  en: 'Omar Khalil',  role: 'intern',  storeId: 's-sf', email: 'omar@maple.co',    phone: '+1 415 555 0134', status: 'invited', joined: '2026-05-10', payType: 'hourly', wage:   17, currency: 'USD', perms: ORG_ROLES.intern.perms },
]);

const ORG_GROUPS_SEED = [
  { id: 'g-hq',  kind: 'group', name: '总部',         groupKind: 'ops',   desc: '运营 · 财务 · HR',   perms: ORG_ROLES.ops.perms,     x: HQ_X, y: HQ_Y, w: hqSize.w, h: hqSize.h },
  { id: 'g-oak', kind: 'group', name: '奥克兰店团队', groupKind: 'store', desc: 'Telegraph Ave',     perms: ORG_ROLES.manager.perms, x: OAK_X, y: OAK_Y, w: oakSize.w, h: oakSize.h },
  { id: 'g-bk',  kind: 'group', name: '伯克利店团队', groupKind: 'store', desc: 'Shattuck Ave',      perms: ORG_ROLES.manager.perms, x: BK_X,  y: BK_Y,  w: bkSize.w,  h: bkSize.h },
  { id: 'g-sf',  kind: 'group', name: '旧金山店团队', groupKind: 'store', desc: 'Mission St',        perms: ORG_ROLES.manager.perms, x: SF_X,  y: SF_Y,  w: sfSize.w,  h: sfSize.h },
];

const ORG_NODES_SEED = [
  ...ORG_GROUPS_SEED,
  ...hqPeople,
  ...oakPeople,
  ...bkPeople,
  ...sfPeople,
];

// Edges show "manages" relationships
const ORG_EDGES_SEED = [
  { id: 'e1',  from: 'n-owner',   to: 'n-ops' },

  // Ops oversees each store group
  { id: 'e2',  from: 'n-ops',     to: 'g-oak' },
  { id: 'e3',  from: 'n-ops',     to: 'g-bk' },
  { id: 'e4',  from: 'n-ops',     to: 'g-sf' },

  // Each manager runs their store group
  { id: 'e5',  from: 'n-oak-mgr', to: 'n-oak-lead' },
  { id: 'e6',  from: 'n-oak-lead',to: 'n-oak-s1' },
  { id: 'e7',  from: 'n-oak-lead',to: 'n-oak-s2' },
  { id: 'e8',  from: 'n-oak-mgr', to: 'n-oak-i1' },

  { id: 'e9',  from: 'n-bk-mgr',  to: 'n-bk-lead' },
  { id: 'e10', from: 'n-bk-lead', to: 'n-bk-s1' },
  { id: 'e11', from: 'n-bk-lead', to: 'n-bk-s2' },
  { id: 'e12', from: 'n-bk-mgr',  to: 'n-bk-s3' },

  { id: 'e13', from: 'n-sf-mgr',  to: 'n-sf-lead' },
  { id: 'e14', from: 'n-sf-lead', to: 'n-sf-s1' },
  { id: 'e15', from: 'n-sf-lead', to: 'n-sf-s2' },
  { id: 'e16', from: 'n-sf-mgr',  to: 'n-sf-i1' },
];

// ─── Shared responsive hook ────────────────────────────────
function useIsMobile(breakpoint = 768) {
  const { useState, useEffect } = React;
  const query = `(max-width: ${breakpoint - 1}px)`;
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query).matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange);
    };
  }, [query]);
  return isMobile;
}

Object.assign(window, {
  ORG_STORES, ORG_ROLES, ORG_PERMS, ORG_PERMS_FLAT,
  ORG_GROUP_PRESETS, ORG_NODES_SEED, ORG_EDGES_SEED,
  CARD_W, CARD_H, GROUP_HEADER_H, GROUP_PAD_X, GROUP_PAD_Y,
  groupSize, layoutInGroup, useIsMobile,
});
