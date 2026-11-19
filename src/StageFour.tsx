import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronRight, Minus, Plus, TicketPercent, X, Activity, Clock3, Search, Star, CalendarDays, ListFilter, Trophy } from 'lucide-react';
import { TeamBadge } from './TeamBadge';
type Fixture={id:string;league:string;time:string;kickoff:string;home:string;away:string;homeCode:string;awayCode:string;homeLogo?:string|null;awayLogo?:string|null;leagueLogo?:string|null;odds:[number|null,number|null,number|null];live?:boolean;completed?:boolean;score?:string|null;status?:string;minute?:number|null;bookmaker?:string|null;oddsUpdatedAt?:string|null};
type Selection={id:string;fixtureId:string;fixture:string;league:string;outcome:string;odd:number;resultStatus?:'pending'|'won'|'lost'|'void';resultScore?:string|null;resultFixtureStatus?:string|null};
type Bet={id:string;selections:Selection[];stake:number;potential:number;settledOdds?:number|null;settledReturn?:number|null;settledAt?:string|null;createdAt:string;status?:'open'|'won'|'lost'|'void'};
type Club={name:string;code:string};
const clubs:Club[]=[
{name:'AS FAR Rabat',code:'ASFAR'},{name:'COD Meknes',code:'CODM'},{name:'Difaâ El Jadida',code:'DHJ'},{name:'FUS Rabat',code:'FUS'},
{name:'Hassania Agadir',code:'HUSA'},{name:'IR Tanger',code:'IRT'},{name:'Kawkab Marrakech',code:'KACM'},{name:'Germany',code:'MAS'},
{name:'Moghreb Tetouan',code:'MAT'},{name:'Netherlands',code:'RCA'},{name:'RCA Zemamra',code:'RCAZ'},{name:'RS Berkane',code:'RSB'},
{name:'US Amal Tiznit',code:'USAT'},{name:'Union Touarga',code:'UTS'},{name:'Wydad Casablanca',code:'WAC'},{name:'Wydad Sportif Temara',code:'WST'}
];
const readJson=<T,>(key:string,fallback:T):T=>{try{return JSON.parse(localStorage.getItem(key)||'') as T}catch{return fallback}};
const readSelections=()=>readJson<Selection[]>('coderush-stage4-slip',[]);
const outcomes=['Home win','Draw','Away win'];
const LEAGUE_BADGE_IDS:Record<string,string>={'Premier League':'39','Championship':'40','Bundesliga':'78','La Liga':'140','Serie A':'135','Ligue 1':'61','Eredivisie':'88','Primeira Liga':'94'};
const leagueBadge=(name:string)=>LEAGUE_BADGE_IDS[name]?'https://media.api-sports.io/football/leagues/'+LEAGUE_BADGE_IDS[name]+'.png':null;
export function StageFourMatches(){
 const [fixtures,setFixtures]=useState<Fixture[]>([]);
 const [filter,setFilter]=useState<'Live'|'Today'|'Tomorrow'|'All'|'Finished'>('Today');
 const [query,setQuery]=useState('');
 const [competition,setCompetition]=useState('TOP LEAGUES');
 const [favorites,setFavorites]=useState<string[]>(()=>readJson<string[]>('coderush-stage4-favorites',[]));
 const [favoritesOnly,setFavoritesOnly]=useState(false);
 const [sort,setSort]=useState<'time'|'league'>('time');
 const [slip,setSlip]=useState<Selection[]>(readSelections);
 const [expanded,setExpanded]=useState<string|null>(null);
 const [matchDetails,setMatchDetails]=useState<Record<string,{statistics:any;events:any[]}>>({});
 const [detailLoading,setDetailLoading]=useState<string|null>(null);
 const [stake,setStake]=useState('10');
 const [ticketOpen,setTicketOpen]=useState(false);
 const [ticketQuote,setTicketQuote]=useState<{combinedOdds:number;expiresAt:string;validatedAt:string;selections:Array<{fixtureId:string;outcomeKey:string;odd:number}>}|null>(null);
 const [quoteLoading,setQuoteLoading]=useState(false),[quoteError,setQuoteError]=useState('');
 const [submittingTicket,setSubmittingTicket]=useState(false),[submitTicketError,setSubmitTicketError]=useState('');
 const ticketSubmissionKey=useRef(crypto.randomUUID());
 useEffect(()=>{ticketSubmissionKey.current=crypto.randomUUID()},[slip,stake]);
 const [providerConfigured,setProviderConfigured]=useState(false),[feedLoading,setFeedLoading]=useState(true),[feedMessage,setFeedMessage]=useState('');
 const [availableBalance,setAvailableBalance]=useState(0),[balanceLoaded,setBalanceLoaded]=useState(false);
 useEffect(()=>{let active=true;const loadBalance=async()=>{try{const response=await fetch('/api/wallet',{credentials:'same-origin',cache:'no-store'});const body=await response.json();if(active&&response.ok&&body?.ok)setAvailableBalance(Number(body.wallet?.availableUnits||0)/1_000_000);}catch{}finally{if(active)setBalanceLoaded(true)}};void loadBalance();window.addEventListener('focus',loadBalance);window.addEventListener('coderush:bets-updated',loadBalance);return()=>{active=false;window.removeEventListener('focus',loadBalance);window.removeEventListener('coderush:bets-updated',loadBalance)}},[]);
 const isArabic=document.documentElement.lang==='ar'||document.documentElement.dir==='rtl';
 const words=(en:string,ar:string)=>isArabic?ar:en;
 useEffect(()=>{let active=true;const load=async()=>{try{const response=await fetch('/api/sports/fixtures');const body=await response.json();if(!response.ok||!body?.ok)throw new Error(body?.error||'Unable to load sports feed');if(!active)return;setProviderConfigured(Boolean(body.configured));const mapped=(body.fixtures||[]).map((f:any)=>({ ...f,time:new Date(f.kickoff).toLocaleTimeString(isArabic?'ar':'en-US',{hour:'2-digit',minute:'2-digit'}),odds:Array.isArray(f.odds)?f.odds:[null,null,null] }));setFixtures(mapped);setFeedMessage(body.configured?(mapped.length?'':(body.sync?.last_error||'No fixtures have been synced yet.')):(body.message||'Sports data provider is not configured.'));}catch(error){if(active)setFeedMessage(error instanceof Error?error.message:'Sports feed unavailable');}finally{if(active)setFeedLoading(false)}};load();const timer=window.setInterval(load,30000);return()=>{active=false;window.clearInterval(timer)}},[isArabic]);
 useEffect(()=>{if(!expanded||matchDetails[expanded])return;if(expanded.startsWith('of-')){setMatchDetails(old=>({...old,[expanded]:{statistics:{error:'The public fixture source does not provide live statistics or match events.'},events:[]}}));return;}let active=true;setDetailLoading(expanded);fetch('/api/sports/fixture-details?id='+encodeURIComponent(expanded),{credentials:'same-origin',cache:'no-store'}).then(async response=>{const body=await response.json();if(!response.ok||!body?.ok)throw new Error(body?.error||'Match details unavailable');if(active)setMatchDetails(old=>({...old,[expanded]:{statistics:body.statistics,events:Array.isArray(body.events)?body.events:[]}}));}).catch(error=>{if(active)setMatchDetails(old=>({...old,[expanded]:{statistics:{error:error instanceof Error?error.message:'Match details unavailable'},events:[]}}));}).finally(()=>{if(active)setDetailLoading(null)});return()=>{active=false}},[expanded,matchDetails]);
 useEffect(()=>{localStorage.setItem('coderush-stage4-slip',JSON.stringify(slip))},[slip]);
 useEffect(()=>{
  let active=true;
  if(!slip.length){setTicketQuote(null);setQuoteError('');setQuoteLoading(false);return;}
  setTicketQuote(null);setQuoteError('');setQuoteLoading(true);
  const controller=new AbortController();
  const timer=window.setTimeout(async()=>{
   try{
    const response=await fetch('/api/bets/quote',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',signal:controller.signal,body:JSON.stringify({selections:slip.map(p=>({fixtureId:p.fixtureId,outcome:p.outcome}))})});
    const body=await response.json();
    if(!response.ok||!body?.ok||!body?.quote)throw new Error(body?.error||'Ticket validation failed.');
    if(active){setSubmitTicketError('');setTicketQuote(body.quote);setSlip(current=>{let changed=false;const next=current.map(p=>{const key=p.outcome==='Home win'?'home':p.outcome==='Draw'?'draw':'away';const fresh=body.quote.selections.find((s:any)=>s.fixtureId===p.fixtureId&&s.outcomeKey===key);if(fresh&&fresh.odd!==p.odd){changed=true;return {...p,odd:fresh.odd};}return p;});return changed?next:current;});setQuoteError('');}
   }catch(error){if(active&&!controller.signal.aborted)setQuoteError(error instanceof Error?error.message:'Ticket validation failed.');}
   finally{if(active)setQuoteLoading(false);}
  },250);
  return()=>{active=false;window.clearTimeout(timer);controller.abort();};
 },[slip]);
 const categories=['TOP LEAGUES',...Array.from(new Set(fixtures.map(f=>f.league)))];
 const catLabel=(v:string)=>({ 'TOP LEAGUES':words('Top leagues','أهم الدوريات'),'INTERNATIONAL':words('International','المنتخبات'),'INTERNATIONAL CLUBS':words('International clubs','الأندية الدولية'),'ENGLISH PREMIER LEAGUE':'Premier League','LA LIGA':'La Liga','SERIE A':'Serie A','BUNDESLIGA':'Bundesliga','LIGUE 1':'Ligue 1','UEFA CHAMPIONS LEAGUE':'Champions League','UEFA EUROPA LEAGUE':'Europa League'} as Record<string,string>)[v]||v;
 const localDateKey=(value:string|number)=>{const d=new Date(value);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
 const todayKey=localDateKey(Date.now()),tomorrowKey=localDateKey(Date.now()+86400000);
 const status=(f:Fixture)=>f.live?'Live':f.completed?'Finished':localDateKey(f.kickoff)===todayKey?'Today':localDateKey(f.kickoff)===tomorrowKey?'Tomorrow':'Upcoming';
 const topLeagues=Array.from(new Set(fixtures.map(f=>f.league))).slice(0,5);
 const filtered=fixtures.filter(f=>(filter==='All'||(filter==='Today'&&localDateKey(f.kickoff)===todayKey)||(filter==='Tomorrow'&&localDateKey(f.kickoff)===tomorrowKey)||(filter==='Live'&&f.live)||(filter==='Finished'&&f.completed))&&(!favoritesOnly||favorites.includes(f.id))&&(!query||(f.home+' '+f.away+' '+f.league).toLowerCase().includes(query.toLowerCase()))&&(competition==='TOP LEAGUES'?topLeagues.includes(f.league):competition==='INTERNATIONAL'||competition==='INTERNATIONAL CLUBS'?f.league===competition:f.league===competition));
 const visible=[...filtered].sort((a,b)=>sort==='league'?a.league.localeCompare(b.league):Number(b.live)-Number(a.live)||a.time.localeCompare(b.time));
 const live=visible.find(f=>f.live);
 const liveMinute=live?.minute??0;
 const list=visible.filter(f=>!f.live);
 const grouped=Array.from(new Set(list.map(f=>f.league))).map(league=>({league,matches:list.filter(f=>f.league===league)}));
 const add=(f:Fixture,index:number)=>{const odd=f.odds[index];if(odd===null||odd===undefined)return;const pick:Selection={id:f.id+'-'+index,fixtureId:f.id,fixture:f.home+' vs '+f.away,league:f.league,outcome:outcomes[index],odd};setSlip(old=>old.some(p=>p.id===pick.id)?old.filter(x=>x.id!==pick.id):[...old.filter(x=>x.fixtureId!==f.id),pick]);};
 const localCombined=slip.reduce((n,p)=>n*p.odd,1),combined=ticketQuote?.combinedOdds??localCombined,amount=Number(stake),valid=Number.isFinite(amount)&&amount>=1&&amount<=5000&&/^\d{1,4}(?:\.\d{1,2})?$/.test(stake.trim());
 const record=async()=>{
  if(!slip.length||!valid||!ticketQuote||submittingTicket)return;
  setSubmittingTicket(true);setSubmitTicketError('');
  try{
   const response=await fetch('/api/bets',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({selections:slip.map(p=>({fixtureId:p.fixtureId,outcome:p.outcome})),stake:amount,idempotencyKey:ticketSubmissionKey.current,quoteValidatedAt:ticketQuote.validatedAt,quotedOdds:ticketQuote.selections})});
   const body=await response.json();
   if(!response.ok||!body?.ok||!body?.ticket)throw new Error(body?.error||'Unable to save this ticket.');
   setSlip([]);setStake('10');setTicketOpen(false);window.dispatchEvent(new CustomEvent('coderush:bets-updated'));
  }catch(error){const message=error instanceof Error?error.message:'Unable to save this ticket.';setSubmitTicketError(message);if(/odds have changed|price snapshot|quote has expired/i.test(message))setSlip(current=>[...current]);}
  finally{setSubmittingTicket(false);}
 };
 const renderMatch=(f:Fixture)=><article className={'sb-match-row '+(f.live?'is-live':'')} key={f.id}>
  <div className="sb-match-main">
   <button className={'sb-fav '+(favorites.includes(f.id)?'saved':'')} onClick={()=>setFavorites(old=>{const next=old.includes(f.id)?old.filter(x=>x!==f.id):[...old,f.id];localStorage.setItem('coderush-stage4-favorites',JSON.stringify(next));return next})} aria-label="Favourite"><Star size={15} fill={favorites.includes(f.id)?'currentColor':'none'}/></button>
   <div className="sb-team-stack"><div><TeamBadge name={f.home} code={f.homeCode} logoUrl={f.homeLogo}/><b>{f.home}</b></div><div><TeamBadge name={f.away} code={f.awayCode} logoUrl={f.awayLogo}/><b>{f.away}</b></div></div>
   <div className="sb-match-state">{f.live?<><i className="sb-live-dot"/><b>{liveMinute}′</b><strong>{f.score}</strong><small>{words('LIVE DATA','بيانات مباشرة')}</small></>:<><b>{f.completed&&f.score?f.score:f.time}</b><small>{status(f)==='Tomorrow'?words('Tomorrow','غداً'):status(f)==='Finished'?words('Finished','انتهت'):status(f)==='Upcoming'?words('Upcoming','قريباً'):words('Today','اليوم')}</small></>}</div>
  </div>
  <div className="sb-market-row">{['1','X','2'].map((label,i)=><button key={label} disabled={f.odds[i]===null||f.odds[i]===undefined} aria-label={label+' '+outcomes[i]+' '+(f.odds[i]===null||f.odds[i]===undefined?'odds unavailable':f.odds[i]!.toFixed(2))} className={slip.some(p=>p.id===f.id+'-'+i)?'selected':''} onClick={()=>add(f,i)}><small><strong>{label}</strong><em>{words(i===0?'Home':i===1?'Draw':'Away',i===0?'الفريق المضيف':i===1?'تعادل':'الفريق الضيف')}</em></small><b>{f.odds[i]===null||f.odds[i]===undefined?'—':f.odds[i]!.toFixed(2)}</b></button>)}<button className="sb-more-market" onClick={()=>setExpanded(expanded===f.id?null:f.id)}>{'1X2'}</button></div>
  {expanded===f.id&&<div className="sb-expanded-market"><b>{f.id.startsWith('of-')?words('Public fixture source','مصدر المباريات العام'):words('Match details · API-Football','تفاصيل المباراة · API-Football')}</b><span>{f.bookmaker||words('No bookmaker price supplied','لا تتوفر أسعار مراهنات من المصدر')}</span><small>{f.oddsUpdatedAt?words('Odds updated: ','آخر تحديث للاحتمالات: ')+new Date(f.oddsUpdatedAt).toLocaleTimeString(isArabic?'ar':'en-US'):words('Markets appear when prices are published.','تظهر الأسواق عند توفر الأسعار.')}</small>{detailLoading===f.id?<small>{words('Loading statistics and events…','جارٍ تحميل الإحصائيات والأحداث…')}</small>:matchDetails[f.id]?<><b>{words('Statistics','الإحصائيات')}</b>{matchDetails[f.id].statistics?.error?<small>{matchDetails[f.id].statistics.error}</small>:<div className="sb-detail-stats">{Object.entries(matchDetails[f.id].statistics||{}).filter(([,v]:any)=>v&&typeof v==='object'&&('home'in v||'away'in v)).map(([k,v]:any)=><span key={k}>{k.replace(/_/g,' ')} <b>{v.home??'—'} – {v.away??'—'}</b></span>)}</div>}<b>{words('Match events','أحداث المباراة')}</b>{matchDetails[f.id].events.length?matchDetails[f.id].events.map((ev:any,index:number)=><small key={index}>{ev.minute!==null&&ev.minute!==undefined?ev.minute+'′ · ':''}{String(ev.type||ev.event||'Event').replace(/_/g,' ')}{ev.team?' · '+ev.team:''}{ev.player?' · '+ev.player:''}</small>):<small>{words('No events supplied for this fixture yet.','لا توجد أحداث متاحة لهذه المباراة بعد.')}</small>}</>:<small>{words('Open the match details to load provider statistics and events.','افتح تفاصيل المباراة لتحميل إحصائيات وأحداث المزود.')}</small>}</div>}
 </article>;
 return <div className="sporty-matches" dir={isArabic?'rtl':'ltr'}>
  <div className="sb-page-heading"><div><span>{words('FOOTBALL','كرة القدم')}</span><h2>{words('Matches','المباريات')}</h2></div><span className="sb-provider-tag">{providerConfigured?words('FIXTURE FEED','بيانات المباريات'):words('FEED SETUP','إعداد البيانات')}</span></div>
  <div className="sb-summary-strip"><div><small>{words('Matches shown','المباريات المعروضة')}</small><b>{visible.length}</b></div><div><small>{words('Live now','مباشر الآن')}</small><b className="sb-summary-live">{visible.filter(f=>f.live).length}</b></div><div><small>{words('Competitions','البطولات')}</small><b>{new Set(visible.map(f=>f.league)).size}</b></div></div>
  <label className="sb-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={words('Search teams or competitions','ابحث عن فريق أو بطولة')}/><kbd>⌕</kbd></label>
  <div className="sb-category-scroll">{categories.map(c=><button key={c} className={competition===c?'active':''} onClick={()=>setCompetition(c)}>{catLabel(c)}</button>)}</div>
  <div className="sb-controls"><div className="sb-day-tabs">{(['Live','Today','Tomorrow','All'] as const).map(k=><button key={k} className={filter===k?'active':''} onClick={()=>setFilter(k)}>{words(({Live:'Live',Today:'Today',Tomorrow:'Tomorrow',All:'All'} as any)[k],({Live:'مباشر',Today:'اليوم',Tomorrow:'غداً',All:'الكل'} as any)[k])}{k==='Live'&&<i/>}</button>)}</div><button className={favoritesOnly?'active':''} onClick={()=>setFavoritesOnly(v=>!v)}><Star size={14}/>{words('Favourites','المفضلة')}</button><button onClick={()=>setSort(v=>v==='time'?'league':'time')}>{sort==='time'?words('Time','الوقت'):words('League','الدوري')} ↕</button></div>
  {live&&<section className="sb-live-feature"><div className="sb-live-feature-top"><span><i/> {words('LIVE MATCH · FEATURED','مباراة مباشرة · مميزة')}</span><small>{words('LIVE DATA','بيانات مباشرة')}</small></div><div className="sb-live-feature-teams"><div><TeamBadge name={live.home} code={live.homeCode} logoUrl={live.homeLogo}/><b>{live.home}</b></div><strong>{live.score||'—'}<small>{liveMinute?liveMinute+'′':'LIVE'}</small></strong><div><TeamBadge name={live.away} code={live.awayCode} logoUrl={live.awayLogo}/><b>{live.away}</b></div></div><div className="sb-live-feature-markets">{['1','X','2'].map((label,i)=><button key={label} disabled={live.odds[i]===null||live.odds[i]===undefined} aria-label={label+' '+outcomes[i]} className={slip.some(p=>p.id===live.id+'-'+i)?'selected':''} onClick={()=>add(live,i)}><small><strong>{label}</strong><em>{words(i===0?'Home':i===1?'Draw':'Away',i===0?'الفريق المضيف':i===1?'تعادل':'الفريق الضيف')}</em></small><b>{live.odds[i]===null||live.odds[i]===undefined?'—':live.odds[i]!.toFixed(2)}</b></button>)}</div></section>}
  {grouped.map(group=><section className="sb-league-group" key={group.league}><button className="sb-league-heading" onClick={()=>setCompetition(group.league)}><span className="sb-league-icon">{group.matches[0]?.leagueLogo||leagueBadge(group.league)?<img src={group.matches[0]?.leagueLogo||leagueBadge(group.league)!} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"/>:"⚽"}</span><b>{catLabel(group.league)}</b><small>{group.matches.length}</small><ChevronRight size={16}/></button>{group.matches.map(renderMatch)}</section>)}
  {!live&&!grouped.length&&<div className="empty"><Trophy size={28}/><h3>{feedLoading?words('Loading real fixtures…','جارٍ تحميل المباريات…'):providerConfigured?words('No matches found','لا توجد مباريات'):words('Sports feed is not connected','مصدر البيانات الرياضية غير متصل')}</h3><p>{feedMessage||words('Fixtures and odds will appear here after the sports provider is configured and synced.','ستظهر المباريات والاحتمالات هنا بعد إعداد مزود البيانات ومزامنته.')}</p></div>}
  {slip.length>0&&<><button className="sb-ticket-launcher" onClick={()=>setTicketOpen(true)}><span className="sb-ticket-icon"><TicketPercent size={19}/><i>{slip.length}</i></span><span><b>{words('BET SLIP','قسيمة الرهان')}</b><small>{slip.length} {words('selection(s)','اختيار')} · {words('Combined odds','إجمالي الاحتمالات')} {combined.toFixed(2)}</small></span><strong>{words('VIEW TICKET','عرض القسيمة')} <ChevronRight size={16}/></strong></button>{ticketOpen&&<div className="sb-ticket-backdrop" onClick={()=>setTicketOpen(false)}><section className="sb-ticket-sheet" onClick={e=>e.stopPropagation()}><div className="sb-ticket-grabber"/><div className="sb-ticket-heading"><div><span className="eyebrow">{words('YOUR SELECTIONS','اختياراتك')}</span><h3><TicketPercent size={19}/> {words('Bet slip','قسيمة الرهان')} <em>{slip.length}</em></h3></div><button onClick={()=>setTicketOpen(false)} aria-label="Close ticket"><X size={20}/></button></div><div className="sb-ticket-mode"><b>{words('Single / Accumulator','مفرد / تراكمي')}</b><small>{quoteLoading?words('Validating selections against current server odds…','جارٍ التحقق من الاختيارات مقابل الأسعار الحالية…'):quoteError?quoteError:ticketQuote?words('Server-validated odds quote · no bet placed','تم التحقق من الأسعار · لم يتم وضع رهان'):words('Waiting for server validation','بانتظار التحقق من الخادم')}</small></div>{slip.map(p=><div className="slip-pick" key={p.id}><div><b>{p.fixture}</b><small>{p.league} · {p.outcome}</small></div><strong>{p.odd.toFixed(2)}</strong><button onClick={()=>setSlip(old=>old.filter(x=>x.id!==p.id))} aria-label="Remove selection"><X size={15}/></button></div>)}<div className="stake-row"><label htmlFor="stage4-stake">{words('Stake (USD)','قيمة الرهان بالدولار')}</label><small className="stake-available">{words('Available balance: $','الرصيد المتاح: $')}{availableBalance.toFixed(2)}</small><div><button onClick={()=>setStake(String(Math.max(1,(Number(stake)||1)-5)))}><Minus size={14}/></button><input id="stage4-stake" type="number" min="1" max={5000} step="0.01" value={stake} onChange={e=>setStake(e.target.value)}/><button onClick={()=>setStake(String(Math.min(5000,(Number(stake)||0)+5)))}><Plus size={14}/></button></div></div><div className="slip-totals"><span>{words('Combined odds','إجمالي الاحتمالات')} <b>{combined.toFixed(2)}</b></span><span>{words('Potential return','العائد المحتمل')} <strong>{valid?'$'+(amount*combined).toFixed(2):'—'}</strong></span></div>{submitTicketError&&<p className="detail-disclaimer" role="alert">{submitTicketError}</p>}<button className="place-bet-disabled place-bet-enabled" onClick={record} disabled={submittingTicket||quoteLoading||!ticketQuote||!valid||!balanceLoaded||amount>availableBalance}>{submittingTicket?words('Placing bet…','جارٍ وضع الرهان…'):words('Place bet','تأكيد الرهان')} <ArrowRight size={16}/></button><button className="sb-ticket-clear" onClick={()=>{setSlip([]);setTicketOpen(false)}}>{words('Clear ticket','مسح القسيمة')}</button></section></div>}</>}
 </div>;
}

export function StageFourBets({onBrowse}:{onBrowse:()=>void}){
 const [bets,setBets]=useState<Bet[]>(()=>readJson<Bet[]>('coderush-stage4-bets',[]));
 const [summary,setSummary]=useState<{openCount:number;settledCount:number;wins:number;losses:number;voids:number;netResult:number;bestReturn:number;winStreak:number;accuracy:number}|null>(null);
 const [view,setView]=useState<'Active'|'Settled'>('Active');
 const [showMoreBets,setShowMoreBets]=useState(false);
 const isArabic=document.documentElement.lang==='ar'||document.documentElement.dir==='rtl';
 useEffect(()=>{
  let active=true;
  const refresh=async()=>{
   try{
    const response=await fetch('/api/bets?limit=50',{credentials:'same-origin',cache:'no-store'});
    const body=await response.json();
    if(!response.ok||!body?.ok)throw new Error(body?.error||'Unable to load ticket history');
    if(active){setBets(Array.isArray(body.bets)?body.bets:[]);setSummary(body.summary||null);}
   }catch{if(active){setBets([]);setSummary(null);}}
  };
  refresh();window.addEventListener('focus',refresh);window.addEventListener('coderush:bets-updated',refresh);
  return()=>{active=false;window.removeEventListener('focus',refresh);window.removeEventListener('coderush:bets-updated',refresh)};
 },[]);
 const labels=isArabic
  ?{profit:'صافي النتائج',accuracy:'نسبة الفوز',streak:'سلسلة الفوز',best:'أفضل عائد',open:'مفتوحة',wins:'الفوز',active:'قيد اللعب',settled:'المُخلّصة',none:'لا رهانات مفتوحة',hint:'اختر مباراة وتوقّع نتيجتها قبل انطلاقها.',browse:'تصفّح المباريات',settledNone:'لا رهانات مُخلّصة',settledHint:'ستظهر رهاناتك المُخلّصة هنا بعد اكتمالها.',recorded:'الرهانات المسجّلة',stake:'قيمة الرهان',potential:'العائد المحتمل',settledReturn:'العائد',openStatus:'مفتوحة',won:'فوز',lost:'خسارة',void:'ملغاة',pending:'بانتظار النتيجة'}
  :{profit:'NET RESULT',accuracy:'win accuracy',streak:'Win streak',best:'Best settled return',open:'Open',wins:'Wins',active:'Active',settled:'Settled',none:'No open bets',hint:'Choose a match and predict its result before it starts.',browse:'Browse matches',settledNone:'No settled bets',settledHint:'Your settled bets will appear here when completed.',recorded:'Recorded bets',stake:'Stake (USD)',potential:'Potential return',settledReturn:'Return',openStatus:'OPEN',won:'WON',lost:'LOST',void:'VOID',pending:'PENDING RESULT'};
 const activeBets=bets.filter(b=>!b.status||b.status==='open');
 const settledBets=bets.filter(b=>b.status==='won'||b.status==='lost'||b.status==='void');
 const displayedBets=view==='Active'?activeBets:settledBets;
 const wins=summary?.wins??settledBets.filter(b=>b.status==='won').length;
 const losses=summary?.losses??settledBets.filter(b=>b.status==='lost').length;
 const voids=summary?.voids??settledBets.filter(b=>b.status==='void').length;
 const accuracy=summary?.accuracy??(wins+losses?Math.round(wins/(wins+losses)*100):0);
 const netResult=summary?.netResult??settledBets.reduce((sum,b)=>sum+(b.settledReturn??(b.status==='lost'?0:b.stake))-b.stake,0);
 const bestSettledReturn=summary?.bestReturn??settledBets.reduce((best,b)=>Math.max(best,b.settledReturn??0),0);
 const recentSettled=[...settledBets].sort((a,b)=>Date.parse(b.settledAt||b.createdAt)-Date.parse(a.settledAt||a.createdAt));
 let winStreak=summary?.winStreak??0;
 if(!summary){for(const bet of recentSettled){if(bet.status!=='won')break;winStreak++;}}
 const activeCount=summary?.openCount??activeBets.length;
 const settledCount=summary?.settledCount??settledBets.length;
 const shownBets=showMoreBets?displayedBets:displayedBets.slice(0,3);
 const resultLabel=(status:Selection['resultStatus'])=>status==='won'?labels.won:status==='lost'?labels.lost:status==='void'?labels.void:labels.pending;
 const ticketLabel=(status:Bet['status'])=>status==='won'?labels.won:status==='lost'?labels.lost:status==='void'?labels.void:labels.openStatus;
 return <div className="mybets-page" dir={isArabic?'rtl':'ltr'}>
  <section className="mybets-performance">
   <div className="mybets-performance-main">
    <div className="mybets-profit-copy"><small>{labels.profit}</small><b>{netResult>=0?'+':'−'}${Math.abs(netResult).toFixed(2)}</b><em>{wins} {labels.wins} · {losses} {labels.lost.toLowerCase()} · {voids} {labels.void.toLowerCase()}</em></div>
    <div className="mybets-accuracy"><b>{accuracy}%</b><small>{labels.accuracy}</small></div>
   </div>
   <div className="mybets-progress"><span style={{width:accuracy+'%'}}/><i/></div>
   <div className="mybets-stats">
    <div><small>{labels.wins}</small><b>{wins}/{wins+losses}</b></div>
    <div><small>{labels.open}</small><b>{activeCount}</b></div>
    <div><small>{labels.best}</small><b>{bestSettledReturn?'$'+bestSettledReturn.toFixed(2):'—'}</b></div>
    <div><small>{labels.streak}</small><b>{winStreak}</b></div>
   </div>
  </section>
  <div className="mybets-tabs">
   <button className={view==='Active'?'active':''} onClick={()=>setView('Active')}><Activity size={16}/><span>{labels.active}</span><b>{activeCount}</b></button>
   <button className={view==='Settled'?'active':''} onClick={()=>setView('Settled')}><TicketPercent size={16}/><span>{labels.settled}</span><b>{settledCount}</b></button>
  </div>
  {displayedBets.length>0
   ?<><div className="mybets-history-heading"><h3>{labels.recorded}</h3><span>{view==='Active'?activeCount:settledCount}</span></div>
    {shownBets.map(b=><article className="bet-history-card mybets-recorded-card" key={b.id}>
     <div className="bet-history-top"><span>{b.id}</span><span className="bet-status-pill">{ticketLabel(b.status)}</span></div>
     {b.selections.map(p=><div className="history-pick" key={p.id}><b>{p.fixture}</b><small>{p.outcome} · {p.odd.toFixed(2)}{p.resultStatus==='pending'?' · '+labels.pending:p.resultStatus?' · '+resultLabel(p.resultStatus)+(p.resultScore?' · '+p.resultScore:''):''}</small></div>)}
     <div className="history-bottom"><span>{labels.stake} <b>{'$'+b.stake.toFixed(2)}</b></span><span>{b.status==='open'?labels.potential:labels.settledReturn} <b>{'$'+(b.status==='open'?b.potential:(b.settledReturn??0)).toFixed(2)}</b></span></div>
     <small className="detail-disclaimer">{new Date(b.createdAt).toLocaleString(isArabic?'ar':'en-US')}</small>
    </article>)}
    {displayedBets.length>3&&<button className="match-view-more mybets-view-more" onClick={()=>setShowMoreBets(v=>!v)}>{showMoreBets?(isArabic?'عرض أقل':'Show fewer bets'):(isArabic?'عرض المزيد من الرهانات':'View more bets')} <ChevronRight size={17}/></button>}
   </>
   :<section className="mybets-empty"><div className="mybets-ticket-art"><TicketPercent size={65} strokeWidth={1.45}/></div><h2>{view==='Active'?labels.none:labels.settledNone}</h2><p>{view==='Active'?labels.hint:labels.settledHint}</p><button className="mybets-browse" onClick={onBrowse}>{labels.browse}<ChevronRight size={18}/></button></section>}
  
 </div>;
}
