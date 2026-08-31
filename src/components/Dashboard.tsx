import React from 'react';
import {
  Boxes,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  Clock,
  Plus,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { Product, Transaction, ActiveSection } from '../types';
import { calculateCurrentStock } from '../utils/storage';
import { useAuth } from '../context/AuthContext';

interface DashboardProps {
  products: Product[];
  transactions: Transaction[];
  onNavigate: (section: ActiveSection) => void;
  onOpenProductModal: () => void;
  onOpenTransactionModal: (type?: 'IN' | 'OUT', productId?: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  products,
  transactions,
  onNavigate,
  onOpenProductModal,
  onOpenTransactionModal,
}) => {
  const { currentUser, settings } = useAuth();

  // Computations
  let totalInventoryUnits = 0;
  let totalPurchasedUnits = 0;
  let totalSoldUnits = 0;

  const lowStockItems: { product: Product; currentStock: number }[] = [];
  const reminderDueItems: Product[] = [];
  const todayStr = new Date().toISOString().split('T')[0];

  products.forEach((prod) => {
    const stock = calculateCurrentStock(prod, transactions);
    totalInventoryUnits += stock;
    if (stock <= (prod.threshold ?? 2)) {
      lowStockItems.push({ product: prod, currentStock: stock });
    }
    if (prod.reminderDate && prod.reminderDate <= todayStr) {
      reminderDueItems.push(prod);
    }
  });

  transactions.forEach((tx) => {
    const q = Number(tx.quantity) || 0;
    if (tx.type === 'IN') totalPurchasedUnits += q;
    if (tx.type === 'OUT') totalSoldUnits += q;
  });

  const recentTransactions = transactions.slice(0, 5);

  const businessDisplayName = settings.businessName || currentUser?.username || 'Owner';

  return (
    <div className="space-y-5 pb-6">
      {/* Hero Card */}
      <div
        id="dashboard-hero-banner"
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-600 via-sky-700 to-slate-900 text-white p-6 sm:p-8 shadow-xl shadow-sky-950/20"
      >
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-xs font-semibold backdrop-blur-md mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Inventory Stats
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Welcome back, {businessDisplayName} 👋
            </h2>
            <p className="text-xs sm:text-sm text-sky-100/90 mt-1 max-w-md">
              Here is your active stock overview and recent product movements.
            </p>
          </div>

          {/* Large Total Units Display */}
          <div className="bg-slate-950/40 border border-white/15 rounded-2xl p-4 sm:p-5 backdrop-blur-md min-w-[200px]">
            <div className="text-[11px] font-bold text-sky-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5" />
              Total Stock In Hand
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {totalInventoryUnits.toLocaleString()}{' '}
              <span className="text-sm font-semibold text-sky-200">Units</span>
            </div>
            <div className="text-[11px] text-sky-200/80 mt-0.5">
              Across {products.length} catalog items
            </div>
          </div>
        </div>

        {/* Decorative backdrop blobs */}
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-sky-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-1/3 w-48 h-48 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* Reminders banner if any */}
      {reminderDueItems.length > 0 && (
        <div
          id="dashboard-reminder-banner"
          className="bg-amber-50 border border-amber-200/90 rounded-2xl p-4 flex items-center justify-between gap-3 text-amber-900 text-xs font-medium shadow-sm"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Clock className="w-5 h-5 text-amber-600 shrink-0" />
            <span className="truncate">
              <strong>Reminder Date Due:</strong>{' '}
              {reminderDueItems.map((p) => p.name).join(', ')}
            </span>
          </div>
          <button
            onClick={() => onNavigate('inventory')}
            className="shrink-0 font-bold text-amber-900 underline hover:text-amber-950"
          >
            View
          </button>
        </div>
      )}

      {/* Stock Summary Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Products */}
        <div
          id="metric-products"
          className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => onNavigate('inventory')}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Products
            </span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{products.length}</div>
          <p className="text-[11px] font-medium text-slate-500 mt-1">Catalog Items Registered</p>
        </div>

        {/* Total Stock In */}
        <div
          id="metric-stock-in"
          className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => onNavigate('transactions')}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Purchased (In)
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-emerald-600">
            +{totalPurchasedUnits.toLocaleString()}
          </div>
          <p className="text-[11px] font-medium text-slate-500 mt-1">Total Units Received</p>
        </div>

        {/* Total Stock Out */}
        <div
          id="metric-stock-out"
          className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => onNavigate('transactions')}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Sold (Out)
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-rose-600">
            -{totalSoldUnits.toLocaleString()}
          </div>
          <p className="text-[11px] font-medium text-slate-500 mt-1">Total Units Dispatched</p>
        </div>
      </div>

      {/* Quick Actions Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          id="quick-add-tx-in"
          onClick={() => onOpenTransactionModal('IN')}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-sm shadow-emerald-200 transition-all active:scale-[0.99]"
        >
          <ArrowDownLeft className="w-4 h-4" />
          <span>+ Stock In</span>
        </button>

        <button
          id="quick-add-tx-out"
          onClick={() => onOpenTransactionModal('OUT')}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-bold shadow-sm shadow-rose-200 transition-all active:scale-[0.99]"
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>- Stock Out</span>
        </button>

        <button
          id="quick-add-product"
          onClick={onOpenProductModal}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-bold shadow-sm shadow-sky-200 transition-all active:scale-[0.99]"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add Product</span>
        </button>

        <button
          id="quick-view-reports"
          onClick={() => onNavigate('reports')}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white border border-slate-200/90 hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-bold shadow-sm transition-all"
        >
          <TrendingUp className="w-4 h-4 text-sky-600" />
          <span>View Reports</span>
        </button>
      </div>

      {/* Two-Column Grid: Low Stock Alert & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Low Stock Alert */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm sm:text-base text-slate-900">Low Stock Alert</h3>
              </div>
              <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200/70">
                {lowStockItems.length} item{lowStockItems.length === 1 ? '' : 's'}
              </span>
            </div>

            {lowStockItems.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs sm:text-sm">
                All inventory items are sufficiently stocked.
              </div>
            ) : (
              <div className="space-y-2.5">
                {lowStockItems.slice(0, 4).map(({ product, currentStock }) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/70 hover:bg-amber-50/50 transition-colors"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-xs sm:text-sm text-slate-800 truncate">
                        {product.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Supplier: {product.supplier || 'Unassigned'} • Threshold: {product.threshold}
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 font-extrabold text-xs">
                        {currentStock} left
                      </span>
                      <button
                        onClick={() => onOpenTransactionModal('IN', product.id)}
                        className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs"
                        title="Restock this item"
                      >
                        + In
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 mt-2 border-t border-slate-100 flex justify-between items-center">
            <span className="text-xs text-slate-500">
              {lowStockItems.length > 4 ? `+${lowStockItems.length - 4} more low stock items` : ''}
            </span>
            <button
              onClick={() => onNavigate('inventory')}
              className="text-xs font-bold text-sky-600 hover:text-sky-700 inline-flex items-center gap-1"
            >
              <span>Manage Inventory</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Recent Movements Activity */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm sm:text-base text-slate-900">Recent Movements</h3>
              </div>
              <button
                onClick={() => onNavigate('transactions')}
                className="text-xs font-bold text-sky-600 hover:text-sky-700 inline-flex items-center gap-1"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {recentTransactions.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs sm:text-sm">
                No transactions recorded yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {recentTransactions.map((tx) => {
                  const isIn = tx.type === 'IN';
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/70 hover:bg-slate-100/70 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isIn ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {isIn ? (
                            <ArrowDownLeft className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-xs sm:text-sm text-slate-800 truncate">
                            {tx.productName}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {tx.date} {tx.description ? `• ${tx.description}` : ''}
                          </div>
                        </div>
                      </div>
                      <div
                        className={`text-xs sm:text-sm font-extrabold shrink-0 ${
                          isIn ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {isIn ? `+${tx.quantity}` : `-${tx.quantity}`} units
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-4 mt-2 border-t border-slate-100 text-right">
            <button
              onClick={() => onOpenTransactionModal('IN')}
              className="text-xs font-bold text-sky-600 hover:text-sky-700"
            >
              + Record New Stock Movement
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
