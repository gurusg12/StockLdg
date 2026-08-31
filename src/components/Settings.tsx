import React, { useState, useRef, useEffect } from 'react';
import {
  Building2,
  Phone,
  MapPin,
  Save,
  Download,
  Upload,
  Lock,
  LogOut,
  User,
  CheckCircle2,
  AlertCircle,
  FileJson,
  ShieldCheck,
  Database,
  RefreshCw,
} from 'lucide-react';
import { Product, Transaction, BusinessSettings } from '../types';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

interface SettingsProps {
  products: Product[];
  transactions: Transaction[];
  onDataRestored: (newProducts: Product[], newTransactions: Transaction[]) => void;
  onOpenChangePassword: () => void;
  onPromptLogout: () => void;
  onShowToast: (message: string, type?: 'success' | 'error' | 'warning') => void;
}

export const Settings: React.FC<SettingsProps> = ({
  products,
  transactions,
  onDataRestored,
  onOpenChangePassword,
  onPromptLogout,
  onShowToast,
}) => {
  const { currentUser, settings, updateSettings } = useAuth();

  const [businessName, setBusinessName] = useState(settings.businessName || '');
  const [phone, setPhone] = useState(settings.phone || '');
  const [address, setAddress] = useState(settings.address || '');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [isLoadingDbStatus, setIsLoadingDbStatus] = useState(false);

  const fetchDbStatus = async () => {
    setIsLoadingDbStatus(true);
    try {
      const res = await api.getDatabaseStatus();
      if (res?.data) {
        setDbStatus(res.data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingDbStatus(false);
    }
  };

  useEffect(() => {
    fetchDbStatus();
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveBusinessInfo = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      businessName: businessName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      reportHeaderName: businessName.trim()
        ? `${businessName.trim()} — Inventory Report`
        : 'StockTrack Inventory Report',
    });
    setSavedSuccess(true);
    onShowToast('Business information saved successfully.', 'success');
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  // Export Data JSON
  const handleExportBackup = () => {
    const backupData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      businessName: settings.businessName,
      phone: settings.phone,
      address: settings.address,
      products,
      transactions,
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const userSafe = currentUser?.username || 'business';
    link.download = `stocktrack_backup_${userSafe}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    onShowToast('Data backup downloaded successfully.', 'success');
  };

  // Import / Restore JSON
  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = String(event.target?.result || '');
        const data = JSON.parse(text);

        if (!Array.isArray(data.products) || !Array.isArray(data.transactions)) {
          onShowToast('Invalid backup file format.', 'error');
          return;
        }

        const isReplace = window.confirm(
          `Backup file detected with ${data.products.length} products and ${data.transactions.length} transactions.\n\nClick OK to REPLACE all current inventory data, or Cancel to MERGE with existing items.`
        );

        let finalProducts: Product[] = [];
        let finalTransactions: Transaction[] = [];

        if (isReplace) {
          finalProducts = data.products;
          finalTransactions = data.transactions;
        } else {
          // Merge
          const existingIds = new Set(products.map((p) => p.id));
          const newProds = [...products];
          data.products.forEach((p: Product) => {
            if (!existingIds.has(p.id)) {
              newProds.push(p);
            }
          });

          const existingTxIds = new Set(transactions.map((t) => t.id));
          const newTx = [...transactions];
          data.transactions.forEach((t: Transaction) => {
            if (!existingTxIds.has(t.id)) {
              newTx.push(t);
            }
          });

          finalProducts = newProds;
          finalTransactions = newTx;
        }

        if (data.businessName || data.phone || data.address) {
          updateSettings({
            businessName: data.businessName || settings.businessName,
            phone: data.phone || settings.phone,
            address: data.address || settings.address,
          });
          if (data.businessName) setBusinessName(data.businessName);
          if (data.phone) setPhone(data.phone);
          if (data.address) setAddress(data.address);
        }

        // Sync restore into SQLite database on backend
        try {
          await api.restoreBackup({
            products: finalProducts,
            transactions: finalTransactions,
            settings: {
              business_name: data.businessName || settings.businessName,
              phone: data.phone || settings.phone,
              address: data.address || settings.address,
            },
            is_replace: isReplace,
          });
          fetchDbStatus();
        } catch {
          // ignore
        }

        onDataRestored(finalProducts, finalTransactions);
        onShowToast(
          isReplace ? 'All data replaced and saved in SQLite database.' : 'Backup merged into SQLite database.',
          'success'
        );
      } catch (err) {
        onShowToast('Failed to read or parse the backup file.', 'error');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-3xl space-y-5 pb-8">
      {/* 1. Business Information Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 mb-5">
          <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-extrabold text-base text-slate-900">Business Information</h3>
            <p className="text-xs text-slate-500">
              This info is displayed on your inventory reports and top dashboard banner.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveBusinessInfo} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Business / Company Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Building2 className="w-4 h-4" />
              </div>
              <input
                id="settings-business-name"
                type="text"
                placeholder="e.g. Apex General Trading Co."
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  id="settings-phone"
                  type="text"
                  placeholder="+1 (555) 019-2834"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Store Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <MapPin className="w-4 h-4" />
                </div>
                <input
                  id="settings-address"
                  type="text"
                  placeholder="124 Market Street, Suite 4"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              id="settings-save-business-btn"
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm shadow-sky-200 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>Save Changes</span>
            </button>
            {savedSuccess && (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                Saved!
              </span>
            )}
          </div>
        </form>
      </div>

      {/* 2. Data Backup & Restore */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 mb-5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <FileJson className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-extrabold text-base text-slate-900">Data Backup & Restore</h3>
            <p className="text-xs text-slate-500">
              Download your user-added stock data file for offline safekeeping or transfer to another device.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Backup */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3">
            <div>
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <Download className="w-4 h-4 text-sky-600" />
                <span>Export Data Backup</span>
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Saves your active {products.length} products and {transactions.length} transactions to a JSON file.
              </p>
            </div>
            <button
              id="settings-backup-btn"
              type="button"
              onClick={handleExportBackup}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
            >
              Download Backup JSON
            </button>
          </div>

          {/* Restore */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3">
            <div>
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-indigo-600" />
                <span>Restore from Backup</span>
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Restore inventory catalog and transactions from a previously downloaded backup file.
              </p>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleRestoreFile}
              className="hidden"
            />
            <button
              id="settings-restore-btn"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-colors"
            >
              Select Backup File
            </button>
          </div>
        </div>

        {/* Clear / Reset Catalog Option */}
        {products.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Need to clear all current products and transactions?
            </span>
            <button
              id="settings-clear-all-btn"
              type="button"
              onClick={() => {
                if (window.confirm('Are you sure you want to remove all products and transactions? Only products you add afterwards will be kept.')) {
                  onDataRestored([], []);
                  onShowToast('All inventory items cleared. Ready for your products.', 'success');
                }
              }}
              className="text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-200 transition-colors"
            >
              Clear All Items
            </button>
          </div>
        )}
      </div>

      {/* 3. Visible SQLite Database Architecture Status & Live Inspector */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs">
              SQL
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">Database Storage Architecture</h3>
              <p className="text-xs text-slate-500">
                Isolated multi-tenant SQLite database files on disk.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchDbStatus}
            disabled={isLoadingDbStatus}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDbStatus ? 'animate-spin' : ''}`} />
            <span>Refresh Status</span>
          </button>
        </div>

        <div className="space-y-3">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-700 space-y-2">
            <div className="flex items-center justify-between font-mono font-bold text-slate-900">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-sky-600" />
                <span>Auth Database (main.sqlite):</span>
              </span>
              <span className="text-sky-700">backend/databases/main.sqlite</span>
            </div>
            <p className="text-slate-500 text-[11px]">
              Stores credentials, hashed passwords, recovery PINs, and tenant database mappings.
            </p>

            {dbStatus?.main_database && (
              <div className="mt-2 pt-2 border-t border-slate-200/60 flex flex-wrap gap-2 text-[11px]">
                <span className="px-2 py-0.5 bg-sky-100 text-sky-800 rounded font-semibold">
                  Registered Users in SQLite: {dbStatus.main_database.users_count}
                </span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold">
                  Active DB Sessions: {dbStatus.main_database.active_sessions}
                </span>
              </div>
            )}

            {/* List of registered users in main.sqlite */}
            {dbStatus?.main_database?.users && dbStatus.main_database.users.length > 0 && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-[11px] font-mono border border-slate-200 rounded-lg overflow-hidden bg-white">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-2.5 py-1.5 font-bold">User ID</th>
                      <th className="px-2.5 py-1.5 font-bold">Username</th>
                      <th className="px-2.5 py-1.5 font-bold">Business Name</th>
                      <th className="px-2.5 py-1.5 font-bold">Created At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {dbStatus.main_database.users.map((u: any) => (
                      <tr key={u.id} className={u.username === currentUser?.username ? 'bg-amber-50/50' : ''}>
                        <td className="px-2.5 py-1 text-slate-500 font-semibold">#{u.id}</td>
                        <td className="px-2.5 py-1 font-bold text-slate-900">
                          {u.username} {u.username === currentUser?.username && <span className="text-[10px] text-amber-600 font-normal">(Current)</span>}
                        </td>
                        <td className="px-2.5 py-1 text-slate-600">{u.business_name || '—'}</td>
                        <td className="px-2.5 py-1 text-slate-400">{u.created_at || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-700 space-y-2">
            <div className="flex items-center justify-between font-mono font-bold text-slate-900">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-emerald-600" />
                <span>Tenant Inventory DB:</span>
              </span>
              <span className="text-emerald-700">backend/databases/tenants/store_*.sqlite</span>
            </div>
            <p className="text-slate-500 text-[11px]">
              Stores your isolated products ({products.length} items), transaction movements ({transactions.length} records), and business settings.
            </p>

            {dbStatus?.tenant_databases && (
              <div className="mt-2 pt-2 border-t border-slate-200/60 flex flex-wrap gap-2 text-[11px]">
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold">
                  Tenant Database Files: {dbStatus.tenant_databases.files_count} file(s)
                </span>
                <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded font-semibold">
                  Active Items in DB: {products.length}
                </span>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold">
                  Transactions in DB: {transactions.length}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Account Settings */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 mb-5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-extrabold text-base text-slate-900">Account Security</h3>
            <p className="text-xs text-slate-500">
              Manage your credentials and active session.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Logged In Username
              </span>
              <span className="text-sm font-extrabold text-slate-900">
                {currentUser?.username || 'User'}
              </span>
            </div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
              Active Session
            </span>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              id="settings-change-password-btn"
              type="button"
              onClick={onOpenChangePassword}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
            >
              <Lock className="w-4 h-4 text-slate-600" />
              <span>Change Password</span>
            </button>

            <button
              id="settings-logout-btn"
              type="button"
              onClick={onPromptLogout}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 font-bold text-xs rounded-xl transition-colors ml-auto"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out of Account</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
