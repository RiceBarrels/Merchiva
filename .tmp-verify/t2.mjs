import { AlgebraicType, BinaryWriter, BinaryReader } from "spacetimedb";
const ty = AlgebraicType.String;
console.log("ty:", JSON.stringify(ty));
const days = [false,true,true,true,true,true,false];
const dayTimes = [{enabled:true,fullDay:false,startTime:"12:00",endTime:"18:00"},{enabled:true,fullDay:false,startTime:"12:00",endTime:"18:00"}];
for (const [name, val] of [["days",days],["dayTimes",dayTimes],["control","hello"]]) {
  try {
    const w = new BinaryWriter(16);
    AlgebraicType.serializeValue(w, ty, val);
    const bytes = w.getBuffer();
    const r = new BinaryReader(bytes);
    const back = AlgebraicType.deserializeValue(r, ty);
    console.log(name, "=> SERIALIZED, reads back:", JSON.stringify(back));
    try { console.log("   JSON.parse ->", JSON.stringify(JSON.parse(back))); } catch(e) { console.log("   JSON.parse THROWS:", e.message); }
  } catch (e) {
    console.log(name, "=> THREW:", e.constructor.name, e.message);
  }
}
