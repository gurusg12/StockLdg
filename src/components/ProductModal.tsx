import React, { useState, useEffect } from 'react';
import { X, PackagePlus, AlertCircle, Building2, Layers, Calendar, Bell } from 'lucide-react';
import { Product } from '../types';

interface ProductModalProps {
  isOpen: boolean;
  productToEdit?: Product | null;
  existingProducts: Product[];
  onClose: () => void;
  onSave: (productData: {
    name: string;
    supplier: string;
    initialStock: number;
    threshold: number;
    reminderDate?: string;
  }) => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  productToEdit,
  existingProducts,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [supplier, setSupplier] = useState('');
  const [initialStock, setInitialStock] = useState<number | string>(0);
  const [threshold, setThreshold] = useState<number | string>(2);
  const [reminderDate, setReminderDate] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (productToEdit) {
        setName(productToEdit.name || '');
        setSupplier(productToEdit.supplier || '');
        setInitialStock(productToEdit.initialStock ?? 0);
        setThreshold(productToEdit.threshold ?? 2);
        setReminderDate(productToEdit.reminderDate || '');
      } else {
        setName('');
        setSupplier('');
        setInitialStock(0);
        setThreshold(2);
        setReminderDate('');
      }
      setError('');
      setIsSubmitting(false);
    }
  }, [productToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Product name is required.');
      return;
    }

    // Check duplicate
    const isDuplicate = existingProducts.some(
      (p) =>
        p.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
        p.id !== productToEdit?.id
    );

    if (isDuplicate) {
      setError('A product with this name already exists in your inventory.');
      return;
    }

    const stockNum = Math.max(0, parseInt(String(initialStock), 10) || 0);
    const thresholdNum = Math.max(0, parseInt(String(threshold), 10) || 0);

    setIsSubmitting(true);
    try {
      onSave({
        name: trimmedName,
        supplier: supplier.trim(),
        initialStock: stockNum,
        threshold: thresholdNum,
        reminderDate: reminderDate || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save product.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="product-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
      onClick={onClose}
    >
      <div
        id="product-modal-container"
        className="w-full max-w-md bg-white rounded-2xl p-5 sm:p-6 shadow-2xl border border-slate-200 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shadow-xs">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 leading-tight">
                {productToEdit ? 'Edit Product Item' : 'Add New Product Item'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {productToEdit ? 'Update product details and stock thresholds' : 'Save a new item to your SQLite database'}
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Product Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="product-name-input"
              type="text"
              required
              autoFocus
              placeholder="e.g. Basmati Rice 25kg / Mustard Oil 1L"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Supplier / Brand Name (Optional)</span>
            </label>
            <input
              id="product-supplier-input"
              type="text"
              placeholder="e.g. Golden Grains Ltd / ITC"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all placeholder:text-slate-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span>Opening Stock</span>
              </label>
              <input
                id="product-stock-input"
                type="number"
                min="0"
                placeholder="0"
                value={initialStock}
                onChange={(e) => setInitialStock(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
              />
              <p className="text-[10px] text-slate-400 mt-1">Starting available units</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                <Bell className="w-3.5 h-3.5 text-amber-500" />
                <span>Low Stock Threshold</span>
              </label>
              <input
                id="product-threshold-input"
                type="number"
                min="0"
                placeholder="2"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
              />
              <p className="text-[10px] text-slate-400 mt-1">Alert when stock ≤ this</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Reminder Date (Optional)</span>
            </label>
            <input
              id="product-reminder-input"
              type="date"
              value={reminderDate}
              onChange={(e) => setReminderDate(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
            />
          </div>

          <div className="flex gap-3 pt-3 border-t border-slate-100">
            <button
              id="product-modal-cancel"
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs sm:text-sm transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="product-modal-submit"
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm text-white bg-sky-600 hover:bg-sky-700 shadow-md shadow-sky-600/20 transition-all active:scale-[0.99] cursor-pointer disabled:opacity-50"
            >
              {productToEdit ? 'Save Changes' : 'Add Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
