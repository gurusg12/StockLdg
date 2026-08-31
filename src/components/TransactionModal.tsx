import React, { useState, useEffect, useMemo } from 'react';
import { X, ArrowDownLeft, ArrowUpRight, AlertTriangle, AlertCircle, Calendar, Plus, Package } from 'lucide-react';
import { Product, Transaction, TransactionType } from '../types';
import { calculateCurrentStock } from '../utils/storage';

interface TransactionModalProps {
  isOpen: boolean;
  transactionToEdit?: Transaction | null;
  initialProductId?: string;
  initialType?: TransactionType;
  products: Product[];
  allTransactions: Transaction[];
  onClose: () => void;
  onAddNewProduct?: () => void;
  onSave: (txData: {
    productId: string;
    productName: string;
    type: TransactionType;
    quantity: number;
    description: string;
    date: string;
  }) => void;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  transactionToEdit,
  initialProductId,
  initialType = 'IN',
  products,
  allTransactions,
  onClose,
  onAddNewProduct,
  onSave,
}) => {
  const [date, setDate] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [type, setType] = useState<TransactionType>('IN');
  const [quantity, setQuantity] = useState<number | string>('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [showStockWarning, setShowStockWarning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (transactionToEdit) {
        setDate(transactionToEdit.date || new Date().toISOString().split('T')[0]);
        setSelectedProductId(transactionToEdit.productId || '');
        setType(transactionToEdit.type);
        setQuantity(transactionToEdit.quantity || '');
        setDescription(transactionToEdit.description || '');
      } else {
        setDate(new Date().toISOString().split('T')[0]);
        const defaultProdId = initialProductId || (products.length > 0 ? products[0].id : '');
        setSelectedProductId(defaultProdId);
        setType(initialType);
        setQuantity('');
        setDescription('');
      }
      setError('');
      setShowStockWarning(false);
      setIsSubmitting(false);
    }
  }, [transactionToEdit, initialProductId, initialType, products, isOpen]);

  // Compute available stock for the currently selected product
  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId);
  }, [products, selectedProductId]);

  const availableStock = useMemo(() => {
    if (!selectedProduct) return 0;
    const relevantTx = transactionToEdit
      ? allTransactions.filter((t) => t.id !== transactionToEdit.id)
      : allTransactions;
    return calculateCurrentStock(selectedProduct, relevantTx);
  }, [selectedProduct, allTransactions, transactionToEdit]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) {
      setError('Transaction date is required.');
      return;
    }
    if (!selectedProduct) {
      setError('Please select a product from your catalog.');
      return;
    }
    const qtyNum = parseInt(String(quantity), 10);
    if (!qtyNum || qtyNum <= 0) {
      setError('Quantity must be a positive number greater than 0.');
      return;
    }

    // Check stock out warning
    if (type === 'OUT' && qtyNum > availableStock && !showStockWarning) {
      setShowStockWarning(true);
      return;
    }

    setIsSubmitting(true);
    try {
      onSave({
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        type,
        quantity: qtyNum,
        description: description.trim(),
        date,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to record transaction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="tx-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
      onClick={onClose}
    >
      <div
        id="tx-modal-container"
        className="w-full max-w-md bg-white rounded-2xl p-5 sm:p-6 shadow-2xl border border-slate-200 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xs ${
                type === 'IN'
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-rose-50 text-rose-600'
              }`}
            >
              {type === 'IN' ? (
                <ArrowDownLeft className="w-5 h-5" />
              ) : (
                <ArrowUpRight className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 leading-tight">
                {transactionToEdit
                  ? 'Edit Transaction Record'
                  : type === 'IN'
                  ? 'Stock In (Purchase Receipt)'
                  : 'Stock Out (Sales Dispatch)'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {type === 'IN' ? 'Add inventory units received into stock' : 'Record goods dispatched or sold to customer'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Stock Out Warning Banner */}
        {showStockWarning && (
          <div className="mb-4 p-3.5 bg-amber-50 border border-amber-300/80 rounded-xl text-xs text-amber-800 space-y-2">
            <div className="flex items-start gap-2 font-bold text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>Stock Out Exceeds Available Count</span>
            </div>
            <p className="leading-relaxed">
              Available stock is <strong>{availableStock} units</strong>, but you are recording a stock out of{' '}
              <strong>{quantity} units</strong>. Proceeding will cause negative inventory.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowStockWarning(false)}
                className="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 font-bold rounded-lg text-xs hover:bg-amber-100 cursor-pointer"
              >
                Adjust Quantity
              </button>
              <button
                type="button"
                onClick={(e) => {
                  setShowStockWarning(false);
                  handleSubmit(e);
                }}
                className="px-3 py-1.5 bg-amber-600 text-white font-bold rounded-lg text-xs hover:bg-amber-700 cursor-pointer"
              >
                Confirm & Proceed
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Transaction Type Buttons */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              id="tx-type-in-btn"
              type="button"
              onClick={() => {
                setType('IN');
                setShowStockWarning(false);
              }}
              className={`py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                type === 'IN'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>Stock In (Purchase)</span>
            </button>
            <button
              id="tx-type-out-btn"
              type="button"
              onClick={() => {
                setType('OUT');
                setShowStockWarning(false);
              }}
              className={`py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                type === 'OUT'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>Stock Out (Sales)</span>
            </button>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Transaction Date <span className="text-rose-500">*</span></span>
            </label>
            <input
              id="tx-date-input"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
            />
          </div>

          {/* Product Select */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 flex items-center gap-1">
                <Package className="w-3.5 h-3.5 text-slate-400" />
                <span>Select Product <span className="text-rose-500">*</span></span>
              </label>
              {selectedProduct && (
                <span className="text-[11px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200/80">
                  Current Stock: {availableStock} units
                </span>
              )}
            </div>

            {products.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 flex flex-col items-center gap-2 text-center">
                <p>No products in your catalog yet.</p>
                {onAddNewProduct && (
                  <button
                    type="button"
                    onClick={onAddNewProduct}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-sky-600 text-white font-bold rounded-lg text-xs hover:bg-sky-700 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Product First</span>
                  </button>
                )}
              </div>
            ) : (
              <select
                id="tx-product-select"
                required
                value={selectedProductId}
                onChange={(e) => {
                  setSelectedProductId(e.target.value);
                  setShowStockWarning(false);
                }}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all bg-white font-medium"
              >
                <option value="" disabled>
                  -- Select an Inventory Product --
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.supplier ? `(${p.supplier})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Quantity (Units) <span className="text-rose-500">*</span>
            </label>
            <input
              id="tx-quantity-input"
              type="number"
              min="1"
              required
              placeholder="e.g. 10"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 0));
                setShowStockWarning(false);
              }}
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all font-mono font-bold"
            />
          </div>

          {/* Description / Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Description / Notes (Optional)
            </label>
            <input
              id="tx-description-input"
              type="text"
              placeholder="e.g. Invoice #204, Customer counter cash, Supplier restocking"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all placeholder:text-slate-400"
            />
          </div>

          <div className="flex gap-3 pt-3 border-t border-slate-100">
            <button
              id="tx-modal-cancel"
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs sm:text-sm transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="tx-modal-submit"
              type="submit"
              disabled={products.length === 0 || isSubmitting}
              className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm text-white shadow-md transition-all active:scale-[0.99] cursor-pointer disabled:opacity-50 ${
                type === 'IN'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                  : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
              }`}
            >
              {transactionToEdit ? 'Save Changes' : type === 'IN' ? 'Record Stock In' : 'Record Stock Out'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
