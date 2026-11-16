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
{id:'tur-fra-demo',league:'UEFA NATIONS LEAGUE · GROUP A1',time:'LIVE · DEMO SIMULATION',home:'Turkey',away:'France',homeCode:'TUR',awayCode:'FRA',odds:[3.20,3.10,1.85],live:true,score:'1 : 0'},
{id:'esp-eng',league:'UEFA NATIONS LEAGUE · GROUP A3',time:'15 NOV',home:'Spain',away:'England',homeCode:'ESP',awayCode:'ENG',odds:[2.10,3.30,3.25],completed:true,score:'2 : 3'},
{id:'ger-ned',league:'UEFA NATIONS LEAGUE · GROUP A2',time:'20:45 WAT · TODAY',home:'Germany',away:'Netherlands',homeCode:'GER',awayCode:'NED',odds:[2.25,3.20,3.05]},
{id:'gre-srb',league:'UEFA NATIONS LEAGUE · GROUP A2',time:'20:45 WAT · TODAY',home:'Greece',away:'Serbia',homeCode:'GRE',awayCode:'SRB',odds:[2.45,3.00,2.90]},
{id:'mkd-svn',league:'UEFA NATIONS LEAGUE · GROUP B1',time:'20:45 WAT · TODAY',home:'North Macedonia',away:'Slovenia',homeCode:'MKD',awayCode:'SVN',odds:[3.10,3.00,2.30]},
{id:'sui-sco',league:'UEFA NATIONS LEAGUE · GROUP B1',time:'20:45 WAT · TODAY',home:'Switzerland',away:'Scotland',homeCode:'SUI',awayCode:'SCO',odds:[1.95,3.20,3.85]},
{id:'fro-mda',league:'UEFA NATIONS LEAGUE · GROUP C3',time:'16:00 WAT · TODAY',home:'Faroe Islands',away:'Moldova',homeCode:'FRO',awayCode:'MDA',odds:[2.50,2.90,2.95]},
{id:'kaz-svk',league:'UEFA NATIONS LEAGUE · GROUP C3',time:'16:00 WAT · TODAY',home:'Kazakhstan',away:'Slovakia',homeCode:'KAZ',awayCode:'SVK',odds:[3.20,3.10,2.15]},
{id:'est-bul',league:'UEFA NATIONS LEAGUE · GROUP C4',time:'18:00 WAT · TODAY',home:'Estonia',away:'Bulgaria',homeCode:'EST',awayCode:'BUL',odds:[2.80,2.90,2.55]},
{id:'isl-lux',league:'UEFA NATIONS LEAGUE · GROUP C4',time:'18:00 WAT · TODAY',home:'Iceland',away:'Luxembourg',homeCode:'ISL',awayCode:'LUX',odds:[1.85,3.40,4.10]},
{id:'ltu-lie',league:'UEFA NATIONS LEAGUE · GROUP D2',time:'18:00 WAT · TODAY',home:'Lithuania',away:'Liechtenstein',homeCode:'LTU',awayCode:'LIE',odds:[1.55,3.70,6.20]},
{id:'gib-mlt',league:'UEFA NATIONS LEAGUE · GROUP D1',time:'20:45 WAT · TODAY',home:'Gibraltar',away:'Malta',homeCode:'GIB',awayCode:'MLT',odds:[4.20,3.10,1.85]},
{id:'den-nor',league:'UEFA NATIONS LEAGUE · GROUP A4',time:'20:45 WAT · 17 NOV',home:'Denmark',away:'Norway',homeCode:'DEN',awayCode:'NOR',odds:[2.35,3.30,2.85]},
{id:'wal-por',league:'UEFA NATIONS LEAGUE · GROUP A4',time:'20:45 WAT · 17 NOV',home:'Wales',away:'Portugal',homeCode:'WAL',awayCode:'POR',odds:[4.60,3.50,1.75]},
{id:'hun-nir',league:'UEFA NATIONS LEAGUE · GROUP B2',time:'20:45 WAT · 17 NOV',home:'Hungary',away:'Northern Ireland',homeCode:'HUN',awayCode:'NIR',odds:[1.75,3.40,4.60]},
{id:'ukr-geo',league:'UEFA NATIONS LEAGUE · GROUP B2',time:'20:45 WAT · 17 NOV',home:'Ukraine',away:'Georgia',homeCode:'UKR',awayCode:'GEO',odds:[2.05,3.20,3.60]},
{id:'isr-aut',league:'UEFA NATIONS LEAGUE · GROUP B3',time:'20:45 WAT · 17 NOV',home:'Israel',away:'Austria',homeCode:'ISR',awayCode:'AUT',odds:[3.50,3.30,2.00]},
{id:'irl-kos',league:'UEFA NATIONS LEAGUE · GROUP B3',time:'20:45 WAT · 17 NOV',home:'Republic of Ireland',away:'Kosovo',homeCode:'IRL',awayCode:'KOS',odds:[2.15,3.05,3.50]},
{id:'bih-rou',league:'UEFA NATIONS LEAGUE · GROUP B4',time:'20:45 WAT · 17 NOV',home:'Bosnia and Herzegovina',away:'Romania',homeCode:'BIH',awayCode:'ROU',odds:[2.75,3.10,2.50]},
{id:'pol-swe',league:'UEFA NATIONS LEAGUE · GROUP B4',time:'20:45 WAT · 17 NOV',home:'Poland',away:'Sweden',homeCode:'POL',awayCode:'SWE',odds:[2.20,3.20,3.20]}
];
const readJson=<T,>(key:string,fallback:T):T=>{try{return JSON.parse(localStorage.getItem(key)||'') as T}catch{return fallback}};
const readSelections=()=>readJson<Selection[]>('coderush-stage4-slip',[]);
const outcomes=['Home win','Draw','Away win'];
function LiveSimulation(){const [minute,setMinute]=useState(28);useEffect(()=>{const timer=window.setInterval(()=>setMinute(m=>m>=90?90:m+1),12000);return()=>window.clearInterval(timer)},[]);const events=[{minute:18,team:'MAS',text:'Goal! Germany take the lead.'},{minute:44,team:'RCA',text:'Netherlands chance — saved by the keeper.'},{minute:63,team:'MAS',text:'Big chance! Shot hits the post.'},{minute:76,team:'RCA',text:'Raja pressure building in the final third.'}];return <div className="live-sim-panel"><div className="live-sim-head"><span><i/> LIVE MATCH SIMULATION</span><b>{minute>=90?'90′ · FULL TIME':minute+'′'}</b></div><div className="live-sim-score"><div><TeamBadge name="Germany" code="GER"/><b>Germany</b></div><strong>1 <small>:</small> 0</strong><div><TeamBadge name="Netherlands" code="NED"/><b>Netherlands</b></div></div><div className="sim-progress"><span style={{width:(minute/90*100)+'%'}}/></div><div className="sim-timeline">{events.filter(e=>e.minute<=minute).slice(-3).reverse().map(e=><div key={e.minute}><b>{e.minute}′</b><span>{e.text}</span></div>)}</div><small className="sim-disclaimer">Accelerated, scripted demo match — not a real-time sports feed.</small></div>}
export function StageFourMatches(){
 const [filter,setFilter]=useState<'All'|'Live'|'Today'|'Tomorrow'|'Completed'>('Today');
 const [showAllMatches,setShowAllMatches]=useState(false);
 const isArabic=document.documentElement.lang==='ar'||document.documentElement.dir==='rtl';
 const [query,setQuery]=useState('');
 const [favorites,setFavorites]=useState<string[]>(()=>readJson<string[]>('coderush-stage4-favorites',[]));
 const [favoritesOnly,setFavoritesOnly]=useState(false);
 const [sort,setSort]=useState<'time'|'league'>('time');
 const [slip,setSlip]=useState<Selection[]>(readSelections);
 const [expanded,setExpanded]=useState<string|null>(null);
 const [stake,setStake]=useState('10');
 const [liveMinute,setLiveMinute]=useState(89);
 const [viewMode,setViewMode]=useState<'cards'|'compact'>('cards');
 useEffect(()=>{const timer=window.setInterval(()=>setLiveMinute(m=>m>=90?89:m+1),45000);return()=>window.clearInterval(timer)},[]);
 useEffect(()=>{localStorage.setItem('coderush-stage4-slip',JSON.stringify(slip))},[slip]);
 const visible=fixtures.filter(f=>(filter==='All'||(filter==='Live'?!!f.live:filter==='Today'?!f.live&&!f.completed&&f.time.includes('TODAY'):filter==='Tomorrow'?!f.live&&!f.completed&&f.time.includes('17 NOV'):filter==='Completed'?!!f.completed:false))&&(!favoritesOnly||favorites.includes(f.id))&&(!query||(f.home+' '+f.away+' '+f.league).toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>sort==='league'?a.league.localeCompare(b.league):a.time.localeCompare(b.time));
 const displayed=showAllMatches?visible:visible.slice(0,3);
 const words=(en:string,ar:string)=>isArabic?ar:en;
 const add=(f:Fixture,index:number)=>{const pick:Selection={id:f.id+'-'+index,fixtureId:f.id,fixture:f.home+' vs '+f.away,league:f.league,outcome:outcomes[index],odd:f.odds[index]};setSlip(old=>old.some(p=>p.id===pick.id)?old.filter(x=>x.id!==pick.id):[...old.filter(x=>x.fixtureId!==f.id),pick]);};
 const combined=slip.reduce((n,p)=>n*p.odd,1),amount=Number(stake),valid=Number.isFinite(amount)&&amount>=1&&amount<=5000;
 const record=()=>{if(!slip.length||!valid)return;const bets=readJson<Bet[]>('coderush-stage4-bets',[]);bets.unshift({id:'DEMO-'+Date.now(),selections:slip,stake:amount,potential:amount*combined,createdAt:new Date().toISOString()});localStorage.setItem('coderush-stage4-bets',JSON.stringify(bets));setSlip([]);setStake('10');};
 return <><section className="page-title match-page-title match-arena-heading"><span className="eyebrow">🏆 INTERNATIONAL FIXTURES · DEMO</span><h1>Match Centre</h1><p>Explore today’s fixtures, match details and illustrative odds.</p></section>
 <section className="match-overview-stats match-arena-stats"><div><span><i className="stat-live-dot"/> Live now</span><b>1</b></div><div><span>Today’s matches <CalendarDays size={13}/></span><b>10</b></div><div><span>Total fixtures <Trophy size={13}/></span><b>{fixtures.length}</b></div></section>
 <label className="match-search match-arena-search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search for a team or league…"/><Search size={19}/></label>
 <div className="match-arena-filterbar"><div className="match-arena-tabs">{(['Live','Today','Tomorrow','All','Completed'] as const).map(f=><button key={f} className={filter===f?'active':' '} onClick={()=>{setFilter(f);setShowAllMatches(false)}}>{f==='Live'?words('● Live','● مباشر'):f==='Today'?words('Today','اليوم'):f==='Tomorrow'?words('Tomorrow','الغد'):f==='Completed'?words('Finished','انتهت'):words('All','الكل')}</button>)}</div></div>
 <div className="match-arena-tools"><button className={favoritesOnly?'active':''} onClick={()=>setFavoritesOnly(v=>!v)}><Star size={16}/> Favourites</button><div className="match-view-switch"><button className={viewMode==='compact'?'active':''} onClick={()=>setViewMode('compact')} aria-label="Compact list">☷</button><button className={viewMode==='cards'?'active':''} onClick={()=>setViewMode('cards')} aria-label="Card view">▱</button></div><button onClick={()=>setSort(s=>s==='time'?'league':'time')}><ListFilter size={15}/> {sort==='time'?'Nearest':'Competition'} ↕</button></div>
 <div className="match-arena-competition"><button className="active" onClick={()=>{setFilter('All');setShowAllMatches(false)}}>{words('All competitions','كل الدوريات')}</button><button onClick={()=>{setFilter('Today');setShowAllMatches(false)}}>🌍 UEFA Nations League <b>{fixtures.length}</b></button></div>
 <div className="match-arena-count">{visible.length} {words('matches','مباريات')}</div>
 <div className="match-league-heading"><b>🏆 {visible[0]?.league.split(' · ')[0]||'MATCH CENTRE'}</b><span>{visible.length} MATCHES</span></div>
 <div className={'match-list match-reference-list match-arena-list '+(viewMode==='compact'?'compact':'')}>{displayed.map(f=><article className={'match-card betting-match match-reference-card match-arena-card '+(f.live?'is-live-demo':'')} key={f.id}>
 <div className="match-arena-card-head"><button className={favorites.includes(f.id)?"fixture-star saved":"fixture-star"} aria-label="Toggle favourite" onClick={()=>{const next=favorites.includes(f.id)?favorites.filter(x=>x!==f.id):[...favorites,f.id];setFavorites(next);localStorage.setItem("coderush-stage4-favorites",JSON.stringify(next))}}><Star size={17} fill={favorites.includes(f.id)?"currentColor":"none"}/></button><span className="match-arena-time">{f.live?'● LIVE · '+liveMinute+"′":f.completed?'✓ FULL TIME · '+f.time:'TODAY · '+f.time.replace(' · TODAY','')}</span><span className="match-arena-league">🏆 {f.league.split(' · ')[0]}</span></div>
 <div className="teams match-arena-teams"><div className="team"><TeamBadge name={f.home} code={f.homeCode}/><b>{f.home}</b></div><div className={f.live?'versus live-score':'versus'}>{f.live?(f.score||'1 : 0'):f.completed?(f.score||'FT'):f.time.split(' · ')[0]}{(f.live||!f.completed)&&<small>{f.live?liveMinute+'′ · DEMO CLOCK':'TODAY'}</small>}</div><div className="team"><TeamBadge name={f.away} code={f.awayCode}/><b>{f.away}</b></div></div>
 <div className="match-arena-countdown">{f.live?'LIVE MATCH SIMULATION':f.completed?'MATCH COMPLETED':'◷ Fixture countdown · illustrative schedule'}</div>
 <div className="match-progress match-arena-progress"><span/><span/><span/></div>
 <div className="market-head match-arena-market-head"><span>FULL TIME RESULT</span><small>1X2 · DEMO MARKET</small></div>
 <div className="odds match-arena-odds">{['1','X','2'].map((label,i)=><button key={label} className={slip.some(p=>p.id===f.id+'-'+i)?'odd selected':'odd'} onClick={()=>add(f,i)}><small>{i===0?f.home:i===1?'Draw':f.away}<i>{label}</i></small><b>{f.odds[i].toFixed(2)}</b></button>)}</div>
 <button className="match-arena-bet" onClick={()=>setExpanded(expanded===f.id?null:f.id)}>{expanded===f.id?'Close match details':'Explore match'} <ChevronRight size={16}/></button>
 {expanded===f.id&&<div className="match-detail-inline"><div className="market-title"><span>Match result</span><small>1X2 · DEMO MARKET</small></div><p>{f.home} · {f.away}</p><div className="detail-odds">{outcomes.map((label,i)=><button key={label} className={slip.some(p=>p.id===f.id+'-'+i)?'detail-odd chosen':'detail-odd'} onClick={()=>add(f,i)}><small>{label}</small><b>{f.odds[i].toFixed(2)}</b></button>)}</div><p className="detail-disclaimer">Illustrative demo odds only — not live or actionable.</p></div>}
 </article>)}</div>
 {visible.length>3&&<button className="match-view-more" onClick={()=>setShowAllMatches(v=>!v)}>{showAllMatches?words('Show fewer matches','عرض مباريات أقل'):words('View more matches','عرض المزيد من المباريات')} <ChevronRight size={17}/><span>{showAllMatches?words('Show less','عرض أقل'):(visible.length-3)+' +'}</span></button>}
 {filter==='Live'&&visible.length===0&&<div className="empty"><Activity size={27}/><h3>No verified live fixtures right now</h3><p>Upcoming international matches are listed under Today and Tomorrow. Demo odds are illustrative only.</p></div>}
 {filter==='Completed'&&visible.length===0&&<div className="empty"><Clock3 size={27}/><h3>No completed matches in this sample</h3><p>Completed international fixtures will appear here.</p></div>}{slip.length>0&&<section className="bet-slip"><div className="slip-title"><div><span className="eyebrow">CURRENT SELECTIONS</span><h3><TicketPercent size={18}/> Demo bet slip <span>{slip.length}</span></h3></div><button className="clear-slip" onClick={()=>setSlip([])}>Clear all</button></div>{slip.map(p=><div className="slip-pick" key={p.id}><div><b>{p.fixture}</b><small>{p.league} · {p.outcome}</small></div><strong>{p.odd.toFixed(2)}</strong><button onClick={()=>setSlip(old=>old.filter(x=>x.id!==p.id))} aria-label="Remove selection"><X size={15}/></button></div>)}<div className="stake-row"><label htmlFor="stage4-stake">Demo stake</label><div><button onClick={()=>setStake(String(Math.max(1,(Number(stake)||1)-5)))} aria-label="Decrease stake"><Minus size={14}/></button><input id="stage4-stake" type="number" min="1" max="5000" step="1" value={stake} onChange={e=>setStake(e.target.value)}/><button onClick={()=>setStake(String(Math.min(5000,(Number(stake)||0)+5)))} aria-label="Increase stake"><Plus size={14}/></button></div></div><div className="slip-totals"><span>Combined demo odds <b>{combined.toFixed(2)}</b></span><span>Potential demo return <strong>{valid?(amount*combined).toFixed(2):'—'} credits</strong></span></div><button className="place-demo" onClick={record} disabled={!valid}>Record demo selection <ArrowRight size={16}/></button><p className="detail-disclaimer">No funds are deducted. This does not create a real bet or transaction.</p></section></>;
}
export function StageFourBets({onBrowse}:{onBrowse:()=>void}){
 const [bets,setBets]=useState<Bet[]>(()=>readJson<Bet[]>('coderush-stage4-bets',[]));
 const [slip,setSlip]=useState<Selection[]>(readSelections);
 const [view,setView]=useState<'Active'|'Settled'>('Active');
 const isArabic=document.documentElement.lang==='ar'||document.documentElement.dir==='rtl';
 useEffect(()=>{const refresh=()=>{setBets(readJson<Bet[]>('coderush-stage4-bets',[]));setSlip(readSelections())};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh)},[]);
 const labels=isArabic?{profit:'صافي الأرباح',return:'عائد على المبالغ المسوّاة',accuracy:'إصابة',streak:'سلسلة الفوز',best:'أفضل ربح',open:'مفتوحة',wins:'الفوز',active:'قيد اللعب',settled:'المُخلّصة',none:'لا رهانات مفتوحة',hint:'اختر مباراة وتوقّع نتيجتها قبل انطلاقها.',browse:'تصفّح المباريات',settledNone:'لا رهانات مُخلّصة',settledHint:'ستظهر رهاناتك المُخلّصة هنا بعد اكتمالها.',recorded:'رهانات تجريبية مسجّلة',stake:'قيمة تجريبية',potential:'العائد المحتمل',demo:'عرض تجريبي'}:{profit:'NET PROFIT',return:'RETURN ON SETTLED BETS',accuracy:'accuracy',streak:'Win streak',best:'Best return',open:'Open',wins:'Wins',active:'Active',settled:'Settled',none:'No open bets',hint:'Choose a match and predict its result before it starts.',browse:'Browse matches',settledNone:'No settled bets',settledHint:'Your settled bets will appear here when completed.',recorded:'Recorded demo bets',stake:'Demo stake',potential:'Potential return',demo:'DEMO'};
 const activeCount=slip.length;
 return <div className="mybets-page" dir={isArabic?'rtl':'ltr'}>
 <section className="mybets-performance">
  <div className="mybets-performance-main"><div className="mybets-profit-copy"><small>{labels.profit}</small><b>+$0</b><em>↗ +0.0% {labels.return}</em></div><div className="mybets-accuracy"><b>0%</b><small>{labels.accuracy}</small></div></div>
  <div className="mybets-progress"><span/><i/></div>
  <div className="mybets-stats"><div><small>{labels.wins}</small><b>0/0</b></div><div><small>{labels.open}</small><b>{activeCount}</b></div><div><small>{labels.best}</small><b>—</b></div><div><small>{labels.streak}</small><b>0</b></div></div>
  <span className="mybets-demo-label">{labels.demo}</span>
 </section>
 <div className="mybets-tabs"><button className={view==='Active'?'active':''} onClick={()=>setView('Active')}><Activity size={16}/><span>{labels.active}</span><b>{activeCount}</b></button><button className={view==='Settled'?'active':''} onClick={()=>setView('Settled')}><TicketPercent size={16}/><span>{labels.settled}</span><b>0</b></button></div>
 {view==='Active'&&slip.length>0&&<section className="mybets-selection-note"><h3>{isArabic?'لديك اختيارات في قسيمة الرهان':'Selections waiting in your demo slip'}</h3><p>{isArabic?'يمكنك مراجعة اختياراتك في صفحة المباريات.':'Return to Match Centre to review your selections and record a demo slip.'}</p><button className="mybets-browse" onClick={onBrowse}>{isArabic?'مراجعة القسيمة':'Review demo slip'} <ChevronRight size={17}/></button></section>}
 {view==='Active'&&bets.length>0?<><div className="mybets-history-heading"><h3>{labels.recorded}</h3><span>{bets.length}</span></div>{bets.map(b=><article className="demo-bet-card mybets-recorded-card" key={b.id}><div className="demo-bet-top"><span>{b.id}</span><span className="demo-open">RECORDED · DEMO</span></div>{b.selections.map(p=><div className="history-pick" key={p.id}><b>{p.fixture}</b><small>{p.outcome} · {p.odd.toFixed(2)}</small></div>)}<div className="history-bottom"><span>{labels.stake} <b>{b.stake.toFixed(2)} credits</b></span><span>{labels.potential} <b>{b.potential.toFixed(2)}</b></span></div><small className="detail-disclaimer">{new Date(b.createdAt).toLocaleString(isArabic?'ar':'en-US')}</small></article>)}</>:view==='Active'&&slip.length===0&&<section className="mybets-empty"><div className="mybets-ticket-art"><TicketPercent size={65} strokeWidth={1.45}/></div><h2>{labels.none}</h2><p>{labels.hint}</p><button className="mybets-browse" onClick={onBrowse}>{labels.browse}<ChevronRight size={18}/></button></section>}
 {view==='Settled'&&<section className="mybets-empty"><div className="mybets-ticket-art"><TicketPercent size={65} strokeWidth={1.45}/></div><h2>{labels.settledNone}</h2><p>{labels.settledHint}</p><button className="mybets-browse" onClick={onBrowse}>{labels.browse}<ChevronRight size={18}/></button></section>}
 </div>;
}