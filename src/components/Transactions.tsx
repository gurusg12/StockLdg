import React, { useState, useMemo } from 'react';
import {
  ArrowLeftRight,
  Search,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Edit2,
  Trash2,
  Calendar,
  Filter,
} from 'lucide-react';
import { Transaction, TransactionType } from '../types';

interface TransactionsProps {
  transactions: Transaction[];
  onAddTransaction: () => void;
  onEditTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (transaction: Transaction) => void;
}

export const Transactions: React.FC<TransactionsProps> = ({
  transactions,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | TransactionType>('ALL');

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Type filter
      if (typeFilter !== 'ALL' && tx.type !== typeFilter) {
        return false;
      }
      // Search filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        tx.productName.toLowerCase().includes(q) ||
        (tx.description && tx.description.toLowerCase().includes(q)) ||
        tx.date.includes(q)
      );
    });
  }, [transactions, searchQuery, typeFilter]);

  // Totals for the filtered set
  const totalIn = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'IN')
      .reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);
  }, [transactions]);

  const totalOut = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'OUT')
      .reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);
  }, [transactions]);

  return (
    <div className="space-y-4 pb-8">
      {/* Top Header Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-sky-600" />
            <span>Stock Transaction History</span>
          </h2>
          <p className="text-xs text-slate-500">
            Log of all stock receipts (In) and dispatches (Out).
          </p>
        </div>

        <button
          id="transactions-add-btn"
          onClick={onAddTransaction}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-sm shadow-sky-200 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Transaction</span>
        </button>
      </div>

      {/* Filters & Search Row */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            id="transactions-search-input"
            type="text"
            placeholder="Search by product, description, date..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200/90 rounded-2xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 shadow-sm"
          />
        </div>

        {/* Type Filter Pills */}
        <div className="flex items-center p-1 bg-slate-100 border border-slate-200/70 rounded-2xl shrink-0 w-full sm:w-auto">
          <button
            onClick={() => setTypeFilter('ALL')}
            className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              typeFilter === 'ALL'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({transactions.length})
          </button>
          <button
            onClick={() => setTypeFilter('IN')}
            className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
              typeFilter === 'IN'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-700 hover:text-emerald-800'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span>In (+{totalIn})</span>
          </button>
          <button
            onClick={() => setTypeFilter('OUT')}
            className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
              typeFilter === 'OUT'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-rose-700 hover:text-rose-800'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Out (-{totalOut})</span>
          </button>
        </div>
      </div>

      {/* DESKTOP TABLE VIEW */}
      <div className="hidden md:block bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4">Product Name</th>
                <th className="py-3.5 px-4">Type</th>
                <th className="py-3.5 px-4 text-right">Quantity</th>
                <th className="py-3.5 px-4">Description / Notes</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <ArrowLeftRight className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-600">No transactions recorded</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {searchQuery || typeFilter !== 'ALL'
                        ? 'No transactions matched the active filters.'
                        : 'Record a Stock In or Stock Out transaction to see history.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const isIn = tx.type === 'IN';
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Date */}
                      <td className="py-3.5 px-4 text-slate-500 font-medium text-xs">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {tx.date}
                        </span>
                      </td>

                      {/* Product Name */}
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {tx.productName}
                      </td>

                      {/* Type Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold ${
                            isIn
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {isIn ? (
                            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
                          )}
                          {isIn ? 'Stock In' : 'Stock Out'}
                        </span>
                      </td>

                      {/* Quantity */}
                      <td className="py-3.5 px-4 text-right">
                        <span
                          className={`font-black text-sm ${
                            isIn ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {isIn ? `+${tx.quantity}` : `-${tx.quantity}`} units
                        </span>
                      </td>

                      {/* Description */}
                      <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate text-xs">
                        {tx.description || <span className="text-slate-400 italic">—</span>}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => onEditTransaction(tx)}
                            title="Edit Transaction"
                            className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteTransaction(tx)}
                            title="Delete Transaction"
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MOBILE CARD LIST VIEW */}
      <div className="md:hidden space-y-3">
        {filteredTransactions.length === 0 ? (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center text-slate-400">
            <ArrowLeftRight className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">No transactions found</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {searchQuery || typeFilter !== 'ALL'
                ? 'Try adjusting your search or filters.'
                : 'Add a new transaction to view activity.'}
            </p>
          </div>
        ) : (
          filteredTransactions.map((tx) => {
            const isIn = tx.type === 'IN';
            return (
              <div
                key={tx.id}
                className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm space-y-2.5"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900">{tx.productName}</h3>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{tx.date}</span>
                    </div>
                  </div>
                  <span
                    className={`font-black text-xs px-2.5 py-1 rounded-xl flex items-center gap-1 ${
                      isIn ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {isIn ? '+' : '-'}
                    {tx.quantity} units
                  </span>
                </div>

                {/* Description if present */}
                {tx.description && (
                  <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-xl">
                    {tx.description}
                  </p>
                )}

                {/* Actions row */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                    {isIn ? 'Stock In (Purchase)' : 'Stock Out (Sales)'}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onEditTransaction(tx)}
                      className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg flex items-center gap-1"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => onDeleteTransaction(tx)}
                      className="py-1 px-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-lg flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
