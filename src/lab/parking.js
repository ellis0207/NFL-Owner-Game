import {parcelPlan,developmentParcels} from './parcels.js';
import {parkingProfiles} from './parking-data.js';
export const PARKING_SCHEMA='stadiumlab-parking-1';
export const rates={surface:12500,garage:35000,demolition:1800,landPerAcre:1200000,surfaceMaintenance:180,garageMaintenance:450,sqftPerStall:330};
const num=(x,lo,hi,fallback=lo)=>Math.max(lo,Math.min(hi,Number.isFinite(Number(x))?Number(x):fallback));
const integer=(x,lo,hi,fallback=lo)=>Math.floor(num(x,lo,hi,fallback));
export function profile(v,c={}){
 if(v.id!=='CUSTOM'){const p=parkingProfiles[v.id],q=parcelPlan(v,c);return q.enabled?{...p,acreage:q.acres}:p;}
 const reserve=c.capacity>0?25+c.capacity/2500+(c.plaza?4:0)+(c.amenities?2:0):0;
 return {context:'Custom development site',source:null,sourceLabel:'User-defined site',notes:'Site area includes the bowl, circulation and landscape reserve. Parking consumes remaining land. All land and layout assumptions are conceptual.',acreage:Math.max(0,(c.siteAcres??150)-reserve),rebuildAcres:0,price:40,heading:0,facilities:[],constraints:['Stadium and access reserve: '+reserve.toFixed(1)+' acres','No existing parking; all supply must be constructed.'],reserve};
}
export function parkingDefaults(v){let p=v.id==='CUSTOM'?null:parkingProfiles[v.id];return {parcelMode:false,parcelIds:'',parking:0,garageFoot:0,levels:3,convert:0,retire:0,convertLot:p?.facilities.find(f=>f.control==='managed'&&f.type==='surface')?.id||'',lease:0,siteAcres:150,parkingPrice:p?.price||40,leaseRate:20,events:10,attendance:95,driveShare:v.id==='MIN'?45:70,occupants:2.8,revenueShare:100,landRate:1.2};}
export function normalizeParking(v,raw){
 const c={...raw};const d=parkingDefaults(v);for(const k of Object.keys(d))if(c[k]===undefined)c[k]=d[k];
 c.parcelMode=!!c.parcelMode&&v.id!=='CUSTOM';const valid=developmentParcels(v);c.parcelIds=valid.filter(p=>String(c.parcelIds).split(',').includes(p.id)).map(p=>p.id).join(',');
 c.siteAcres=integer(c.siteAcres,50,1000,150);c.levels=integer(c.levels,2,6,3);
 c.parkingPrice=integer(c.parkingPrice,0,200,40);c.leaseRate=integer(c.leaseRate,0,150,20);c.events=integer(c.events,1,40,10);c.attendance=integer(c.attendance,0,100,95);c.driveShare=integer(c.driveShare,0,100,70);c.occupants=num(c.occupants,1,6,2.8);c.revenueShare=integer(c.revenueShare,0,100,100);c.landRate=num(c.landRate,0,20,1.2);
 const p=profile(v,c),fac=p.facilities.filter(f=>f.control==='managed'&&f.type==='surface');
 if(!fac.some(f=>f.id===c.convertLot))c.convertLot=fac[0]?.id||'';
 const lot=fac.find(f=>f.id===c.convertLot),budget=c.parcelMode?parcelPlan(v,c).stalls:Math.floor(p.acreage*43560/rates.sqftPerStall);
 c.parking=integer(c.parking,0,budget);c.garageFoot=integer(c.garageFoot,0,budget-c.parking);
 c.convert=integer(c.convert,0,Math.min(lot?.spaces||0,Math.floor(p.rebuildAcres*43560/rates.sqftPerStall)));
 c.retire=integer(c.retire,0,(lot?.spaces||0)-c.convert);
 c.lease=integer(c.lease,0,p.facilities.filter(f=>f.control==='shared').reduce((s,f)=>s+f.spaces,0));return c;
}
export function parkingPlan(v,raw){
 const c=normalizeParking(v,raw),p=profile(v,c),sum=(control,type)=>p.facilities.filter(f=>f.control===control&&(!type||f.type===type)).reduce((s,f)=>s+f.spaces,0);
 const baseSurface=sum('managed','surface'),baseGarage=sum('managed','garage'),shared=sum('shared');
 const surface=baseSurface-c.convert-c.retire+c.parking,garage=baseGarage+(c.convert+c.garageFoot)*c.levels,managed=surface+garage;
 const newAcres=(c.parking+c.garageFoot)*rates.sqftPerStall/43560;
 const lines=[['Surface parking construction',c.parking*rates.surface,`${c.parking} spaces × $12,500`],['Structured parking construction',(c.convert+c.garageFoot)*c.levels*rates.garage,`${(c.convert+c.garageFoot)*c.levels} total constructed spaces × $35,000`],['Parking removal and restoration',(c.convert+c.retire)*rates.demolition,`${c.convert+c.retire} removed surface spaces × $1,800`]].filter(x=>x[1]>0).map(([label,cost,basis])=>({label,cost,basis}));
 const parcels=parcelPlan(v,c);if(parcels.enabled&&parcels.clearance)lines.push({label:'Selected parcel clearance',cost:parcels.clearance,basis:'Acquired acreage × scenario clearance allowance'});
 const land=c.custom?0:parcels.enabled?parcels.land:newAcres*c.landRate*1e6,hard=lines.reduce((s,l)=>s+l.cost,0),capital=hard*(c.market||1)*(1+(c.soft??15)/100)*(1+(c.contingency??20)/100)+land;
 const demand=Math.ceil(Math.max(0,c.capacity)*c.attendance/100*c.driveShare/100/c.occupants);
 function operations(s,g,lease){const supply=s+g,served=Math.min(demand,supply),leasedUsed=Math.min(lease,Math.max(0,demand-served)),unserved=Math.max(0,demand-supply-shared),gross=(served+leasedUsed)*c.parkingPrice*c.events*c.revenueShare/100,leaseCost=lease*c.leaseRate*c.events,maintenance=s*rates.surfaceMaintenance+g*rates.garageMaintenance,staffing=(served+leasedUsed)*6*c.events;return {served,leasedUsed,unserved,gross,leaseCost,maintenance,staffing,net:gross-leaseCost-maintenance-staffing};}
 const ops=operations(surface,garage,c.lease),baseOps=operations(baseSurface,baseGarage,0),incremental=ops.net-baseOps.net;
 return {parcels,schema:PARKING_SCHEMA,profile:p,custom:c.custom,config:c,baseSurface,baseGarage,shared,surface,garage,managed,total:managed+shared,lease:c.lease,added:managed-baseSurface-baseGarage,surfaceAdded:c.parking,garageFoot:c.garageFoot,convert:c.convert,retire:c.retire,levels:c.levels,chosenLot:p.facilities.find(f=>f.id===c.convertLot)||null,newAcres,land,hard,capital,lines,budget:parcels.enabled?parcels.stalls:Math.floor(p.acreage*43560/rates.sqftPerStall),remainingAcres:Math.max(0,p.acreage-newAcres),demand,operations:ops,baselineOperations:baseOps,incrementalNOI:incremental,payback:capital>0&&incremental>0?capital/incremental:null};
}
export function simulatorExport(v,c){const p=parkingPlan(v,c);return {schema:PARKING_SCHEMA,venueId:v.id,physicalVenueId:({NYJ:'NYG',LAC:'LAR'})[v.id]||v.id,currency:'USD',priceYear:2026,capacity:c.capacity,configuration:p.config,development: p.parcels,inventory:p.profile.facilities,limits:{expansionAcres:p.profile.acreage,rebuildAcres:p.profile.rebuildAcres,footprintStalls:p.budget,limitsArePlanningEstimates:true},parking:{managedSurface:p.surface,managedGarage:p.garage,sharedThirdParty:p.shared,leasedSubsetOfShared:p.lease,netAdded:p.added},economics:{capital:p.capital,annual:p.operations,incrementalNOI:p.incrementalNOI,simplePaybackYears:p.payback},assumptions:{...rates,eventsAreEquivalentFullDemandEvents:true,managedDoesNotEstablishOwnership:true,sharedRevenueOnlyWithLease:true,operationRightsShare:c.revenueShare,excludes:'Financing, taxes, permit/land entitlement, land ownership verification, construction downtime, event conflicts and road network capacity'},provenance:{url:p.profile.source,notes:p.profile.notes}};}
