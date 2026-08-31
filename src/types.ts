export interface Product {
  id: string;
  name: string;
  supplier: string;
  initialStock: number;
  threshold: number;
  reminderDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type TransactionType = 'IN' | 'OUT';

export interface Transaction {
  id: string;
  productId: string;
  productName: string;
  type: TransactionType;
  quantity: number;
  description: string;
  date: string;
  createdAt: string;
}

export interface UserAccount {
  id: string;
  username: string;
  passwordHash: string;
  securityCodeHash?: string;
  businessName?: string;
  phone?: string;
  address?: string;
  createdAt: string;
}

export interface BusinessSettings {
  businessName: string;
  phone: string;
  address: string;
  reportHeaderName: string;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  undoAction?: () => void;
  undoLabel?: string;
}

export type ActiveSection = 'dashboard' | 'inventory' | 'transactions' | 'reports' | 'settings';
