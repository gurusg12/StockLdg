import React from 'react';
import { Boxes, LogOut, User, KeyRound, Plus, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ActiveSection } from '../types';

interface HeaderProps {
  activeSection?: ActiveSection;
  onNavigate?: (section: ActiveSection) => void;
  onPromptLogout: () => void;
  onOpenAddProduct?: () => void;
  onOpenStockIn?: () => void;
  onOpenStockOut?: () => void;
  onChangePassword?: () => void;
}

const sectionTitles: Record<ActiveSection, string> = {
  dashboard: 'Dashboard Overview',
  inventory: 'Inventory Catalog',
  transactions: 'Stock In / Out Movement',
  reports: 'Reports & Statements',
  settings: 'Settings & Database',
};

export const Header: React.FC<HeaderProps> = ({
  activeSection = 'dashboard',
  onPromptLogout,
  onOpenAddProduct,
  onOpenStockIn,
  onOpenStockOut,
  onChangePassword,
}) => {
  const { currentUser, settings } = useAuth();
  const displayName = settings.businessName || 'STOCKTRACK';

  return (
    <header
      id="app-top-header"
      className="fixed top-0 left-0 right-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3 sm:px-6 shadow-xs select-none"
    >
      <div className="max-w-7xl mx-auto w-full h-full flex items-center justify-between">
        {/* Brand icon & name on mobile / desktop */}
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <div className="w-8 h-8 rounded-xl bg-sky-600 flex items-center justify-center text-white shadow-xs shrink-0">
            <Boxes className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-900 tracking-tight text-sm sm:text-base truncate block">
                {displayName}
              </span>
              <span className="hidden lg:inline-block text-slate-300">•</span>
              <span className="hidden lg:inline-block text-xs font-semibold text-slate-500 truncate">
                {sectionTitles[activeSection] || 'Stock Management'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Add Item Quick Button */}
          {onOpenAddProduct && (
            <button
              id="header-add-product-btn"
              type="button"
              onClick={onOpenAddProduct}
              className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              title="Add New Product Item"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Item</span>
            </button>
          )}

          {/* Quick Stock In (Desktop/Tablet) */}
          {onOpenStockIn && (
            <button
              id="header-stock-in-btn"
              type="button"
              onClick={onOpenStockIn}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200/80 transition-colors cursor-pointer"
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Stock In</span>
            </button>
          )}

          {/* Quick Stock Out (Desktop/Tablet) */}
          {onOpenStockOut && (
            <button
              id="header-stock-out-btn"
              type="button"
              onClick={onOpenStockOut}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200/80 transition-colors cursor-pointer"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Stock Out</span>
            </button>
          )}

          {/* User Profile Badge */}
          <div
            id="user-profile-badge"
            className="hidden md:flex items-center gap-1.5 bg-slate-50 border border-slate-200/90 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-700"
          >
            <div className="w-4 h-4 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-[10px] font-bold">
              <User className="w-2.5 h-2.5" />
            </div>
            <span className="max-w-[120px] truncate">
              {currentUser?.username || 'User'}
            </span>
          </div>

          {/* Change Password icon */}
          {onChangePassword && (
            <button
              id="header-change-password-btn"
              type="button"
              onClick={onChangePassword}
              title="Change Account Password"
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Logout button */}
          <button
            id="top-header-logout-btn"
            type="button"
            onClick={onPromptLogout}
            className="flex items-center gap-1 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 px-2.5 sm:px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};
