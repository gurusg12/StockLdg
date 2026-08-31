import React from 'react';
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  BarChart3,
  Settings as SettingsIcon,
} from 'lucide-react';
import { ActiveSection } from '../types';

interface MobileBottomNavProps {
  activeSection: ActiveSection;
  onSelectSection?: (section: ActiveSection) => void;
  onNavigate?: (section: ActiveSection) => void;
  productsCount?: number;
  transactionsCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeSection,
  onSelectSection,
  onNavigate,
  productsCount = 0,
  transactionsCount = 0,
}) => {
  const handleNav = (section: ActiveSection) => {
    if (onSelectSection) onSelectSection(section);
    else if (onNavigate) onNavigate(section);
  };

  const items = [
    {
      id: 'dashboard' as ActiveSection,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'inventory' as ActiveSection,
      label: 'Inventory',
      icon: Package,
      badge: productsCount > 0 ? productsCount : null,
    },
    {
      id: 'transactions' as ActiveSection,
      label: 'Movement',
      icon: ArrowLeftRight,
      badge: transactionsCount > 0 ? transactionsCount : null,
    },
    {
      id: 'reports' as ActiveSection,
      label: 'Reports',
      icon: BarChart3,
      badge: null,
    },
    {
      id: 'settings' as ActiveSection,
      label: 'Settings',
      icon: SettingsIcon,
      badge: null,
    },
  ];

  return (
    <nav
      id="mobile-bottom-navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200/90 px-1 py-1.5 pb-[calc(env(safe-area-inset-bottom,0px)+6px)] shadow-lg select-none"
    >
      <div className="flex items-center justify-around">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              id={`mobile-nav-${item.id}`}
              type="button"
              onClick={() => handleNav(item.id)}
              className={`relative flex flex-col items-center justify-center flex-1 py-1 px-1 transition-colors rounded-xl cursor-pointer ${
                isActive ? 'text-sky-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div
                className={`relative p-1.5 rounded-xl transition-all ${
                  isActive ? 'bg-sky-50 text-sky-600 scale-105' : 'bg-transparent text-slate-500'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.badge !== null && (
                  <span className="absolute -top-1 -right-1.5 bg-sky-600 text-white text-[9px] font-mono font-bold px-1 rounded-full border border-white leading-tight min-w-[14px] text-center">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight font-semibold">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
