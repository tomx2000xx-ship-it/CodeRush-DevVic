import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, ChevronRight, Copy, Gift, Link2, Users, Wallet, Sparkles } from 'lucide-react';

type Notice={id:string;title:string;body:string;category:'Rewards'|'Activity'|'Updates';date:string;read:boolean};
const initialNotices:Notice[]=[
{id:'n1',title:'Welcome to CodeRush',body:'Your demo profile is ready. Explore matches, sample selections and your personal arena.',category:'Updates',date:'Just now',read:false},
{id:'n2',title:'Your referral rewards',body:'Your invite dashboard shows how the three-level demo commission structure works.',category:'Rewards',date:'Today',read:false},
{id:'n3',title:'Match centre is ready',body:'Browse sample fixtures and add an outcome to your demo slip. No real bets are placed.',category:'Activity',date:'Today',read:true},
{id:'n4',title:'Demo wallet reminder',body:'All displayed balances and wallet activity are simulated and have no cash value.',category:'Updates',date:'Yesterday',read:true}
];
const safeRead=():Notice[]=>{try{const raw=localStorage.getItem('coderush-stage5-notifications');return raw?JSON.parse(raw):initialNotices}catch{return initialNotices}};
export function StageFiveFriends(){
 const [copied,setCopied]=useState(false);
 const [code]=useState(()=>{let v=localStorage.getItem('coderush-stage5-referral-code');if(!v){v='CR'+Math.random().toString(36).slice(2,8).toUpperCase();localStorage.setItem('coderush-stage5-referral-code',v)}return v});
 const [inviteLink,setInviteLink]=useState('');const [linkError,setLinkError]=useState('');useEffect(()=>{let active=true;fetch('/api/telegram/link?ref='+encodeURIComponent(code)).then(r=>r.json()).then(d=>{if(active&&d?.ok&&d.referralLink)setInviteLink(d.referralLink);else if(active)setLinkError(d?.error||'Telegram invite link unavailable')}).catch(()=>{if(active)setLinkError('Open this screen inside the deployed CodeRush app to generate your Telegram link')});return()=>{active=false}},[code]);
 const copy=async()=>{try{if(!inviteLink)throw new Error(linkError||'Your Telegram invite link is still being prepared');if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(inviteLink)}else{const field=document.createElement('textarea');field.value=inviteLink;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();const ok=document.execCommand('copy');field.remove();if(!ok)throw new Error('Clipboard unavailable')}setCopied(true)}catch{setCopied(false)}};
 return <><section className="page-title"><span className="eyebrow">GROW YOUR CIRCLE</span><h1>Friends & rewards</h1><p>Share your demo invite and explore the referral programme.</p></section>
 <section className="ref-card stage5-ref"><div className="stage5-ref-icon"><Gift size={21}/></div><span className="eyebrow">REGISTRATION REWARD</span><h2>$5 <small>demo reward</small></h2><p>Illustrative reward for the demo journey. It is not withdrawable and has no cash value.</p><div className="ref-code"><span><small>YOUR INVITE CODE</small><b>{code}</b></span><button onClick={copy}><Copy size={15}/>{copied?'Copied':'Copy link'}</button></div>{!copied&&<small className="stage5-hint">{inviteLink?'Real Telegram bot deep link ready. Friends must press Start to join your message audience.':linkError||'Preparing your unique Telegram referral link…'}</small>}</section>
 <section className="stage5-stats"><div><Users size={17}/><small>Invited friends</small><b>00</b><span>Demo preview</span></div><div><Wallet size={17}/><small>Demo rewards</small><b>$0.00</b><span>No real earnings</span></div></section>
 <section className="levels stage5-levels"><div className="stage5-section-head"><div><span className="eyebrow">THREE-LEVEL PROGRAMME</span><h3>Referral commission</h3></div><Sparkles size={19}/></div>{[['Level 1','10%','Direct referrals'],['Level 2','5%','Second level'],['Level 3','3%','Third level']].map(x=><div className="stage5-level" key={x[0]}><span><b>{x[0]}</b><small>{x[2]}</small></span><strong>{x[1]}</strong></div>)}<p className="detail-disclaimer">Percentages are shown for product demonstration only. No commissions are calculated or paid.</p></section>
 <section className="stage5-activity"><div className="section-head"><div><span className="eyebrow">YOUR NETWORK</span><h2>Referral activity</h2></div><span className="demo-tag">SAMPLE VIEW</span></div><div className="empty"><Users size={25}/><h3>No referrals yet</h3><p>Your referral activity will appear here in a connected product. This demo does not create real invitations or track other users.</p></div></section></>;
}
export function StageFiveNotifications(){
 const [items,setItems]=useState<Notice[]>(safeRead);
 const [filter,setFilter]=useState<'All'|'Unread'>('All');
 const unread=useMemo(()=>items.filter(n=>!n.read).length,[items]);
 const save=(next:Notice[])=>{setItems(next);localStorage.setItem('coderush-stage5-notifications',JSON.stringify(next))};
 const markAll=()=>save(items.map(n=>({...n,read:true})));
 const visible=items.filter(n=>filter==='All'||!n.read);
 return <><section className="page-title"><span className="eyebrow">YOUR UPDATES</span><h1>Notifications</h1><p>Keep track of demo rewards, activity and product updates.</p></section>
 <div className="stage5-notice-toolbar"><div className="filter-row">{(['All','Unread'] as const).map(f=><button key={f} className={filter===f?'filter active':'filter'} onClick={()=>setFilter(f)}>{f}{f==='Unread'?' ('+unread+')':''}</button>)}</div><button className="stage5-markall" onClick={markAll} disabled={!unread}><CheckCheck size={14}/> Mark all read</button></div>
 {visible.length? <div className="stage5-notice-list">{visible.map(n=><article className={n.read?'stage5-notice read':'stage5-notice'} key={n.id} role="button" tabIndex={0} aria-label={'Mark notification as read: '+n.title} onClick={()=>save(items.map(x=>x.id===n.id?{...x,read:true}:x))} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();save(items.map(x=>x.id===n.id?{...x,read:true}:x))}}}><span className="stage5-notice-icon"><Bell size={17}/></span><div className="stage5-notice-copy"><div><b>{n.title}</b>{!n.read&&<i/>}</div><p>{n.body}</p><small>{n.category} · {n.date}</small></div><ChevronRight size={16}/></article>)}</div>:<div className="empty"><Bell size={27}/><h3>{filter==='Unread'?'You’re all caught up':'No notifications'}</h3><p>New demo updates will appear here.</p></div>}
 <p className="detail-disclaimer stage5-disclaimer">These are local sample notifications stored on this device, not messages sent by a live service.</p></>;
}
