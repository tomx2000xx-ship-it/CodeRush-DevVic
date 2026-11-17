import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronRight, Minus, Plus, TicketPercent, X, Activity, Clock3, Search, Star, CalendarDays, ListFilter, Trophy } from 'lucide-react';
import { TeamBadge } from './TeamBadge';
type Fixture={id:string;league:string;time:string;kickoff:string;home:string;away:string;homeCode:string;awayCode:string;odds:[number|null,number|null,number|null];live?:boolean;completed?:boolean;score?:string|null;status?:string;minute?:number|null;bookmaker?:string|null;oddsUpdatedAt?:string|null};
type Selection={id:string;fixtureId:string;fixture:string;league:string;outcome:string;odd:number};
type Bet={id:string;selections:Selection[];stake:number;potential:number;createdAt:string;status?:'open'|'won'|'lost'|'void'};
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
 const [stake,setStake]=useState('10'),[walletBalance,setWalletBalance]=useState(()=>{const raw=localStorage.getItem('coderush-stage6-demo-balance');if(raw===null)return 125;const n=Number(raw);return Number.isFinite(n)&&n>=0?n:125});
 const [ticketOpen,setTicketOpen]=useState(false);
 const [ticketQuote,setTicketQuote]=useState<{combinedOdds:number;expiresAt:string;validatedAt:string;selections:Array<{fixtureId:string;outcomeKey:string;odd:number}>}|null>(null);
 const [quoteLoading,setQuoteLoading]=useState(false),[quoteError,setQuoteError]=useState('');
 const [submittingTicket,setSubmittingTicket]=useState(false),[submitTicketError,setSubmitTicketError]=useState('');
 const ticketSubmissionKey=useRef(crypto.randomUUID());
 useEffect(()=>{ticketSubmissionKey.current=crypto.randomUUID()},[slip,stake]);
 const [providerConfigured,setProviderConfigured]=useState(false),[feedLoading,setFeedLoading]=useState(true),[feedMessage,setFeedMessage]=useState('');
 const isArabic=document.documentElement.lang==='ar'||document.documentElement.dir==='rtl';
 const words=(en:string,ar:string)=>isArabic?ar:en;
 useEffect(()=>{let active=true;const load=async()=>{try{const response=await fetch('/api/sports/fixtures');const body=await response.json();if(!response.ok||!body?.ok)throw new Error(body?.error||'Unable to load sports feed');if(!active)return;setProviderConfigured(Boolean(body.configured));const mapped=(body.fixtures||[]).map((f:any)=>({ ...f,time:new Date(f.kickoff).toLocaleTimeString(isArabic?'ar':'en-US',{hour:'2-digit',minute:'2-digit'}),odds:Array.isArray(f.odds)?f.odds:[null,null,null] }));setFixtures(mapped);setFeedMessage(body.configured?(mapped.length?'':(body.sync?.last_error||'No fixtures have been synced yet.')):(body.message||'Sports data provider is not configured.'));}catch(error){if(active)setFeedMessage(error instanceof Error?error.message:'Sports feed unavailable');}finally{if(active)setFeedLoading(false)}};load();const timer=window.setInterval(load,30000);return()=>{active=false;window.clearInterval(timer)}},[isArabic]);
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
 const status=(f:Fixture)=>f.live?'Live':f.completed?'Finished':new Date(f.kickoff).toDateString()===new Date().toDateString()?'Today':'Tomorrow';
 const topLeagues=Array.from(new Set(fixtures.map(f=>f.league))).slice(0,5);
 const filtered=fixtures.filter(f=>(filter==='All'||status(f)===filter||(filter==='Today'&&f.live))&&(!favoritesOnly||favorites.includes(f.id))&&(!query||(f.home+' '+f.away+' '+f.league).toLowerCase().includes(query.toLowerCase()))&&(competition==='TOP LEAGUES'?topLeagues.includes(f.league):competition==='INTERNATIONAL'||competition==='INTERNATIONAL CLUBS'?f.league===competition:f.league===competition));
 const visible=[...filtered].sort((a,b)=>sort==='league'?a.league.localeCompare(b.league):Number(b.live)-Number(a.live)||a.time.localeCompare(b.time));
 const live=visible.find(f=>f.live);
 const liveMinute=live?.minute??0;
 const list=visible.filter(f=>!f.live);
 const grouped=Array.from(new Set(list.map(f=>f.league))).map(league=>({league,matches:list.filter(f=>f.league===league)}));
 const add=(f:Fixture,index:number)=>{const odd=f.odds[index];if(odd===null||odd===undefined)return;const pick:Selection={id:f.id+'-'+index,fixtureId:f.id,fixture:f.home+' vs '+f.away,league:f.league,outcome:outcomes[index],odd};setSlip(old=>old.some(p=>p.id===pick.id)?old.filter(x=>x.id!==pick.id):[...old.filter(x=>x.fixtureId!==f.id),pick]);};
 const localCombined=slip.reduce((n,p)=>n*p.odd,1),combined=ticketQuote?.combinedOdds??localCombined,amount=Number(stake),valid=Number.isFinite(amount)&&amount>=1&&amount<=Math.min(5000,walletBalance);
 const record=async()=>{
  if(!slip.length||!valid||!ticketQuote||submittingTicket)return;
  setSubmittingTicket(true);setSubmitTicketError('');
  try{
   const response=await fetch('/api/bets',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({selections:slip.map(p=>({fixtureId:p.fixtureId,outcome:p.outcome})),stake:amount,idempotencyKey:ticketSubmissionKey.current,quoteValidatedAt:ticketQuote.validatedAt,quotedOdds:ticketQuote.selections})});
   const body=await response.json();
   if(!response.ok||!body?.ok||!body?.ticket)throw new Error(body?.error||'Unable to save this ticket.');
   setSlip([]);setStake('10');setTicketOpen(false);window.dispatchEvent(new CustomEvent('coderush:bets-updated'));
  }catch(error){const message=error instanceof Error?error.message:'Unable to save this ticket.';setSubmitTicketError(message);if(/odds have changed|price snapshot/i.test(message))setSlip(current=>[...current]);}
  finally{setSubmittingTicket(false);}
 };
 const renderMatch=(f:Fixture)=><article className={'sb-match-row '+(f.live?'is-live':'')} key={f.id}>
  <div className="sb-match-main">
   <button className={'sb-fav '+(favorites.includes(f.id)?'saved':'')} onClick={()=>setFavorites(old=>{const next=old.includes(f.id)?old.filter(x=>x!==f.id):[...old,f.id];localStorage.setItem('coderush-stage4-favorites',JSON.stringify(next));return next})} aria-label="Favourite"><Star size={15} fill={favorites.includes(f.id)?'currentColor':'none'}/></button>
   <div className="sb-team-stack"><div><TeamBadge name={f.home} code={f.homeCode}/><b>{f.home}</b></div><div><TeamBadge name={f.away} code={f.awayCode}/><b>{f.away}</b></div></div>
   <div className="sb-match-state">{f.live?<><i className="sb-live-dot"/><b>{liveMinute}′</b><strong>{f.score}</strong><small>{words('LIVE DATA','بيانات مباشرة')}</small></>:<><b>{f.time}</b><small>{status(f)==='Tomorrow'?words('Tomorrow','غداً'):status(f)==='Finished'?words('Finished','انتهت'):words('Today','اليوم')}</small></>}</div>
  </div>
  <div className="sb-market-row">{['1','X','2'].map((label,i)=><button key={label} disabled={f.odds[i]===null||f.odds[i]===undefined} className={slip.some(p=>p.id===f.id+'-'+i)?'selected':''} onClick={()=>add(f,i)}><small>{label}</small><b>{f.odds[i]===null||f.odds[i]===undefined?'—':f.odds[i]!.toFixed(2)}</b></button>)}<button className="sb-more-market" onClick={()=>setExpanded(expanded===f.id?null:f.id)}>{'1X2'}</button></div>
  {expanded===f.id&&<div className="sb-expanded-market"><b>{words('Match result · Live provider feed','نتيجة المباراة · مصدر البيانات')}</b><span>{f.bookmaker||words('Odds not currently supplied','لا تتوفر احتمالات حالياً')}</span><small>{f.oddsUpdatedAt?words('Odds updated: ','آخر تحديث للاحتمالات: ')+new Date(f.oddsUpdatedAt).toLocaleTimeString(isArabic?'ar':'en-US') : words('Markets appear when the provider publishes prices.','تظهر الأسواق عند توفر الأسعار من مزود البيانات.')}</small></div>}
 </article>;
 return <div className="sporty-matches" dir={isArabic?'rtl':'ltr'}>
  <div className="sb-page-heading"><div><span>{words('FOOTBALL','كرة القدم')}</span><h2>{words('Matches','المباريات')}</h2></div><span className="sb-demo-tag">{providerConfigured?words('LIVE DATA','بيانات مباشرة'):words('FEED SETUP','إعداد البيانات')}</span></div>
  <div className="sb-summary-strip"><div><small>{words('Matches shown','المباريات المعروضة')}</small><b>{visible.length}</b></div><div><small>{words('Live now','مباشر الآن')}</small><b className="sb-summary-live">{visible.filter(f=>f.live).length}</b></div><div><small>{words('Competitions','البطولات')}</small><b>{new Set(visible.map(f=>f.league)).size}</b></div></div>
  <label className="sb-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={words('Search teams or competitions','ابحث عن فريق أو بطولة')}/><kbd>⌕</kbd></label>
  <div className="sb-category-scroll">{categories.map(c=><button key={c} className={competition===c?'active':''} onClick={()=>setCompetition(c)}>{catLabel(c)}</button>)}</div>
  <div className="sb-controls"><div className="sb-day-tabs">{(['Live','Today','Tomorrow','All'] as const).map(k=><button key={k} className={filter===k?'active':''} onClick={()=>setFilter(k)}>{words(({Live:'Live',Today:'Today',Tomorrow:'Tomorrow',All:'All'} as any)[k],({Live:'مباشر',Today:'اليوم',Tomorrow:'غداً',All:'الكل'} as any)[k])}{k==='Live'&&<i/>}</button>)}</div><button className={favoritesOnly?'active':''} onClick={()=>setFavoritesOnly(v=>!v)}><Star size={14}/>{words('Favourites','المفضلة')}</button><button onClick={()=>setSort(v=>v==='time'?'league':'time')}>{sort==='time'?words('Time','الوقت'):words('League','الدوري')} ↕</button></div>
  {live&&<section className="sb-live-feature"><div className="sb-live-feature-top"><span><i/> {words('LIVE MATCH · FEATURED','مباراة مباشرة · مميزة')}</span><small>{words('LIVE DATA','بيانات مباشرة')}</small></div><div className="sb-live-feature-teams"><div><TeamBadge name={live.home} code={live.homeCode}/><b>{live.home}</b></div><strong>{live.score||'—'}<small>{liveMinute?liveMinute+'′':'LIVE'}</small></strong><div><TeamBadge name={live.away} code={live.awayCode}/><b>{live.away}</b></div></div><div className="sb-live-feature-markets">{['1','X','2'].map((label,i)=><button key={label} disabled={live.odds[i]===null||live.odds[i]===undefined} className={slip.some(p=>p.id===live.id+'-'+i)?'selected':''} onClick={()=>add(live,i)}><small>{label}</small><b>{live.odds[i]===null||live.odds[i]===undefined?'—':live.odds[i]!.toFixed(2)}</b></button>)}</div></section>}
  {grouped.map(group=><section className="sb-league-group" key={group.league}><button className="sb-league-heading" onClick={()=>setCompetition(group.league)}><span className="sb-league-icon">⚽</span><b>{catLabel(group.league)}</b><small>{group.matches.length}</small><ChevronRight size={16}/></button>{group.matches.map(renderMatch)}</section>)}
  {!live&&!grouped.length&&<div className="empty"><Trophy size={28}/><h3>{feedLoading?words('Loading real fixtures…','جارٍ تحميل المباريات…'):providerConfigured?words('No matches found','لا توجد مباريات'):words('Sports feed is not connected','مصدر البيانات الرياضية غير متصل')}</h3><p>{feedMessage||words('Fixtures and odds will appear here after the sports provider is configured and synced.','ستظهر المباريات والاحتمالات هنا بعد إعداد مزود البيانات ومزامنته.')}</p></div>}
  {slip.length>0&&<><button className="sb-ticket-launcher" onClick={()=>setTicketOpen(true)}><span className="sb-ticket-icon"><TicketPercent size={19}/><i>{slip.length}</i></span><span><b>{words('BET SLIP','قسيمة الرهان')}</b><small>{slip.length} {words('selection(s)','اختيار')} · {words('Combined odds','إجمالي الاحتمالات')} {combined.toFixed(2)}</small></span><strong>{words('VIEW TICKET','عرض القسيمة')} <ChevronRight size={16}/></strong></button>{ticketOpen&&<div className="sb-ticket-backdrop" onClick={()=>setTicketOpen(false)}><section className="sb-ticket-sheet" onClick={e=>e.stopPropagation()}><div className="sb-ticket-grabber"/><div className="sb-ticket-heading"><div><span className="eyebrow">{words('YOUR SELECTIONS','اختياراتك')}</span><h3><TicketPercent size={19}/> {words('Bet slip','قسيمة الرهان')} <em>{slip.length}</em></h3></div><button onClick={()=>setTicketOpen(false)} aria-label="Close ticket"><X size={20}/></button></div><div className="sb-ticket-mode"><b>{words('Single / Accumulator','مفرد / تراكمي')}</b><small>{quoteLoading?words('Validating selections against current server odds…','جارٍ التحقق من الاختيارات مقابل الأسعار الحالية…'):quoteError?quoteError:ticketQuote?words('Server-validated demo quote · no bet placed','تم التحقق من الأسعار · لم يتم وضع رهان'):words('Waiting for server validation','بانتظار التحقق من الخادم')}</small></div>{slip.map(p=><div className="slip-pick" key={p.id}><div><b>{p.fixture}</b><small>{p.league} · {p.outcome}</small></div><strong>{p.odd.toFixed(2)}</strong><button onClick={()=>setSlip(old=>old.filter(x=>x.id!==p.id))} aria-label="Remove selection"><X size={15}/></button></div>)}<div className="stake-row"><label htmlFor="stage4-stake">{words('Stake (USD)','قيمة الرهان بالدولار')}</label><small className="stake-available">{words('Demo reference balance: ','الرصيد التجريبي المرجعي: ')}${walletBalance.toFixed(2)}</small><div><button onClick={()=>setStake(String(Math.max(1,(Number(stake)||1)-5)))}><Minus size={14}/></button><input id="stage4-stake" type="number" min="1" max={Math.min(5000,walletBalance)} step="0.01" value={stake} onChange={e=>setStake(e.target.value)}/><button onClick={()=>setStake(String(Math.min(5000,walletBalance,(Number(stake)||0)+5)))}><Plus size={14}/></button></div></div><div className="slip-totals"><span>{words('Combined odds','إجمالي الاحتمالات')} <b>{combined.toFixed(2)}</b></span><span>{words('Potential return','العائد المحتمل')} <strong>{valid?'$'+(amount*combined).toFixed(2):'—'}</strong></span></div>{submitTicketError&&<p className="detail-disclaimer" role="alert">{submitTicketError}</p>}<button className="place-demo" onClick={record} disabled={!valid||!ticketQuote||quoteLoading||submittingTicket}>{submittingTicket?words('Saving ticket…','جارٍ حفظ القسيمة…'):words('Save demo ticket','حفظ القسيمة التجريبية')} <ArrowRight size={16}/></button><button className="sb-ticket-clear" onClick={()=>{setSlip([]);setTicketOpen(false)}}>{words('Clear ticket','مسح القسيمة')}</button><p className="detail-disclaimer">{words('Demo only. No real money moves. The demo wallet balance is reduced by the stake.','للعرض التجريبي فقط. يتم حفظ القسيمة للتتبع دون خصم أي رصيد أو وضع رهان بأموال حقيقية.')}</p></section></div>}</>}
 </div>;
}

