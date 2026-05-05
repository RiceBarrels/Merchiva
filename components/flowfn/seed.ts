import { makeNode } from "./node-lib";
import type { FlowFunction, FlowEdge } from "./types";

function wire(from: { node: string; port: string }, to: { node: string; port: string }): FlowEdge {
  return { from, to };
}

export function seedFunctions(): FlowFunction[] {
  // 1) celsiusToFahrenheit(c) => c * 9/5 + 32
  const c2f = (() => {
    const param = makeNode("param", 60, 80, { data: { name: "c", type: "number" } });
    const nine = makeNode("const-num", 60, 200, { data: { value: 9 } });
    const five = makeNode("const-num", 60, 280, { data: { value: 5 } });
    const div = makeNode("math-bin", 320, 240, { data: { op: "/" } });
    const mul = makeNode("math-bin", 560, 140, { data: { op: "*" } });
    const thirtyTwo = makeNode("const-num", 560, 320, { data: { value: 32 } });
    const add = makeNode("math-bin", 800, 200, { data: { op: "+" } });
    const ret = makeNode("return", 1060, 200);
    return {
      id: "fn_c2f",
      name: "celsiusToFahrenheit",
      desc: "Convert C to F",
      nodes: [param, nine, five, div, mul, thirtyTwo, add, ret],
      edges: [
        wire({ node: nine.id, port: "out" }, { node: div.id, port: "a" }),
        wire({ node: five.id, port: "out" }, { node: div.id, port: "b" }),
        wire({ node: param.id, port: "out" }, { node: mul.id, port: "a" }),
        wire({ node: div.id, port: "out" }, { node: mul.id, port: "b" }),
        wire({ node: mul.id, port: "out" }, { node: add.id, port: "a" }),
        wire({ node: thirtyTwo.id, port: "out" }, { node: add.id, port: "b" }),
        wire({ node: add.id, port: "out" }, { node: ret.id, port: "value" }),
      ],
      tests: [
        { args: ["100"], expect: "212" },
        { args: ["0"], expect: "32" },
      ],
    };
  })();

  // 2) greet(name) => "Hello, NAME!"
  const greet = (() => {
    const p = makeNode("param", 60, 100, { data: { name: "name", type: "string" } });
    const upper = makeNode("str-method", 320, 100, { data: { fn: "toUpperCase" } });
    const tpl = makeNode("str-template", 580, 100, { data: { tpl: "Hello, {a}!" } });
    const ret = makeNode("return", 840, 100);
    return {
      id: "fn_greet",
      name: "greet",
      desc: "Friendly greeting",
      nodes: [p, upper, tpl, ret],
      edges: [
        wire({ node: p.id, port: "out" }, { node: upper.id, port: "s" }),
        wire({ node: upper.id, port: "out" }, { node: tpl.id, port: "a" }),
        wire({ node: tpl.id, port: "out" }, { node: ret.id, port: "value" }),
      ],
      tests: [{ args: ['"world"'], expect: '"Hello, WORLD!"' }],
    };
  })();

  // 3) sumDoubled(arr) => arr.map(x=>x*2).reduce(+)
  const sumDoubled = (() => {
    const p = makeNode("param", 60, 100, { data: { name: "arr", type: "array" } });
    const item = makeNode("param", 60, 260, { data: { name: "item", type: "number" } });
    const two = makeNode("const-num", 60, 360, { data: { value: 2 } });
    const mul = makeNode("math-bin", 320, 300, { data: { op: "*" } });
    const map = makeNode("arr-map", 580, 160, { data: { iter: "item" } });
    const sum = makeNode("arr-reduce", 840, 160);
    const ret = makeNode("return", 1080, 160);
    return {
      id: "fn_sumdbl",
      name: "sumDoubled",
      desc: "Sum of all items x 2",
      nodes: [p, item, two, mul, map, sum, ret],
      edges: [
        wire({ node: item.id, port: "out" }, { node: mul.id, port: "a" }),
        wire({ node: two.id, port: "out" }, { node: mul.id, port: "b" }),
        wire({ node: p.id, port: "out" }, { node: map.id, port: "arr" }),
        wire({ node: mul.id, port: "out" }, { node: map.id, port: "expr" }),
        wire({ node: map.id, port: "out" }, { node: sum.id, port: "arr" }),
        wire({ node: sum.id, port: "out" }, { node: ret.id, port: "value" }),
      ],
      tests: [{ args: ["[1,2,3,4]"], expect: "20" }],
    };
  })();

  // 4) priceWithTax(price, taxRate)
  const priceTax = (() => {
    const price = makeNode("param", 60, 80, { data: { name: "price", type: "number" } });
    const tax = makeNode("param", 60, 160, { data: { name: "taxRate", type: "number" } });
    const threshold = makeNode("const-num", 60, 260, { data: { value: 100 } });
    const cmp = makeNode("compare", 320, 200, { data: { op: ">=" } });
    const discount = makeNode("const-num", 60, 380, { data: { value: 0.9 } });
    const one = makeNode("const-num", 60, 460, { data: { value: 1 } });
    const ratio = makeNode("ternary", 320, 380);
    const subtotal = makeNode("math-bin", 580, 280, { data: { op: "*" } });
    const onePlus = makeNode("math-bin", 580, 460, { data: { op: "+" } });
    const oneB = makeNode("const-num", 580, 540, { data: { value: 1 } });
    const total = makeNode("math-bin", 840, 360, { data: { op: "*" } });
    const ret = makeNode("return", 1100, 360);
    return {
      id: "fn_pricetax",
      name: "priceWithTax",
      desc: "Apply 10% discount over $100, then tax",
      nodes: [price, tax, threshold, cmp, discount, one, ratio, subtotal, onePlus, oneB, total, ret],
      edges: [
        wire({ node: price.id, port: "out" }, { node: cmp.id, port: "a" }),
        wire({ node: threshold.id, port: "out" }, { node: cmp.id, port: "b" }),
        wire({ node: cmp.id, port: "out" }, { node: ratio.id, port: "cond" }),
        wire({ node: discount.id, port: "out" }, { node: ratio.id, port: "a" }),
        wire({ node: one.id, port: "out" }, { node: ratio.id, port: "b" }),
        wire({ node: price.id, port: "out" }, { node: subtotal.id, port: "a" }),
        wire({ node: ratio.id, port: "out" }, { node: subtotal.id, port: "b" }),
        wire({ node: tax.id, port: "out" }, { node: onePlus.id, port: "a" }),
        wire({ node: oneB.id, port: "out" }, { node: onePlus.id, port: "b" }),
        wire({ node: subtotal.id, port: "out" }, { node: total.id, port: "a" }),
        wire({ node: onePlus.id, port: "out" }, { node: total.id, port: "b" }),
        wire({ node: total.id, port: "out" }, { node: ret.id, port: "value" }),
      ],
      tests: [
        { args: ["50", "0.08"], expect: "54" },
        { args: ["200", "0.08"], expect: "194.4" },
      ],
    };
  })();

  return [c2f, greet, sumDoubled, priceTax];
}
