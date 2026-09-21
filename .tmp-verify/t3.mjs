import { AlgebraicType, BinaryWriter, BinaryReader } from "spacetimedb";
const optStr = AlgebraicType.createOptionType(AlgebraicType.String);
for (const [n,v] of [["undefined",undefined],["null",null],["'abc'","abc"]]) {
  try {
    const w = new BinaryWriter(8);
    AlgebraicType.serializeValue(w, optStr, v);
    const back = AlgebraicType.deserializeValue(new BinaryReader(w.getBuffer()), optStr);
    console.log("option", n, "=> ok, back:", JSON.stringify(back));
  } catch(e) { console.log("option", n, "=> THREW:", e.message); }
}
