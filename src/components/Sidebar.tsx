import React, { useMemo } from 'react';
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  BarChart3,
  Settings as SettingsIcon,
  LogOut,
  Boxes,
  Database,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
} from 'lucide-react';
import { ActiveSection, Product, Transaction } from '../types';
import { useAuth } from '../context/AuthContext';
import { calculateCurrentStock } from '../utils/storage';

interface SidebarProps {
  activeSection: ActiveSection;
  onSelectSection?: (section: ActiveSection) => void;
  onNavigate?: (section: ActiveSection) => void;
  onPromptLogout?: () => void;
  products?: Product[];
  transactions?: Transaction[];
  productsCount?: number;
  transactionsCount?: number;
  onOpenAddProduct?: () => void;
  onOpenStockIn?: () => void;
  onOpenStockOut?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  onNavigate,
  onPromptLogout,
  products = [],
  transactions = [],
  productsCount = 0,
  transactionsCount = 0,
  onOpenAddProduct,
  onOpenStockIn,
  onOpenStockOut,
}) => {
  const { currentUser, settings } = useAuth();
  const brandName = settings.businessName || 'STOCKTRACK';

  const totalProducts = products.length || productsCount;
  const totalTransactions = transactions.length || transactionsCount;

  // Calculate low stock items count
  const lowStockCount = useMemo(() => {
    if (!products.length) return 0;
    return products.filter((p) => {
      const stock = calculateCurrentStock(p, transactions);
      return stock <= (p.threshold ?? 2);
    }).length;
  }, [products, transactions]);

  const handleNav = (section: ActiveSection) => {
    if (onSelectSection) onSelectSection(section);
    else if (onNavigate) onNavigate(section);
  };

  const navItems = [
    {
      id: 'dashboard' as ActiveSection,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
      alert: false,
    },
    {
      id: 'inventory' as ActiveSection,
      label: 'Inventory Catalog',
      icon: Package,
      badge: totalProducts > 0 ? totalProducts : null,
      alert: lowStockCount > 0,
    },
    {
      id: 'transactions' as ActiveSection,
      label: 'Stock Transactions',
      icon: ArrowLeftRight,
      badge: totalTransactions > 0 ? totalTransactions : null,
      alert: false,
    },
    {
      id: 'reports' as ActiveSection,
      label: 'Reports & Export',
      icon: BarChart3,
      badge: null,
      alert: false,
    },
    {
      id: 'settings' as ActiveSection,
      label: 'Settings & DB',
      icon: SettingsIcon,
      badge: null,
      alert: false,
    },
  ];

  return (
    <aside
      id="desktop-sidebar-nav"
      className="hidden md:flex flex-col w-64 shrink-0 bg-slate-900 border border-slate-800 text-slate-300 rounded-2xl shadow-md h-[calc(100vh-6.5rem)] sticky top-20 select-none overflow-hidden"
    >
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800/90 flex items-center gap-3 bg-slate-950/50">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-sky-950/40 shrink-0">
          <Boxes className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-extrabold text-sm tracking-tight text-white truncate">
            {brandName}
          </h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <p className="text-[11px] font-semibold text-emerald-400 truncate">SQLite DB Active</p>
          </div>
        </div>
      </div>

      {/* Quick Action Shortcuts */}
      {(onOpenAddProduct || onOpenStockIn || onOpenStockOut) && (
        <div className="px-3 pt-3 pb-1 border-b border-slate-800/60 bg-slate-950/20">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">
            Quick Actions
          </div>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {onOpenStockIn && (
              <button
                type="button"
                onClick={onOpenStockIn}
                className="flex items-center justify-center gap-1 px-2 py-1.5 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/50 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>Stock In</span>
              </button>
            )}
            {onOpenStockOut && (
              <button
                type="button"
                onClick={onOpenStockOut}
                className="flex items-center justify-center gap-1 px-2 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/50 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Stock Out</span>
              </button>
            )}
          </div>
          {onOpenAddProduct && (
            <button
              type="button"
              onClick={onOpenAddProduct}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Product Item</span>
            </button>
          )}
        </div>
      )}

      {/* Main Nav Items */}
      <nav className="p-3 space-y-1 overflow-y-auto flex-1 custom-scrollbar">
        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Navigation
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              id={`sidebar-nav-${item.id}`}
              type="button"
              onClick={() => handleNav(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-950/50'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </div>

              <div className="flex items-center gap-1.5">
                {item.alert && (
                  <span
                    title={`${lowStockCount} item(s) low stock`}
                    className="flex items-center gap-0.5 text-[10px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 px-1.5 py-0.5 rounded-full"
                  >
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    <span>{lowStockCount}</span>
                  </span>
                )}
                {item.badge !== null && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                      isActive
                        ? 'bg-sky-700/80 text-sky-100'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </nav>

      {/* User Status & Sign Out (Sticky Bottom) */}
      <div className="p-3 border-t border-slate-800/90 bg-slate-950/40">
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
          <div className="min-w-0 pr-2">
            <div className="text-xs font-bold text-slate-100 truncate">
              {currentUser?.username || 'User'}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate">
              <Database className="w-3 h-3 text-emerald-400" />
              <span>Offline & Server Synced</span>
            </div>
          </div>
          {onPromptLogout && (
            <button
              id="sidebar-logout-btn"
              type="button"
              onClick={onPromptLogout}
              title="Sign Out"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
