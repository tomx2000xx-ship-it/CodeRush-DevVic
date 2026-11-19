import {useEffect,useState} from 'react';
type Entry={name:string;id?:string;aliases?:string[]};
const TEAMS:Record<string,Entry>={SEN:{name:'Senegal'},SUD:{name:'Sudan'},GHA:{name:'Ghana'},SOM:{name:'Somalia'},TUR:{name:'Turkey',id:'135985'},FRA:{name:'France',id:'133913'},ENG:{name:'England',id:'133914'},ESP:{name:'Spain',id:'133909'},GER:{name:'Germany'},NED:{name:'Netherlands',aliases:['Holland']},GRE:{name:'Greece'},SRB:{name:'Serbia'},MKD:{name:'North Macedonia',aliases:['FYR Macedonia']},SVN:{name:'Slovenia'},SUI:{name:'Switzerland'},SCO:{name:'Scotland'},FRO:{name:'Faroe Islands'},MDA:{name:'Moldova'},KAZ:{name:'Kazakhstan'},SVK:{name:'Slovakia'},EST:{name:'Estonia'},BUL:{name:'Bulgaria'},ISL:{name:'Iceland'},LUX:{name:'Luxembourg'},LTU:{name:'Lithuania'},LIE:{name:'Liechtenstein'},GIB:{name:'Gibraltar'},MLT:{name:'Malta'},DEN:{name:'Denmark'},NOR:{name:'Norway'},WAL:{name:'Wales'},POR:{name:'Portugal'},HUN:{name:'Hungary'},NIR:{name:'Northern Ireland'},UKR:{name:'Ukraine'},GEO:{name:'Georgia'},ISR:{name:'Israel'},AUT:{name:'Austria'},IRL:{name:'Republic of Ireland',aliases:['Ireland']},KOS:{name:'Kosovo'},BIH:{name:'Bosnia and Herzegovina',aliases:['Bosnia']},ROU:{name:'Romania'},POL:{name:'Poland'},SWE:{name:'Sweden'}};
const CLUB_LOGOS:Record<string,string>={
 ARS:'42',MUN:'33',LIV:'40',CHE:'49',MCI:'50',TOT:'47',NEW:'34',AVL:'66',
 BAR:'529',RMA:'541',ATM:'530',SEV:'536',INT:'505',MIL:'489',JUV:'496',NAP:'492',
 BAY:'157',DOR:'165',LEV:'168',RBL:'173',PSG:'85',OM:'81',MON:'91',LIL:'79',
 PSV:'197',ROM:' Roma',VIL:'94',POR:'212',BEN:'211'
};
const FLAGS:Record<string,string>={SEN:'sn',SUD:'sd',GHA:'gh',SOM:'so',TUR:'tr',FRA:'fr',ENG:'gb-eng',ESP:'es',GER:'de',NED:'nl',GRE:'gr',SRB:'rs',MKD:'mk',SVN:'si',SUI:'ch',SCO:'gb-sct',FRO:'fo',MDA:'md',KAZ:'kz',SVK:'sk',EST:'ee',BUL:'bg',ISL:'is',LUX:'lu',LTU:'lt',LIE:'li',GIB:'gi',MLT:'mt',DEN:'dk',NOR:'no',WAL:'gb-wls',POR:'pt',HUN:'hu',NIR:'gb-nir',UKR:'ua',GEO:'ge',ISR:'il',AUT:'at',IRL:'ie',KOS:'xk',BIH:'ba',ROU:'ro',POL:'pl',SWE:'se'};
const cache=new Map<string,string>(),pending=new Map<string,Promise<string>>();
const cacheKey=(code:string,name:string)=>code||("name:"+name.trim().toLowerCase().replace(/\s+/g," "));
async function loadBadge(code:string,name:string):Promise<string>{
 const key=cacheKey(code,name);
 if(CLUB_LOGOS[code]&&CLUB_LOGOS[code]!==' Roma')return 'https://media.api-sports.io/football/teams/'+CLUB_LOGOS[code]+'.png';
 if(cache.has(key))return cache.get(key)!;
 if(pending.has(key))return pending.get(key)!;
 const team:Entry=TEAMS[code]||{name:name.trim()};
 if(!team.name)return '';
 const task=(async()=>{try{
  const endpoint=team.id?'https://www.thesportsdb.com/api/v1/json/3/lookupteam.php?id='+team.id:'https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t='+encodeURIComponent(team.name);
  const response=await fetch(endpoint,{signal:AbortSignal.timeout(5000)});
  if(!response.ok)return FLAGS[code]?'https://flagcdn.com/w160/'+FLAGS[code]+'.png':'';
  const data=await response.json(),rows=Array.isArray(data?.teams)?data.teams:[];
  const names=[team.name,...(team.aliases||[])].map(value=>value.toLowerCase());
  const found=rows.find((row:any)=>row.strBadge&&names.includes(String(row.strTeam||'').trim().toLowerCase()));
  const url=found?.strBadge||(FLAGS[code]?'https://flagcdn.com/w160/'+FLAGS[code]+'.png':'');
  if(url)cache.set(key,url);
  return url;
 }catch{return FLAGS[code]?'https://flagcdn.com/w160/'+FLAGS[code]+'.png':''}})();
 pending.set(key,task);
 const result=await task;pending.delete(key);return result;
}
export function TeamBadge({name,code,logoUrl}:{name:string;code:string;logoUrl?:string|null}){
 const key=cacheKey(code,name);
 const [src,setSrc]=useState(()=>logoUrl||cache.get(key)||'');
 useEffect(()=>{let active=true;if(logoUrl){setSrc(logoUrl);return()=>{active=false}}setSrc(cache.get(key)||'');loadBadge(code,name).then(url=>{if(active&&url)setSrc(url)});return()=>{active=false}},[code,name,logoUrl,key]);
 return <div className="crest club-crest team-crest">{src?<img src={src} alt={name+' team crest or flag'} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setSrc('')}/>:<span>{code||name.slice(0,3).toUpperCase()}</span>}</div>
}