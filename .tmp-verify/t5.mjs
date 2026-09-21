import { AlgebraicType as A, BinaryWriter, BinaryReader } from "spacetimedb";
// Option is a Sum of {some: T, none: unit}
const optStr = A.Sum([{name:"some", algebraicType: A.String},{name:"none", algebraicType: A.Product([])}]);
for (const [n,v] of [["undefined",undefined],["null",null],["'abc'","abc"]]) {
  try {
    const w = new BinaryWriter(8);
    A.serializeValue(w, optStr, v);
    const back = A.deserializeValue(new BinaryReader(w.getBuffer()), optStr);
    console.log("option", n, "=> ok, back:", JSON.stringify(back));
  } catch(e) { console.log("option", n, "=> THREW:", e.message); }
}
