import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock3, ShieldCheck, Wallet, Info } from 'lucide-react';
type Tx={id:string;type:'Deposit'|'Withdrawal';amount:number;createdAt:string;status:'Recorded'|'Declined'};
const KEY_BALANCE='coderush-stage6-demo-balance',KEY_TX='coderush-stage6-demo-transactions';
const getBalance=()=>{const n=Number(localStorage.getItem(KEY_BALANCE));return Number.isFinite(n)&&n>=0?n:125};
const getTransactions=():Tx[]=>{try{return JSON.parse(localStorage.getItem(KEY_TX)||'[]')}catch{return []}};
export function StageSixWallet(){
 const [balance,setBalance]=useState(getBalance);
 const [transactions,setTransactions]=useState<Tx[]>(getTransactions);
 const [amount,setAmount]=useState('25');
 const [mode,setMode]=useState<'Deposit'|'Withdrawal'>('Deposit');
 const [message,setMessage]=useState('');
 const value=Number(amount),valid=Number.isFinite(value)&&value>=1&&value<=10000;
 const format=(n:number)=>n.toLocaleString(document.documentElement.lang==='ar'?'ar':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const save=(nextBalance:number,nextTx:Tx[])=>{setBalance(nextBalance);setTransactions(nextTx);localStorage.setItem(KEY_BALANCE,String(nextBalance));localStorage.setItem(KEY_TX,JSON.stringify(nextTx))};
 const submit=()=>{if(!valid){setMessage('Enter an amount between 1 and 10,000 demo USDT.');return}if(mode==='Withdrawal'&&value>balance){setMessage('Insufficient demo balance. No transaction was made.');return}const nextBalance=mode==='Deposit'?balance+value:balance-value;const tx:Tx={id:'CR-DEMO-'+Date.now(),type:mode,amount:value,createdAt:new Date().toISOString(),status:'Recorded'};save(nextBalance,[tx,...transactions]);setMessage('Demo '+mode.toLowerCase()+' recorded. No funds moved.');};
 const reset=()=>{save(125,[]);setMessage('Demo wallet reset to its starting balance.');};
 const totalDeposits=useMemo(()=>transactions.filter(t=>t.type==='Deposit').reduce((s,t)=>s+t.amount,0),[transactions]);
 const totalWithdrawals=useMemo(()=>transactions.filter(t=>t.type==='Withdrawal').reduce((s,t)=>s+t.amount,0),[transactions]);
 return <><section className="page-title"><span className="eyebrow">YOUR DEMO FUNDS</span><h1>Wallet</h1><p>Review your sample balance and locally recorded wallet activity.</p></section>
 <section className="stage6-wallet-card"><div className="stage6-wallet-head"><span><Wallet size={17}/> CODE RUSH WALLET</span><span className="demo-tag">SIMULATED</span></div><small>AVAILABLE DEMO BALANCE</small><h2>{format(balance)} <em>USDT</em></h2><div className="stage6-wallet-foot"><span><ShieldCheck size={13}/> Demo account only</span><span>TRC-20 preview</span></div></section>
 <section className="stage6-totals"><div><ArrowDownLeft size={16}/><small>Total deposits</small><b>{format(totalDeposits)}</b></div><div><ArrowUpRight size={16}/><small>Total withdrawals</small><b>{format(totalWithdrawals)}</b></div><div><Clock3 size={16}/><small>Today's rewards</small><b>$0.00</b></div><div><Wallet size={16}/><small>Total profit</small><b>$0.00</b></div></section>
 <section className="stage6-action-card"><div className="stage6-mode"><button className={mode==='Deposit'?'active':''} onClick={()=>{setMode('Deposit');setMessage('')}}><ArrowDownLeft size={15}/> Deposit</button><button className={mode==='Withdrawal'?'active':''} onClick={()=>{setMode('Withdrawal');setMessage('')}}><ArrowUpRight size={15}/> Withdraw</button></div>
 <label htmlFor="stage6-amount">AMOUNT (DEMO USDT)</label><div className="stage6-amount"><input id="stage6-amount" type="number" min="1" max="10000" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/><span>USDT</span></div><div className="stage6-network"><span>Network</span><b>TRON · TRC-20 (display only)</b><small>USDT · 100% · simulated wallet</small></div><button className="stage6-submit" onClick={submit} disabled={!valid}>{mode==='Deposit'?'Simulate deposit':'Simulate withdrawal'}</button>
 {message&&<div className="stage6-message"><Info size={14}/>{message}</div>}</section>
 <section className="stage6-notice"><Info size={16}/><p><b>Demo safety notice</b> No wallet is connected. No deposit address, QR code, blockchain transaction, payment, or withdrawal request is created. Actions only update sample data stored in this browser.</p></section>
 <section className="stage6-history"><div className="section-head"><div><span className="eyebrow">YOUR WALLET ACTIVITY</span><h2>Transactions</h2></div><span className="demo-tag">{transactions.length} DEMO</span></div>
 {transactions.length?transactions.map(tx=><article className="stage6-tx" key={tx.id}><span className={tx.type==='Deposit'?'stage6-tx-icon deposit':'stage6-tx-icon withdrawal'}>{tx.type==='Deposit'?<ArrowDownLeft size={17}/>:<ArrowUpRight size={17}/>}</span><div className="stage6-tx-copy"><b>{tx.type}</b><small>{new Date(tx.createdAt).toLocaleString(document.documentElement.lang==='ar'?'ar':'en-US')}</small><small>{tx.id}</small></div><div className="stage6-tx-amount"><b className={tx.type==='Deposit'?'positive':'negative'}>{tx.type==='Deposit'?'+':'−'}{format(tx.amount)}</b><small><CheckCircle2 size={11}/> Recorded</small></div></article>):<div className="empty"><Clock3 size={27}/><h3>No transactions yet</h3><p>Use the controls above to create a clearly labelled local demo entry.</p></div>}
 <button className="stage6-reset" onClick={reset}>Reset demo wallet</button></section></>;
}
