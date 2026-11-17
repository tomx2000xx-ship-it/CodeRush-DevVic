import { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock3, Copy, Info, RefreshCw, ShieldCheck, WalletCards, X } from 'lucide-react';

type Mode='Deposit'|'Withdrawal';
type Network={network_code:string;network_name:string;deposit_address:string|null;deposits_enabled:number;withdrawals_enabled:number};
type Transaction={id:string;type:'deposit'|'withdrawal';status:string;amount_units:number;asset:string;network_code:string;tx_hash:string|null;destination_address:string|null;payout_tx_hash:string|null;created_at:string;updated_at:string;review_note?:string|null};
type WalletData={enabled:boolean;asset:string;scale:number;availableUnits:number;reservedUnits:number;minDepositUnits:number;maxDepositUnits:number;minWithdrawalUnits:number;maxWithdrawalUnits:number;networks:Network[];transactions:Transaction[]};
type Props={initialMode?:Mode|null;showHistory?:boolean;onClose?:()=>void};
const amountText=(units:number)=>((Number(units)||0)/1_000_000).toFixed(2);
const networkLabel=(code:string)=>code==='USDT_TRC20'?'TRON · TRC20':code==='USDT_ERC20'?'Ethereum · ERC20':'BNB Smart Chain · BEP20';
const statusLabel=(status:string,rtl:boolean)=>({pending_review:rtl?'قيد المراجعة':'Under review',processing:rtl?'قيد المعالجة':'Processing',completed:rtl?'مكتملة':'Completed',rejected:rtl?'مرفوضة':'Rejected'}[status]||status);
const transactionLabel=(type:string,rtl:boolean)=>type==='deposit'?(rtl?'إيداع':'Deposit'):(rtl?'سحب':'Withdrawal');

