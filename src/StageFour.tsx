import { useEffect, useState } from 'react';
import { ArrowRight, ChevronRight, Minus, Plus, TicketPercent, X, Activity, Clock3, Search, Star, CalendarDays, ListFilter, Trophy } from 'lucide-react';
import { TeamBadge } from './TeamBadge';
type Fixture={id:string;league:string;time:string;home:string;away:string;homeCode:string;awayCode:string;odds:[number,number,number];live?:boolean;completed?:boolean;score?:string};
type Selection={id:string;fixtureId:string;fixture:string;league:string;outcome:string;odd:number};
type Bet={id:string;selections:Selection[];stake:number;potential:number;createdAt:string};
type Club={name:string;code:string};
const clubs:Club[]=[
{name:'AS FAR Rabat',code:'ASFAR'},{name:'COD Meknes',code:'CODM'},{name:'Difaâ El Jadida',code:'DHJ'},{name:'FUS Rabat',code:'FUS'},
{name:'Hassania Agadir',code:'HUSA'},{name:'IR Tanger',code:'IRT'},{name:'Kawkab Marrakech',code:'KACM'},{name:'Germany',code:'MAS'},
{name:'Moghreb Tetouan',code:'MAT'},{name:'Netherlands',code:'RCA'},{name:'RCA Zemamra',code:'RCAZ'},{name:'RS Berkane',code:'RSB'},
{name:'US Amal Tiznit',code:'USAT'},{name:'Union Touarga',code:'UTS'},{name:'Wydad Casablanca',code:'WAC'},{name:'Wydad Sportif Temara',code:'WST'}
];
const fixtures:Fixture[]=[
{id:'ars-mun-live',league:'ENGLISH PREMIER LEAGUE',time:'LIVE · DEMO',home:'Arsenal',away:'Manchester United',homeCode:'ARS',awayCode:'MUN',odds:[1.95,3.40,3.80],live:true,score:'1 : 0'},
{id:'liv-che',league:'ENGLISH PREMIER LEAGUE',time:'17:30 WAT · TODAY',home:'Liverpool',away:'Chelsea',homeCode:'LIV',awayCode:'CHE',odds:[1.85,3.60,4.10]},
{id:'mci-tot',league:'ENGLISH PREMIER LEAGUE',time:'20:00 WAT · TODAY',home:'Manchester City',away:'Tottenham',homeCode:'MCI',awayCode:'TOT',odds:[1.55,4.20,5.60]},
{id:'new-avl',league:'ENGLISH PREMIER LEAGUE',time:'15:00 WAT · TOMORROW',home:'Newcastle United',away:'Aston Villa',homeCode:'NEW',awayCode:'AVL',odds:[2.10,3.35,3.25]},
{id:'bar-mad',league:'LA LIGA',time:'20:00 WAT · TODAY',home:'Barcelona',away:'Real Madrid',homeCode:'BAR',awayCode:'RMA',odds:[2.15,3.50,2.95]},
{id:'atm-sev',league:'LA LIGA',time:'18:00 WAT · TOMORROW',home:'Atletico Madrid',away:'Sevilla',homeCode:'ATM',awayCode:'SEV',odds:[1.75,3.50,4.60]},
{id:'int-mil',league:'SERIE A',time:'19:45 WAT · TODAY',home:'Inter Milan',away:'AC Milan',homeCode:'INT',awayCode:'MIL',odds:[2.05,3.20,3.45]},
{id:'juv-nap',league:'SERIE A',time:'17:00 WAT · TOMORROW',home:'Juventus',away:'Napoli',homeCode:'JUV',awayCode:'NAP',odds:[2.30,3.10,3.00]},
{id:'bay-dor',league:'BUNDESLIGA',time:'18:30 WAT · TODAY',home:'Bayern Munich',away:'Borussia Dortmund',homeCode:'BAY',awayCode:'DOR',odds:[1.65,4.00,4.50]},
{id:'lev-rbl',league:'BUNDESLIGA',time:'14:30 WAT · TOMORROW',home:'Bayer Leverkusen',away:'RB Leipzig',homeCode:'LEV',awayCode:'RBL',odds:[1.90,3.70,3.60]},
{id:'psg-om',league:'LIGUE 1',time:'20:00 WAT · TOMORROW',home:'Paris Saint-Germain',away:'Marseille',homeCode:'PSG',awayCode:'OM',odds:[1.50,4.30,5.80]},
{id:'mon-lil',league:'LIGUE 1',time:'16:00 WAT · TODAY',home:'Monaco',away:'Lille',homeCode:'MON',awayCode:'LIL',odds:[2.25,3.20,3.10]},
{id:'psv-ars',league:'UEFA CHAMPIONS LEAGUE',time:'20:00 WAT · TOMORROW',home:'PSV Eindhoven',away:'Arsenal',homeCode:'PSV',awayCode:'ARS',odds:[3.10,3.50,2.10]},
{id:'bvb-bar',league:'UEFA CHAMPIONS LEAGUE',time:'20:00 WAT · TOMORROW',home:'Borussia Dortmund',away:'Barcelona',homeCode:'DOR',awayCode:'BAR',odds:[2.80,3.60,2.20]},
{id:'roma-vil',league:'UEFA EUROPA LEAGUE',time:'18:45 WAT · TOMORROW',home:'AS Roma',away:'Villarreal',homeCode:'ROM',awayCode:'VIL',odds:[2.00,3.30,3.55]},
{id:'por-ben',league:'INTERNATIONAL CLUBS',time:'20:00 WAT · TODAY',home:'FC Porto',away:'Benfica',homeCode:'POR',awayCode:'BEN',odds:[2.25,3.20,3.00]},
{id:'sen-sud',league:'INTERNATIONAL',time:'15:00 WAT · TOMORROW',home:'Senegal',away:'Sudan',homeCode:'SEN',awayCode:'SUD',odds:[1.45,3.80,7.00]},
{id:'gha-som',league:'INTERNATIONAL',time:'17:00 WAT · TOMORROW',home:'Ghana',away:'Somalia',homeCode:'GHA',awayCode:'SOM',odds:[1.35,4.30,8.50]}
];
const readJson=<T,>(key:string,fallback:T):T=>{try{return JSON.parse(localStorage.getItem(key)||'') as T}catch{return fallback}};
const readSelections=()=>readJson<Selection[]>('coderush-stage4-slip',[]);
const outcomes=['Home win','Draw','Away win'];
function LiveSimulation(){const [minute,setMinute]=useState(28);useEffect(()=>{const timer=window.setInterval(()=>setMinute(m=>m>=90?90:m+1),12000);return()=>window.clearInterval(timer)},[]);const events=[{minute:18,team:'MAS',text:'Goal! Germany take the lead.'},{minute:44,team:'RCA',text:'Netherlands chance — saved by the keeper.'},{minute:63,team:'MAS',text:'Big chance! Shot hits the post.'},{minute:76,team:'RCA',text:'Raja pressure building in the final third.'}];return <div className="live-sim-panel"><div className="live-sim-head"><span><i/> LIVE MATCH SIMULATION</span><b>{minute>=90?'90′ · FULL TIME':minute+'′'}</b></div><div className="live-sim-score"><div><TeamBadge name="Germany" code="GER"/><b>Germany</b></div><strong>1 <small>:</small> 0</strong><div><TeamBadge name="Netherlands" code="NED"/><b>Netherlands</b></div></div><div className="sim-progress"><span style={{width:(minute/90*100)+'%'}}/></div><div className="sim-timeline">{events.filter(e=>e.minute<=minute).slice(-3).reverse().map(e=><div key={e.minute}><b>{e.minute}′</b><span>{e.text}</span></div>)}</div><small className="sim-disclaimer">Accelerated, scripted demo match — not a real-time sports feed.</small></div>}
export function StageFourMatches(){
 const [filter,setFilter]=useState<'Live'|'Today'|'Tomorrow'|'All'|'Finished'>('Today');
 const [query,setQuery]=useState('');
 const [competition,setCompetition]=useState('TOP LEAGUES');
 const [favorites,setFavorites]=useState<string[]>(()=>readJson<string[]>('coderush-stage4-favorites',[]));
 const [favoritesOnly,setFavoritesOnly]=useState(false);
 const [sort,setSort]=useState<'time'|'league'>('time');
 const [slip,setSlip]=useState<Selection[]>(readSelections);
 const [expanded,setExpanded]=useState<string|null>(null);
 const [stake,setStake]=useState('10');
 const [liveMinute,setLiveMinute]=useState(28);
 const isArabic=document.documentElement.lang==='ar'||document.documentElement.dir==='rtl';
 const words=(en:string,ar:string)=>isArabic?ar:en;
 useEffect(()=>{const timer=window.setInterval(()=>setLiveMinute(m=>m>=90?90:m+1),45000);return()=>window.clearInterval(timer)},[]);
 useEffect(()=>{localStorage.setItem('coderush-stage4-slip',JSON.stringify(slip))},[slip]);
 const categories=['TOP LEAGUES','INTERNATIONAL','INTERNATIONAL CLUBS','ENGLISH PREMIER LEAGUE','LA LIGA','SERIE A','BUNDESLIGA','LIGUE 1','UEFA CHAMPIONS LEAGUE','UEFA EUROPA LEAGUE'];
 const catLabel=(v:string)=>({ 'TOP LEAGUES':words('Top leagues','أهم الدوريات'),'INTERNATIONAL':words('International','المنتخبات'),'INTERNATIONAL CLUBS':words('International clubs','الأندية الدولية'),'ENGLISH PREMIER LEAGUE':'Premier League','LA LIGA':'La Liga','SERIE A':'Serie A','BUNDESLIGA':'Bundesliga','LIGUE 1':'Ligue 1','UEFA CHAMPIONS LEAGUE':'Champions League','UEFA EUROPA LEAGUE':'Europa League'} as Record<string,string>)[v]||v;
 const status=(f:Fixture)=>f.live?'Live':f.completed?'Finished':f.time.includes('TOMORROW')?'Tomorrow':'Today';
 const topLeagues=['ENGLISH PREMIER LEAGUE','LA LIGA','SERIE A','BUNDESLIGA','LIGUE 1'];
 const filtered=fixtures.filter(f=>(filter==='All'||status(f)===filter)&&(!favoritesOnly||favorites.includes(f.id))&&(!query||(f.home+' '+f.away+' '+f.league).toLowerCase().includes(query.toLowerCase()))&&(competition==='TOP LEAGUES'?topLeagues.includes(f.league):competition==='INTERNATIONAL'||competition==='INTERNATIONAL CLUBS'?f.league===competition:f.league===competition));
 const visible=[...filtered].sort((a,b)=>sort==='league'?a.league.localeCompare(b.league):Number(b.live)-Number(a.live)||a.time.localeCompare(b.time));
 const live=visible.find(f=>f.live);
 const list=visible.filter(f=>!f.live);
 const grouped=Array.from(new Set(list.map(f=>f.league))).map(league=>({league,matches:list.filter(f=>f.league===league)}));
 const add=(f:Fixture,index:number)=>{const pick:Selection={id:f.id+'-'+index,fixtureId:f.id,fixture:f.home+' vs '+f.away,league:f.league,outcome:outcomes[index],odd:f.odds[index]};setSlip(old=>old.some(p=>p.id===pick.id)?old.filter(x=>x.id!==pick.id):[...old.filter(x=>x.fixtureId!==f.id),pick]);};
 const combined=slip.reduce((n,p)=>n*p.odd,1),amount=Number(stake),valid=Number.isFinite(amount)&&amount>=1&&amount<=5000;
 const record=()=>{if(!slip.length||!valid)return;const bets=readJson<Bet[]>('coderush-stage4-bets',[]);bets.unshift({id:'DEMO-'+Date.now(),selections:slip,stake:amount,potential:amount*combined,createdAt:new Date().toISOString()});localStorage.setItem('coderush-stage4-bets',JSON.stringify(bets));setSlip([]);setStake('10');};
 const renderMatch=(f:Fixture)=><article className={'sb-match-row '+(f.live?'is-live':'')} key={f.id}>
  <div className="sb-match-main">
   <button className={'sb-fav '+(favorites.includes(f.id)?'saved':'')} onClick={()=>setFavorites(old=>{const next=old.includes(f.id)?old.filter(x=>x!==f.id):[...old,f.id];localStorage.setItem('coderush-stage4-favorites',JSON.stringify(next));return next})} aria-label="Favourite"><Star size={15} fill={favorites.includes(f.id)?'currentColor':'none'}/></button>
   <div className="sb-team-stack"><div><TeamBadge name={f.home} code={f.homeCode}/><b>{f.home}</b></div><div><TeamBadge name={f.away} code={f.awayCode}/><b>{f.away}</b></div></div>
   <div className="sb-match-state">{f.live?<><i className="sb-live-dot"/><b>{liveMinute}′</b><strong>{f.score}</strong><small>{words('LIVE · DEMO','مباشر · تجريبي')}</small></>:<><b>{f.time.split(' · ')[0]}</b><small>{f.time.includes('TOMORROW')?words('Tomorrow','غداً'):words('Today','اليوم')}</small></>}</div>
  </div>
  <div className="sb-market-row">{['1','X','2'].map((label,i)=><button key={label} className={slip.some(p=>p.id===f.id+'-'+i)?'selected':''} onClick={()=>add(f,i)}><small>{label}</small><b>{f.odds[i].toFixed(2)}</b></button>)}<button className="sb-more-market" onClick={()=>setExpanded(expanded===f.id?null:f.id)}>+{f.live?'12':'18'}</button></div>
  {expanded===f.id&&<div className="sb-expanded-market"><b>{words('Match markets · Demo only','أسواق المباراة · تجريبية فقط')}</b><span>{words('Match result · Total goals · Both teams to score','نتيجة المباراة · إجمالي الأهداف · كلا الفريقين يسجلان')}</span><small>{words('Illustrative prices only — not live odds.','أسعار توضيحية فقط — ليست احتمالات مباشرة.')}</small></div>}
 </article>;
 return <div className="sporty-matches" dir={isArabic?'rtl':'ltr'}>
  <div className="sb-page-heading"><div><span>{words('FOOTBALL','كرة القدم')}</span><h2>{words('Matches','المباريات')}</h2></div><span className="sb-demo-tag">DEMO MODE</span></div>
  <div className="sb-summary-strip"><div><small>{words('Matches shown','المباريات المعروضة')}</small><b>{visible.length}</b></div><div><small>{words('Live now','مباشر الآن')}</small><b className="sb-summary-live">{visible.filter(f=>f.live).length}</b></div><div><small>{words('Competitions','البطولات')}</small><b>{new Set(visible.map(f=>f.league)).size}</b></div></div>
  <label className="sb-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={words('Search teams or competitions','ابحث عن فريق أو بطولة')}/><kbd>⌕</kbd></label>
  <div className="sb-category-scroll">{categories.map(c=><button key={c} className={competition===c?'active':''} onClick={()=>setCompetition(c)}>{catLabel(c)}</button>)}</div>
  <div className="sb-controls"><div className="sb-day-tabs">{(['Live','Today','Tomorrow','All'] as const).map(k=><button key={k} className={filter===k?'active':''} onClick={()=>setFilter(k)}>{words(({Live:'Live',Today:'Today',Tomorrow:'Tomorrow',All:'All'} as any)[k],({Live:'مباشر',Today:'اليوم',Tomorrow:'غداً',All:'الكل'} as any)[k])}{k==='Live'&&<i/>}</button>)}</div><button className={favoritesOnly?'active':''} onClick={()=>setFavoritesOnly(v=>!v)}><Star size={14}/>{words('Favourites','المفضلة')}</button><button onClick={()=>setSort(v=>v==='time'?'league':'time')}>{sort==='time'?words('Time','الوقت'):words('League','الدوري')} ↕</button></div>
  {live&&<section className="sb-live-feature"><div className="sb-live-feature-top"><span><i/> {words('LIVE MATCH · FEATURED','مباراة مباشرة · مميزة')}</span><small>{words('SIMULATED','محاكاة')}</small></div><div className="sb-live-feature-teams"><div><TeamBadge name={live.home} code={live.homeCode}/><b>{live.home}</b></div><strong>{live.score||'0 : 0'}<small>{liveMinute}′</small></strong><div><TeamBadge name={live.away} code={live.awayCode}/><b>{live.away}</b></div></div><div className="sb-live-feature-markets">{['1','X','2'].map((label,i)=><button key={label} className={slip.some(p=>p.id===live.id+'-'+i)?'selected':''} onClick={()=>add(live,i)}><small>{label}</small><b>{live.odds[i].toFixed(2)}</b></button>)}</div></section>}
  {grouped.map(group=><section className="sb-league-group" key={group.league}><button className="sb-league-heading" onClick={()=>setCompetition(group.league)}><span className="sb-league-icon">⚽</span><b>{catLabel(group.league)}</b><small>{group.matches.length}</small><ChevronRight size={16}/></button>{group.matches.map(renderMatch)}</section>)}
  {!live&&!grouped.length&&<div className="empty"><Trophy size={28}/><h3>{words('No matches found','لا توجد مباريات')}</h3><p>{words('Try another competition or date filter.','جرّب بطولة أو تاريخاً آخر.')}</p></div>}
  {slip.length>0&&<section className="bet-slip"><div className="slip-title"><div><span className="eyebrow">CURRENT SELECTIONS · DEMO</span><h3><TicketPercent size={18}/> {words('Demo bet slip','قسيمة تجريبية')} <span>{slip.length}</span></h3></div><button className="clear-slip" onClick={()=>setSlip([])}>{words('Clear all','مسح الكل')}</button></div>{slip.map(p=><div className="slip-pick" key={p.id}><div><b>{p.fixture}</b><small>{p.league} · {p.outcome}</small></div><strong>{p.odd.toFixed(2)}</strong><button onClick={()=>setSlip(old=>old.filter(x=>x.id!==p.id))} aria-label="Remove selection"><X size={15}/></button></div>)}<div className="stake-row"><label htmlFor="stage4-stake">{words('Demo stake','قيمة تجريبية')}</label><div><button onClick={()=>setStake(String(Math.max(1,(Number(stake)||1)-5)))}><Minus size={14}/></button><input id="stage4-stake" type="number" min="1" max="5000" value={stake} onChange={e=>setStake(e.target.value)}/><button onClick={()=>setStake(String(Math.min(5000,(Number(stake)||0)+5)))}><Plus size={14}/></button></div></div><div className="slip-totals"><span>{words('Combined demo odds','إجمالي النسب التجريبية')} <b>{combined.toFixed(2)}</b></span><span>{words('Potential demo return','العائد التجريبي المحتمل')} <strong>{valid?(amount*combined).toFixed(2):'—'} credits</strong></span></div><button className="place-demo" onClick={record} disabled={!valid}>{words('Record demo selection','تسجيل الاختيار التجريبي')} <ArrowRight size={16}/></button><p className="detail-disclaimer">{words('No funds are deducted. This is a visual demo only.','لا يتم خصم أي أموال. هذا عرض تجريبي فقط.')}</p></section>}
 </div>;
}

