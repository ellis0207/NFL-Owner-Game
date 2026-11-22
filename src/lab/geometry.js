import {drawDistrict} from './district-model.js';
import {parkingPlan} from './parking.js';
import {surveys} from './surveys.js';
import {architecture} from './architecture.js';
const TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const tint=(color,ratio,other='#ffffff')=>{
 const a=parseInt(color.slice(1),16),b=parseInt(other.slice(1),16);
 const ch=k=>Math.round(((a>>k)&255)*(1-ratio)+((b>>k)&255)*ratio);
 return '#'+((ch(16)<<16)|(ch(8)<<8)|ch(0)).toString(16).padStart(6,'0');
};
export class Geometry{
 constructor(){this.vertices=[];this.faces=[];this.seats=[];this.lookup=new Map();this.textures=[]}
 vertex(p){const key=p.map(n=>Math.round(n*2000)).join(',');let id=this.lookup.get(key);if(id===undefined){id=this.vertices.length;this.lookup.set(key,id);this.vertices.push(p)}return id}
 tri(color,a,b,c,group='body',texture=null){
   const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
   let nx=u[1]*v[2]-u[2]*v[1],ny=u[2]*v[0]-u[0]*v[2],nz=u[0]*v[1]-u[1]*v[0];let length=Math.hypot(nx,ny,nz);if(length<1e-6)return;
   nx/=length;ny/=length;nz/=length;if(Math.abs(ny)>.28?ny<0:nx*a[0]+nz*a[2]<0){nx=-nx;ny=-ny;nz=-nz}
   const light=.71+.33*Math.max(0,-nx*.46+ny*.78+nz*.42);
   let rgb=typeof color==='string'?parseInt(color.replace('#',''),16):color;
   this.faces.push({v:[this.vertex(a),this.vertex(b),this.vertex(c)],rgb,light,group,texture});
 }
 quad(color,a,b,c,d,group='body'){this.tri(color,a,b,c,group);this.tri(color,a,c,d,group)}
 box(color,x,y,z,w,h,d,group='body'){
   const p=Array.from({length:8},(_,i)=>[x+(i&1?w:-w)/2,y+(i&2?h:-h)/2,z+(i&4?d:-d)/2]);
   for(const [a,b,c,e] of [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]])this.quad(color,p[a],p[b],p[c],p[e],group);
 }
 beam(color,a,b,r,group='body',sides=5){
   const diff=b.map((n,i)=>n-a[i]),len=Math.hypot(...diff);if(len<.001)return;const n=diff.map(x=>x/len);
   const u=Math.abs(n[1])>.96?[0,-n[2],n[1]]:[-n[2],0,n[0]],lu=Math.hypot(...u);for(let j=0;j<3;j++)u[j]/=lu;
   const v=[n[1]*u[2]-n[2]*u[1],n[2]*u[0]-n[0]*u[2],n[0]*u[1]-n[1]*u[0]];
   const ring=(p,i)=>p.map((x,j)=>x+r*(u[j]*Math.cos(i*TAU/sides)+v[j]*Math.sin(i*TAU/sides)));
   for(let i=0;i<sides;i++){this.quad(color,ring(a,i),ring(a,i+1),ring(b,i+1),ring(b,i),group);this.tri(color,a,ring(a,i),ring(a,i+1),group);this.tri(color,b,ring(b,i+1),ring(b,i),group)}
 }
 patch(canvas,a,b,c,d,group='body',cols=1,rows=1){
   const id=this.textures.length,ctx=canvas.getContext('2d');this.textures.push(ctx.getImageData(0,0,canvas.width,canvas.height));
   function point(u,v){return a.map((x,j)=>x*(1-u)*(1-v)+b[j]*u*(1-v)+c[j]*u*v+d[j]*(1-u)*v)}
   for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){
     let u=i/cols,v=j/rows,e=(i+1)/cols,f=(j+1)/rows,P=point(u,v),Q=point(e,v),R=point(e,f),S=point(u,f);
     this.tri('#ffffff',P,Q,R,group,{id,uv:[u,v,e,v,e,f]});this.tri('#ffffff',P,R,S,group,{id,uv:[u,v,e,f,u,f]});
   }
 }
}
function field(g,v,c){
 let canvas=document.createElement('canvas');canvas.width=1536;canvas.height=688;
 let p=canvas.getContext('2d'),W=canvas.width,H=canvas.height;
 p.fillStyle=c.surface==='turf'?'#408052':c.surface==='hybrid'?'#497743':'#537e40';p.fillRect(0,0,W,H);
 for(let i=0;i<24;i+=2){p.fillStyle='#ffffff0d';p.fillRect(i*W/24,0,W/24,H)}
 p.fillStyle=c.color;p.fillRect(0,0,W/12,H);p.fillRect(11*W/12,0,W/12,H);
 p.strokeStyle='#fffbe7';p.lineWidth=4;p.strokeRect(2,2,W-4,H-4);
 for(let i=10;i<=110;i+=5){p.beginPath();p.moveTo(W*i/120,0);p.lineTo(W*i/120,H);p.stroke()}
 p.lineWidth=2;for(let i=11;i<110;i++)for(const z of [.41,.59]){p.beginPath();p.moveTo(i*W/120,H*z-4);p.lineTo(i*W/120,H*z+4);p.stroke()}
 p.fillStyle='#fffbe7';p.font='bold 30px sans-serif';p.textAlign='center';p.textBaseline='middle';
 for(let i=20;i<=100;i+=10){let n=String(Math.min(i-10,110-i));p.fillText(n,W*i/120,H*.80);p.save();p.translate(W*i/120,H*.20);p.rotate(Math.PI);p.fillText(n,0,0);p.restore()}
 let text=c.custom?(c.name==='Untitled stadium'?'HOME FIELD':c.name.slice(0,18).toUpperCase()):v.team.split(' ').at(-1).toUpperCase();
 p.font='bold 54px sans-serif';for(let i=0;i<2;i++){p.save();p.translate(i?W*23/24:W/24,H/2);p.rotate(i?Math.PI/2:-Math.PI/2);p.fillText(text,0,0,H*.88);p.restore()}
 p.fillStyle=c.color;p.beginPath();p.ellipse(W/2,H/2,70,43,0,0,TAU);p.fill();p.stroke();p.fillStyle='#ffffff';p.font='bold 41px sans-serif';p.fillText(c.custom?'SL':v.id,W/2,H/2);
 g.box('#96a895',0,.05,0,135,.4,64);
 g.patch(canvas,[-60,.45,-26.667],[60,.45,-26.667],[60,.45,26.667],[-60,.45,26.667],'field',12,6);
 for(const s of [-1,1]){let x=s*60;g.beam('#efc03f',[x,.5,0],[x,4.3,0],.20);g.beam('#efc03f',[x,4.3,-3.08],[x,4.3,3.08],.16);for(const z of [-3.08,3.08])g.beam('#efc03f',[x,4.3,z],[x,12,z],.15)}
}
function sign(g,text,x,y,z,width,front='#293d34'){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=100;const ctx=canvas.getContext('2d');
 ctx.fillStyle=front;ctx.fillRect(0,0,1024,100);ctx.fillStyle='#faf8e9';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 66px sans-serif';ctx.fillText(text.toUpperCase(),512,50,965);
 g.patch(canvas,[x-width/2,y+1.9,z],[x+width/2,y+1.9,z],[x+width/2,y-1.9,z],[x-width/2,y-1.9,z],'body',3);
}
function tree(g,x,z,h){g.beam('#8e8270',[x,.1,z],[x,h*.67,z],.36);for(let i=0;i<8;i++){let a=i*TAU/8,b=(i+1)*TAU/8,r=h*.47,p=[x+r*Math.cos(a),h*.72,z+r*Math.sin(a)],q=[x+r*Math.cos(b),h*.72,z+r*Math.sin(b)];g.tri(i%2?'#849875':'#91a57c',p,q,[x,h*1.4,z]);g.tri('#75896c',p,q,[x,h*.37,z])}}
export function buildModel(v,c){
 const g=new Geometry();field(g,v,c);
 if(c.custom&&c.capacity===0){g.box('#c5cebf',0,-.4,0,185,.8,108);for(let x of [-1,1])for(let z of [-1,1])g.box('#859e85',x*88,.4,z*50,4,.7,4);g.district=drawDistrict(g,v,c,{X:92,Z:54,H:0},parkingPlan(v,c),null);return g}
 const id=v.id,is=(...ids)=>ids.includes(id),rect=c.custom?c.shape==='rectangular':is('TEN','TB','SEA','BAL','MIA','MIN','IND','DET','HOU','PHI','SF','JAX','CIN','NE','WAS');
 const exponent=rect?4.1:is('NO','LV','KC','ARI')?2.15:2.65;
 const point=(x,z,t,y,n=exponent)=>[x*Math.sign(Math.cos(t))*Math.abs(Math.cos(t))**(2/n),y,z*Math.sign(Math.sin(t))*Math.abs(Math.sin(t))**(2/n)];
 const capacityRatio=c.custom?Math.sqrt(Math.max(100,c.capacity)/68000):Math.sqrt(c.capacity/v.capacity);
 let decks=c.custom?(c.decks||(c.capacity<=30000?1:c.capacity<=55000?2:3)):3;
 const proportions=decks===1?[1]:decks===2?[.63,.37]:decks===3?[.49,.16,.35]:[.39,.18,.18,.25];
 const totalRows=c.custom?clamp(Math.round(c.capacity/1500),4,74):Math.round(50*capacityRatio);
 let rowDepth=.71*clamp(capacityRatio,.85,1.14),rise=c.rake==='steep'?.70:c.rake==='shallow'?.41:.54;
 const lowerX=75.7,lowerZ=40.5;let x=lowerX,z=lowerZ,h=1.9;
 const grouped=[],rims=[],N=112;
 const band=(color,f1,f2,test=()=>true,res=N)=>{for(let i=0;i<res;i++){let a=i*TAU/res,b=(i+1)*TAU/res;if(test((a+b)/2))g.quad(color,f1(a),f1(b),f2(b),f2(a))}};
 const allowed=(t,k)=>{
   let cs=Math.cos(t),sn=Math.sin(t);if(c.custom&&c.shape==='horseshoe'&&cs>.77)return false;if(k===0)return true;
   if(is('PIT','DEN')&&cs>(k===2?.50:.78))return false;
   if(is('TB','TEN','JAX','CIN','SEA')&&Math.abs(cs)>(k===2?.68:.91))return false;
   if(is('SF')&&sn>.24)return false;
   if(is('BAL','CAR','NE','PHI','CHI')&&k===2&&Math.abs(cs)>.5&&Math.abs(sn)>.55)return false;
   if(is('CLE','WAS')&&k===2&&Math.abs(cs)>.81)return false;
   return true;
 };
 function lift(t,level){let f=level/decks;if(is('KC','DEN'))return 8*Math.sin(t)**2*f;if(is('GB'))return 10*Math.max(0,-Math.cos(t))**3*f;if(is('CHI','PHI'))return 6*Math.max(0,Math.sin(t))*f;if(is('BUF'))return 3*Math.cos(2*t)*f;return 0}
 for(let k=0;k<decks;k++){
   let num=Math.max(2,Math.round(totalRows*proportions[k]));
   if(k){let xx=x,zz=z,hh=h;x+=2;z+=2;h+=2.55;band('#47575a',t=>point(xx,zz,t,hh+lift(t,k)),t=>point(x,z,t,h+lift(t,k)),t=>allowed(t,k));band('#d2d1c2',t=>point(x,z,t,h-.4+lift(t,k)),t=>point(x,z,t,h+lift(t,k)),t=>allowed(t,k))}
   for(let row=0;row<num;row++){
     let xx=x,zz=z,hh=h,level=k+(row+.5)/num;x+=rowDepth;z+=rowDepth;h+=rise;
     const l=t=>lift(t,level),tread=is('JAX')&&k===2?'#b8bcb4':tint(c.color,is('GB')?.53:.25,'#c7c8b8');
     band(tread,t=>point(xx,zz,t,hh+l(t)),t=>point(x,z,t,hh+l(t)),t=>allowed(t,k));
     band('#a8ada0',t=>point(x,z,t,hh+l(t)),t=>point(x,z,t,h+l(t)),t=>allowed(t,k));
     grouped.push({x:x-.35,z:z-.35,h:hh+.28,k,level,row,num});
   }
   rims.push({x:x+1,z:z+1,h:h+.3,k});
 }
 const X=x+1,Z=z+1,H=h+.3;
 function edge(t){let k=decks-1;while(k>=0&&!allowed(t,k))k--;if(k<0)return {x:lowerX,z:lowerZ,h:.5};let r=rims[k];return {x:r.x,z:r.z,h:r.h+lift(t,k+1)}}
 const ep=(t,f=1,off=0)=>{let e=edge(t);return point(e.x+off,e.z+off,t,e.h*f)};
 const facade=({original:v.facadeColor,brick:'#a5755b',metal:'#adbac0',glass:'#7c9aa7',timber:'#b48c65'})[c.facade];
 const skeletal=is('BAL','CAR','PIT','PHI','TEN','TB','SEA','SF','CIN','KC','DEN','JAX','CLE')&&c.facade==='original';
 band(facade,t=>ep(t,0),t=>ep(t),t=>!skeletal||Math.abs(Math.sin(6*t))<.45);
 for(let j=1;j<=4;j++){
   let f=j/5;
   band('#748286',t=>ep(t,f,.35),t=>ep(t,f+.038,.35));
   band('#c4c7bd',t=>ep(t,f+.04,1),t=>ep(t,f+.04,-4),t=>edge(t).h>2);
 }
 for(let i=0;i<64;i++){let t=(i+.25)*TAU/64,a=ep(t,0,1),b=ep(t,1,.4);g.beam(tint(facade,.12),a,b,.50,'body',4);if(skeletal&&i%2===0)g.beam('#a9b4aa',ep(t+.085,0,1),b,.28,'body',4)}
 if(c.facade==='metal'||is('NYG','NYJ','LV','ARI'))for(let j=1;j<13;j++){let f=j/13;band(tint(facade,j%2?.2:.05),t=>ep(t,f,1.2),t=>ep(t,f+.023,1.45))}
 if(c.facade==='glass'||c.facade==='timber')for(let i=0;i<72;i++){
   let a=i*TAU/72,b=(i+1)*TAU/72;
   if(c.facade==='glass'){g.quad(i%3?'#7e9fac':'#90acb4',ep(a,0,1.4),ep(b,0,1.4),ep(b,1,1.4),ep(a,1,1.4));g.beam('#c9d1cb',ep(a,0,1.6),ep(a,1,1.6),.25,'body',4)}
   else{g.beam('#ac8760',ep(a,0,1),ep(b,1,1),.62);g.beam('#c09b70',ep(b,0,1),ep(a,1,1),.55)}
 }
 // Every seat band has openings for stairs and short entrance tunnels. Seats are visual samples.
 for(const row of grouped){
   if(is('JAX')&&row.k===2)continue;
   let samples=Math.round(Math.PI*(row.x+row.z)/.92);
   for(let i=0;i<samples;i++){
     let t=(i+.5)*TAU/samples;if(!allowed(t,row.k)||Math.abs(Math.sin(24*t))<.15)continue;
     if(row.row>row.num-4&&Math.abs(Math.sin(12*t))<.16)continue;
     let col=is('WAS')&&row.row%9===0?'#b6a060':is('TEN')&&row.k===1?'#a25a60':c.color;
     let pos=point(row.x,row.z,t,row.h+lift(t,row.level));g.seats.push([g.vertex(pos),parseInt(col.slice(1),16),.82+((i*13+row.row*7)%17)*.017]);
   }
 }
 band('#c1c8b9',t=>point(X+20,Z+17,t,-.8,3.6),t=>point(X+20,Z+17,t,-.12,3.6));
 band('#cdd3c6',t=>point(.01,.01,t,-.12,3.6),t=>point(X+20,Z+17,t,-.12,3.6));
 for(let j of [-1,1])for(let i=-3;i<=3;i++){tree(g,i*15,j*(Z+12),4+(i+3)%3)}
 architecture(g,v,c,{X,Z,H});
 const showName=c.custom?c.name:v.name;sign(g,showName,0,edge(Math.PI/2).h*.68,Z+2.2,Math.min(62,17+showName.length*1.4),tint(c.color,.28,'#243c32'));
 if(c.suites){let len=16+c.suites*1.14;g.box(facade,0,H-4,-Z,len,10,10);for(let i=0;i<3;i++){g.box('#637e87',0,H-7+i*3,-Z,len+.5,2.1,10.4);g.box('#d4d7cd',0,H-8+i*3,-Z,len+1,.45,11)}}
 if(c.plaza){g.box('#c2b6a2',X+14,.1,0,28,.6,56);for(let j=-2;j<=2;j++){tree(g,X+23,j*10,5);g.box('#6e8075',X+9,.7,j*9,3.7,1.3,2)}}
 if(c.solar)for(let j=-4;j<=4;j++){g.box('#355467',j*10,4,Z+14,9,.6,7);g.box('#839085',j*10,2,Z+14,.5,4,.5)}
 if(c.amenities){g.box(facade,X+5,4,0,12,8,49);for(let j=-2;j<=2;j++)g.box('#78969a',X+11.1,4,j*9,.3,5.2,6)}

 if(c.led||(!c.custom&&c.roof==='open'&&!is('GB','NE','JAX','PHI','PIT')))for(let i of [-1,1])for(let j of [-1,1]){let x=i*X*.64,z=j*Z*.84;g.beam('#8d9892',[x,8,z],[x,H+8,z],.4);g.box('#53625c',x,H+8,z,9,1.8,1);g.box('#f3edd2',x,H+8,z-j*.58,8.7,1.3,.18)}
 g.district=drawDistrict(g,v,c,{X,Z,H},parkingPlan(v,c),surveys[v.id]);
 g.lookup.clear();return g;
}
