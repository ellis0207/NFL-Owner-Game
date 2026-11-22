import {businessDefaults} from './business.js';
import {parkingDefaults,parkingPlan} from './parking.js';
export const roofLabels = {open:'Open air', canopy:'Seating canopy', fixed:'Fixed roof', retractable:'Retractable roof'};
export const facadeLabels = {original:'Original exterior',brick:'Brick masonry',metal:'Metal louvers',glass:'Glazed curtain wall',timber:'Timber fins'};
export const surfaceLabels = {natural:'Natural grass',hybrid:'Reinforced grass',turf:'Synthetic turf'};
export const customVenue = {id:'CUSTOM',name:'Custom stadium',team:'Independent design',city:'New site',capacity:0,roof:'open',color:'#356d58',facadeColor:'#abb8b2',surface:'natural',style:'custom'};
export function baseline(v){
 const custom=v.id==='CUSTOM';
 return {...businessDefaults(),...parkingDefaults(v),custom,name:custom?'Untitled stadium':v.name+' renovation',capacity:v.capacity,roof:v.roof,color:v.color,surface:v.surface,facade:custom?'metal':'original',shape:'oval',decks:0,rake:'balanced',board:custom?'none':'original',suites:0,solar:false,plaza:false,led:false,wifi:false,amenities:false,parking:0,market:1,soft:15,contingency:20,land:0};
}
export function estimate(v,c){
 const lines=[];let months=0;
 function add(label,cost,basis,duration){if(cost<=0)return;lines.push({label,cost,basis});months=Math.max(duration,months)}
 const n=c.capacity,delta=n-v.capacity,roofCost={open:0,canopy:260e6,fixed:620e6,retractable:950e6};
 
 if(c.custom&&n>0){
   add('Stadium core and site work',Math.min(600e6,n*10000)+n*16500,'$16,500 per seat plus site and structural work at $10,000 per seat, capped at $600M',32);
   add(roofLabels[c.roof],roofCost[c.roof],'New-build roof allowance',c.roof==='retractable'?42:36);
   if(c.decks===4)add('Fourth deck structure',n*1050,'$1,050 per seat for additional vertical circulation and structure',36);
   if(c.rake==='steep')add('Steeper seating terraces',n*650,'$650 per seat for enhanced rakers and access',34);
 } else if(!c.custom) {
   if(delta>0)add('Seating expansion',delta*14000,delta.toLocaleString()+' added seats × $14,000 installed',delta>10000?24:18);
   if(delta<0)add('Seating removal',-delta*2200,(-delta).toLocaleString()+' removed seats × $2,200 for reconfiguration',12);
   if(c.roof!==v.roof){
     add('Roof demolition and stabilization',({open:0,canopy:65e6,fixed:160e6,retractable:220e6})[v.roof],'Existing roof removal allowance',18);
     add('Replacement roof system',roofCost[c.roof]*1.25,'New-build allowance × 1.25 for retrofit work',c.roof==='retractable'?42:30);
   }
   if(c.color!==v.color)add('Seat finish and replacement',n*420,'$420 per seat installed',8);
 }
 if(c.surface!==(c.custom?'natural':v.surface))add('Playing surface and drainage',({natural:6e6,hybrid:5e6,turf:3.5e6})[c.surface],'Playing surface, substrate and installation allowance',4);
 if(c.facade!==(c.custom?'metal':'original'))add('Exterior cladding',({brick:95e6,glass:145e6,metal:70e6,timber:110e6})[c.facade],'Facade system and installation allowance',18);
 add('Additional premium suites',c.suites*2.5e6,'$2.5M per suite. Premium seats replace general seats one for one.',18);
 if(c.board!==(c.custom?'none':'original')){
   const cost=({compact:c.custom?7e6:4.5e6,large:28e6,halo:56e6,none:4e6})[c.board]||0;
   add('Video display system',cost,c.board==='compact'?'Basic display and reconfiguration allowance':c.board==='none'?'Display demolition and electrical isolation':'Display, rigging and controls allowance',10);
 }
 if(c.plaza)add('Fan plaza and landscaping',38e6,'Outdoor event space and landscape allowance',12);
 if(c.solar)add('Solar and efficiency package',22e6,'Photovoltaic canopy, equipment and controls',10);
 if(c.led)add('LED lighting package',12e6,'Field and architectural lighting allowance',6);
 if(c.wifi)add('Venue connectivity',18e6,'Wi-Fi and distributed antenna systems',8);
 if(c.amenities)add('Expanded concourse amenities',85e6,'Restrooms, food service, accessibility and utilities',18);
 const parking=parkingPlan(v,c);for(const l of parking.lines)add(l.label,l.cost,l.basis,l.label.includes('Structured')?20:10);
 const hard=lines.reduce((sum,line)=>sum+line.cost,0),regional=hard*(c.market-1),soft=(hard+regional)*c.soft/100,contingency=(hard+regional+soft)*c.contingency/100,land=c.custom?c.land*1e6:parking.land,total=hard+regional+soft+contingency+land;
 return {lines,hard,regional,soft,contingency,land,total,low:total*.7,high:total*1.4,months,delta};
}
export const money=n=>n<0?'−'+money(-n):n>=1e9?'$'+(n/1e9).toFixed(2)+'B':n>=1e6?'$'+(n/1e6).toFixed(n>=100e6?0:1)+'M':n>=1e3?'$'+(n/1e3).toFixed(0)+'K':'$'+Math.round(n);
export const count=n=>Math.round(n).toLocaleString('en-US');
