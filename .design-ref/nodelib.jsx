// Node library: every supported node type lives here.
// Each entry defines: category, label, icon, ports, controls, and codegen.
// Ports can be:
//   inputs:  [{id, label, type, control? }]   control: number|string|bool|select|textarea
//   outputs: [{id, label, type}]
// codegen(node, getInExpr) returns:
//   { value }            for pure expression nodes (a single output value)
//   { values: {id: expr}}for multi-output expression nodes
//   { stmt, value }      stmt is run in line, value is the expression
//   { decl }             top-level: param/return/custom-fn nodes (handled specially)
//
// type colors come from CSS: number, string, bool, any, array, object, flow

const T = { number:'number', string:'string', bool:'bool', any:'any', array:'array', object:'object', flow:'flow' };

const NODE_LIB = {
  // -------- INPUTS --------
  'param': {
    cat:'Inputs', label:'Parameter', icon:'\uea7d', iconClass:'input',
    desc:'Function input',
    inputs:[],
    outputs:[{ id:'out', label:'value', type:T.any }],
    controls:[
      { id:'name', kind:'text', placeholder:'name', default:'x' },
      { id:'type', kind:'select', options:['any','number','string','bool','array','object'], default:'any' },
    ],
    expr: (n) => safeIdent(n.data.name||'arg'),
  },
  'const-num': {
    cat:'Inputs', label:'Number', icon:'\ueab0', iconClass:'input',
    desc:'Numeric literal',
    inputs:[], outputs:[{id:'out', label:'value', type:T.number}],
    controls:[{ id:'value', kind:'number', default:0 }],
    expr:(n)=> JSON.stringify(Number(n.data.value)||0),
  },
  'const-str': {
    cat:'Inputs', label:'Text', icon:'\ueb0a', iconClass:'input',
    desc:'String literal',
    inputs:[], outputs:[{id:'out', label:'value', type:T.string}],
    controls:[{ id:'value', kind:'text', default:'hello' }],
    expr:(n)=> JSON.stringify(String(n.data.value??'')),
  },
  'const-bool': {
    cat:'Inputs', label:'Boolean', icon:'\ueab1', iconClass:'input',
    desc:'true / false',
    inputs:[], outputs:[{id:'out', label:'value', type:T.bool}],
    controls:[{ id:'value', kind:'bool', default:true }],
    expr:(n)=> n.data.value ? 'true' : 'false',
  },
  'const-arr': {
    cat:'Inputs', label:'Array', icon:'\ueae8', iconClass:'input',
    desc:'JSON array literal',
    inputs:[], outputs:[{id:'out', label:'value', type:T.array}],
    controls:[{ id:'value', kind:'textarea', default:'[1, 2, 3]' }],
    expr:(n)=> {
      try { return JSON.stringify(JSON.parse(n.data.value)); }
      catch { return '[]'; }
    },
  },
  'const-obj': {
    cat:'Inputs', label:'Object', icon:'\ueb96', iconClass:'input',
    desc:'JSON object literal',
    inputs:[], outputs:[{id:'out', label:'value', type:T.object}],
    controls:[{ id:'value', kind:'textarea', default:'{ "a": 1 }' }],
    expr:(n)=> {
      try { return JSON.stringify(JSON.parse(n.data.value)); }
      catch { return '{}'; }
    },
  },

  // -------- MATH --------
  'math-bin': {
    cat:'Math', label:'Math', icon:'\ueb91', iconClass:'logic',
    desc:'a op b',
    inputs:[
      { id:'a', label:'a', type:T.number },
      { id:'b', label:'b', type:T.number },
    ],
    outputs:[{ id:'out', label:'result', type:T.number }],
    controls:[{ id:'op', kind:'select', options:['+','-','*','/','%','**'], default:'+' }],
    expr:(n, get) => `(${get('a','0')} ${n.data.op||'+'} ${get('b','0')})`,
  },
  'math-fn': {
    cat:'Math', label:'Math fn', icon:'\ueb91', iconClass:'logic',
    desc:'Math.x()',
    inputs:[{ id:'x', label:'x', type:T.number }],
    outputs:[{ id:'out', label:'result', type:T.number }],
    controls:[{ id:'fn', kind:'select', options:['abs','floor','ceil','round','sqrt','log','sign','min','max'], default:'round' }],
    expr:(n, get) => `Math.${n.data.fn||'round'}(${get('x','0')})`,
  },
  'compare': {
    cat:'Math', label:'Compare', icon:'\ueb91', iconClass:'logic',
    desc:'a vs b',
    inputs:[
      { id:'a', label:'a', type:T.any },
      { id:'b', label:'b', type:T.any },
    ],
    outputs:[{ id:'out', label:'bool', type:T.bool }],
    controls:[{ id:'op', kind:'select', options:['===','!==','>','<','>=','<='], default:'===' }],
    expr:(n,get)=>`(${get('a','0')} ${n.data.op||'==='} ${get('b','0')})`,
  },
  'logic': {
    cat:'Math', label:'Logic', icon:'\ueb91', iconClass:'logic',
    desc:'and / or / not',
    inputs:[
      { id:'a', label:'a', type:T.bool },
      { id:'b', label:'b', type:T.bool },
    ],
    outputs:[{ id:'out', label:'bool', type:T.bool }],
    controls:[{ id:'op', kind:'select', options:['&&','||','xor','! a'], default:'&&' }],
    expr:(n,get)=>{
      const a = get('a','false'), b = get('b','false');
      const op = n.data.op || '&&';
      if (op === '! a') return `(!${a})`;
      if (op === 'xor') return `((!!${a}) !== (!!${b}))`;
      return `(${a} ${op} ${b})`;
    },
  },

  // -------- STRINGS --------
  'str-concat': {
    cat:'Strings', label:'Concat', icon:'\ueb0a', iconClass:'data',
    desc:'a + b',
    inputs:[
      { id:'a', label:'a', type:T.string },
      { id:'b', label:'b', type:T.string },
    ],
    outputs:[{ id:'out', label:'result', type:T.string }],
    expr:(_,get)=>`String(${get('a','""')}) + String(${get('b','""')})`,
  },
  'str-template': {
    cat:'Strings', label:'Template', icon:'\ueb0a', iconClass:'data',
    desc:'Interpolated text',
    inputs:[
      { id:'a', label:'a', type:T.any },
      { id:'b', label:'b', type:T.any },
      { id:'c', label:'c', type:T.any },
    ],
    outputs:[{ id:'out', label:'result', type:T.string }],
    controls:[{ id:'tpl', kind:'text', default:'Hello {a} you are {b}', placeholder:'use {a} {b} {c}' }],
    expr:(n, get) => {
      const tpl = String(n.data.tpl || '');
      // Convert into a template literal
      const escaped = tpl.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
      const interp = escaped.replace(/\{([abc])\}/g, (_, k) => '${'+get(k,'""')+'}');
      return '`' + interp + '`';
    },
  },
  'str-method': {
    cat:'Strings', label:'String method', icon:'\ueb0a', iconClass:'data',
    desc:'transform',
    inputs:[{ id:'s', label:'str', type:T.string }],
    outputs:[{ id:'out', label:'result', type:T.string }],
    controls:[{ id:'fn', kind:'select', options:['toUpperCase','toLowerCase','trim','length'], default:'toUpperCase' }],
    expr:(n,get)=> n.data.fn==='length'
      ? `String(${get('s','""')}).length`
      : `String(${get('s','""')}).${n.data.fn||'toUpperCase'}()`,
  },

  // -------- ARRAYS / OBJECTS --------
  'arr-map': {
    cat:'Arrays', label:'Map', icon:'\ueae8', iconClass:'data',
    desc:'arr.map(item => expr)',
    inputs:[
      { id:'arr', label:'array', type:T.array },
      { id:'expr', label:'item→', type:T.any },
    ],
    outputs:[{ id:'out', label:'array', type:T.array }],
    controls:[{ id:'iter', kind:'text', default:'item', placeholder:'item name' }],
    // Special: needs lambda. we mark it pure but the codegen wraps into arrow.
    iter:true,
    expr:(n, get, ctx) => {
      const itName = safeIdent(n.data.iter||'item');
      const inner = ctx.exprWithIterator(n.id, 'expr', itName, itName);
      return `(${get('arr','[]')}).map((${itName}) => ${inner})`;
    },
  },
  'arr-filter': {
    cat:'Arrays', label:'Filter', icon:'\ueae8', iconClass:'data',
    desc:'arr.filter(item => bool)',
    inputs:[
      { id:'arr', label:'array', type:T.array },
      { id:'expr', label:'keep?', type:T.bool },
    ],
    outputs:[{ id:'out', label:'array', type:T.array }],
    controls:[{ id:'iter', kind:'text', default:'item' }],
    iter:true,
    expr:(n, get, ctx) => {
      const it = safeIdent(n.data.iter||'item');
      const inner = ctx.exprWithIterator(n.id, 'expr', it, it);
      return `(${get('arr','[]')}).filter((${it}) => ${inner})`;
    },
  },
  'arr-reduce': {
    cat:'Arrays', label:'Sum', icon:'\ueae8', iconClass:'data',
    desc:'arr.reduce((a,b)=>a+b)',
    inputs:[{ id:'arr', label:'array', type:T.array }],
    outputs:[{ id:'out', label:'number', type:T.number }],
    expr:(_,get)=>`(${get('arr','[]')}).reduce((a,b)=>a+Number(b),0)`,
  },
  'arr-len': {
    cat:'Arrays', label:'Length', icon:'\ueae8', iconClass:'data',
    desc:'arr.length',
    inputs:[{ id:'arr', label:'array', type:T.array }],
    outputs:[{ id:'out', label:'count', type:T.number }],
    expr:(_,get)=>`(${get('arr','[]')}).length`,
  },
  'arr-index': {
    cat:'Arrays', label:'At index', icon:'\ueae8', iconClass:'data',
    desc:'arr[i]',
    inputs:[
      { id:'arr', label:'array', type:T.array },
      { id:'i', label:'index', type:T.number },
    ],
    outputs:[{ id:'out', label:'item', type:T.any }],
    expr:(_,get)=>`(${get('arr','[]')})[${get('i','0')}]`,
  },
  'obj-get': {
    cat:'Arrays', label:'Get property', icon:'\ueb96', iconClass:'data',
    desc:'obj[key]',
    inputs:[{ id:'obj', label:'object', type:T.object }],
    outputs:[{ id:'out', label:'value', type:T.any }],
    controls:[{ id:'key', kind:'text', default:'name' }],
    expr:(n,get)=>`(${get('obj','{}')})[${JSON.stringify(n.data.key||'')}]`,
  },

  // -------- LOGIC / FLOW --------
  'ternary': {
    cat:'Flow', label:'If / else', icon:'\uea7e', iconClass:'logic',
    desc:'cond ? a : b',
    inputs:[
      { id:'cond', label:'if', type:T.bool },
      { id:'a', label:'then', type:T.any },
      { id:'b', label:'else', type:T.any },
    ],
    outputs:[{ id:'out', label:'value', type:T.any }],
    expr:(_,get)=>`((${get('cond','false')}) ? (${get('a','undefined')}) : (${get('b','undefined')}))`,
  },

  // -------- I/O --------
  'fetch': {
    cat:'I/O', label:'Fetch JSON', icon:'\uebd6', iconClass:'io',
    desc:'await fetch(url).json()',
    inputs:[{ id:'url', label:'url', type:T.string }],
    outputs:[{ id:'out', label:'data', type:T.any }],
    controls:[{ id:'method', kind:'select', options:['GET','POST'], default:'GET' }],
    async:true,
    expr:(n,get)=>`(await (await fetch(${get('url','""')}, { method: ${JSON.stringify(n.data.method||'GET')} })).json())`,
  },
  'dom-set': {
    cat:'I/O', label:'Set DOM text', icon:'\ueae5', iconClass:'io',
    desc:'set element text',
    inputs:[
      { id:'sel', label:'selector', type:T.string },
      { id:'text', label:'text', type:T.string },
    ],
    outputs:[{ id:'out', label:'ok', type:T.bool }],
    side:true,
    expr:(_,get)=>`((function(){ const el = document.querySelector(${get('sel','""')}); if (el) el.textContent = String(${get('text','""')}); return !!el; })())`,
  },
  'log': {
    cat:'I/O', label:'Log', icon:'\uea99', iconClass:'io',
    desc:'console.log',
    inputs:[
      { id:'label', label:'label', type:T.string },
      { id:'value', label:'value', type:T.any },
    ],
    outputs:[{ id:'out', label:'value', type:T.any }],
    side:true,
    expr:(_,get)=>`((function(){ const v = ${get('value','undefined')}; __log(${get('label','""')}, v); return v; })())`,
  },

  // -------- CUSTOM CALL --------
  'call-fn': {
    cat:'Functions', label:'Call function', icon:'\ueb29', iconClass:'logic',
    desc:'call saved function',
    inputs:[
      { id:'a', label:'arg 1', type:T.any },
      { id:'b', label:'arg 2', type:T.any },
      { id:'c', label:'arg 3', type:T.any },
    ],
    outputs:[{ id:'out', label:'result', type:T.any }],
    controls:[{ id:'fn', kind:'fn-select', default:'' }],
    expr:(n, get, ctx) => {
      const name = ctx.fnExists(n.data.fn) ? safeIdent(n.data.fn) : 'undefined';
      // Determine how many args to pass based on connected inputs
      const args = ['a','b','c']
        .map(k => ctx.isConnected(n.id, k) ? get(k,'undefined') : null)
        .filter(Boolean);
      const argList = args.length ? args.join(', ') : '';
      return `${name}(${argList})`;
    },
  },

  // -------- OUTPUT --------
  'return': {
    cat:'Output', label:'Return', icon:'\ueb1d', iconClass:'output',
    desc:'function output',
    inputs:[{ id:'value', label:'value', type:T.any }],
    outputs:[],
    isReturn:true,
  },
};

function safeIdent(s) {
  s = String(s||'').trim();
  if (!s) return '_';
  s = s.replace(/[^A-Za-z0-9_$]/g, '_');
  if (/^[0-9]/.test(s)) s = '_' + s;
  return s;
}

function makeNode(typeId, x, y, overrides = {}) {
  const def = NODE_LIB[typeId];
  if (!def) throw new Error('unknown node ' + typeId);
  const data = {};
  (def.controls||[]).forEach(c => { data[c.id] = c.default; });
  return {
    id: 'n_' + Math.random().toString(36).slice(2, 9),
    type: typeId,
    x, y,
    data: { ...data, ...(overrides.data||{}) },
    ...overrides,
  };
}

function nodeCategories() {
  const groups = {};
  Object.entries(NODE_LIB).forEach(([id, def]) => {
    if (!groups[def.cat]) groups[def.cat] = [];
    groups[def.cat].push({ id, ...def });
  });
  return groups;
}

Object.assign(window, { NODE_LIB, T, makeNode, safeIdent, nodeCategories });
