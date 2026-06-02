// Seed examples.

function seedFunctions() {
  // Helper builders
  const mk = (typeId, x, y, data={}) => ({
    ...makeNode(typeId, x, y, { data }),
  });
  const wire = (from, to) => ({ from, to });

  // 1) celsiusToFahrenheit(c) => c * 9/5 + 32
  const c2f = (() => {
    const param = mk('param', 60, 80, { name:'c', type:'number' });
    const nine = mk('const-num', 60, 200, { value: 9 });
    const five = mk('const-num', 60, 280, { value: 5 });
    const div = mk('math-bin', 320, 240, { op:'/' });
    const mul = mk('math-bin', 560, 140, { op:'*' });
    const thirtyTwo = mk('const-num', 560, 320, { value: 32 });
    const add = mk('math-bin', 800, 200, { op:'+' });
    const ret = mk('return', 1060, 200);
    const edges = [
      wire({node:nine.id, port:'out'}, {node:div.id, port:'a'}),
      wire({node:five.id, port:'out'}, {node:div.id, port:'b'}),
      wire({node:param.id, port:'out'}, {node:mul.id, port:'a'}),
      wire({node:div.id, port:'out'}, {node:mul.id, port:'b'}),
      wire({node:mul.id, port:'out'}, {node:add.id, port:'a'}),
      wire({node:thirtyTwo.id, port:'out'}, {node:add.id, port:'b'}),
      wire({node:add.id, port:'out'}, {node:ret.id, port:'value'}),
    ];
    return {
      id:'fn_c2f', name:'celsiusToFahrenheit',
      desc:'Convert °C to °F',
      nodes:[param, nine, five, div, mul, thirtyTwo, add, ret],
      edges,
      tests:[{ args:['100'], expect:'212' }, { args:['0'], expect:'32' }],
    };
  })();

  // 2) greet(name) => "Hello, NAME!"
  const greet = (() => {
    const p = mk('param', 60, 100, { name:'name', type:'string' });
    const upper = mk('str-method', 320, 100, { fn:'toUpperCase' });
    const tpl = mk('str-template', 580, 100, { tpl:'Hello, {a}!' });
    const ret = mk('return', 840, 100);
    const edges = [
      wire({node:p.id, port:'out'}, {node:upper.id, port:'s'}),
      wire({node:upper.id, port:'out'}, {node:tpl.id, port:'a'}),
      wire({node:tpl.id, port:'out'}, {node:ret.id, port:'value'}),
    ];
    return {
      id:'fn_greet', name:'greet',
      desc:'Friendly greeting',
      nodes:[p, upper, tpl, ret],
      edges,
      tests:[{ args:['"world"'], expect:'"Hello, WORLD!"' }],
    };
  })();

  // 3) sumDoubled(arr) => arr.map(x=>x*2).reduce(+)
  const sumDoubled = (() => {
    const p = mk('param', 60, 100, { name:'arr', type:'array' });
    const item = mk('param', 60, 260, { name:'item', type:'number' });
    const two = mk('const-num', 60, 360, { value:2 });
    const mul = mk('math-bin', 320, 300, { op:'*' });
    const map = mk('arr-map', 580, 160, { iter:'item' });
    const sum = mk('arr-reduce', 840, 160);
    const ret = mk('return', 1080, 160);
    const edges = [
      wire({node:item.id, port:'out'}, {node:mul.id, port:'a'}),
      wire({node:two.id, port:'out'}, {node:mul.id, port:'b'}),
      wire({node:p.id, port:'out'}, {node:map.id, port:'arr'}),
      wire({node:mul.id, port:'out'}, {node:map.id, port:'expr'}),
      wire({node:map.id, port:'out'}, {node:sum.id, port:'arr'}),
      wire({node:sum.id, port:'out'}, {node:ret.id, port:'value'}),
    ];
    return {
      id:'fn_sumdbl', name:'sumDoubled',
      desc:'Sum of all items × 2',
      nodes:[p, item, two, mul, map, sum, ret],
      edges,
      tests:[{ args:['[1,2,3,4]'], expect:'20' }],
    };
  })();

  // 4) priceWithTax(price, taxRate) — conditional discount
  const priceTax = (() => {
    const price = mk('param', 60, 80, { name:'price', type:'number' });
    const tax = mk('param', 60, 160, { name:'taxRate', type:'number' });
    const threshold = mk('const-num', 60, 260, { value:100 });
    const cmp = mk('compare', 320, 200, { op:'>=' });
    const discount = mk('const-num', 60, 380, { value:0.9 });
    const one = mk('const-num', 60, 460, { value:1 });
    const ratio = mk('ternary', 320, 380);
    const subtotal = mk('math-bin', 580, 280, { op:'*' });
    const onePlus = mk('math-bin', 580, 460, { op:'+' });
    const oneB = mk('const-num', 580, 540, { value:1 });
    const total = mk('math-bin', 840, 360, { op:'*' });
    const ret = mk('return', 1100, 360);
    const edges = [
      wire({node:price.id, port:'out'}, {node:cmp.id, port:'a'}),
      wire({node:threshold.id, port:'out'}, {node:cmp.id, port:'b'}),
      wire({node:cmp.id, port:'out'}, {node:ratio.id, port:'cond'}),
      wire({node:discount.id, port:'out'}, {node:ratio.id, port:'a'}),
      wire({node:one.id, port:'out'}, {node:ratio.id, port:'b'}),
      wire({node:price.id, port:'out'}, {node:subtotal.id, port:'a'}),
      wire({node:ratio.id, port:'out'}, {node:subtotal.id, port:'b'}),
      wire({node:tax.id, port:'out'}, {node:onePlus.id, port:'a'}),
      wire({node:oneB.id, port:'out'}, {node:onePlus.id, port:'b'}),
      wire({node:subtotal.id, port:'out'}, {node:total.id, port:'a'}),
      wire({node:onePlus.id, port:'out'}, {node:total.id, port:'b'}),
      wire({node:total.id, port:'out'}, {node:ret.id, port:'value'}),
    ];
    return {
      id:'fn_pricetax', name:'priceWithTax',
      desc:'Apply 10% discount over $100, then tax',
      nodes:[price, tax, threshold, cmp, discount, one, ratio, subtotal, onePlus, oneB, total, ret],
      edges,
      tests:[
        { args:['50','0.08'], expect:'54' },
        { args:['200','0.08'], expect:'194.4' },
      ],
    };
  })();

  return [c2f, greet, sumDoubled, priceTax];
}

window.seedFunctions = seedFunctions;
