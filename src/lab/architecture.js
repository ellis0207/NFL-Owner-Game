// Venue details occupy the same yard-based coordinate system as the stadium bowl.
// Roof skin, trusses and roof-borne equipment belong to the removable roof group.
const TAU = Math.PI * 2;
const ROOF = 'roof';
const steel = '#aebbc0';
const white = '#e8ebe5';
const glass = '#779ba7';
const darkGlass = '#405d6c';
const concrete = '#b9bcb3';

function signedPower(value, power) {
  return Math.sign(value) * Math.abs(value) ** power;
}
function outline(x, z, angle, y, exponent = 2.7) {
  return [
    x * signedPower(Math.cos(angle), 2 / exponent),
    y,
    z * signedPower(Math.sin(angle), 2 / exponent),
  ];
}
function pointBetween(a, b, f) {
  return a.map((value, i) => value + (b[i] - value) * f);
}
function loop(g, count, lower, upper, color, group) {
  for (let i = 0; i < count; i++) {
    const a = i * TAU / count;
    const b = (i + 1) * TAU / count;
    g.quad(typeof color === 'function' ? color(i) : color,
      lower(a), lower(b), upper(b), upper(a), group);
  }
}
function roofSkin(g, point, radialSteps, segments, material, inner = .005) {
  for (let j = 0; j < radialSteps; j++) {
    const s = inner + (1 - inner) * j / radialSteps;
    const end = inner + (1 - inner) * (j + 1) / radialSteps;
    loop(g, segments, a => point(s, a), a => point(end, a),
      i => material(j, i), ROOF);
  }
}
function curveBeam(g, color, curve, steps, radius, group = ROOF) {
  for (let i = 0; i < steps; i++) {
    g.beam(color, curve(i / steps), curve((i + 1) / steps), radius, group, 5);
  }
}
function truss(g, top, bottom, bays, color, girth = .45, group = ROOF) {
  for (let j = 0; j < bays; j++) {
    const a = j / bays, b = (j + 1) / bays;
    g.beam(color, top(a), top(b), girth, group);
    g.beam(color, bottom(a), bottom(b), girth * .8, group);
    g.beam(color, j % 2 ? top(a) : bottom(a), j % 2 ? bottom(b) : top(b), girth * .55, group);
  }
}
function sphere(g, color, x, y, z, rx, ry, rz, group) {
  for (let j = -2; j < 2; j++) {
    const p = j * Math.PI / 4;
    const q = (j + 1) * Math.PI / 4;
    const at = (latitude, a) => [x + rx * Math.cos(latitude) * Math.cos(a),
      y + ry * Math.sin(latitude), z + rz * Math.cos(latitude) * Math.sin(a)];
    loop(g, 10, a => at(p, a), a => at(q, a), color, group);
  }
}
function panelWindow(g, center, width, height, facing, frame = '#a9b8ba') {
  const [x,y,z] = center;
  const alongX = facing === 'side';
  g.box(glass,x,y,z,alongX?width:1,height,alongX?1:width);
  const bays = Math.max(2, Math.round(width / 6));
  for(let j=0;j<=bays;j++){
    const p = (j/bays-.5)*width;
    g.box(frame,x+(alongX?p:0),y,z+(alongX?0:p),alongX?.27:1.2,height,alongX?1.2:.27);
  }
  for(let j=0;j<=3;j++)g.box(frame,x,y+(j/3-.5)*height,z,alongX?width:1.2,.24,alongX?1.2:width);
}
function suiteTower(g,d,{side=1,length=100,height=d.H,levels=4,color=concrete,glassColor=darkGlass,depth=10,x=0,z=side*(d.Z+.5)}={}) {
  g.box(color,x,height*.5,z,length,height,depth);
  const floor = Math.min(4, height/(levels+1));
  for(let i=0;i<levels;i++){
    const y=height-2.1-i*floor;
    g.box(glassColor,x,y,z,length+.4,floor*.69,depth+.5);
    g.box('#d0d3ca',x,y-floor*.42,z,length+.9,.60,depth+1.1);
    for(let j=-length/2+3;j<length/2;j+=7)
      g.box(color,x+j,y,z,.38,floor*.71,depth+.7);
  }
  g.box('#dce0d7',x,height+.5,z,length+2,1,depth+2);
}
function ovalCanopy(g,d,variant='standard') {
  const {X,Z,H}=d;
  const squared=variant==='miami' ? 12 : 2.7;
  const isWide=variant==='buffalo';
  const y=H+(variant==='miami'?8:5);
  function point(f,a) {
    return outline(X*((isWide?.76:.78)+f*(isWide?.30:.29)),
      Z*((isWide?.61:.63)+f*(isWide?.47:.47)),a,y+f*2.7,squared);
  }
  for(let j=0;j<7;j++) loop(g,88,a=>point(j/7,a),a=>point((j+1)/7,a),
    j%3===0?'#d4dbd6':white,ROOF);
  loop(g,88,a=>point(1,a),a=>{const p=point(1,a);p[1]-=1.6;return p},'#839694',ROOF);
  for(let i=0;i<48;i++){
    const a=i*TAU/48, p=point(1,a);
    g.beam('#b5c1bc',point(0,a),p,.26,ROOF);
    if(i%3===0 && variant!=='miami')g.beam(steel,[p[0]*.95,H*.44,p[2]*.95],p,.55,ROOF);
  }
  if(variant==='miami'){
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const x=sx*X*.91,z=sz*Z*.94, mast=[x,y+28,z];
      g.beam(white,[x,1,z],mast,1.22,ROOF,8);
      for(const frac of [.25,.50,.73]){
        g.beam('#c2ccc5',mast,[sx*X*frac,y+3.0,sz*Z*1.06],.18,ROOF);
        g.beam('#c2ccc5',mast,[sx*X*1.045,y+3.0,sz*Z*frac],.18,ROOF);
      }
    }
  }
}
function sidelineRoofs(g,d,kind) {
  const {X,Z,H}=d;
  const seattle=kind==='SEA',pittsburgh=kind==='PIT',cincinnati=kind==='CIN';
  const span=seattle?.90:cincinnati?.67:.62;
  for(const s of [-1,1]){
    const at=(u,b)=>{
      const curve=Math.sin(u*Math.PI);
      const x=(2*u-1)*X*span;
      const depth=(seattle?21:cincinnati?14:11)+(seattle?8:4)*curve;
      const y=H+4.6+(seattle?14:cincinnati?6:3)*curve+b*(seattle?1:2);
      return [x,y,s*(Z+4-depth*b)];
    };
    for(let i=0;i<32;i++){
      const a=i/32,b=(i+1)/32;
      g.quad(pittsburgh?'#747a73':white,at(a,0),at(b,0),at(b,1),at(a,1),ROOF);
      if(i%2===0)g.beam(steel,at(a,0),at(a,1),.35,ROOF);
    }
    function spine(f,h){const p=at(f,.16);p[1]+=h;return p}
    truss(g,f=>spine(f,seattle?5.8:2.8),f=>spine(f,.1),24,seattle?'#ccd5d8':steel,seattle?.63:.43);
    for(let i=0;i<=8;i++){
      const p=at(i/8,0), top=spine(i/8,seattle?5.8:2.8);
      g.beam(steel,[p[0],H*.44,p[2]+s*2],p,.68,ROOF);
      g.beam(steel,top,at(i/8,1),.32,ROOF);
    }
  }
}
function petalRoof(g,d) {
  const {X,Z,H}=d;
  const height=H+7;
  // Eight planar roof panels translate along straight rails, leaving an octagonal oculus.
  for(let i=0;i<8;i++){
    const a=(i-.5)*TAU/8,b=a+TAU/8;
    const p=outline(X*1.095,Z*1.095,a,height,3);
    const q=outline(X*1.095,Z*1.095,b,height,3);
    const v=outline(X*.405,Z*.48,a+.35,height+10.5,2.2);
    const w=outline(X*.405,Z*.48,b+.35,height+10.5,2.2);
    const tip=outline(X*.22,Z*.26,b+.58,height+11,2);
    g.quad(i%2?'#b5bdbe':'#d3d7d5',p,q,w,v,ROOF);
    g.tri(i%2?'#9ba9aa':'#c0c8c8',v,w,tip,ROOF);
    g.beam('#7e8b90',p,v,.37,ROOF);
    g.beam('#758287',v,tip,.32,ROOF);
  }
}
function falconsFacets(g,d) {
  const {X,Z,H}=d;
  for(let i=0;i<12;i++){
    const a=i*TAU/12,b=(i+1)*TAU/12,m=(a+b)/2;
    const p=outline(X*.98,Z*.98,a,1.0,2.9),q=outline(X*.98,Z*.98,b,1.0,2.9);
    const u=outline(X*1.09,Z*1.09,a,H+7,2.9),v=outline(X*1.09,Z*1.09,b,H+7,2.9);
    const f=outline(X*1.145,Z*1.145,m,H*.69,2.9);
    g.tri(i%4===1?'#7496a4':'#8e9da3',p,q,f);
    g.tri(i%3?'#bcc5c6':'#7895a3',q,v,f);
    g.tri(i%2?'#ccd2d1':'#a5b1b6',u,v,f);
    g.tri(i%3?'#a9b4b5':'#879da7',p,u,f);
  }
}
function sailRoof(g,d) {
  const {X,Z,H}=d;
  // The canopy extends beyond the sunken bowl, spanning the plaza and adjacent theater.
  const at=(s,a)=>{
    const p=outline((X+32)*s,(Z+10)*s,a,0,2.15);
    p[0]-=15;
    p[1]=H+6+12.7*(1-s*s)+6.3*Math.sin(a)*s-4.0*Math.cos(a)*s;
    return p;
  };
  roofSkin(g,at,15,84,(j,i)=>j%4===0?'#aabecc':(i%4?'#c9d8da':'#bcd0d4'));
  for(let j=2;j<15;j+=2)loop(g,84,a=>at(j/15,a),a=>at(j/15+.005,a),'#e0e7e3',ROOF);
  for(let i=0;i<36;i++){
    const a=i*TAU/36;
    curveBeam(g,'#cfdbda',f=>at(.11+.88*f,a),9,.19);
    if(i%3===0){
      const p=at(.98,a),foot=[p[0]*.95,1,p[2]*.97];
      g.beam('#b8c6c6',foot,p,.95,ROOF);
      g.beam('#d6dfdd',foot,at(.90,a+.075),.5,ROOF);
    }
  }
}
function roundRoof(g,d,kind) {
  const {X,Z,H}=d;
  const dome=kind==='NO',charcoal=kind==='LV',sliding=kind==='ARI'||kind==='DAL'||kind==='retractable';
  const rx=dome?X*1.035:X*1.065,rz=dome?X*1.035:Z*1.075;
  const y=H+5.0, exponent=dome?2:kind==='DAL'?2.6:2.15;
  const base=(s,a)=>{
    const p=outline(rx*s,rz*s,a,y,exponent);
    p[1]+= (dome?17:kind==='ARI'?13:16)*(1-s*s);
    return p;
  };
  if(sliding){
    // Blend a broad rectangular opening into the outer ellipse.
    const skin=(f,a)=>{const o=base(1,a),inner=outline(rx*.43,rz*.32,a,y+12,7);
      const p=pointBetween(inner,o,f);p[1]+=3*Math.sin(f*Math.PI);return p};
    for(let j=0;j<10;j++)loop(g,80,a=>skin(j/10,a),a=>skin((j+1)/10,a),
      j%4===0?'#aebbbe':kind==='ARI'?'#e0e3df':'#d2d9d7',ROOF);
    for(let i=0;i<40;i++){const a=i*TAU/40;curveBeam(g,'#b7c4c5',f=>skin(f,a),7,.20)}
    loop(g,80,a=>skin(0,a),a=>{const p=skin(0,a);p[1]-=.8;return p},'#75888f',ROOF);
  }else{
    roofSkin(g,base,16,80,(j,i)=>dome?(j%4?'#dedfdb':'#cfd3d0'):charcoal?(j%3?'#e0e5e1':'#c5d0d1'):j%4?'#d4dbd7':'#c2cac9');
  }
  loop(g,80,a=>outline(rx,rz,a,y-4,exponent),a=>base(1,a),charcoal?'#242b31':'#a4b0b0',ROOF);
  if(kind==='DAL'){
    for(const s of [-1,1]){
      const arch=(f,h)=>[(2*f-1)*X*1.13,y-8+33*Math.sin(f*Math.PI)+h,s*Z*.59];
      truss(g,f=>arch(f,1.2),f=>arch(f,-1.6),32,'#e3e7e2',1.0);
    }
  }
}
function angularRoof(g,d,kind) {
  const {X,Z,H}=d, retract=kind==='IND'||kind==='HOU';
  const point=(x,z)=>{
    let y=H+4;
    if(kind==='MIN')y+=5+18*(1-Math.abs(z+.29))+(x+1)*3.5;
    else if(kind==='DET')y+=12*(1-z*z);
    else y+=13.5*(1-Math.abs(z));
    return [x*X*1.035,y,z*Z*1.055];
  };
  for(let i=0;i<32;i++)for(let j=0;j<18;j++){
    const a=-1+2*i/32,b=a+2/32,z=-1+2*j/18,w=z+2/18;
    if(retract&&Math.abs(z+1/18)<.34&&Math.abs(a+1/32)<.62)continue;
    const color=kind==='MIN'?(z>-.28?(j%4?'#bacfd4':'#a7c1cd'):'#495762')
      :kind==='DET'?(j%5?'#c4cccb':'#a9b6b7'):(j%4?'#cdd5d1':'#b3c0c0');
    g.quad(color,point(a,z),point(b,z),point(b,w),point(a,w),ROOF);
  }
  for(const s of [-1,1]){
    for(let i=0;i<24;i++){
      const p=point(s,-1+i/12),q=point(s,-1+(i+1)/12);
      const wall=kind==='MIN'?'#7696a4':kind==='IND'||kind==='DET'?'#976850':'#819ba4';
      g.quad(i%5===0?'#a8b9b9':wall,[p[0],1,p[2]],[q[0],1,q[2]],q,p,ROOF);
      g.beam('#c4cccc',[p[0],1,p[2]],p,.31,ROOF);
    }
    for(let i=0;i<16;i++){
      const p=point(-1+i/8,s),q=point(-1+(i+1)/8,s);
      const wall=kind==='IND'||kind==='DET'?'#976954':kind==='MIN'?'#4c5c67':'#7b939a';
      g.quad(wall,p,q,[q[0],H*.7,q[2]],[p[0],H*.7,p[2]],ROOF);
    }
  }
  if(kind==='HOU')for(const s of [-1,-.66,.66,1])
    truss(g,f=>{const p=point(f*2-1,s);p[1]+=4.0;return p},
      f=>point(f*2-1,s),17,white,.47);
}
function originalRoof(g,v,c,d) {
  if(c.custom||c.roof!==v.roof)return false;
  switch(v.id){
    case 'MIA': ovalCanopy(g,d,'miami');break;
    case 'BUF': ovalCanopy(g,d,'buffalo');break;
    case 'ATL': petalRoof(g,d);break;
    case 'LAC':case 'LAR':sailRoof(g,d);break;
    case 'SEA':case 'CIN':case 'PHI':case 'PIT':sidelineRoofs(g,d,v.id);break;
    case 'NO':case 'ARI':case 'LV':case 'DAL':roundRoof(g,d,v.id);break;
    case 'HOU':case 'IND':case 'DET':case 'MIN':angularRoof(g,d,v.id);break;
    default:return v.roof==='open';
  }
  return true;
}
function endBoard(g,{x,y,width,height,color,side=1}) {
  const back='#29373a';
  g.box(back,x,y,0,1.65,height+1.2,width+1.4);
  g.box('#33525d',x+side*.92,y,0,.20,height,width);
  g.box(color,x+side*1.09,y-height*.33,0,.18,height*.20,width-.8);
  g.box('#8aafb4',x+side*1.09,y+height*.31,0,.18,height*.095,width-.8);
  for(const f of [-.47,.47]){
    g.box(back,x,y*.46,f*width,1.2,y*.92,1.5);
  }
}
function ovalScreen(g,d,color,sofi=false) {
  const lx=sofi?45:38,lz=sofi?21:22,y=d.H+2.1,h=sofi?5.3:4.5;
  loop(g,72,a=>outline(lx,lz,a,y,2),a=>outline(lx,lz,a,y+h,2),'#293c45');
  loop(g,72,a=>outline(lx+.23,lz+.23,a,y+.43,2),a=>outline(lx+.23,lz+.23,a,y+h-.43,2),
    i=>i%10<2?'#6998a3':color);
  loop(g,72,a=>outline(lx-.60,lz-.60,a,y+.25,2),a=>outline(lx-.60,lz-.60,a,y+h-.25,2),'#4f7586');
  for(let i=0;i<8;i++){
    const p=outline(lx,lz,i*TAU/8,y+h,2);
    g.beam('#7d898b',p,[p[0],d.H+12,p[2]],.13,ROOF);
  }
}
function scoreboard(g,v,c,d) {
  const board=c.board||'original';
  if(board==='none'||(c.custom&&board==='original'))return;
  if(board==='halo'||(board==='original'&&['ATL','LAC','LAR'].includes(v.id))){
    ovalScreen(g,d,c.color,board==='original'&&['LAC','LAR'].includes(v.id));
    return;
  }
  if(v.id==='DAL'&&board==='original'&&!c.custom){
    const y=d.H+1.5;
    g.box('#26373d',0,y,0,51,11.7,8.4);
    for(const s of [-1,1]){
      g.box('#537b89',0,y,s*4.27,49.5,10.2,.22);
      g.box(c.color,0,y-3.0,s*4.43,49.3,2.9,.19);
      g.box('#9ab9bf',0,y+4.0,s*4.43,49.3,.75,.19);
      g.beam('#73828b',[s*18,y+6,0],[s*18,d.H+16,0],.23,ROOF);
    }
    return;
  }
  const scale=board==='compact'?.58:board==='large'?1.6:1;
  const panoramic=!c.custom&&['NE','JAX','BAL'].includes(v.id);
  const width=(panoramic?54:29)*scale,height=(panoramic?8.5:7.3)*scale;
  endBoard(g,{x:-d.X+2,y:d.H*.91+4.0,width,height,color:c.color});
  if((v.id==='JAX'||v.id==='BAL'||v.id==='TEN')&&!c.custom&&board!=='compact')
    endBoard(g,{x:d.X-2,y:d.H*.90+4.0,width:width*.9,height,color:c.color,side:-1});
}
function armature(g,d,color=concrete,locations=8) {
  for(let i=0;i<locations;i++){
    const a=i*TAU/locations+.15;
    const p=outline(d.X+3,d.Z+3,a,1.0),q=outline(d.X+3,d.Z+3,a+.11,d.H*.85);
    g.beam(color,p,q,.57);
    g.beam(color,[q[0],1,q[2]],[p[0],q[1],p[2]],.57);
  }
}
function entryPavilions(g,d,color,arched=false) {
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const x=sx*d.X*.81,z=sz*d.Z*.82;
    g.box(color,x,8.8,z,12,17.6,11);
    g.box('#c1b59b',x,17.8,z,13,.9,12);
    g.box('#47595a',x,6.1,z+sz*5.55,7.1,10.4,.45);
    if(arched){
      const zz=z+sz*5.88;
      curveBeam(g,'#aeb3a8',f=>[x+4.4*Math.cos(f*Math.PI),8+3.4*Math.sin(f*Math.PI),zz],13,.53,'detail');
      for(const t of [-1,1])g.beam('#afb3aa',[x+t*4.4,1,zz],[x+t*4.4,8,zz],.52);
    }
  }
}
function lambeau(g,d) {
  suiteTower(g,d,{side:1,length:111,levels:3,color:'#986f52'});
  const x=-d.X+2,z=13,b='#9d7157',coping='#435f4e';
  g.box(b,x,10,z,17,20,55);
  panelWindow(g,[x-8.8,13,z],48,15,'end');
  g.box(coping,x-.5,20.8,z,18,1.5,57);
  for(const s of [-1,1]){
    g.box(b,x-4,13,z+s*28,12,26,8.3);
    g.box(coping,x-4,26.5,z+s*28,13,1.7,9.3);
    for(let j=0;j<3;j++)g.box(darkGlass,x-10.2,5+j*7,z+s*28,.5,4.1,4.5);
  }
  // The high south-end structure rises as a distinct bank behind the original lower bowl.
  const sx=d.X-2;
  g.box('#a37a61',sx,12,0,12,24,47);
  for(let k=0;k<4;k++){
    g.box('#51695c',sx,21+k*2.75,0,13,1.4,48-k*.6);
    g.box('#879b8f',sx,21.9+k*2.75,0,13.6,.48,48-k*.6);
  }
}
function soldier(g,d) {
  for(const s of [-1,1]){
    const z=s*(d.Z+8);
    g.box('#c2bba6',0,2,z,133,4,13);
    g.box('#d8d1bd',0,14.7,z,133,2.85,11.4);
    g.box('#c4bda9',0,16.4,z,135,.8,12.0);
    for(let x=-61;x<=61;x+=5.65){
      g.beam('#dad3c0',[x,4,z+s*3.4],[x,13.55,z+s*3.4],1.02,undefined,9);
      g.box('#d4cdb9',x,4.25,z+s*3.4,2.55,.72,2.55);
      g.box('#e3ddcc',x,13.4,z+s*3.4,2.55,.82,2.55);
    }
  }
}
function pirateShip(g,d) {
  const x=-d.X+7,y=d.H*.54,z=-12;
  const stern=x+6,bow=x-10;
  const keel=[x-1,y-2.6,z],oak='#846343',dark='#63513b';
  const p=[stern,y+2,z-3.4],q=[stern,y+2,z+3.4],prow=[bow,y+3.6,z];
  g.quad(oak,p,q,[stern,y-1,z+2.2],[stern,y-1,z-2.2]);
  g.tri(oak,p,prow,keel);g.tri(dark,q,keel,prow);g.tri('#b89864',p,q,prow);
  g.box(oak,stern-1.5,y+2.9,z,4.4,2.4,6.6);
  for(const mast of [x-3,x+2.8]){
    g.beam('#69563d',[mast,y+1,z],[mast,y+14.3,z],.25);
    g.beam('#8e7049',[mast,y+11.7,z-3.2],[mast,y+11.7,z+3.2],.18);
    g.quad('#e4d7b6',[mast,y+11.5,z-3.05],[mast,y+11.5,z+3.05],
      [mast-.36,y+7.1,z+2.48],[mast-.36,y+7.1,z-2.48]);
    g.tri('#2f3539',[mast,y+14,z],[mast+3.5,y+13.65,z],[mast,y+12.5,z]);
  }
  g.beam('#92734e',[bow,y+3.5,z],[bow-3.8,y+6.6,z],.24);
}
function gillette(g,d) {
  const x=-d.X-2,z=-28,top=69;
  g.box('#aba596',x,3,z,10,6,10);
  for(let i=0;i<5;i++){
    const y=6+i*10.9;
    g.beam(i%2?'#d3d2c7':'#dddcd2',[x,y,z],[x,y+10.9,z],3.25-i*.15,undefined,12);
  }
  g.beam('#879795',[x,60.4,z],[x,65.9,z],3.65,undefined,12);
  g.beam('#d4d8cb',[x,65.9,z],[x,67,z],4.25,undefined,12);
  g.beam('#8a9692',[x,67,z],[x,top,z],2.7,undefined,12);
  const span=43,y=d.H*.55;
  g.box('#aab6b4',x+3.3,y,z/2,5.7,1.6,span);
  truss(g,f=>[x+5,y+3,z/2+(f-.5)*span],f=>[x+5,y,z/2+(f-.5)*span],10,steel,.36,'detail');
}
function endGlazing(g,d,side,cladding='silver') {
  const {X,Z,H}=d;
  for(let j=-6;j<6;j++){
    const z=j*Z*.09,q=(j+1)*Z*.09;
    const at=zz=>side*(X*1.037-8*(zz/(Z*.55))**2);
    const p=[at(z),2,z],w=[at(q),2,q],a=[at(z),H+2,z],b=[at(q),H+2,q];
    g.quad(j%3===0?'#638596':'#82a2ad',p,w,b,a);
    g.beam(cladding==='black'?'#36434c':'#c1ccca',p,a,.38);
    for(let k=1;k<=4;k++)g.beam(cladding==='black'?'#44545c':'#bac8c7',
      pointBetween(p,a,k/5),pointBetween(w,b,k/5),.21);
  }
}
function drum(g,d) {
  const {X,H}=d,r=X*1.035;
  loop(g,80,a=>outline(r,r,a,1,2),a=>outline(r,r,a,H+5,2),
    i=>i%3?'#b5a788':'#b9ad92');
  for(let i=1;i<9;i++)loop(g,80,a=>outline(r+.18,r+.18,a,H*i/9,2),
    a=>outline(r+.18,r+.18,a,H*i/9+.68,2),'#a69b81');
  for(let i=0;i<12;i++){
    const a=i*TAU/12,p=outline(r+.2,r+.2,a,1,2),q=outline(r+1,r+1,a,H*.35,2);
    g.beam('#c8be9e',p,q,.60);
  }
}
function bison(g,x,z) {
  // Massed silhouette of one of the Buffalo entrance sculptures.
  const bronze='#6c6557';
  sphere(g,bronze,x,3.4,z,2.9,1.48,1.05);
  sphere(g,bronze,x-1.95,4.1,z,1.65,1.60,1.2);
  sphere(g,'#5f594e',x-3.10,3.25,z,1.13,1.10,.9);
  for(const a of [-1,1])for(const s of [-1,1])
    g.beam(bronze,[x+a*1.75,2.85,z+s*.58],[x+a*1.83,.55,z+s*.68],.33);
  for(const s of [-1,1])g.beam('#a59c84',[x-3.1,3.75,z+s*.68],[x-3.5,4.1,z+s*1.41],.17);
}
function spirals(g,d) {
  for(const sign of [-1,1]){
    const cx=sign*d.X*.92,cz=d.Z*.68,r=6.5;
    const point=(f,rr,h)=>[cx+rr*Math.cos(f*TAU*2.25),1+f*(d.H*.72)+h,cz+rr*Math.sin(f*TAU*2.25)];
    for(let j=0;j<64;j++){
      const a=j/64,b=(j+1)/64;
      g.quad('#c3c4b7',point(a,r,0),point(b,r,0),point(b,r-2.5,0),point(a,r-2.5,0));
      g.quad('#aaa99c',point(a,r,.8),point(b,r,.8),point(b,r,0),point(a,r,0));
    }
    g.beam('#adae9f',[cx,1,cz],[cx,d.H*.73,cz],1.05);
  }
}
function louvers(g,d,black=false) {
  const {X,Z,H}=d;
  for(let i=0;i<(black?10:13);i++){
    const y=H*(.11+i*(black?.081:.066)),a=black?2.1:2.62;
    loop(g,70,t=>outline(X+1.6,Z+1.6,t,y,a),
      t=>outline(X+2.2,Z+2.2,t,y+1.03,a),black?'#34414a':i%2?'#b0b9bb':'#c6cdca');
  }
}
function landmark(g,v,c,d) {
  const {X,Z,H}=d;
  switch(v.id) {
    case 'ARI':
      for(let i=0;i<38;i++){
        const a=i*TAU/38,b=a+.022;
        const p=outline(X+1.8,Z+1.8,a,1,2.2),q=outline(X+1.8,Z+1.8,b,1,2.2);
        const u=outline(X+2.1,Z+2.1,a,H+2.2,2.2),w=outline(X+2.1,Z+2.1,b,H+2.2,2.2);
        g.quad('#677d86',p,q,w,u);
      }
      g.box('#aab9a9',X+13,.25,0,28,.5,57);
      for(const s of [-1,1])g.box('#748780',X+13,.62,s*26,28,.38,.65);
      endGlazing(g,d,-1);
      break;
    case 'ATL':falconsFacets(g,d);break;
    case 'BAL':
      entryPavilions(g,d,'#976c55');
      suiteTower(g,d,{side:1,length:89,height:H*.91,color:'#a57760',levels:3});
      break;
    case 'BUF':
      for(let i=0;i<40;i++){
        const a=i*TAU/40,b=a+.10,p=outline(X+2,Z+2,a,H*.23),q=outline(X+2,Z+2,b,H*.23);
        const u=outline(X+3.5,Z+3.5,a,H*.90),w=outline(X+3.5,Z+3.5,b,H*.90);
        g.quad(i%3?'#b0b9b8':'#9faead',p,q,w,u);
      }
      for(let j=-1;j<=1;j++)bison(g,-X-10+j*1.4,j*5.7+8);
      break;
    case 'CAR':entryPavilions(g,d,'#5a6766',true);break;
    case 'CHI':soldier(g,d);break;
    case 'CIN':armature(g,d,'#b6c4c1',12);break;
    case 'CLE':
      suiteTower(g,d,{side:1,length:113,height:H*.96,levels:3});
      armature(g,d,'#a0adb0');
      break;
    case 'DAL':endGlazing(g,d,1);endGlazing(g,d,-1);break;
    case 'DEN':
      for(const s of [-1,1]){
        g.box('#b4b8ad',X*.83,8,s*Z*.60,14,16,14);
        sphere(g,'#c5c7b9',X*.83,16,s*Z*.60,8,2.7,8);
      }
      armature(g,d);
      break;
    case 'DET':{
      suiteTower(g,d,{side:1,length:145,height:H+5,levels:4,color:'#94644e',depth:13});
      const x=-X-3;
      g.box('#935d44',x,15.0,0,8,30,68);
      panelWindow(g,[x-4.4,15,0],55,20,'end','#b6a789');
      curveBeam(g,'#b38668',f=>[x-4,25+6*Math.sin(f*Math.PI),(f-.5)*66],20,2.0,'detail');
      break;
    }
    case 'GB':lambeau(g,d);break;
    case 'HOU':
      for(const side of [-1,1]){
        panelWindow(g,[side*(X+1.4),H*.5,0],Z*1.35,H*.84,'end');
        for(const z of [-Z*.66,Z*.66])g.box('#c1c7be',side*(X+1.1),H*.38,z,8,H*.76,8);
      }
      break;
    case 'IND':
      for(const side of [-1,1]){
        panelWindow(g,[side*(X*1.036+.4),H*.60,0],Z*1.23,H*.74,'end','#aba49b');
        for(const z of [-Z*.84,Z*.84]){g.box('#a56953',side*X*.95,H*.60,z,12,H*1.20,11);g.box('#938c7e',side*X*.95,H*1.20+.5,z,13,.9,12)}
      }
      break;
    case 'JAX':
      for(let i=0;i<20;i++){
        const a=(i+.5)*TAU/20,p=outline(X+3,Z+3,a,1,3.7),q=outline(X+10,Z+10,a,H+9,3.7);
        const foot=outline(X+3,Z+3,a+.055,1,3.7);
        g.beam('#929e9f',p,q,.70);g.beam('#a7b2af',foot,q,.46);
        g.beam('#a1adaa',q,outline(X+10,Z+10,a+.06,H+9,3.7),.44);
      }
      break;
    case 'KC':spirals(g,d);armature(g,d,'#a5aa9c',8);break;
    case 'LV':{
      louvers(g,d,true);endGlazing(g,d,-1,'black');
      const x=-X+9,y=H*.54;
      g.beam('#a48d63',[x,y,-18],[x,y+12,-18],.80,undefined,8);
      sphere(g,'#c9b47e',x,y+12.5,-18,2.2,1.2,2.2);
      g.beam('#e1b263',[x,y+13,-18],[x+.7,y+15.6,-18],.75,undefined,6);
      break;
    }
    case 'LAC':case 'LAR':
      g.box('#ccd6ca',-X-14,3.0,3,22,6,58);
      for(let j=0;j<8;j++)g.box('#adbdb2',-X-14-j*.75,4.0+j*.72,3,11,.8,41-j*2.8);
      break;
    case 'MIA':
      for(const sx of [-1,1])for(const sz of [-1,1])g.box('#a5b7ac',sx*X*.89,6.5,sz*Z*.90,8,13,8);
      break;
    case 'MIN':{
      const x=-X*1.044;
      // Five tall pivoting doors and their oversized steel mullions mark the west prow.
      for(let i=-2;i<=2;i++){
        const z=i*Z*.23,h=H+14-Math.abs(i)*1.6;
        g.box(i%2?'#809ca8':'#91acb8',x,h*.5,z,.85,h,Z*.207);
        g.box('#d1d9d6',x-.7,h*.5,z-Z*.106,.45,h,.55);
        for(let k=1;k<6;k++)g.box('#9daeb2',x-.65,h*k/6,z,.35,.31,Z*.21);
      }
      const prow=[x-7,H+20,-Z*.27],bottom=[x-8,1,-Z*.91],tip=[x-2,H+4,-Z*1.04];
      g.tri('#435361',prow,bottom,tip);
      break;
    }
    case 'NE':gillette(g,d);break;
    case 'NO':drum(g,d);break;
    case 'NYG':case 'NYJ':louvers(g,d);break;
    case 'PHI':
      armature(g,d,'#afbbba',14);
      for(const sx of [-1,1])for(const sz of [-1,1]){
        const x=sx*X*.76,z=sz*Z*.82;
        truss(g,f=>[x-4+8*f,H*.80,z],f=>[x-4+8*f,2,z],5,'#a6b5b1',.46,'detail');
      }
      break;
    case 'PIT':armature(g,d,'#cfad45',12);break;
    case 'SF':
      suiteTower(g,d,{side:1,length:151,height:H+9.4,levels:6,color:'#c7cecb',glassColor:'#6c8a95',depth:13});
      g.box('#92a383',0,H+10.2,Z+.6,146,.5,12);
      armature(g,d,'#c4ccca',12);break;
    case 'SEA':
      for(let i=0;i<15;i++){
        const xx=-X+7-i*.66,h=6+i*.61;
        g.box('#647e89',xx,h,0,1.6,.8,31+i*.87);
      }
      break;
    case 'TB':pirateShip(g,d);break;
    case 'TEN':
      for(const sx of [-1,1])for(const sz of [-1,1]){
        const x=sx*X*.77,z=sz*Z*.85;
        g.box('#a9b6b9',x,H*.45,z,6,H*.9,6);
        g.box('#bdc7c5',x,H*.91,z,7,1.3,7);
        for(let k=0;k<4;k++)g.box('#668797',x,H*.15+k*H*.18,z+sz*3.1,3.5,H*.10,.4);
      }
      break;
    case 'WAS':
      suiteTower(g,d,{side:1,length:86,height:H*.93,levels:3,color:'#ae9c88'});
      entryPavilions(g,d,'#aa9781');break;
  }
}
export function architecture(g,v,c,d) {
  if(c.capacity===0)return;
  const hasOriginalRoof=originalRoof(g,v,c,d);
  if(!hasOriginalRoof){
    if(c.roof==='canopy')ovalCanopy(g,d);
    if(c.roof==='fixed'||c.roof==='retractable')roundRoof(g,d,c.roof);
  }
  if(!c.custom)landmark(g,v,c,d);
  scoreboard(g,v,c,d);
}
