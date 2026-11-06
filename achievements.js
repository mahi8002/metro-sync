(function(scope){
const definitions=[
{id:'first-trip',icon:'🚇',name:'First Stop',metric:'rides',target:1,description:'Complete your first journey'},
{id:'five-trips',icon:'🎫',name:'Commute Starter',metric:'rides',target:5,description:'Complete 5 journeys'},
{id:'twenty-trips',icon:'🏙️',name:'City Regular',metric:'rides',target:20,description:'Complete 20 journeys'},
{id:'five-stations',icon:'📍',name:'City Explorer',metric:'stations',target:5,description:'Visit 5 different origin or destination stations'},
{id:'ten-stations',icon:'🗽',name:'Station Collector',metric:'stations',target:10,description:'Visit 10 different origin or destination stations'},
{id:'first-favorite',icon:'⭐',name:'My Commute',metric:'favorite',target:1,description:'Bookmark your first route'}];
const empty=()=>({version:1,trips:[],unlocked:{},hasBookmarked:false,active:null});
function normalize(v){
 if(!v||v.version!==1||!Array.isArray(v.trips))return empty();
 const trips=v.trips.filter(t=>t&&typeof t.id==='string'&&typeof t.origin==='string'&&typeof t.destination==='string'&&t.origin!==t.destination&&Number.isFinite(Date.parse(t.completedAt)));
 return {...empty(),trips:[...new Map(trips.map(t=>[t.id,t])).values()],hasBookmarked:v.hasBookmarked===true,unlocked:Object.fromEntries(Object.entries(v.unlocked||{}).filter(([id,date])=>definitions.some(d=>d.id===id)&&typeof date==='string'&&Number.isFinite(Date.parse(date)))),active:v.active&&typeof v.active.id==='string'&&typeof v.active.origin==='string'&&typeof v.active.destination==='string'?v.active:null};
}
function stats(p){return {rides:p.trips.length,stations:new Set(p.trips.flatMap(t=>[t.origin,t.destination])).size,favorite:p.hasBookmarked?1:0};}
function unlock(p,now){const totals=stats(p),unlocked={...p.unlocked};definitions.forEach(d=>{if(totals[d.metric]>=d.target&&!unlocked[d.id])unlocked[d.id]=now;});return {...p,unlocked};}
function start(p,origin,destination,id){return {...p,active:{id,origin,destination}};}
function complete(p,now){const j=p.active;if(!j||j.origin===j.destination||p.trips.some(t=>t.id===j.id))return p;return unlock({...p,trips:[...p.trips,{...j,completedAt:now}]},now);}
function bookmark(p,now){return unlock({...p,hasBookmarked:true},now);}
scope.MetroAchievements={definitions,empty,normalize,stats,start,complete,bookmark};
})(globalThis);
