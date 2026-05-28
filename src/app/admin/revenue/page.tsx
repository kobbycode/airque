'use client';

import React, { useState, useEffect } from 'react';
import {
  collection, onSnapshot, query, orderBy, addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEMO_MODE } from '@/lib/demo';

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
      alert(`Payout request submitted successfully for $${pendingAmount}!`);
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
          className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-md hover:opacity-90 active:scale-95 transition-opacity flex items-center gap-1 shadow-md disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-sm">account_balance_wallet</span>
          {requesting ? 'Processing…' : 'Request Payout'}
        </button>
      </div>

      {/* Revenue Grid */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white border border-outline-variant p-6 rounded-xl flex flex-col gap-2 shadow-sm border-l-4 border-l-primary">
          <div className="flex justify-between items-center">
            <span className="font-label-md text-on-surface-variant uppercase tracking-wider text-xs">Total Earnings (YTD)</span>
            <span className="material-symbols-outlined text-primary">monetization_on</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display-lg text-display-lg text-on-surface">
              ${totalYTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-green-600 font-label-md text-xs font-bold">+18.2%</span>
          </div>
          <p className="text-body-sm text-[12px] text-on-surface-variant">Cleared and pending balances</p>
        </div>

        <div className="bg-white border border-outline-variant p-6 rounded-xl flex flex-col gap-2 shadow-sm border-l-4 border-l-secondary">
          <div className="flex justify-between items-center">
            <span className="font-label-md text-on-surface-variant uppercase tracking-wider text-xs">Audio Ad Networks</span>
            <span className="material-symbols-outlined text-secondary">campaign</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display-lg text-display-lg text-on-surface">
              ${adNetworkShare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-green-600 font-label-md text-xs font-bold">+14.4%</span>
          </div>
          <p className="text-body-sm text-[12px] text-on-surface-variant">Pre-roll & mid-roll insertions</p>
        </div>

        <div className="bg-white border border-outline-variant p-6 rounded-xl flex flex-col gap-2 shadow-sm border-l-4 border-l-tertiary">
          <div className="flex justify-between items-center">
            <span className="font-label-md text-on-surface-variant uppercase tracking-wider text-xs">Premium Support</span>
            <span className="material-symbols-outlined text-tertiary">card_membership</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display-lg text-display-lg text-on-surface">
              ${premiumShare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-green-600 font-label-md text-xs font-bold">+22.8%</span>
          </div>
          <p className="text-body-sm text-[12px] text-on-surface-variant">Direct listener subscriptions</p>
        </div>

        <div className="bg-white border border-outline-variant p-6 rounded-xl flex flex-col gap-2 shadow-sm border-l-4 border-l-outline">
          <div className="flex justify-between items-center">
            <span className="font-label-md text-on-surface-variant uppercase tracking-wider text-xs">Sponsorships</span>
            <span className="material-symbols-outlined text-outline">handshake</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display-lg text-display-lg text-on-surface">
              ${sponsorshipShare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-on-surface-variant font-label-md text-xs">Stable</span>
          </div>
          <p className="text-body-sm text-[12px] text-on-surface-variant">Corporate station partners</p>
        </div>
      </section>

      {/* Analytics Chart & Summary */}
      <div className="grid grid-cols-12 gap-6">
        {/* Payout Channels Breakdown */}
        <section className="col-span-12 lg:col-span-7 bg-white border border-outline-variant rounded-xl p-6 flex flex-col gap-4 shadow-sm">
          <h3 className="font-headline-md text-headline-md font-bold">Monthly Payout Breakdown</h3>
          <div className="space-y-4 pt-4">
            <div>
              <div className="flex justify-between text-body-sm mb-1">
                <span>Ad Insertion CPM (Average $4.20)</span>
                <span className="font-bold font-code">${(adNetworkShare * 0.22).toLocaleString('en-US', { maximumFractionDigits: 2 })} this month</span>
              </div>
              <div className="w-full bg-surface-container-low h-2 rounded-full overflow-hidden">
                <div className="bg-primary h-full transition-all duration-500" style={{ width: '60%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-body-sm mb-1">
                <span>Direct Mobile Money Support (MTN MoMo / Telecel)</span>
                <span className="font-bold font-code">${(premiumShare * 0.22).toLocaleString('en-US', { maximumFractionDigits: 2 })} this month</span>
              </div>
              <div className="w-full bg-surface-container-low h-2 rounded-full overflow-hidden">
                <div className="bg-secondary h-full transition-all duration-500" style={{ width: '38%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-body-sm mb-1">
                <span>Premium Ad-Free Tiers</span>
                <span className="font-bold font-code">${(premiumShare * 0.08).toLocaleString('en-US', { maximumFractionDigits: 2 })} this month</span>
              </div>
              <div className="w-full bg-surface-container-low h-2 rounded-full overflow-hidden">
                <div className="bg-tertiary h-full transition-all duration-500" style={{ width: '12%' }}></div>
              </div>
            </div>
          </div>
        </section>

        {/* Payout Info Alert Box */}
        <section className="col-span-12 lg:col-span-5 bg-white border border-outline-variant rounded-xl p-6 flex flex-col justify-between shadow-sm">
          <div>
            <h3 className="font-headline-md text-headline-md mb-2 font-bold">Next Scheduled Payout</h3>
            <p className="text-body-sm text-on-surface-variant">Earnings are processed on the 1st of every month automatically to your connected bank/wallet account.</p>
          </div>
          <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 flex flex-col gap-2 mt-4">
            <div className="flex justify-between items-center text-body-sm">
              <span className="text-on-surface-variant">Target Bank:</span>
              <span className="font-bold text-on-surface">Ecobank Ghana (Accra Hub)</span>
            </div>
            <div className="flex justify-between items-center text-body-sm">
              <span className="text-on-surface-variant">Account Code:</span>
              <span className="font-bold font-code text-on-surface">**** 9428</span>
            </div>
            <div className="flex justify-between items-center text-body-sm">
              <span className="text-on-surface-variant">Estimated Payout:</span>
              <span className="font-bold text-green-600 font-code">
                ${totalPending > 0 ? totalPending.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '5,784.30'}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Transactions List */}
      <section className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-outline-variant flex justify-between items-center">
          <h3 className="font-headline-md text-headline-md font-bold">Payout Ledger</h3>
          <span className="text-xs text-on-surface-variant bg-surface-container-low border border-outline-variant/40 px-3 py-1 rounded-full font-semibold">
            {transactions.length} Total Transaction{transactions.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="p-6 font-label-md text-on-surface-variant uppercase tracking-wider text-xs">Transaction ID</th>
                <th className="p-6 font-label-md text-on-surface-variant uppercase tracking-wider text-xs">Date</th>
                <th className="p-6 font-label-md text-on-surface-variant uppercase tracking-wider text-xs">Method</th>
                <th className="p-6 font-label-md text-on-surface-variant uppercase tracking-wider text-xs">Amount</th>
                <th className="p-6 font-label-md text-on-surface-variant uppercase tracking-wider text-xs">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant font-code text-body-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-on-surface-variant">
                    <div className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-outline-variant border-t-primary rounded-full animate-spin" />
                      <span>Loading ledger database...</span>
                    </div>
                  </td>
                </tr>
              ) : (
                transactions.map(txn => (
                  <tr key={txn.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="p-6 text-on-surface font-bold">{txn.txnId}</td>
                    <td className="p-6 font-body-sm text-on-surface">{txn.date}</td>
                    <td className="p-6 font-body-sm text-on-surface">{txn.method}</td>
                    <td className="p-6 text-on-surface font-bold">
                      ${txn.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-6">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        txn.status === 'PAID'
                          ? 'bg-green-100 text-green-700'
                          : txn.status === 'PENDING'
                          ? 'bg-primary/10 text-primary animate-pulse'
                          : 'bg-error-container/20 text-error'
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
