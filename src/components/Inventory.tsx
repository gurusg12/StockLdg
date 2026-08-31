import React, { useState, useMemo, useRef } from 'react';
import {
  Package,
  Search,
  Plus,
  FileSpreadsheet,
  Upload,
  Download,
  Edit2,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  Calendar,
  Building2,
} from 'lucide-react';
import { Product, Transaction } from '../types';
import { calculateCurrentStock, exportProductsToCSV } from '../utils/storage';

interface InventoryProps {
  products: Product[];
  transactions: Transaction[];
  onAddProduct: () => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (product: Product) => void;
  onQuickTransaction: (product: Product, type: 'IN' | 'OUT') => void;
  onImportCSV: (file: File) => void;
}

export const Inventory: React.FC<InventoryProps> = ({
  products,
  transactions,
  onAddProduct,
  onEditProduct,
  onDeleteProduct,
  onQuickTransaction,
  onImportCSV,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute products with calculated stocks
  const productsWithStock = useMemo(() => {
    return products.map((prod) => ({
      ...prod,
      currentStock: calculateCurrentStock(prod, transactions),
    }));
  }, [products, transactions]);

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return productsWithStock;
    return productsWithStock.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.supplier && p.supplier.toLowerCase().includes(q))
    );
  }, [productsWithStock, searchQuery]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportCSV(file);
      e.target.value = '';
    }
  };

  const handleExportCSV = () => {
    exportProductsToCSV(products, transactions, 'stocktrack_inventory');
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Top Action Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Title */}
        <div>
          <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Package className="w-5 h-5 text-sky-600" />
            <span>Product Catalog & Stock</span>
          </h2>
          <p className="text-xs text-slate-500">
            Manage your inventory items, suppliers, thresholds, and quick stock movements.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* CSV Import */}
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            id="inventory-import-csv-btn"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
            title="Import inventory from CSV file"
          >
            <Upload className="w-3.5 h-3.5 text-slate-600" />
            <span>Import CSV</span>
          </button>

          {/* CSV Export */}
          <button
            id="inventory-export-csv-btn"
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
            title="Export inventory to CSV file"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Export CSV</span>
          </button>

          {/* Add Product Button */}
          <button
            id="inventory-add-product-btn"
            type="button"
            onClick={onAddProduct}
            className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-sm shadow-sky-200 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <Search className="w-4 h-4" />
        </div>
        <input
          id="inventory-search-input"
          type="text"
          placeholder="Search by product name or supplier..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200/90 rounded-2xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 shadow-sm"
        />
      </div>

      {/* DESKTOP TABLE VIEW */}
      <div className="hidden md:block bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Product Name</th>
                <th className="py-3.5 px-4">Supplier</th>
                <th className="py-3.5 px-4 text-right">Available Stock</th>
                <th className="py-3.5 px-4">Threshold</th>
                <th className="py-3.5 px-4">Reminder Date</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-600">No products found</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {searchQuery
                        ? 'Try modifying your search term.'
                        : 'Add your first product to start managing inventory.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((prod) => {
                  const isLow = prod.currentStock <= (prod.threshold ?? 2);
                  return (
                    <tr key={prod.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Product Name */}
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {prod.name}
                      </td>

                      {/* Supplier */}
                      <td className="py-3.5 px-4">
                        {prod.supplier ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            {prod.supplier}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-xs">—</span>
                        )}
                      </td>

                      {/* Available Stock */}
                      <td className="py-3.5 px-4 text-right">
                        <span
                          className={`font-black text-sm px-2.5 py-1 rounded-lg ${
                            isLow
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {prod.currentStock} units
                        </span>
                      </td>

                      {/* Threshold */}
                      <td className="py-3.5 px-4 text-slate-600 font-semibold">
                        {prod.threshold ?? 2} units
                      </td>

                      {/* Reminder Date */}
                      <td className="py-3.5 px-4 text-slate-500 text-xs">
                        {prod.reminderDate ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {prod.reminderDate}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Quick In */}
                          <button
                            onClick={() => onQuickTransaction(prod, 'IN')}
                            title="Stock In (Purchase)"
                            className="p-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg font-bold text-xs flex items-center gap-1 transition-colors"
                          >
                            <ArrowDownLeft className="w-3.5 h-3.5" />
                            <span>In</span>
                          </button>

                          {/* Quick Out */}
                          <button
                            onClick={() => onQuickTransaction(prod, 'OUT')}
                            title="Stock Out (Sales)"
                            className="p-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg font-bold text-xs flex items-center gap-1 transition-colors"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            <span>Out</span>
                          </button>

                          {/* Edit */}
                          <button
                            onClick={() => onEditProduct(prod)}
                            title="Edit Product"
                            className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => onDeleteProduct(prod)}
                            title="Delete Product"
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
        {filteredProducts.length === 0 ? (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center text-slate-400">
            <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">No products found</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {searchQuery ? 'Try modifying your search query.' : 'Add your first product to begin.'}
            </p>
          </div>
        ) : (
          filteredProducts.map((prod) => {
            const isLow = prod.currentStock <= (prod.threshold ?? 2);
            return (
              <div
                key={prod.id}
                className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm space-y-3"
              >
                {/* Header row: Name and Available Stock Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-sm text-slate-900 truncate">{prod.name}</h3>
                    {prod.supplier && (
                      <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        <span>{prod.supplier}</span>
                      </div>
                    )}
                  </div>
                  <span
                    className={`font-black text-xs px-2.5 py-1 rounded-xl shrink-0 ${
                      isLow ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {prod.currentStock} units
                  </span>
                </div>

                {/* Sub details: Threshold & Reminder */}
                <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                  <span>Threshold: {prod.threshold ?? 2}</span>
                  {prod.reminderDate ? (
                    <span className="flex items-center gap-1 text-slate-600 font-medium">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {prod.reminderDate}
                    </span>
                  ) : (
                    <span>No reminder</span>
                  )}
                </div>

                {/* Mobile action buttons row */}
                <div className="grid grid-cols-4 gap-2 pt-1">
                  <button
                    onClick={() => onQuickTransaction(prod, 'IN')}
                    className="py-1.5 px-2 bg-emerald-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1 shadow-xs"
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    <span>In</span>
                  </button>

                  <button
                    onClick={() => onQuickTransaction(prod, 'OUT')}
                    className="py-1.5 px-2 bg-rose-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1 shadow-xs"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Out</span>
                  </button>

                  <button
                    onClick={() => onEditProduct(prod)}
                    className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>

                  <button
                    onClick={() => onDeleteProduct(prod)}
                    className="py-1.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
