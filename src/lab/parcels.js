import {parkingProfiles} from './parking-data.js';
// Scenario subdivisions, not cadastral parcels or offers of land for sale.
export function developmentParcels(v){
 const physicalId=({NYJ:'NYG',LAC:'LAR'})[v.id]||v.id,p=parkingProfiles[v.id];if(!p||!p.acreage)return [];
 const acres=[.4,.35,.25].map((x,i)=>i===2?p.acreage-Math.round(p.acreage*.4*100)/100-Math.round(p.acreage*.35*100)/100:Math.round(p.acreage*x*100)/100);
 return acres.map((a,i)=>({id:physicalId+'-parcel-'+(i+1),name:['Development zone A','Development zone B','Development zone C'][i],acres:a,priceMultiplier:[1,1.4,2][i],clearancePerAcre:[150000,450000,900000][i],approvalMonths:[6,12,24][i],use:['Low-intensity redevelopment scenario','Commercial relocation scenario','Complex redevelopment scenario'][i],constraint:['Access, drainage and utilities review','Relocation agreements and demolition allowance','Land assembly and zoning review; approval uncertain'][i],confidence:'Simulation assumption',geometry:'Detached study area; not a real property boundary'}));
}
export function parcelPlan(v,c){const all=developmentParcels(v),ids=new Set(String(c.parcelIds||'').split(',')),selected=all.filter(p=>ids.has(p.id));return {enabled:!!c.parcelMode&&v.id!=='CUSTOM',all,selected,stalls:selected.reduce((s,p)=>s+Math.floor(p.acres*43560/330),0),acres:selected.reduce((s,p)=>s+p.acres,0),land:selected.reduce((s,p)=>s+p.acres*(Number(c.landRate)||0)*1e6*p.priceMultiplier,0),clearance:selected.reduce((s,p)=>s+p.acres*p.clearancePerAcre,0),approvalMonths:Math.max(0,...selected.map(p=>p.approvalMonths))};}
