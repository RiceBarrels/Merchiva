import * as sdk from "spacetimedb";
console.log("exports:", Object.getOwnPropertyNames(sdk).filter(n=>/Binary|Algebraic|serial/i.test(n)));
const { AlgebraicType, BinaryWriter, BinaryReader, t } = sdk;
const ty = t.string();
const days = [false,true,true,true,true,true,false];
const dayTimes = [{enabled:true,fullDay:false,startTime:"12:00",endTime:"18:00"},{enabled:true,fullDay:false,startTime:"12:00",endTime:"18:00"}];
for (const [name, val] of [["days",days],["dayTimes",dayTimes]]) {
  try {
    const w = new BinaryWriter(16);
    AlgebraicType.serializeValue(w, ty, val);
    const bytes = w.getBuffer ? w.getBuffer() : w.toBase64();
    const r = new BinaryReader(typeof bytes === "string" ? Uint8Array.from(atob(bytes), c=>c.charCodeAt(0)) : bytes);
    const back = AlgebraicType.deserializeValue(r, ty);
    console.log(name, "=> SERIALIZED OK, reads back as:", JSON.stringify(back));
    try { console.log("   JSON.parse ->", JSON.parse(back)); } catch(e) { console.log("   JSON.parse THROWS:", e.message); }
  } catch (e) {
    console.log(name, "=> THREW:", e.constructor.name, e.message);
  }
}
