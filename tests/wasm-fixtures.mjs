export const u32=n=>{const bytes=[];do{const b=n&127;n=Math.floor(n/128);bytes.push(b|(n?128:0));}while(n);return bytes;};
export const str=s=>{const b=[...new TextEncoder().encode(s)];return [...u32(b.length),...b];};
export const section=(id,payload)=>[id,...u32(payload.length),...payload];
export function wasm(functions,{types=[1,96,0,0],before=[],after=[],imported=0}={}){
  const names=functions.flatMap((f,i)=>f.name===undefined?[]:[[...u32(imported+i),...str(f.name)]]);
  const bodies=functions.flatMap(f=>{const b=[0,...(f.code??[]),11];return [...u32(b.length),...b];});
  const nameSub=[...u32(names.length),...names.flat()];
  return Uint8Array.from([0,97,115,109,1,0,0,0,...section(1,types),...before.filter(s=>s[0]===2).flat(),
    ...section(3,[...u32(functions.length),...functions.flatMap(f=>u32(f.type??0))]),
    ...before.filter(s=>s[0]!==2).flat(),...section(10,[...u32(functions.length),...bodies]),...after.flat(),
    ...section(0,[...str('name'),...section(1,nameSub)])]);
}
export const exportFunction=(name,index)=>section(7,[1,...str(name),0,...u32(index)]);
