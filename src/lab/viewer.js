import {buildModel} from './geometry.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function cameraFrame(view){
 const sa=Math.sin(view.yaw),ca=Math.cos(view.yaw),se=Math.sin(view.elevation),ce=Math.cos(view.elevation);
 return {right:[ca,0,-sa],up:[-sa*se,ce,-ca*se],back:[sa*ce,se,ca*ce],focus:view.focus,distance:view.distance};
}
const dots=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const shade=(rgb,light)=>[(rgb>>16)*light,((rgb>>8)&255)*light,(rgb&255)*light];
class HardwareRenderer{
 constructor(canvas,gl){
   this.canvas=canvas;this.gl=gl;this.parts=[];
   const compile=(type,code)=>{let s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
   const vertex=compile(gl.VERTEX_SHADER,`#version 300 es
   in vec3 aPosition;in vec3 aColor;in vec2 aUV;
   uniform vec3 uRight,uUp,uBack,uFocus;uniform float uDistance,uAspect,uHeight,uPoint;
   out vec3 vColor,vWorld;out vec2 vUV;
   void main(){vec3 p=aPosition-uFocus;float z=uDistance-dot(p,uBack);gl_Position=vec4(dot(p,uRight)*2.90421/uAspect,dot(p,uUp)*2.90421,z*1.00002-.400004,z);gl_PointSize=clamp(uHeight*1.45*uPoint/max(z,.2),.8,8.);vColor=aColor;vUV=aUV;vWorld=aPosition;}`);
   const fragment=compile(gl.FRAGMENT_SHADER,`#version 300 es
   precision highp float;in vec3 vColor,vWorld;in vec2 vUV;uniform sampler2D uTexture;uniform int uMode;uniform float uNight;out vec4 color;
   void main(){vec3 c=vColor;if(uMode==1)c=texture(uTexture,vUV).rgb;
   if(uMode==2){vec2 grid=abs(fract(vWorld.xz/10.+.5)-.5)/max(fwidth(vWorld.xz/10.),vec2(.0001));float line=1.-min(min(grid.x,grid.y),1.);float shadow=1.-smoothstep(.68,1.15,length((vWorld.xz-vec2(7.,5.))/vec2(137.,90.)));c=mix(vec3(.90,.925,.881),vec3(.75,.79,.72),line*.33+shadow*.67);}
   c=mix(c,c*vec3(.46,.55,.72),uNight);color=vec4(c,1.);}`);
   const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Unable to initialize graphics');this.program=program;gl.useProgram(program);
   this.attrs=['aPosition','aColor','aUV'].map(n=>gl.getAttribLocation(program,n));
   this.u={};for(let n of ['Right','Up','Back','Focus','Distance','Aspect','Height','Point','Mode','Night','Texture'])this.u[n]=gl.getUniformLocation(program,'u'+n);
   gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);this.textures=[];
 }
 load(g){
   const gl=this.gl;
   for(const part of this.parts)gl.deleteBuffer(part.buffer);this.textures.forEach(t=>gl.deleteTexture(t));this.parts=[];
   this.textures=g.textures.map(image=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t});
   const chunks=new Map();function add(group,texture,pos,rgb,uv){let key=group+':'+texture;if(!chunks.has(key))chunks.set(key,{group,texture,data:[]});chunks.get(key).data.push(...pos,...rgb.map(c=>c/255),...uv)}
   for(const f of g.faces){let col=shade(f.rgb,f.light);f.v.forEach((idx,i)=>add(f.group,f.texture?.id??-1,g.vertices[idx],col,f.texture?f.texture.uv.slice(i*2,i*2+2):[0,0]))}
   for(const [idx,color,intensity] of g.seats)add('seats',-1,g.vertices[idx],shade(color,intensity),[0,0]);
   const corners=[[-1400,-1,-1400],[-1400,-1,1400],[1400,-1,1400],[1400,-1,-1400]];for(let i of [0,1,2,0,2,3])add('ground',-1,corners[i],[215,226,211],[0,0]);
   for(const {group,texture,data} of chunks.values()){let buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);this.parts.push({group,texture,buffer,count:data.length/8})}
 }
 draw(view){
   const gl=this.gl,w=this.canvas.width,h=this.canvas.height,cam=cameraFrame(view),u=this.u;
   gl.viewport(0,0,w,h);gl.clearColor(...(view.night?[.09,.16,.16,1]:[.90,.925,.881,1]));gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   gl.useProgram(this.program);for(let key of ['Right','Up','Back','Focus'])gl.uniform3fv(u[key],cam[key.toLowerCase()]);gl.uniform1f(u.Distance,cam.distance);gl.uniform1f(u.Aspect,w/h);gl.uniform1f(u.Height,h);gl.uniform1f(u.Night,view.night?1:0);gl.uniform1i(u.Texture,0);
   for(const part of this.parts){if(view.hideRoof&&part.group==='roof')continue;gl.bindBuffer(gl.ARRAY_BUFFER,part.buffer);
     for(let i=0;i<3;i++){gl.enableVertexAttribArray(this.attrs[i]);gl.vertexAttribPointer(this.attrs[i],i===2?2:3,gl.FLOAT,false,32,[0,12,24][i])}
     gl.uniform1i(u.Mode,part.group==='ground'?2:part.texture>=0?1:0);gl.uniform1f(u.Point,part.group==='seats'?.52:1);
     if(part.texture>=0)gl.bindTexture(gl.TEXTURE_2D,this.textures[part.texture]);gl.drawArrays(part.group==='seats'?gl.POINTS:gl.TRIANGLES,0,part.count);
   }
 }
}
class SoftwareRenderer{
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.layer=document.createElement('canvas');this.paint=this.layer.getContext('2d')}
 load(g){this.g=g;this.projected=new Float32Array(g.vertices.length*3)}
 draw(view){
   const g=this.g;if(!g)return;let w=this.canvas.width,h=this.canvas.height;if(w!==this.layer.width||h!==this.layer.height||!this.image){this.layer.width=w;this.layer.height=h;this.image=this.paint.createImageData(w,h);this.depth=new Float32Array(w*h)}
   let cam=cameraFrame(view),proj=this.projected,focal=h*1.4521;
   const project=p=>{let delta=sub(p,cam.focus),q=1/(cam.distance-dots(delta,cam.back));return [w/2+dots(delta,cam.right)*focal*q,h/2-dots(delta,cam.up)*focal*q,q]};
   let ctx=this.ctx;ctx.fillStyle=view.night?'#1d3030':'#e4e9df';ctx.fillRect(0,0,w,h);
   ctx.strokeStyle=view.night?'#bac8bd19':'#83917e2b';ctx.lineWidth=.7;
   for(let n=-300;n<=300;n+=10)for(let axis of [0,1]){let a=project(axis?[n,-1,-300]:[-300,-1,n]),b=project(axis?[n,-1,300]:[300,-1,n]);if(a[2]>0&&b[2]>0){ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke()}}
   if(view.mode!=='field'){ctx.save();ctx.filter='blur(9px)';ctx.fillStyle=view.night?'#06131380':'#41533d38';ctx.beginPath();for(let i=0;i<=72;i++){let t=i*Math.PI/36,p=project([8+Math.cos(t)*133,-.97,3+Math.sin(t)*86]);i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])}ctx.fill();ctx.restore()}
   g.vertices.forEach((p,i)=>proj.set(project(p),i*3));let pixels=this.image.data,depth=this.depth;pixels.fill(0);depth.fill(0);
   let night=view.night?[.46,.55,.72]:[1,1,1];
   for(let f of g.faces){if(view.hideRoof&&f.group==='roof')continue;
     const [a,b,c]=f.v.map(i=>i*3);let ax=proj[a],ay=proj[a+1],bx=proj[b],by=proj[b+1],cx=proj[c],cy=proj[c+1],qa=proj[a+2],qb=proj[b+2],qc=proj[c+2];if(Math.min(qa,qb,qc)<=0)continue;
     let x0=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),x1=Math.min(w-1,Math.floor(Math.max(ax,bx,cx)-.5)),y0=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)),y1=Math.min(h-1,Math.floor(Math.max(ay,by,cy)-.5));if(x1<x0||y1<y0)continue;
     let det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(det)<.025)continue;
     let ux=(by-cy)/det,uy=(cx-bx)/det,vx=(cy-ay)/det,vy=(ax-cx)/det,ur=(x0+.5-cx)*ux+(y0+.5-cy)*uy,vr=(x0+.5-cx)*vx+(y0+.5-cy)*vy;
     let col=shade(f.rgb,f.light).map((v,i)=>v*night[i]),tex=f.texture?g.textures[f.texture.id]:null,uv=f.texture?.uv;
     for(let y=y0;y<=y1;y++,ur+=uy,vr+=vy){let u=ur,v=vr,idx=y*w+x0;for(let x=x0;x<=x1;x++,idx++,u+=ux,v+=vx){let s=1-u-v;if(u<-.00001||v<-.00001||s<-.00001)continue;let z=u*qa+v*qb+s*qc;if(z<depth[idx])continue;depth[idx]=z;let off=idx*4;
       if(tex){let tx=clamp(Math.floor((u*qa*uv[0]+v*qb*uv[2]+s*qc*uv[4])/z*tex.width),0,tex.width-1),ty=clamp(Math.floor((u*qa*uv[1]+v*qb*uv[3]+s*qc*uv[5])/z*tex.height),0,tex.height-1),k=(ty*tex.width+tx)*4;for(let j=0;j<3;j++)pixels[off+j]=tex.data[k+j]*night[j]}else{pixels[off]=col[0];pixels[off+1]=col[1];pixels[off+2]=col[2]}pixels[off+3]=255;
     }}
   }
   for(let [idx,col,light] of g.seats){let i=idx*3,q=proj[i+2];if(q<=0)continue;let x=Math.round(proj[i]),y=Math.round(proj[i+1]),r=clamp(Math.round(focal*q*.51),1,6);if(x<0||x>=w||y<0||y>=h)continue;let rgb=shade(col,light);
     for(let j=0;j<r&&y-j>=0;j++)for(let k=0;k<r&&x+k<w;k++){let p=(y-j)*w+x+k;if(q+q*q*.12<depth[p])continue;depth[p]=q;let o=p*4;for(let s=0;s<3;s++)pixels[o+s]=rgb[s]*night[s];pixels[o+3]=255}
   }
   this.paint.putImageData(this.image,0,0);ctx.drawImage(this.layer,0,0);
 }
}
export class Viewer{
 constructor(container){
   let canvas=document.createElement('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','3D stadium. Drag to orbit, scroll to zoom. Arrow keys rotate and plus or minus zoom.');container.prepend(canvas);this.canvas=canvas;this.labelLayer=document.createElement('div');this.labelLayer.className='district-labels';container.append(this.labelLayer);
   try{let gl=canvas.getContext('webgl2',{alpha:false,antialias:true,powerPreference:'high-performance'});if(!gl)throw Error('WebGL unavailable');this.renderer=new HardwareRenderer(canvas,gl)}
   catch{let fallback=canvas.cloneNode(false);canvas.replaceWith(fallback);this.canvas=canvas=fallback;this.renderer=new SoftwareRenderer(canvas)}
   this.night=false;this.hideRoof=false;this.rotate=false;this.pointers=new Map();this.reset();
   this.observer=new ResizeObserver(()=>{this.resize();this.dirty=true});this.observer.observe(container);this.resize();
   const update=()=>{if(this.stopped)return;if(this.rotate&&!document.hidden){this.yaw+=.0025;this.dirty=true}if(this.dirty&&!document.hidden){this.renderer.draw(this);this.drawLabels();this.dirty=false}this.frame=requestAnimationFrame(update)};this.frame=requestAnimationFrame(update);
   canvas.oncontextmenu=e=>e.preventDefault();
   canvas.onpointerdown=e=>{this.clickStart=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,[e.clientX,e.clientY]);canvas.style.cursor='grabbing'};
   canvas.onpointerup=canvas.onpointercancel=e=>{if(e.type==='pointerup'&&this.clickStart&&Math.hypot(e.clientX-this.clickStart[0],e.clientY-this.clickStart[1])<5)this.pickLot(e);this.pointers.delete(e.pointerId);canvas.style.cursor='grab'};
   canvas.onpointermove=e=>{let prev=this.pointers.get(e.pointerId);if(!prev)return;let dx=e.clientX-prev[0],dy=e.clientY-prev[1],other=[...this.pointers].find(([id])=>id!==e.pointerId)?.[1];
     if(other){let old=Math.hypot(prev[0]-other[0],prev[1]-other[1]),now=Math.hypot(e.clientX-other[0],e.clientY-other[1]);if(now>1)this.zoom(old/now)}
     else if(e.buttons===2||e.shiftKey){let scale=this.distance*.0015;this.focus[0]-=dx*Math.cos(this.yaw)*scale;this.focus[2]+=dx*Math.sin(this.yaw)*scale;this.focus[1]+=dy*scale}
     else{this.yaw-=dx*.007;this.elevation=clamp(this.elevation+dy*.005,-.04,1.565)}this.pointers.set(e.pointerId,[e.clientX,e.clientY]);this.dirty=true};
   canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom(Math.exp(clamp(e.deltaY,-120,120)*.0025))},{passive:false});
   canvas.onkeydown=e=>{let f={ArrowLeft:()=>this.yaw-=.12,ArrowRight:()=>this.yaw+=.12,ArrowUp:()=>this.elevation=clamp(this.elevation+.09,-.04,1.565),ArrowDown:()=>this.elevation=clamp(this.elevation-.09,-.04,1.565),'+':()=>this.zoom(.88),'=':()=>this.zoom(.88),'-':()=>this.zoom(1.14)}[e.key];if(f){e.preventDefault();f();this.dirty=true}};
 }
 resize(){let w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;let scale=this.renderer instanceof HardwareRenderer?Math.min(devicePixelRatio,1.75):Math.min(1.35,1000/w);this.canvas.width=Math.round(w*scale);this.canvas.height=Math.round(h*scale);this.dirty=true}
 zoom(f){this.distance=clamp(this.distance*f,5,10000);this.dirty=true}
 reset(mode='orbit'){this.mode=mode;this.rotate=false;let aspect=(this.canvas.clientWidth||700)/(this.canvas.clientHeight||440);this.focus=[0,4,0];this.distance=330*Math.max(1,1.51/aspect);this.elevation=.64;this.yaw=-.68;if(mode==='top'){this.elevation=1.565;this.yaw=0;this.distance=283*Math.max(1,1.51/aspect)}if(mode==='district'){this.focus=this.district?.focus||[0,0,0];this.distance=Math.max(650,(this.district?.radius||250)*2.35)*Math.max(1,1/aspect);this.elevation=.95;this.yaw=0;}if(mode==='field'){this.focus=[-22,8,-8];this.distance=80;this.elevation=-.055;this.yaw=1.26;this.hideRoof=true}this.dirty=true}
 load(v,c){const model=buildModel(v,c);this.district=model.district;this.renderer.load(model);if(this.mode==='district')this.reset('district');this.dirty=true}
 drawLabels(){
   this.labelLayer.replaceChildren();if(this.mode!=='district'||!this.district)return;
   const cam=cameraFrame(this),w=this.canvas.clientWidth,h=this.canvas.clientHeight,used=[];
   for(const label of [...this.district.labels].sort((a,b)=>(a.control==='proposed'?-1:0)-(b.control==='proposed'?-1:0))){
     if(label.match==='mapped only')continue;const delta=sub([label.x,7,label.z],cam.focus),q=1/(cam.distance-dots(delta,cam.back));if(q<=0)continue;
     const x=w/2+dots(delta,cam.right)*h*1.4521*q,y=h/2-dots(delta,cam.up)*h*1.4521*q;
     if(x<50||x>w-50||y<65||y>h-80||used.some(p=>Math.abs(p[0]-x)<110&&Math.abs(p[1]-y)<28))continue;
     used.push([x,y]);const el=document.createElement('button');el.type='button';el.onclick=()=>this.onSelect?.(label);el.textContent=label.name;el.title=label.name+' · '+label.match;el.style.left=x+'px';el.style.top=y+'px';this.labelLayer.append(el);if(used.length>=14)break;
   }
 }
 pickLot(e){
  if(this.mode!=='district'||!this.district)return;const rect=this.canvas.getBoundingClientRect(),mx=e.clientX-rect.left,my=e.clientY-rect.top,cam=cameraFrame(this),w=rect.width,h=rect.height;
  const project=([x,z])=>{const d=sub([x,1,z],cam.focus),depth=cam.distance-dots(d,cam.back);return [w/2+dots(d,cam.right)*h*1.4521/depth,h/2-dots(d,cam.up)*h*1.4521/depth]};
  const inside=ring=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>my)!==(b[1]>my)&&mx<(b[0]-a[0])*(my-a[1])/(b[1]-a[1])+a[0])yes=!yes}return yes};
  for(const label of [...this.district.labels].reverse())if(label.ring?.length>=3&&inside(label.ring.map(project))){this.onSelect?.(label);break;}
 }
 capture(){this.renderer.draw(this);return this.canvas.toDataURL('image/png')}
 // Game patch: the Stadium page mounts and unmounts the viewer, so it stops its
 // frame loop, its resize watch and removes what it added to the page.
 destroy(){this.stopped=true;cancelAnimationFrame(this.frame);this.observer.disconnect();this.canvas.remove();this.labelLayer.remove()}
}