export function StageSixWallet({initialMode,showHistory=false,onClose}:Props){
 const rtl=document.documentElement.lang.toLowerCase().startsWith('ar');
 const t=(en:string,ar:string)=>rtl?ar:en;
 const [wallet,setWallet]=useState<WalletData|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const [mode,setMode]=useState<Mode>('Deposit'),[flowOpen,setFlowOpen]=useState(false);
 const [networkCode,setNetworkCode]=useState('USDT_TRC20'),[amount,setAmount]=useState('25'),[txHash,setTxHash]=useState(''),[destination,setDestination]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const response=await fetch('/api/wallet',{credentials:'same-origin',cache:'no-store'});
   const body=await response.json();
   if(!response.ok||!body?.ok)throw new Error(body?.error||'Unable to load wallet');
   setWallet(body.wallet as WalletData);
  }catch(e){setWallet(null);setError(e instanceof Error?e.message:'Unable to load wallet data');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();window.addEventListener('focus',load);return()=>window.removeEventListener('focus',load)},[load]);
 useEffect(()=>{if(initialMode){setMode(initialMode);setFlowOpen(true);setMessage('')}},[initialMode]);
 const close=()=>{setFlowOpen(false);setMessage('');setTxHash('');setDestination('');onClose?.()};
 const open=(next:Mode)=>{setMode(next);setFlowOpen(true);setMessage('');setAmount('25');setTxHash('');setDestination('');setNetworkCode('USDT_TRC20')};
 const selectedNetwork=wallet?.networks.find(n=>n.network_code===networkCode);
 const available=Number(wallet?.availableUnits||0),reserved=Number(wallet?.reservedUnits||0);
 const amountNumber=Number(amount),validAmount=Number.isFinite(amountNumber)&&amountNumber>0&&/^\\d{1,9}(?:\\.\\d{1,6})?$/.test(amount.trim());
 const format=(units:number)=>Number(units/1_000_000).toLocaleString(rtl?'ar':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const submit=async()=>{
  if(!wallet?.enabled){setMessage(t('The crypto wallet is not active yet.','المحفظة الرقمية غير مفعّلة حالياً.'));return}
  if(!selectedNetwork){setMessage(t('Choose a supported network.','اختر شبكة مدعومة.'));return}
  if(!validAmount){setMessage(t('Enter a valid USDT amount with up to 6 decimal places.','أدخل مبلغ USDT صحيحاً بحد أقصى 6 منازل عشرية.'));return}
  if(mode==='Deposit'&&(!selectedNetwork.deposits_enabled||!selectedNetwork.deposit_address)){setMessage(t('Deposits are not enabled for this network.','الإيداع غير متاح على هذه الشبكة.'));return}
  if(mode==='Withdrawal'&&(!selectedNetwork.withdrawals_enabled||amountNumber*1_000_000>available)){setMessage(t('This network is unavailable or your available balance is insufficient.','هذه الشبكة غير متاحة أو رصيدك المتاح غير كافٍ.'));return}
  if(mode==='Deposit'&&!/^(?:0x)?[a-fA-F0-9]{64}$/.test(txHash.trim())){setMessage(t('Enter the blockchain transaction hash (64 hexadecimal characters).','أدخل معرّف معاملة البلوكشين المكوّن من 64 خانة سداسية عشرية.'));return}
  if(mode==='Withdrawal'&&!(networkCode==='USDT_TRC20'?/^T[1-9A-HJ-NP-Za-km-z]{33}$/:/^0x[a-fA-F0-9]{40}$/).test(destination.trim())){setMessage(t('Enter a valid destination address for the selected network.','أدخل عنوان وجهة صحيحاً للشبكة المحددة.'));return}
  setBusy(true);setMessage('');
  try{
   const response=await fetch(mode==='Deposit'?'/api/wallet/deposits':'/api/wallet/withdrawals',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({amount:amount.trim(),networkCode,txHash:mode==='Deposit'?txHash.trim():undefined,destinationAddress:mode==='Withdrawal'?destination.trim():undefined,idempotencyKey:crypto.randomUUID()})});
   const body=await response.json();
   if(!response.ok||!body?.ok)throw new Error(body?.error||'Wallet request failed');
   setMessage(body.notice||t('Your request has been recorded.','تم تسجيل طلبك.'));
   await load();
   window.setTimeout(()=>{setFlowOpen(false);setTxHash('');setDestination('');setMessage('')},1300);
  }catch(e){setMessage(e instanceof Error?e.message:'Unable to submit wallet request');}
  finally{setBusy(false);}
 };
 const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);setMessage(t('Copied to clipboard.','تم النسخ.'))}catch{setMessage(value)}};
 const dashboard=<div className="wallet-history-only wallet-redesign wallet-server-view">
  <header className="wallet-page-heading"><span>{t('USDT Wallet','محفظة USDT')}</span><span className={'wallet-live-pill '+(wallet?.enabled?'active':'')}>{wallet?.enabled?t('WALLET ACTIVE','المحفظة مفعّلة'):t('NOT ACTIVATED','غير مفعّلة')}</span></header>
  <section className="wallet-server-balance"><div><span>{t('AVAILABLE BALANCE','الرصيد المتاح')}</span><strong>{format(available)} <small>USDT</small></strong><p>{t('Reserved for pending withdrawals','محجوز لطلبات السحب قيد المراجعة')}: {format(reserved)} USDT</p></div><WalletCards size={32}/></section>
  {!wallet?.enabled&&<div className="wallet-server-notice"><ShieldCheck size={19}/><div><b>{t('Crypto wallet activation is pending','تفعيل المحفظة الرقمية قيد الانتظار')}</b><p>{t('Real deposits and withdrawals remain disabled until the operator configures the supported USDT networks and enables wallet operations. Your demo ticket balance is separate and cannot be withdrawn.','الإيداعات والسحوبات الحقيقية معطّلة حتى يقوم المشغّل بإعداد شبكات USDT وتفعيل عمليات المحفظة. رصيد التذاكر التجريبي منفصل ولا يمكن سحبه.')}</p></div></div>}
  {wallet?.enabled&&<div className="wallet-server-actions"><button onClick={()=>open('Deposit')}><ArrowDownLeft size={18}/>{t('Deposit USDT','إيداع USDT')}</button><button onClick={()=>open('Withdrawal')}><ArrowUpRight size={18}/>{t('Withdraw USDT','سحب USDT')}</button></div>}
  <section className="wallet-reference-history"><div className="wallet-history-heading"><div><span>{t('SUPPORTED NETWORKS','الشبكات المدعومة')}</span><h3>{t('USDT transfer routes','مسارات تحويل USDT')}</h3></div></div>
   {(wallet?.networks||[]).map(n=><article className="wallet-network-row" key={n.network_code}><div><b>{n.network_name}</b><small>{n.network_code.replace('USDT_','USDT · ')}</small><small>{n.deposits_enabled&&n.deposit_address?t('Deposit address configured','عنوان الإيداع جاهز'):t('Deposit unavailable','الإيداع غير متاح')} · {n.withdrawals_enabled?t('Withdrawals enabled','السحب مفعّل'):t('Withdrawals unavailable','السحب غير متاح')}</small></div>{n.deposit_address&&<button onClick={()=>void copy(n.deposit_address!)} aria-label="Copy deposit address"><Copy size={16}/></button>}</article>)}
  </section>
  <section className="wallet-reference-history"><div className="wallet-history-heading"><div><span>{t('YOUR ACTIVITY','نشاطك')}</span><h3>{t('Recent transactions','المعاملات الأخيرة')}</h3></div><span>{wallet?.transactions.length||0} {t('RECORDS','عمليات')}</span></div>
   {wallet?.transactions.length?wallet.transactions.map(tx=><article className="stage6-tx" key={tx.id}><span className={tx.type==='deposit'?'stage6-tx-icon deposit':'stage6-tx-icon withdrawal'}>{tx.type==='deposit'?<ArrowDownLeft size={17}/>:<ArrowUpRight size={17}/>}</span><div className="stage6-tx-copy"><b>{transactionLabel(tx.type,rtl)} · USDT</b><small>{networkLabel(tx.network_code)}</small><small>{new Date(tx.created_at).toLocaleString(rtl?'ar':'en-US')}</small><small>{tx.tx_hash||tx.destination_address||tx.id}</small></div><div className="stage6-tx-amount"><b className={tx.type==='deposit'?'positive':'negative'}>{tx.type==='deposit'?'+':'−'}{format(tx.amount_units)}</b><small>{statusLabel(tx.status,rtl)}</small></div></article>):<div className="wallet-history-empty"><Clock3 size={22}/><span>{t('No wallet transactions recorded yet','لا توجد معاملات محفظة مسجلة بعد')}</span></div>}
  </section>
  <p className="wallet-server-footnote">{t('USDT only · Transaction amounts are stored in integer micro-units. Deposits are credited only after manual blockchain verification. Withdrawals require operator approval and a recorded payout transaction hash.','USDT فقط · يتم تخزين المبالغ بوحدات صحيحة دقيقة. لا يُضاف الإيداع إلا بعد التحقق اليدوي من البلوكشين. يتطلب السحب موافقة المشغّل وتسجيل معرّف معاملة الدفع.')}</p>
 </div>;
 if(loading&&!wallet)return <div className="wallet-history-only wallet-redesign"><div className="wallet-page-heading">{t('USDT Wallet','محفظة USDT')}</div><div className="wallet-history-empty"><RefreshCw size={20}/>{t('Loading secure wallet…','جارٍ تحميل المحفظة الآمنة…')}</div></div>;
 if(showHistory)return <>{dashboard}{error&&<p className="wallet-server-error">{error}</p>}{<button className="wallet-server-refresh" onClick={()=>void load()}><RefreshCw size={15}/>{t('Refresh wallet','تحديث المحفظة')}</button>}{flowOpen&&renderFlow()}</>;
 function renderFlow(){return <div className="wallet-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section className="wallet-flow-card" role="dialog" aria-modal="true" aria-label={mode==='Deposit'?'Deposit USDT':'Withdraw USDT'}>
  <div className="wallet-flow-heading"><div><span>{mode==='Deposit'?t('CRYPTO DEPOSIT','إيداع العملات الرقمية'):t('CRYPTO WITHDRAWAL','سحب العملات الرقمية')}</span><h3>{mode==='Deposit'?t('Deposit USDT','إيداع USDT'):t('Withdraw USDT','سحب USDT')}</h3></div><button className="wallet-flow-close" onClick={close} aria-label="Close"><X size={19}/></button></div>
  {!wallet?.enabled?<div className="wallet-server-notice"><Info size={18}/><p>{t('Wallet operations are currently disabled by the operator.','عمليات المحفظة معطّلة حالياً من قبل المشغّل.')}</p></div>:<>
   <label className="wallet-field-label">{t('NETWORK','الشبكة')}</label><select className="wallet-network-select" value={networkCode} onChange={e=>setNetworkCode(e.target.value)}>{(wallet?.networks||[]).map(n=><option key={n.network_code} value={n.network_code}>{n.network_name}</option>)}</select>
   <label className="wallet-field-label" htmlFor="stage6-amount">{t('AMOUNT · USDT','المبلغ · USDT')}</label><div className="stage6-amount wallet-amount-input"><input id="stage6-amount" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/><span>USDT</span></div>
   {mode==='Deposit'?<><div className="wallet-sample-address"><div><ShieldCheck size={16}/><b>{t('SEND ONLY ON THE SELECTED NETWORK','أرسل فقط عبر الشبكة المحددة')}</b></div>{selectedNetwork?.deposit_address?<><code>{selectedNetwork.deposit_address}</code><button onClick={()=>void copy(selectedNetwork.deposit_address!)}><Copy size={14}/>{t('Copy address','نسخ العنوان')}</button></>:<p>{t('No deposit address is configured for this network.','لم يتم إعداد عنوان إيداع لهذه الشبكة.')}</p>}</div><label className="wallet-field-label" htmlFor="stage6-txhash">{t('BLOCKCHAIN TRANSACTION HASH','معرّف معاملة البلوكشين')}</label><input className="wallet-destination-input" id="stage6-txhash" value={txHash} onChange={e=>setTxHash(e.target.value)} placeholder="64-character transaction hash"/><p className="wallet-demo-warning">{t('Your deposit remains pending until an operator verifies the transaction on-chain. Never send funds to an address that is not shown here.','سيظل إيداعك قيد المراجعة حتى يتحقق المشغّل من المعاملة على الشبكة. لا ترسل الأموال إلى عنوان غير معروض هنا.')}</p></>:<><label className="wallet-field-label" htmlFor="stage6-destination">{t('YOUR USDT DESTINATION ADDRESS','عنوان استقبال USDT')}</label><input className="wallet-destination-input" id="stage6-destination" value={destination} onChange={e=>setDestination(e.target.value)} placeholder={networkCode==='USDT_TRC20'?'T…':'0x…'}/><p className="wallet-demo-warning">{t('The requested amount is reserved immediately. An operator reviews the request and records the on-chain payout before it is marked completed.','يتم حجز المبلغ المطلوب فوراً. يراجع المشغّل الطلب ويسجل الدفع على الشبكة قبل اعتباره مكتملاً.')}</p></>}
   {message&&<p className="wallet-inline-message"><Info size={14}/>{message}</p>}
   <button className="wallet-flow-primary" disabled={busy||!selectedNetwork||(mode==='Deposit'?(!selectedNetwork.deposits_enabled||!selectedNetwork.deposit_address):(!selectedNetwork.withdrawals_enabled||amountNumber*1_000_000>available))} onClick={()=>void submit()}>{busy?t('Submitting…','جارٍ الإرسال…'):mode==='Deposit'?t('Submit deposit for verification','إرسال الإيداع للتحقق'):t('Submit withdrawal request','إرسال طلب السحب')}</button>
  </>}
 </section></div>}
 return <>{flowOpen&&renderFlow()}</>;
}
