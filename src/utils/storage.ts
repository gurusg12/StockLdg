import { Product, Transaction, BusinessSettings, UserAccount } from '../types';

export async function hashString(str: string): Promise<string> {
  const enc = new TextEncoder().encode(str.trim());
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function getStorageKeys(username: string) {
  const safe = username.trim().toLowerCase();
  return {
    products: `st_prods_${safe}`,
    transactions: `st_tx_${safe}`,
    settings: `st_set_${safe}`,
  };
}

export function loadUserProducts(username: string): Product[] {
  const keys = getStorageKeys(username);
  const data = localStorage.getItem(keys.products);
  if (!data) {
    return [];
  }
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveUserProducts(username: string, products: Product[]): void {
  const keys = getStorageKeys(username);
  localStorage.setItem(keys.products, JSON.stringify(products));
}

export function loadUserTransactions(username: string): Transaction[] {
  const keys = getStorageKeys(username);
  const data = localStorage.getItem(keys.transactions);
  if (!data) {
    return [];
  }
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveUserTransactions(username: string, transactions: Transaction[]): void {
  const keys = getStorageKeys(username);
  localStorage.setItem(keys.transactions, JSON.stringify(transactions));
}

export function loadUserSettings(username: string): BusinessSettings {
  const keys = getStorageKeys(username);
  const data = localStorage.getItem(keys.settings);
  if (data) {
    try {
      return JSON.parse(data);
    } catch {
      // fallback below
    }
  }
  return {
    businessName: '',
    phone: '',
    address: '',
    reportHeaderName: '',
  };
}

export function saveUserSettings(username: string, settings: BusinessSettings): void {
  const keys = getStorageKeys(username);
  localStorage.setItem(keys.settings, JSON.stringify(settings));
}

// Compute accurate real-time available stock
export function calculateCurrentStock(
  product: Product,
  transactions: Transaction[]
): number {
  let stock = Number(product.initialStock) || 0;
  const prodNameLower = product.name.trim().toLowerCase();

  for (const tx of transactions) {
    const isMatching =
      (tx.productId && tx.productId === product.id) ||
      (tx.productName && tx.productName.trim().toLowerCase() === prodNameLower);

    if (isMatching) {
      const q = Number(tx.quantity) || 0;
      if (tx.type === 'IN') {
        stock += q;
      } else if (tx.type === 'OUT') {
        stock -= q;
      }
    }
  }
  return stock;
}

// User accounts store
const ACCOUNTS_KEY = 'stocktrack_users_directory';

export function getAllUsers(): UserAccount[] {
  const data = localStorage.getItem(ACCOUNTS_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveAllUsers(users: UserAccount[]): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(users));
}

// CSV Export
export function exportProductsToCSV(products: Product[], transactions: Transaction[], filename: string) {
  const headers = ['Product Name', 'Supplier', 'Current Stock', 'Threshold', 'Reminder Date'];
  const rows = products.map((p) => {
    const stock = calculateCurrentStock(p, transactions);
    return [
      escapeCSV(p.name),
      escapeCSV(p.supplier || ''),
      stock,
      p.threshold || 2,
      escapeCSV(p.reminderDate || ''),
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCSV(val: string | number): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// CSV Parser
export function parseCSVProducts(
  csvText: string
): { success: boolean; added: number; updated: number; error?: string } {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { success: false, added: 0, updated: 0, error: 'CSV file contains no data rows.' };
  }

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          cur += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          result.push(cur.trim());
          cur = '';
        } else {
          cur += char;
        }
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const nameIdx = headers.findIndex((h) => h.includes('name') || h.includes('product'));
  if (nameIdx === -1) {
    return { success: false, added: 0, updated: 0, error: 'CSV must contain a column for Product Name.' };
  }

  const supplierIdx = headers.findIndex((h) => h.includes('supplier'));
  const stockIdx = headers.findIndex((h) => h.includes('stock') || h.includes('qty') || h.includes('quantity'));
  const thresholdIdx = headers.findIndex((h) => h.includes('threshold') || h.includes('min') || h.includes('reorder'));
  const reminderIdx = headers.findIndex((h) => h.includes('reminder') || h.includes('date'));

  return {
    success: true,
    added: 0,
    updated: 0,
  };
}
