// Site geometry uses local yards. OSM outlines identify mapped use, never ownership.
const directions={N:0,NE:45,E:90,SE:135,S:180,SW:225,W:270,NW:315};
const palette={managed:'#738b85',shared:'#718fa8',mapped:'#a2aaa4',proposed:'#408c68',open:'#a4ba87',leased:'#c6a55b',building:'#b9c4b0'};
const normalize=s=>String(s||'').toLowerCase().replace(/parking|stadium|car park|lot|garage|[^a-z0-9]/g,'');
const lotNumber=s=>String(s||'').toLowerCase().match(/\blot\s*(\d+)\b/)?.[1];
const area=ring=>ring.reduce((a,p,i)=>{const q=ring[(i+1)%ring.length];return a+p[0]*q[1]-p[1]*q[0]},0)/2;
const bounds=ring=>({minX:Math.min(...ring.map(p=>p[0])),maxX:Math.max(...ring.map(p=>p[0])),minZ:Math.min(...ring.map(p=>p[1])),maxZ:Math.max(...ring.map(p=>p[1]))});
const center=ring=>{const b=bounds(ring);return [(b.minX+b.maxX)/2,(b.minZ+b.maxZ)/2]};
const inside=(x,z,ring)=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes}return yes};
const boxRing=(x,z,w,d)=>[[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]];
function triangulate(ring){
 const r=area(ring)<0?[...ring].reverse():[...ring],ids=r.map((_,i)=>i),tri=[];
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 let guard=r.length*r.length;
 while(ids.length>3&&guard-->0){let found=false;for(let j=0;j<ids.length;j++){
  const a=ids[(j+ids.length-1)%ids.length],b=ids[j],c=ids[(j+1)%ids.length];if(cross(r[a],r[b],r[c])<=.00001)continue;
  if(ids.some(k=>k!==a&&k!==b&&k!==c&&cross(r[a],r[b],r[k])>=0&&cross(r[b],r[c],r[k])>=0&&cross(r[c],r[a],r[k])>=0))continue;
  tri.push([r[a],r[b],r[c]]);ids.splice(j,1);found=true;break;
 }if(!found)break}
 if(ids.length===3)tri.push(ids.map(i=>r[i]));return tri;
}
export function drawDistrict(g,v,c,dimensions,plan,survey){
 const {X=110,Z=80}=dimensions||{},profile=plan.profile||{},facilities=profile.facilities||[];
 const heading=(survey?.heading??profile.heading??0)*Math.PI/180,sin=Math.sin(heading),cos=Math.cos(heading);
 const transform=([e,n])=>[e*sin+n*cos,e*cos-n*sin];
 const ext={minX:-X-25,maxX:X+25,minZ:-Z-25,maxZ:Z+25},labels=[];
 const absorb=ring=>{const b=bounds(ring);for(const k of ['minX','minZ'])ext[k]=Math.min(ext[k],b[k]);for(const k of ['maxX','maxZ'])ext[k]=Math.max(ext[k],b[k])};
 const stadium=(x,z)=>Math.abs(x)<X+22&&Math.abs(z)<Z+20;
 const intersectsStadium=ring=>ring.some(p=>stadium(...p))||inside(0,0,ring);
 const fill=(ring,color,y=.01,height=0)=>{if(ring.length<3)return;absorb(ring);for(const tri of triangulate(ring))g.tri(color,...tri.map(([x,z])=>[x,y+height,z]),'district');if(height)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];g.quad(color,[a[0],y,a[1]],[b[0],y,b[1]],[b[0],y+height,b[1]],[a[0],y+height,a[1]],'district')}};
 const line=(a,b,color,width=.35,y=.08)=>{const dx=b[0]-a[0],dz=b[1]-a[1],d=Math.hypot(dx,dz);if(d<.01)return;const x=-dz/d*width/2,z=dx/d*width/2;g.quad(color,[a[0]+x,y,a[1]+z],[b[0]+x,y,b[1]+z],[b[0]-x,y,b[1]-z],[a[0]-x,y,a[1]-z],'district')};
 const stripes=(ring,y=.07)=>{const b=bounds(ring),step=Math.max(4,(b.maxX-b.minX)/30),rows=Math.min(12,Math.ceil((b.maxZ-b.minZ)/19));for(let j=0;j<rows;j++){const z=b.minZ+7+j*19;for(let x=b.minX+5;x<b.maxX-3;x+=step)if(inside(x,z-3,ring)&&inside(x,z+3,ring))line([x,z-3],[x,z+3],'#d5d7c9',.2,y)}};
 const garage=(ring,levels,color)=>{fill(ring,color,.04,levels*3);for(let i=1;i<=levels;i++)for(let j=0;j<ring.length;j++)line(ring[j],ring[(j+1)%ring.length],'#d5d8cd',.8,i*3+.06);stripes(ring,levels*3+.08)};
 const clean=ring=>{let out=(ring||[]).filter(p=>p.length>=2&&p.every(Number.isFinite)).map(transform);if(out.length>2&&Math.hypot(out[0][0]-out.at(-1)[0],out[0][1]-out.at(-1)[1])<.01)out.pop();return out};
 const mapped=(survey?.features||[]).slice(0,650).map((f,i)=>({...f,id:'map-'+i,ring:clean(f.ring)})).filter(f=>f.ring.length>=2);
 const lots=mapped.filter(f=>['surface','garage'].includes(f.kind)&&f.ring.length>=3&&!intersectsStadium(f.ring));
 const matches=new Map(),used=new Set();
 for(const f of facilities){
  let pool=lots.filter(p=>!used.has(p.id)),match=pool.find(p=>normalize(f.name).length>0&&normalize(p.name)&& (normalize(p.name)===normalize(f.name)||(lotNumber(p.name)&&lotNumber(p.name)===lotNumber(f.name)&&/lot\s*\d+$/i.test(f.name))||(normalize(f.name).length>3&&normalize(p.name).includes(normalize(f.name)))));
  let mode='name';if(!match&&pool.length){mode='spatial estimate';const angle=((directions[f.dir]??0)*Math.PI/180)-heading;const ux=Math.cos(angle),uz=Math.sin(angle);pool=pool.filter(p=>{const [x,z]=center(p.ring);return (x*ux+z*uz)/Math.max(1,Math.hypot(x,z))>.3});pool.sort((a,b)=>Math.abs(area(b.ring))-Math.abs(area(a.ring)));match=pool[0]}
  if(match){used.add(match.id);matches.set(match.id,{facility:f,mode})}
 }
 for(const f of mapped){
  if(['surface','garage'].includes(f.kind))continue;
  if(f.kind==='road'||f.kind==='rail'){
   const color=f.kind==='rail'?'#879086':'#b6bdb3',w=f.kind==='rail'?2:7;
   for(let i=1;i<f.ring.length;i++){const a=f.ring[i-1],b=f.ring[i];if(stadium(...a)||stadium(...b)||stadium((a[0]+b[0])/2,(a[1]+b[1])/2))continue;line(a,b,color,w,-.08);absorb([a,b])}
  }else if(f.ring.length>=3&&!intersectsStadium(f.ring)){
   if(f.kind==='water')fill(f.ring,'#91b4bd',-.12);
   if(f.kind==='building')fill(f.ring,'#bfc5b9',-.02,Math.min(24,Math.max(5,Number(f.height)||8)));
  }
 }
 for(const lot of lots){
  const matched=matches.get(lot.id),f=matched?.facility,col=matched?.mode==='name'?palette[f.control]:palette.mapped;
  const [x,z]=center(lot.ring),isChosen=f&&f.id===plan.chosenLot?.id;
  if(lot.kind==='garage')garage(lot.ring,3,col);else{fill(lot.ring,col);stripes(lot.ring)}
  labels.push({id:f?.id||lot.id,name:(matched?.mode==='spatial estimate'?'≈ ':'')+(f?.name||lot.name||'Mapped parking'),x,z,ring:lot.ring,control:matched?.mode==='name'?f.control:'mapped',type:lot.kind,surveyed:true,match:matched?.mode||'mapped only'});
  if(isChosen&&plan.convert>0){const b=bounds(lot.ring),ratio=Math.min(.85,Math.sqrt(plan.convert/Math.max(1,f.spaces))),w=(b.maxX-b.minX)*ratio,d=(b.maxZ-b.minZ)*ratio;const r=boxRing(x,z,w,d);if(r.every(p=>inside(...p,lot.ring)))garage(r,plan.levels||3,palette.proposed)}
  if(isChosen&&plan.retire>0){const b=bounds(lot.ring),r=boxRing(b.minX+(b.maxX-b.minX)*.16,z,Math.min((b.maxX-b.minX)*.25,Math.sqrt(plan.retire*36.67)),Math.min((b.maxZ-b.minZ)*.8,Math.sqrt(plan.retire*36.67)));if(r.every(p=>inside(...p,lot.ring)))fill(r,palette.open,.15)}
 }
 const drawn=new Set([...matches.values()].map(m=>m.facility.id)),placed=[];
 const fits=r=>!intersectsStadium(r)&&!placed.some(p=>{const a=bounds(r),b=bounds(p);return a.minX<b.maxX+12&&a.maxX>b.minX-12&&a.minZ<b.maxZ+12&&a.maxZ>b.minZ-12})&&!mapped.some(p=>p.ring.length>=3&&r.some(q=>inside(...q,p.ring)));
 for(let i=0;i<facilities.length;i++){
  const f=facilities[i];if(drawn.has(f.id)||!f.spaces)continue;
  const footprint=f.spaces/(f.type==='garage'?3:1),w=Math.sqrt(footprint*36.67*1.35),d=w/1.35;
  const angle=((directions[f.dir]??0)*Math.PI/180)-heading,ux=Math.cos(angle),uz=Math.sin(angle);
  let distance=Math.max(X,Z)+Math.max(w,d)/2+60,ring;
  for(let n=0;n<35;n++){ring=boxRing(ux*distance,uz*distance,w,d);if(fits(ring))break;distance+=35}
  const [x,z]=center(ring),chosen=f.id===plan.chosenLot?.id;
  if(f.type==='garage')garage(ring,3,palette[f.control]);else{fill(ring,palette[f.control]);stripes(ring)}
  if(chosen&&plan.convert>0){let rw=w*Math.min(1,plan.convert/f.spaces);garage(boxRing(x-w/2+rw/2,z,rw,d),plan.levels||3,palette.proposed)}
  if(chosen&&plan.retire>0){let rw=w*Math.min(1,plan.retire/f.spaces);fill(boxRing(x+w/2-rw/2,z,rw,d),palette.open,.14)}
  placed.push(ring);labels.push({id:f.id,name:'≈ '+f.name,x,z,ring,control:f.control,type:f.type,surveyed:false,match:'directional estimate'});
 }
 // A separated study pad prevents imagined additions from occupying real mapped parcels.
 let proposedX=ext.maxX+75;
 for(const [id,name,spaces,levels] of [['new-surface','Proposed surface · conceptual location',plan.surfaceAdded,1],['new-garage','Proposed garage · conceptual location',plan.garageFoot,plan.levels||3]]){
  if(!(spaces>0)||plan.parcels?.enabled)continue;const w=Math.sqrt(spaces*36.67*1.35),d=w/1.35,x=proposedX+w/2,z=0,ring=boxRing(x,z,w,d);
  if(levels>1)garage(ring,levels,palette.proposed);else{fill(ring,palette.proposed);stripes(ring)}
  labels.push({id,name,x,z,ring,control:'proposed',type:levels>1?'garage':'surface',surveyed:false,match:'proposed'});proposedX+=w+35;
 }
 if(plan.parcels?.enabled){let px=ext.maxX+80,surfaceLeft=plan.surfaceAdded||0,garageLeft=plan.garageFoot||0;for(const parcel of plan.parcels.all){const width=Math.sqrt(parcel.acres*4840),x=px+width/2,z=-width/2-80,ring=boxRing(x,z,width,width),selected=plan.parcels.selected.some(p=>p.id===parcel.id);fill(ring,selected?'#c6a55b':'#dad3bf',.03);let built=0;
   if(selected){let slots=Math.floor(parcel.acres*43560/330),surface=Math.min(surfaceLeft,slots),structured=Math.min(garageLeft,slots-surface),unit=width/Math.max(1,slots),left=x-width/2;surfaceLeft-=surface;garageLeft-=structured;built=surface+structured*(plan.levels||3);
    if(surface){const r=boxRing(left+surface*unit/2,z,surface*unit,width);fill(r,palette.proposed,.12);stripes(r,.18);left+=surface*unit;}
    if(structured){garage(boxRing(left+structured*unit/2,z,structured*unit,width),plan.levels||3,palette.proposed);}
   }
   for(let i=0;i<4;i++)line(ring[i],ring[(i+1)%4],'#a18444',2,.2);labels.push({id:parcel.id,name:parcel.name+(selected?' · '+built+' planned spaces':' · available'),x,z,ring,control:'parcel',type:'parcel',surveyed:false,match:'simulation parcel'});px+=width+30;}}

 const focus=[(ext.minX+ext.maxX)/2,0,(ext.minZ+ext.maxZ)/2];
 return {radius:Math.max(180,Math.hypot(ext.maxX-ext.minX,ext.maxZ-ext.minZ)/2),focus,extent:ext,labels};
}