export function StageFourBets({onBrowse}:{onBrowse:()=>void}){
 const [bets,setBets]=useState<Bet[]>(()=>readJson<Bet[]>('coderush-stage4-bets',[]));
 const [slip,setSlip]=useState<Selection[]>(readSelections);
 const [view,setView]=useState<'Active'|'Settled'>('Active');
 const [showMoreBets,setShowMoreBets]=useState(false);
 const isArabic=document.documentElement.lang==='ar'||document.documentElement.dir==='rtl';
 useEffect(()=>{
  let active=true;
  const refresh=async()=>{
   try{const response=await fetch('/api/bets?limit=50',{credentials:'same-origin',cache:'no-store'});const body=await response.json();if(!response.ok||!body?.ok)throw new Error(body?.error||'Unable to load ticket history');if(active)setBets(Array.isArray(body.bets)?body.bets:[]);}
   catch{if(active)setBets([]);}
   setSlip(readSelections());
  };
  refresh();window.addEventListener('focus',refresh);window.addEventListener('coderush:bets-updated',refresh);
  return()=>{active=false;window.removeEventListener('focus',refresh);window.removeEventListener('coderush:bets-updated',refresh)};
 },[]);
 const labels=isArabic?{profit:'صافي الأرباح',return:'العائد المحتمل',accuracy:'الدقة',streak:'سلسلة الفوز',best:'أفضل عائد',open:'مفتوحة',wins:'الفوز',active:'قيد اللعب',settled:'المُخلّصة',none:'لا رهانات مفتوحة',hint:'اختر مباراة وتوقّع نتيجتها قبل انطلاقها.',browse:'تصفّح المباريات',settledNone:'لا رهانات مُخلّصة',settledHint:'ستظهر رهاناتك المُخلّصة هنا بعد اكتمالها.',recorded:'رهانات تجريبية مسجّلة',stake:'قيمة الرهان',potential:'العائد المحتمل',demo:'تجريبي'}:{profit:'NET PROFIT',return:'POTENTIAL RETURN',accuracy:'accuracy',streak:'Win streak',best:'Best return',open:'Open',wins:'Wins',active:'Active',settled:'Settled',none:'No open bets',hint:'Choose a match and predict its result before it starts.',browse:'Browse matches',settledNone:'No settled bets',settledHint:'Your settled bets will appear here when completed.',recorded:'Recorded demo bets',stake:'Stake (USD)',potential:'Potential return',demo:'DEMO'};
 const activeBets=bets.filter(b=>!b.status||b.status==='open');
 const settledBets=bets.filter(b=>b.status==='won'||b.status==='lost'||b.status==='void');
 const displayedBets=view==='Active'?activeBets:settledBets;
 const activeCount=activeBets.length;
 const shownBets=showMoreBets?displayedBets:displayedBets.slice(0,3);
 return <div className="mybets-page" dir={isArabic?'rtl':'ltr'}>
  <section className="mybets-performance"><div className="mybets-performance-main"><div className="mybets-profit-copy"><small>{labels.profit}</small><b>+$0.00</b><em>↗ +0.0% {labels.return}</em></div><div className="mybets-accuracy"><b>0%</b><small>{labels.accuracy}</small></div></div><div className="mybets-progress"><span/><i/></div><div className="mybets-stats"><div><small>{labels.wins}</small><b>0/0</b></div><div><small>{labels.open}</small><b>{activeCount}</b></div><div><small>{labels.best}</small><b>—</b></div><div><small>{labels.streak}</small><b>0</b></div></div></section>
  <div className="mybets-tabs"><button className={view==='Active'?'active':''} onClick={()=>setView('Active')}><Activity size={16}/><span>{labels.active}</span><b>{activeCount}</b></button><button className={view==='Settled'?'active':''} onClick={()=>setView('Settled')}><TicketPercent size={16}/><span>{labels.settled}</span><b>0</b></button></div>
  {displayedBets.length>0?<><div className="mybets-history-heading"><h3>{labels.recorded}</h3><span>{displayedBets.length}</span></div>{shownBets.map(b=><article className="demo-bet-card mybets-recorded-card" key={b.id}><div className="demo-bet-top"><span>{b.id}</span><span className="demo-open">RECORDED · DEMO</span></div>{b.selections.map(p=><div className="history-pick" key={p.id}><b>{p.fixture}</b><small>{p.outcome} · {p.odd.toFixed(2)}</small></div>)}<div className="history-bottom"><span>{labels.stake} <b>{'$'+b.stake.toFixed(2)}</b></span><span>{labels.potential} <b>{'$'+b.potential.toFixed(2)}</b></span></div><small className="detail-disclaimer">{new Date(b.createdAt).toLocaleString(isArabic?'ar':'en-US')}</small></article>)}{displayedBets.length>3&&<button className="match-view-more mybets-view-more" onClick={()=>setShowMoreBets(v=>!v)}>{showMoreBets?(isArabic?'عرض أقل':'Show fewer bets'):(isArabic?'عرض المزيد من الرهانات':'View more bets')} <ChevronRight size={17}/></button>}</>:view==='Active'&&displayedBets.length===0&&<section className="mybets-empty"><div className="mybets-ticket-art"><TicketPercent size={65} strokeWidth={1.45}/></div><h2>{labels.none}</h2><p>{labels.hint}</p><button className="mybets-browse" onClick={onBrowse}>{labels.browse}<ChevronRight size={18}/></button></section>}
  {view==='Settled'&&displayedBets.length===0&&<section className="mybets-empty"><div className="mybets-ticket-art"><TicketPercent size={65} strokeWidth={1.45}/></div><h2>{labels.settledNone}</h2><p>{labels.settledHint}</p><button className="mybets-browse" onClick={onBrowse}>{labels.browse}<ChevronRight size={18}/></button></section>}
  <p className="detail-disclaimer">Demo only · Tickets are stored for tracking; no wallet balance is debited. Potential returns are illustrative and are not paid.</p>
 </div>;
}
