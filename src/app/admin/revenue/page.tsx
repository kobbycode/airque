'use client';

import React, { useState, useEffect } from 'react';
import {
  collection, onSnapshot, query, orderBy, addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEMO_MODE } from '@/lib/demo';
import { useAlert } from '@/components/CustomAlert';

interface Transaction {
  id: string;
  txnId: string;
  date: string;
  method: string;
  amount: number;
  status: 'PAID' | 'PENDING' | 'FAILED';
}

const SEED_TRANSACTIONS: Omit<Transaction, 'id'>[] = [
  {
    txnId: 'TXN-90248231',
    date: 'May 01, 2026',
    method: 'Bank Wire Transfer',
    amount: 4892.40,
    status: 'PAID'
  },
  {
    txnId: 'TXN-89237429',
    date: 'Apr 01, 2026',
    method: 'MTN Mobile Money',
    amount: 3110.20,
    status: 'PAID'
  },
  {
    txnId: 'TXN-88127494',
    date: 'Mar 01, 2026',
    method: 'Bank Wire Transfer',
    amount: 4180.00,
    status: 'PAID'
  }
];

export default function RevenuePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const { showAlert } = useAlert();

  // Firestore transaction dynamic sync & seeding
  useEffect(() => {
    const q = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, async snap => {
      if (snap.empty && DEMO_MODE) {
        console.log('Seeding default transactions in database...');
        try {
          const promises = SEED_TRANSACTIONS.map(item =>
            addDoc(collection(db, 'transactions'), {
              ...item,
              createdAt: serverTimestamp()
            })
          );
          await Promise.all(promises);
        } catch (err) {
          console.error('Failed to seed transactions:', err);
        }
      } else {
        const list = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        } as Transaction));
        setTransactions(list);
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const handleRequestPayout = async () => {
    // Generate a random pending payout amount between $1,500 and $5,000
    const pendingAmount = parseFloat((1500 + Math.random() * 3500).toFixed(2));
    const randomId = `TXN-${Math.floor(10000000 + Math.random() * 90000000)}`;
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

    setRequesting(true);
    try {
      await addDoc(collection(db, 'transactions'), {
        txnId: randomId,
        date: dateStr,
        method: 'MTN Mobile Money',
        amount: pendingAmount,
        status: 'PENDING',
        createdAt: serverTimestamp()
      });
      showAlert({
        title: 'Payout Request Queued',
        message: `Payout request submitted successfully for $${pendingAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}!`,
        type: 'success',
        confirmText: 'Done'
      });
    } catch (err) {
      console.error('Failed to submit payout:', err);
    } finally {
      setRequesting(false);
    }
  };

  // Compute dynamic stats based on Firestore transactions
  const totalPaid = transactions
    .filter(t => t.status === 'PAID')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalPending = transactions
    .filter(t => t.status === 'PENDING')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalYTD = totalPaid + totalPending;

  // Let's dynamically partition the ad share vs premium based on transactions
  const adNetworkShare = totalYTD * 0.58;
  const premiumShare = totalYTD * 0.32;
  const sponsorshipShare = totalYTD * 0.10;

  return (
    <div className="flex-1 overflow-y-auto p-[32px] custom-scrollbar space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Revenue Manager</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Track streaming ad network earnings, station sponsorships, and premium listener subscriptions in real-time</p>
        </div>
        <button
          onClick={handleRequestPayout}
          disabled={requesting}
          className="bg-primary text-black px-6 py-3 rounded-xl font-label-md font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm font-bold">account_balance_wallet</span>
          {requesting ? 'Processing…' : 'Request Payout'}
        </button>
      </div>

      {/* Revenue Grid */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6 text-white">
        <div className="modern-glass border border-white/5 p-6 rounded-2xl flex flex-col gap-2 hover:-translate-y-1 transition-transform border-l-4 border-l-primary shadow-lg">
          <div className="flex justify-between items-center mb-1">
            <span className="font-label-md text-white/50 uppercase tracking-widest text-[10px]">Total Earnings (YTD)</span>
            <span className="material-symbols-outlined text-primary">monetization_on</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display-lg text-[28px] font-black text-white leading-none mt-1">
              ${totalYTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-emerald-400 font-label-md text-xs font-bold">+18.2%</span>
          </div>
          <p className="text-[11px] text-white/40 font-medium mt-1">Cleared and pending balances</p>
        </div>

        <div className="modern-glass border border-white/5 p-6 rounded-2xl flex flex-col gap-2 hover:-translate-y-1 transition-transform border-l-4 border-l-secondary shadow-lg">
          <div className="flex justify-between items-center mb-1">
            <span className="font-label-md text-white/50 uppercase tracking-widest text-[10px]">Audio Ad Networks</span>
            <span className="material-symbols-outlined text-secondary">campaign</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display-lg text-[28px] font-black text-white leading-none mt-1">
              ${adNetworkShare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-emerald-400 font-label-md text-xs font-bold">+14.4%</span>
          </div>
          <p className="text-[11px] text-white/40 font-medium mt-1">Pre-roll & mid-roll insertions</p>
        </div>

        <div className="modern-glass border border-white/5 p-6 rounded-2xl flex flex-col gap-2 hover:-translate-y-1 transition-transform border-l-4 border-l-tertiary shadow-lg">
          <div className="flex justify-between items-center mb-1">
            <span className="font-label-md text-white/50 uppercase tracking-widest text-[10px]">Premium Support</span>
            <span className="material-symbols-outlined text-tertiary">card_membership</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display-lg text-[28px] font-black text-white leading-none mt-1">
              ${premiumShare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-emerald-400 font-label-md text-xs font-bold">+22.8%</span>
          </div>
          <p className="text-[11px] text-white/40 font-medium mt-1">Direct listener subscriptions</p>
        </div>

        <div className="modern-glass border border-white/5 p-6 rounded-2xl flex flex-col gap-2 hover:-translate-y-1 transition-transform border-l-4 border-l-outline shadow-lg">
          <div className="flex justify-between items-center mb-1">
            <span className="font-label-md text-white/50 uppercase tracking-widest text-[10px]">Sponsorships</span>
            <span className="material-symbols-outlined text-white/40">handshake</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display-lg text-[28px] font-black text-white leading-none mt-1">
              ${sponsorshipShare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-white/40 font-label-md text-xs">Stable</span>
          </div>
          <p className="text-[11px] text-white/40 font-medium mt-1">Corporate station partners</p>
        </div>
      </section>

      {/* Analytics Chart & Summary */}
      <div className="grid grid-cols-12 gap-6">
        {/* Payout Channels Breakdown */}
        <section className="col-span-12 lg:col-span-7 modern-glass border border-white/5 rounded-2xl p-6 flex flex-col gap-4 text-white">
          <h3 className="font-headline-md text-white font-bold">Monthly Payout Breakdown</h3>
          <div className="space-y-4 pt-4">
            <div>
              <div className="flex justify-between text-sm mb-1 text-white/80">
                <span>Ad Insertion CPM (Average $4.20)</span>
                <span className="font-bold text-primary font-mono">${(adNetworkShare * 0.22).toLocaleString('en-US', { maximumFractionDigits: 2 })} this month</span>
              </div>
              <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
                <div className="bg-primary h-full transition-all duration-500" style={{ width: '60%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1 text-white/80">
                <span>Direct Mobile Money Support (MTN MoMo / Telecel)</span>
                <span className="font-bold text-secondary font-mono">${(premiumShare * 0.22).toLocaleString('en-US', { maximumFractionDigits: 2 })} this month</span>
              </div>
              <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
                <div className="bg-secondary h-full transition-all duration-500" style={{ width: '38%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1 text-white/80">
                <span>Premium Ad-Free Tiers</span>
                <span className="font-bold text-tertiary font-mono">${(premiumShare * 0.08).toLocaleString('en-US', { maximumFractionDigits: 2 })} this month</span>
              </div>
              <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
                <div className="bg-tertiary h-full transition-all duration-500" style={{ width: '12%' }}></div>
              </div>
            </div>
          </div>
        </section>

        {/* Payout Info Alert Box */}
        <section className="col-span-12 lg:col-span-5 modern-glass border border-white/5 rounded-2xl p-6 flex flex-col justify-between text-white">
          <div>
            <h3 className="font-headline-md text-white mb-2 font-bold">Next Scheduled Payout</h3>
            <p className="text-sm text-white/50 leading-relaxed">Earnings are processed on the 1st of every month automatically to your connected bank/wallet account.</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-2 mt-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/40">Target Bank:</span>
              <span className="font-bold text-white/90">Ecobank Ghana (Accra Hub)</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/40">Account Code:</span>
              <span className="font-bold font-mono text-white/90">**** 9428</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/40">Estimated Payout:</span>
              <span className="font-bold text-emerald-400 font-mono">
                ${totalPending > 0 ? totalPending.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '5,784.30'}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Transactions List */}
      <section className="modern-glass border border-white/5 rounded-2xl overflow-hidden shadow-lg">
        <div className="p-6 border-b border-white/5 flex justify-between items-center">
          <h3 className="font-headline-md text-white font-bold">Payout Ledger</h3>
          <span className="text-xs text-white/50 bg-white/5 border border-white/10 px-3 py-1 rounded-full font-semibold">
            {transactions.length} Total Transaction{transactions.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5">
                <th className="p-6 text-xs uppercase text-white/40 tracking-wider font-bold">Transaction ID</th>
                <th className="p-6 text-xs uppercase text-white/40 tracking-wider font-bold">Date</th>
                <th className="p-6 text-xs uppercase text-white/40 tracking-wider font-bold">Method</th>
                <th className="p-6 text-xs uppercase text-white/40 tracking-wider font-bold">Amount</th>
                <th className="p-6 text-xs uppercase text-white/40 tracking-wider font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono text-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-white/40">
                    <div className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/20 border-t-primary rounded-full animate-spin" />
                      <span className="font-sans text-xs">Loading ledger database...</span>
                    </div>
                  </td>
                </tr>
              ) : (
                transactions.map(txn => (
                  <tr key={txn.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-6 text-white/95 font-bold">{txn.txnId}</td>
                    <td className="p-6 font-sans text-white/70">{txn.date}</td>
                    <td className="p-6 font-sans text-white/70">{txn.method}</td>
                    <td className="p-6 text-white/90 font-bold font-mono">
                      ${txn.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-6">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase border ${
                        txn.status === 'PAID'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : txn.status === 'PENDING'
                          ? 'bg-primary/10 text-primary border-primary/20 animate-pulse'
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>
                        {txn.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
