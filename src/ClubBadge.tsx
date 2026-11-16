import {useEffect,useState} from 'react';
type TeamInfo={aliases:string[]};
const TEAM_ALIASES:Record<string,TeamInfo>={
 ASFAR:{aliases:['AS FAR','FAR Rabat','Association Sportive des Forces Armées Royales']},
 CODM:{aliases:['COD Meknes','COD Meknès','Club Omnisports de Meknès']},
 DHJ:{aliases:['Difaâ Hassani El Jadidi','Difaa El Jadida','Difaa Hassani El Jadidi']},
 FUS:{aliases:['FUS Rabat','Fath Union Sport','Fath Union Sports Rabat']},
 HUSA:{aliases:['Hassania Agadir','Hassania Union Sport Agadir','Hassania US Agadir']},
 IRT:{aliases:['IR Tanger','Ittihad Tanger','Ittihad Riadi de Tanger']},
 KACM:{aliases:['Kawkab Marrakech','Kawkab Athletic Club Marrakech','Kawkab of Marrakech']},
 MAS:{aliases:['Maghreb Fes','Maghreb Fès','Maghreb Association Sportive']},
 MAT:{aliases:['Moghreb Tetouan','Moghreb Tétouan','Moghreb Athletic Tetouan']},
 RCA:{aliases:['Raja Casablanca','Raja Club Athletic','Raja CA']},
 RCAZ:{aliases:['RCA Zemamra','Renaissance Club Athletic Zemamra']},
 RSB:{aliases:['RS Berkane','Renaissance Sportive de Berkane']},
 USAT:{aliases:['US Amal Tiznit','Union Sportive Amal Tiznit','Amal Tiznit']},
 UTS:{aliases:['Union Touarga','Union Touarga Sport','UTS Rabat']},
 WAC:{aliases:['Wydad Casablanca','Wydad Athletic Club','Wydad AC']},
 WST:{aliases:['Wydad Sportif Temara','Wydad Sportif Témara','Wydad Sportif de Temara']}
};
const badgeCache=new Map<string,string|null>();
async function findBadge(name:string,code:string){
 const key=code.toUpperCase();if(badgeCache.has(key))return badgeCache.get(key)||'';
 const candidates=TEAM_ALIASES[key]?.aliases||[name];
 for(const candidate of candidates){
  try{
   const response=await fetch('https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t='+encodeURIComponent(candidate));
   if(!response.ok)continue;
   const data=await response.json();
   const teams=Array.isArray(data?.teams)?data.teams:[];
   const match=teams.find((team:any)=>team.strBadge&&(/morocco|maroc/i.test([team.strCountry,team.strLeague,team.strTeam].join(' '))||/moroccan championship/i.test(team.strLeague||'')))||teams.find((team:any)=>team.strBadge);
   if(match?.strBadge){badgeCache.set(key,match.strBadge);return match.strBadge;}
  }catch{/* try next recognised club spelling */}
 }
 badgeCache.set(key,null);return '';
}
export function ClubBadge({name,code}:{name:string;code:string}){
 const [src,setSrc]=useState(()=>badgeCache.get(code.toUpperCase())||'');
 useEffect(()=>{let active=true;if(!src)findBadge(name,code).then(url=>{if(active&&url)setSrc(url)});return()=>{active=false}},[name,code]);
 return <div className="crest club-crest">{src?<img src={src} alt={name+' official club badge'} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setSrc('')}/>:<span className="club-crest-fallback" aria-label={name+' badge loading'}>{code.slice(0,4)}</span>}</div>;
}
