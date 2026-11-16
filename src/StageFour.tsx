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
{id:'sen-sud-afcon27',league:'AFRICA CUP OF NATIONS 2027 QUALIFIERS',time:'02:00 PM · TODAY',home:'Senegal',away:'Sudan',homeCode:'SEN',awayCode:'SUD',odds:[1.5,5.1,3.5]},
{id:'gha-som-afcon27',league:'AFRICA CUP OF NATIONS 2027 QUALIFIERS',time:'04:00 PM · TODAY',home:'Ghana',away:'Somalia',homeCode:'GHA',awayCode:'SOM',odds:[1.4,5.6,2.2]},
{id:'tur-fra-demo',league:'UEFA NATIONS LEAGUE',time:'LIVE · DEMO SIMULATION',home:'Turkey',away:'France',homeCode:'TUR',awayCode:'FRA',odds:[3.20,3.10,1.85],live:true,score:'1 : 0'},
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
 const [filter,setFilter]=useState<'Live'|'Today'|'Tomorrow'|'All'|'Finished'>('Live');
 const [query,setQuery]=useState('');
 const [favorites,setFavorites]=useState<string[]>(()=>readJson<string[]>('coderush-stage4-favorites',[]));
 const [favoritesOnly,setFavoritesOnly]=useState(false);
 const [sort,setSort]=useState<'time'|'league'>('time');
 const [slip,setSlip]=useState<Selection[]>(readSelections);
 const [expanded,setExpanded]=useState<string|null>(null);
 const [stake,setStake]=useState('10');
 const [liveMinute,setLiveMinute]=useState(89);
 const [viewMode,setViewMode]=useState<'cards'|'compact'>('cards');
 const [showAll,setShowAll]=useState(false);
 const isArabic=document.documentElement.lang==='ar'||document.documentElement.dir==='rtl';
 const words=(en:string,ar:string)=>isArabic?ar:en;
 useEffect(()=>{const timer=window.setInterval(()=>setLiveMinute(m=>m>=90?90:m+1),45000);return()=>window.clearInterval(timer)},[]);
 useEffect(()=>{localStorage.setItem('coderush-stage4-slip',JSON.stringify(slip))},[slip]);
 const status=(f:Fixture)=>f.live?'Live':f.completed?'Finished':f.time.includes('17 NOV')?'Tomorrow':'Today';
 const filtered=fixtures.filter(f=>(filter==='All'||status(f)===filter)&&(!favoritesOnly||favorites.includes(f.id))&&(!query||(f.home+' '+f.away+' '+f.league).toLowerCase().includes(query.toLowerCase())));
 const visible=[...filtered].sort((a,b)=>sort==='league'?a.league.localeCompare(b.league):Number(b.live)-Number(a.live)||a.time.localeCompare(b.time));
 const displayed=showAll?visible:visible.slice(0,4);
 const add=(f:Fixture,index:number)=>{const pick:Selection={id:f.id+'-'+index,fixtureId:f.id,fixture:f.home+' vs '+f.away,league:f.league,outcome:outcomes[index],odd:f.odds[index]};setSlip(old=>old.some(p=>p.id===pick.id)?old.filter(x=>x.id!==pick.id):[...old.filter(x=>x.fixtureId!==f.id),pick]);};
 const combined=slip.reduce((n,p)=>n*p.odd,1),amount=Number(stake),valid=Number.isFinite(amount)&&amount>=1&&amount<=5000;
 const record=()=>{if(!slip.length||!valid)return;const bets=readJson<Bet[]>('coderush-stage4-bets',[]);bets.unshift({id:'DEMO-'+Date.now(),selections:slip,stake:amount,potential:amount*combined,createdAt:new Date().toISOString()});localStorage.setItem('coderush-stage4-bets',JSON.stringify(bets));setSlip([]);setStake('10');};
 const tabs:[typeof filter,string,string][]=[['Live','Live','مباشر'],['Today','Today','اليوم'],['Tomorrow','Tomorrow','الغد'],['All','All','الكل'],['Finished','Finished','انتهت']];
 const count=(key:string)=>fixtures.filter(f=>key==='All'||status(f)===key).length;
 const arabicTeams:Record<string,string>={Senegal:'السنغال',Sudan:'السودان',Ghana:'غانا',Somalia:'الصومال',Turkey:'تركيا',France:'فرنسا'};
 const leagueName=(league:string)=>league==='AFRICA CUP OF NATIONS 2027 QUALIFIERS'?words('Africa Cup of Nations 2027 Qualifiers','تصفيات كأس أمم أفريقيا 2027'):league==='UEFA NATIONS LEAGUE'?words('UEFA Nations League','دوري الأمم الأوروبية'):league;
 return <div className="trophy-match-page" dir={isArabic?'rtl':'ltr'}>
  <section className="trophy-summary" aria-label={words('Match overview','ملخص المباريات')}>
   <div className="trophy-summary-card total"><span>{words('Total accumulated','إجمالي المبلغ المجمع')}<i>↗</i></span><b>$3,888</b><small>{words('DEMO TOTAL','إجمالي تجريبي')}</small></div>
   <div className="trophy-summary-card today"><span>{words("Today's matches",'مباريات اليوم')}<CalendarDays size={17}/></span><b>0</b></div>
   <div className="trophy-summary-card live"><span>{words('Live now','مباشر الآن')}<i className="stat-live-dot"/></span><b>{count('Live')}</b></div>
  </section>
  <label className="trophy-search"><Search size={19}/><input value={query} onChange={e=>{setQuery(e.target.value);setShowAll(false)}} placeholder={words('Search for a team or league…','ابحث عن فريق أو دوري...')}/></label>
  <div className="trophy-filter-scroll"><div className="trophy-filter-tabs">{tabs.map(([key,en,ar])=><button key={key} className={filter===key?'active':''} onClick={()=>{setFilter(key);setShowAll(false)}}>{words(en,ar)}{key==='Live'&&<i className="filter-live-dot"/>}{key==='Tomorrow'&&<small>3</small>}</button>)}</div></div>
  <div className="trophy-tools">
   <button className={favoritesOnly?'active':''} onClick={()=>setFavoritesOnly(v=>!v)}><Star size={16}/>{words('Favourites','المفضلة')}</button>
   <div className="trophy-view-switch"><button className={viewMode==='compact'?'active':''} onClick={()=>setViewMode('compact')} aria-label={words('List view','عرض القائمة')}>☷</button><button className={viewMode==='cards'?'active':''} onClick={()=>setViewMode('cards')} aria-label={words('Card view','عرض البطاقات')}>▱</button></div>
   <button onClick={()=>setSort(v=>v==='time'?'league':'time')}>{sort==='time'?words('Nearest','الأقرب'):words('Competition','الدوري')} <span>↕</span></button>
  </div>
  <div className="trophy-competition-row"><button className="all-leagues" onClick={()=>{setFilter('All');setShowAll(false)}}>{words('All leagues','كل الدوريات')}</button><button className="competition-chip" onClick={()=>{setQuery('Africa Cup of Nations');setFilter('All')}}><span>🏆</span>{words('Africa Cup of Nations 2027 Qualifiers','تصفيات كأس أمم أفريقيا 2027')}<b>2</b></button></div>
  <div className="trophy-result-count">{visible.length} {words('matches','مباريات')}</div>
  {visible.length>0&&<div className="trophy-league-heading"><i>⌄</i><small>{visible.length}</small><b>{leagueName(visible[0].league)}</b></div>}
  <div className={'trophy-fixture-list '+(viewMode==='compact'?'compact':'')}>{displayed.map(f=><article className={'trophy-fixture-card '+(f.live?'is-live':'')+(f.completed?' is-finished':'')} key={f.id}>
   <div className="trophy-fixture-head"><button className={favorites.includes(f.id)?'saved':''} aria-label={words('Toggle favourite','تبديل المفضلة')} onClick={()=>setFavorites(old=>{const next=old.includes(f.id)?old.filter(x=>x!==f.id):[...old,f.id];localStorage.setItem('coderush-stage4-favorites',JSON.stringify(next));return next})}><Star size={17} fill={favorites.includes(f.id)?'currentColor':'none'}/></button><span className={'trophy-time-pill '+(f.live?'live-pill':'')}>{f.live?words('LIVE · 89′','مباشر · 89′'):f.completed?words('FINISHED','انتهت'):f.time.split(' · ')[0]}</span><b>🏆 {leagueName(f.league)}</b></div>
   <div className="trophy-teams"><div className="trophy-team"><TeamBadge name={f.home} code={f.homeCode}/><b>{isArabic?arabicTeams[f.home]||f.home:f.home}</b></div><div className="trophy-kickoff"><strong>{f.live?(f.score||'1 : 0'):f.completed?(f.score||'FT'):f.time.split(' · ')[0]}</strong><small>{f.live?liveMinute+'′':f.completed?'FT':words('KICK-OFF','موعد البداية')}</small></div><div className="trophy-team"><TeamBadge name={f.away} code={f.awayCode}/><b>{isArabic?arabicTeams[f.away]||f.away:f.away}</b></div></div>
   {!f.live&&<div className="trophy-countdown">{f.completed?words('Match completed','انتهت المباراة'):words('◷ Scheduled fixture','◷ مباراة مجدولة')}</div>}
   {f.live&&<div className="trophy-live-progress" aria-label={words('Live match progress','تقدم المباراة المباشرة')}><span style={{width:Math.min(100,liveMinute/90*100)+'%'}}/></div>}
   <div className={'trophy-odds-track '+(f.live?'live-track':'')}><i/><i/><i/></div>
   <div className="trophy-odds">{[0,1,2].map(i=><button key={i} className={slip.some(p=>p.id===f.id+'-'+i)?'selected':''} onClick={()=>add(f,i)}><small>{i===0?(isArabic?arabicTeams[f.home]||f.home:f.home):i===1?words('Draw','تعادل'):(isArabic?arabicTeams[f.away]||f.away:f.away)}</small><b>{f.odds[i].toFixed(1)}%</b></button>)}</div>
   <button className="trophy-bet-button" onClick={()=>setExpanded(expanded===f.id?null:f.id)}>{words('Bet now','رهان تجريبي')} <ChevronRight size={17}/></button>
   {expanded===f.id&&<div className="trophy-match-details"><b>{words('Match details','تفاصيل المباراة')}</b><p>{f.home} vs {f.away} · {words('Illustrative demo market only — not live odds.','سوق تجريبي توضيحي — ليست احتمالات مباشرة.')}</p></div>}
  </article>)}</div>
  {visible.length>4&&<button className="match-view-more trophy-view-more" onClick={()=>setShowAll(v=>!v)}>{showAll?words('Show fewer matches','عرض مباريات أقل'):words('View more matches','عرض المزيد من المباريات')} <ChevronRight size={17}/><span>{showAll?words('Show less','عرض أقل'):(visible.length-4)+' +'}</span></button>}
  {visible.length===0&&<div className="empty"><Trophy size={28}/><h3>{words('No matches found','لم يتم العثور على مباريات')}</h3><p>{words('Try another filter or search term.','جرّب مرشحاً أو كلمة بحث أخرى.')}</p></div>}
  {slip.length>0&&<section className="bet-slip"><div className="slip-title"><div><span className="eyebrow">CURRENT SELECTIONS · DEMO</span><h3><TicketPercent size={18}/> {words('Demo bet slip','قسيمة تجريبية')} <span>{slip.length}</span></h3></div><button className="clear-slip" onClick={()=>setSlip([])}>{words('Clear all','مسح الكل')}</button></div>{slip.map(p=><div className="slip-pick" key={p.id}><div><b>{p.fixture}</b><small>{p.league} · {p.outcome}</small></div><strong>{p.odd.toFixed(1)}%</strong><button onClick={()=>setSlip(old=>old.filter(x=>x.id!==p.id))} aria-label="Remove selection"><X size={15}/></button></div>)}<div className="stake-row"><label htmlFor="stage4-stake">{words('Demo stake','قيمة تجريبية')}</label><div><button onClick={()=>setStake(String(Math.max(1,(Number(stake)||1)-5)))} aria-label="Decrease stake"><Minus size={14}/></button><input id="stage4-stake" type="number" min="1" max="5000" step="1" value={stake} onChange={e=>setStake(e.target.value)}/><button onClick={()=>setStake(String(Math.min(5000,(Number(stake)||0)+5)))} aria-label="Increase stake"><Plus size={14}/></button></div></div><div className="slip-totals"><span>{words('Combined demo odds','إجمالي النسب التجريبية')} <b>{combined.toFixed(2)}</b></span><span>{words('Potential demo return','العائد التجريبي المحتمل')} <strong>{valid?(amount*combined).toFixed(2):'—'} credits</strong></span></div><button className="place-demo" onClick={record} disabled={!valid}>{words('Record demo selection','تسجيل الاختيار التجريبي')} <ArrowRight size={16}/></button><p className="detail-disclaimer">{words('No funds are deducted. This is a visual demo only.','لا يتم خصم أي أموال. هذا عرض تجريبي فقط.')}</p></section>}
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