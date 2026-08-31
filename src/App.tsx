import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { Dashboard } from './components/Dashboard';
import { Inventory } from './components/Inventory';
import { Transactions } from './components/Transactions';
import { Reports } from './components/Reports';
import { Settings } from './components/Settings';
import { ProductModal } from './components/ProductModal';
import { TransactionModal } from './components/TransactionModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { ConfirmModal } from './components/ConfirmModal';
import { Product, Transaction, ActiveSection, TransactionType } from './types';
import {
  loadUserProducts,
  saveUserProducts,
  loadUserTransactions,
  saveUserTransactions,
  generateId,
} from './utils/storage';
import { api } from './services/api';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

interface Toast {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
}

const VALID_SECTIONS: ActiveSection[] = ['dashboard', 'inventory', 'transactions', 'reports', 'settings'];

const getSectionFromHash = (): ActiveSection => {
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  if (VALID_SECTIONS.includes(hash as ActiveSection)) {
    return hash as ActiveSection;
  }
  return 'dashboard';
};

const MainApp: React.FC = () => {
  const { currentUser, logout } = useAuth();

  const [activeSection, setActiveSection] = useState<ActiveSection>(getSectionFromHash);
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Modals state
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);

  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txToEdit, setTxToEdit] = useState<Transaction | null>(null);
  const [initialTxType, setInitialTxType] = useState<TransactionType>('IN');
  const [initialTxProductId, setInitialTxProductId] = useState<string | undefined>(undefined);

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // Confirmation Modal state
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Sync activeSection with browser history (Hash-based Routing to prevent browser Back issues)
  const handleNavigate = useCallback((section: ActiveSection) => {
    setActiveSection(section);
    if (window.location.hash.replace(/^#\/?/, '') !== section) {
      window.location.hash = `#${section}`;
    }
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const current = getSectionFromHash();
      setActiveSection(current);
    };

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);

    // If initial hash is empty, set default
    if (!window.location.hash) {
      window.location.hash = '#dashboard';
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, []);

  // Sync state with SQLite DB on Login
  useEffect(() => {
    if (!currentUser) {
      setProducts([]);
      setTransactions([]);
      return;
    }

    const loadData = async () => {
      try {
        const [itemsRes, txsRes] = await Promise.all([
          api.getProducts().catch(() => null),
          api.getTransactions().catch(() => null),
        ]);

        if (itemsRes?.data && Array.isArray(itemsRes.data)) {
          const mappedProducts: Product[] = itemsRes.data.map((item: any) => ({
            id: String(item.id),
            name: item.name,
            supplier: item.supplier || '',
            initialStock: Number(item.initial_stock || 0),
            threshold: Number(item.threshold_qty ?? 2),
            reminderDate: item.reminder_date || undefined,
            createdAt: item.created_at || new Date().toISOString(),
            updatedAt: item.updated_at || new Date().toISOString(),
          }));
          setProducts(mappedProducts);
          saveUserProducts(currentUser.username, mappedProducts);
        } else {
          const localProds = loadUserProducts(currentUser.username);
          setProducts(localProds);
        }

        if (txsRes?.data && Array.isArray(txsRes.data)) {
          const mappedTxs: Transaction[] = txsRes.data.map((tx: any) => ({
            id: String(tx.id),
            productId: String(tx.product_id),
            productName: tx.product_name,
            type: tx.type as TransactionType,
            quantity: Number(tx.quantity),
            description: tx.description || '',
            date: tx.date,
            createdAt: tx.created_at || new Date().toISOString(),
          }));
          setTransactions(mappedTxs);
          saveUserTransactions(currentUser.username, mappedTxs);
        } else {
          const localTxs = loadUserTransactions(currentUser.username);
          setTransactions(localTxs);
        }
      } catch {
        const localProds = loadUserProducts(currentUser.username);
        const localTxs = loadUserTransactions(currentUser.username);
        setProducts(localProds);
        setTransactions(localTxs);
      }
    };

    loadData();
  }, [currentUser]);

  // If not logged in, render AuthScreen
  if (!currentUser) {
    return <AuthScreen />;
  }

  // Handlers for Product
  const handleOpenProductModal = (product?: Product) => {
    setProductToEdit(product || null);
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = async (productData: {
    name: string;
    supplier: string;
    initialStock: number;
    threshold: number;
    reminderDate?: string;
  }) => {
    if (!currentUser) return;

    if (productToEdit) {
      // Edit in SQLite
      try {
        await api.updateProduct(productToEdit.id, {
          name: productData.name,
          supplier: productData.supplier,
          initial_stock: productData.initialStock,
          threshold_qty: productData.threshold,
          reminder_date: productData.reminderDate || '',
        });
      } catch (err: any) {
        showToast(err.message || 'Saved locally (SQLite offline)', 'warning');
      }

      const updated = products.map((p) =>
        p.id === productToEdit.id
          ? {
              ...p,
              ...productData,
              updatedAt: new Date().toISOString(),
            }
          : p
      );
      setProducts(updated);
      saveUserProducts(currentUser.username, updated);
      showToast(`Product "${productData.name}" updated successfully.`);
    } else {
      // Add in SQLite
      let assignedId = generateId();
      try {
        const res = await api.createProduct({
          name: productData.name,
          supplier: productData.supplier,
          initial_stock: productData.initialStock,
          threshold_qty: productData.threshold,
          reminder_date: productData.reminderDate || '',
        });
        if (res?.data?.id) {
          assignedId = String(res.data.id);
        }
      } catch (err: any) {
        showToast(err.message || 'Saved locally (SQLite offline)', 'warning');
      }

      const newProduct: Product = {
        id: assignedId,
        ...productData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const updated = [newProduct, ...products];
      setProducts(updated);
      saveUserProducts(currentUser.username, updated);
      showToast(`Product "${productData.name}" added to inventory.`);
    }
    setProductToEdit(null);
  };

  const handleDeleteProduct = (product: Product) => {
    if (!currentUser) return;

    const hasTxs = transactions.some((t) => t.productId === product.id);

    setConfirmConfig({
      isOpen: true,
      title: 'Delete Product',
      message: hasTxs
        ? `"${product.name}" has recorded transactions. Deleting it will also remove all associated movement history. Are you sure you want to delete this product?`
        : `Are you sure you want to delete product "${product.name}" from your catalog?`,
      confirmLabel: 'Delete Product',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.deleteProduct(product.id);
        } catch {
          // ignore
        }
        const updatedProducts = products.filter((p) => p.id !== product.id);
        const updatedTxs = transactions.filter((t) => t.productId !== product.id);
        setProducts(updatedProducts);
        setTransactions(updatedTxs);
        saveUserProducts(currentUser.username, updatedProducts);
        saveUserTransactions(currentUser.username, updatedTxs);
        showToast(`Product "${product.name}" deleted.`, 'info');
      },
    });
  };

  // Handlers for Transactions
  const handleOpenTxModal = (
    productId?: string,
    type: TransactionType = 'IN',
    tx?: Transaction
  ) => {
    setTxToEdit(tx || null);
    setInitialTxProductId(productId);
    setInitialTxType(type);
    setIsTxModalOpen(true);
  };

  const handleSaveTransaction = async (txData: {
    productId: string;
    productName: string;
    type: TransactionType;
    quantity: number;
    description: string;
    date: string;
  }) => {
    if (!currentUser) return;

    if (txToEdit) {
      try {
        await api.deleteTransaction(txToEdit.id);
        await api.createTransaction({
          product_id: txData.productId,
          product_name: txData.productName,
          type: txData.type,
          quantity: txData.quantity,
          description: txData.description,
          date: txData.date,
        });
      } catch (err: any) {
        showToast(err.message || 'Saved locally (SQLite offline)', 'warning');
      }

      const updated = transactions.map((t) =>
        t.id === txToEdit.id ? { ...t, ...txData } : t
      );
      setTransactions(updated);
      saveUserTransactions(currentUser.username, updated);
      showToast('Transaction record updated.');
    } else {
      let assignedId = generateId();
      try {
        const res = await api.createTransaction({
          product_id: txData.productId,
          product_name: txData.productName,
          type: txData.type,
          quantity: txData.quantity,
          description: txData.description,
          date: txData.date,
        });
        if (res?.data?.id) {
          assignedId = String(res.data.id);
        }
      } catch (err: any) {
        showToast(err.message || 'Saved locally (SQLite offline)', 'warning');
      }

      const newTx: Transaction = {
        id: assignedId,
        ...txData,
        createdAt: new Date().toISOString(),
      };
      const updated = [newTx, ...transactions];
      setTransactions(updated);
      saveUserTransactions(currentUser.username, updated);
      showToast(
        `${txData.type === 'IN' ? 'Stock In' : 'Stock Out'} of ${txData.quantity} units recorded.`
      );
    }
    setTxToEdit(null);
  };

  const handleDeleteTransaction = (tx: Transaction) => {
    if (!currentUser) return;

    setConfirmConfig({
      isOpen: true,
      title: 'Delete Transaction Record',
      message: `Are you sure you want to delete this ${tx.type === 'IN' ? 'Stock In' : 'Stock Out'} of ${tx.quantity} units for "${tx.productName}" on ${tx.date}?`,
      confirmLabel: 'Delete Record',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.deleteTransaction(tx.id);
        } catch {
          // ignore
        }
        const updated = transactions.filter((t) => t.id !== tx.id);
        setTransactions(updated);
        saveUserTransactions(currentUser.username, updated);
        showToast('Transaction deleted.', 'info');
      },
    });
  };

  // CSV Import handling
  const handleImportCSV = async (file: File) => {
    if (!currentUser) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const lines = text.split('\n');
      if (lines.length < 2) {
        showToast('CSV file is empty or invalid format.', 'error');
        return;
      }

      const newItems: Product[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',');
        const name = parts[0]?.trim();
        if (!name) continue;

        const supplier = parts[1]?.trim() || '';
        const initialStock = Math.max(0, parseInt(parts[2]?.trim(), 10) || 0);
        const threshold = Math.max(0, parseInt(parts[3]?.trim(), 10) || 2);
        const reminderDate = parts[4]?.trim() || undefined;

        // Check if name exists
        const exists = products.some((p) => p.name.toLowerCase() === name.toLowerCase());
        if (!exists) {
          let assignedId = generateId();
          try {
            const res = await api.createProduct({
              name,
              supplier,
              initial_stock: initialStock,
              threshold_qty: threshold,
              reminder_date: reminderDate || '',
            });
            if (res?.data?.id) assignedId = String(res.data.id);
          } catch {
            // local fallback
          }

          newItems.push({
            id: assignedId,
            name,
            supplier,
            initialStock,
            threshold,
            reminderDate,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }

      if (newItems.length > 0) {
        const updated = [...newItems, ...products];
        setProducts(updated);
        saveUserProducts(currentUser.username, updated);
        showToast(`Imported ${newItems.length} new product(s) successfully!`);
      } else {
        showToast('No new products to import (duplicates skipped).', 'info');
      }
    };
    reader.readAsText(file);
  };

  const handlePromptLogout = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'Sign Out Confirmation',
      message: 'Are you sure you want to sign out of StockTrack?',
      confirmLabel: 'Sign Out',
      isDestructive: false,
      onConfirm: () => {
        logout();
      },
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased text-slate-900 font-sans">
      {/* Toast Notification Container */}
      <div
        id="toast-container"
        className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 rounded-2xl shadow-xl border flex items-center justify-between gap-3 text-xs sm:text-sm font-medium animate-in slide-in-from-right duration-200 ${
              toast.type === 'error'
                ? 'bg-rose-900 text-white border-rose-800'
                : toast.type === 'warning'
                ? 'bg-amber-50 text-amber-900 border-amber-300'
                : toast.type === 'info'
                ? 'bg-slate-900 text-white border-slate-800'
                : 'bg-emerald-900 text-white border-emerald-800'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />}
              {toast.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />}
              {toast.type === 'info' && <Info className="w-4 h-4 text-sky-400 shrink-0" />}
              {(!toast.type || toast.type === 'success') && (
                <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
              )}
              <span>{toast.message}</span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 hover:opacity-75 rounded transition-opacity cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmLabel={confirmConfig.confirmLabel}
        isDestructive={confirmConfig.isDestructive}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Product Add/Edit Modal */}
      <ProductModal
        isOpen={isProductModalOpen}
        productToEdit={productToEdit}
        existingProducts={products}
        onSave={handleSaveProduct}
        onClose={() => {
          setIsProductModalOpen(false);
          setProductToEdit(null);
        }}
      />

      {/* Transaction Add/Edit Modal */}
      <TransactionModal
        isOpen={isTxModalOpen}
        products={products}
        allTransactions={transactions}
        initialProductId={initialTxProductId}
        initialType={initialTxType}
        transactionToEdit={txToEdit}
        onSave={handleSaveTransaction}
        onClose={() => {
          setIsTxModalOpen(false);
          setTxToEdit(null);
        }}
        onAddNewProduct={() => {
          setIsTxModalOpen(false);
          setProductToEdit(null);
          setIsProductModalOpen(true);
        }}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onShowToast={showToast}
      />

      {/* Top Header with Breadcrumbs & Action buttons */}
      <Header
        activeSection={activeSection}
        onNavigate={handleNavigate}
        onOpenAddProduct={() => handleOpenProductModal()}
        onOpenStockIn={() => handleOpenTxModal(undefined, 'IN')}
        onOpenStockOut={() => handleOpenTxModal(undefined, 'OUT')}
        onChangePassword={() => setIsPasswordModalOpen(true)}
        onPromptLogout={handlePromptLogout}
      />

      {/* Main Layout Body */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-20 sm:pt-22 pb-4 sm:pb-6 gap-6">
        {/* Desktop Sidebar Navigation (Full Height & Feature Rich) */}
        <Sidebar
          activeSection={activeSection}
          onSelectSection={handleNavigate}
          onNavigate={handleNavigate}
          onPromptLogout={handlePromptLogout}
          products={products}
          transactions={transactions}
          productsCount={products.length}
          transactionsCount={transactions.length}
          onOpenAddProduct={() => handleOpenProductModal()}
          onOpenStockIn={() => handleOpenTxModal(undefined, 'IN')}
          onOpenStockOut={() => handleOpenTxModal(undefined, 'OUT')}
        />

        {/* Content View Area */}
        <main className="flex-1 min-w-0 pb-24 md:pb-6">
          {activeSection === 'dashboard' && (
            <Dashboard
              products={products}
              transactions={transactions}
              onNavigate={handleNavigate}
              onOpenProductModal={() => handleOpenProductModal()}
              onOpenTransactionModal={(type, productId) => handleOpenTxModal(productId, type || 'IN')}
            />
          )}

          {activeSection === 'inventory' && (
            <Inventory
              products={products}
              transactions={transactions}
              onAddProduct={() => handleOpenProductModal()}
              onEditProduct={(product) => handleOpenProductModal(product)}
              onDeleteProduct={handleDeleteProduct}
              onQuickTransaction={(product, type) => handleOpenTxModal(product.id, type)}
              onImportCSV={handleImportCSV}
            />
          )}

          {activeSection === 'transactions' && (
            <Transactions
              transactions={transactions}
              onAddTransaction={() => handleOpenTxModal(undefined, 'IN')}
              onEditTransaction={(tx) => handleOpenTxModal(tx.productId, tx.type, tx)}
              onDeleteTransaction={handleDeleteTransaction}
            />
          )}

          {activeSection === 'reports' && (
            <Reports
              products={products}
              transactions={transactions}
              onOpenProductStatement={() => {
                // Statement handling
              }}
            />
          )}

          {activeSection === 'settings' && (
            <Settings
              products={products}
              transactions={transactions}
              onOpenChangePassword={() => setIsPasswordModalOpen(true)}
              onPromptLogout={handlePromptLogout}
              onDataRestored={async (restoredProducts, restoredTransactions) => {
                if (currentUser) {
                  if (restoredProducts.length === 0 && restoredTransactions.length === 0) {
                    try {
                      await api.clearItems();
                    } catch {
                      // Continue
                    }
                  }
                  setProducts(restoredProducts);
                  setTransactions(restoredTransactions);
                  saveUserProducts(currentUser.username, restoredProducts);
                  saveUserTransactions(currentUser.username, restoredTransactions);
                }
              }}
              onShowToast={showToast}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        activeSection={activeSection}
        onSelectSection={handleNavigate}
        onNavigate={handleNavigate}
        productsCount={products.length}
        transactionsCount={transactions.length}
      />
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

export default App;