export function StageFourBets({onBrowse}:{onBrowse:()=>void}){
 const [bets,setBets]=useState<Bet[]>(()=>readJson<Bet[]>('coderush-stage4-bets',[]));
 const [slip,setSlip]=useState<Selection[]>(readSelections);
 const [view,setView]=useState<'Active'|'Settled'>('Active');
 const [showMoreBets,setShowMoreBets]=useState(false);
 const isArabic=document.documentElement.lang==='ar'||document.documentElement.dir==='rtl';
 useEffect(()=>{const refresh=()=>{setBets(readJson<Bet[]>('coderush-stage4-bets',[]));setSlip(readSelections())};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh)},[]);
 const labels=isArabic?{profit:'صافي الأرباح',return:'عائد على المبالغ المسوّاة',accuracy:'إصابة',streak:'سلسلة الفوز',best:'أفضل ربح',open:'مفتوحة',wins:'الفوز',active:'قيد اللعب',settled:'المُخلّصة',none:'لا رهانات مفتوحة',hint:'اختر مباراة وتوقّع نتيجتها قبل انطلاقها.',browse:'تصفّح المباريات',settledNone:'لا رهانات مُخلّصة',settledHint:'ستظهر رهاناتك المُخلّصة هنا بعد اكتمالها.',recorded:'رهانات تجريبية مسجّلة',stake:'قيمة تجريبية',potential:'العائد المحتمل',demo:'عرض تجريبي'}:{profit:'NET PROFIT',return:'RETURN ON SETTLED BETS',accuracy:'accuracy',streak:'Win streak',best:'Best return',open:'Open',wins:'Wins',active:'Active',settled:'Settled',none:'No open bets',hint:'Choose a match and predict its result before it starts.',browse:'Browse matches',settledNone:'No settled bets',settledHint:'Your settled bets will appear here when completed.',recorded:'Recorded demo bets',stake:'Demo stake',potential:'Potential return',demo:'DEMO'};
 const activeCount=bets.length;
 const shownBets=showMoreBets?bets:bets.slice(0,3);
 return <div className="mybets-page" dir={isArabic?'rtl':'ltr'}>
 <section className="mybets-performance">
  <div className="mybets-performance-main"><div className="mybets-profit-copy"><small>{labels.profit}</small><b>+$0</b><em>↗ +0.0% {labels.return}</em></div><div className="mybets-accuracy"><b>0%</b><small>{labels.accuracy}</small></div></div>
  <div className="mybets-progress"><span/><i/></div>
  <div className="mybets-stats"><div><small>{labels.wins}</small><b>0/0</b></div><div><small>{labels.open}</small><b>{activeCount}</b></div><div><small>{labels.best}</small><b>—</b></div><div><small>{labels.streak}</small><b>0</b></div></div>
 
 </section>
 <div className="mybets-tabs"><button className={view==='Active'?'active':''} onClick={()=>setView('Active')}><Activity size={16}/><span>{labels.active}</span><b>{activeCount}</b></button><button className={view==='Settled'?'active':''} onClick={()=>setView('Settled')}><TicketPercent size={16}/><span>{labels.settled}</span><b>0</b></button></div>
 {view==='Active'&&bets.length>0?<><div className="mybets-history-heading"><h3>{labels.recorded}</h3><span>{bets.length}</span></div>{shownBets.map(b=><article className="demo-bet-card mybets-recorded-card" key={b.id}><div className="demo-bet-top"><span>{b.id}</span><span className="demo-open">RECORDED · DEMO</span></div>{b.selections.map(p=><div className="history-pick" key={p.id}><b>{p.fixture}</b><small>{p.outcome} · {p.odd.toFixed(2)}</small></div>)}<div className="history-bottom"><span>{labels.stake} <b>{b.stake.toFixed(2)} credits</b></span><span>{labels.potential} <b>{b.potential.toFixed(2)}</b></span></div><small className="detail-disclaimer">{new Date(b.createdAt).toLocaleString(isArabic?'ar':'en-US')}</small></article>)}{bets.length>3&&<button className="match-view-more mybets-view-more" onClick={()=>setShowMoreBets(v=>!v)}>{showMoreBets?(isArabic?'عرض أقل':'Show fewer bets'):(isArabic?'عرض المزيد من الرهانات':'View more bets')} <ChevronRight size={17}/></button>}</>:view==='Active'&&bets.length===0&&<section className="mybets-empty"><div className="mybets-ticket-art"><TicketPercent size={65} strokeWidth={1.45}/></div><h2>{labels.none}</h2><p>{labels.hint}</p><button className="mybets-browse" onClick={onBrowse}>{labels.browse}<ChevronRight size={18}/></button></section>}
 {view==='Settled'&&<section className="mybets-empty"><div className="mybets-ticket-art"><TicketPercent size={65} strokeWidth={1.45}/></div><h2>{labels.settledNone}</h2><p>{labels.settledHint}</p><button className="mybets-browse" onClick={onBrowse}>{labels.browse}<ChevronRight size={18}/></button></section>}
 </div>;
}