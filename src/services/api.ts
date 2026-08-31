import axios from 'axios';

const API_BASE_URL = ((import.meta as any).env?.VITE_API_BASE_URL as string) || '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Attach Authorization Bearer token to all outgoing requests
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('stocktrack_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Unified response interceptor
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Network request failed';

    if (error.response?.status === 401) {
      localStorage.removeItem('stocktrack_token');
      localStorage.removeItem('stocktrack_user');
    }

    return Promise.reject(new Error(message));
  }
);

export const api = {
  // Auth
  register: (data: { username: string; password: string; business_name?: string; recovery_pin?: string }) =>
    apiClient.post('/auth/register', data) as Promise<{ success: boolean; data: any }>,
  
  login: (data: { username: string; password: string }) =>
    apiClient.post('/auth/login', data) as Promise<{ success: boolean; data: any }>,
  
  logout: () => apiClient.post('/auth/logout') as Promise<{ success: boolean; data: any }>,
  
  getMe: () => apiClient.get('/auth/me') as Promise<{ success: boolean; data: any }>,
  
  resetPassword: (data: { username: string; recovery_pin: string; new_password: string }) =>
    apiClient.post('/auth/reset-password', data) as Promise<{ success: boolean; data: any }>,
  
  changePassword: (data: { new_password: string }) =>
    apiClient.post('/auth/change-password', data) as Promise<{ success: boolean; data: any }>,

  // Products
  getProducts: (params?: { search?: string; supplier?: string; low_stock?: boolean }) =>
    apiClient.get('/products', { params }) as Promise<{ success: boolean; data: any[] }>,
  
  getProduct: (id: string) =>
    apiClient.get(`/products/${id}`) as Promise<{ success: boolean; data: any }>,
  
  createProduct: (data: any) =>
    apiClient.post('/products', data) as Promise<{ success: boolean; data: any }>,
  
  updateProduct: (id: string, data: any) =>
    apiClient.put(`/products/${id}`, data) as Promise<{ success: boolean; data: any }>,
  
  deleteProduct: (id: string) =>
    apiClient.delete(`/products/${id}`) as Promise<{ success: boolean; data: any }>,
  
  importProductsCsv: (csvData: string) =>
    apiClient.post('/products/import', { csv_data: csvData }) as Promise<{ success: boolean; data: any }>,

  // Transactions
  getTransactions: (params?: any) =>
    apiClient.get('/transactions', { params }) as Promise<{ success: boolean; data: any[] }>,
  
  createTransaction: (data: any) =>
    apiClient.post('/transactions', data) as Promise<{ success: boolean; data: any }>,
  
  deleteTransaction: (id: string) =>
    apiClient.delete(`/transactions/${id}`) as Promise<{ success: boolean; data: any }>,

  // Dashboard
  getDashboard: () => apiClient.get('/dashboard') as Promise<{ success: boolean; data: any }>,

  // Settings
  getSettings: () => apiClient.get('/settings') as Promise<{ success: boolean; data: any }>,
  
  updateSettings: (data: any) =>
    apiClient.post('/settings', data) as Promise<{ success: boolean; data: any }>,
  
  clearItems: () =>
    apiClient.post('/settings/clear-items') as Promise<{ success: boolean; data: any }>,

  restoreBackup: (data: { products: any[]; transactions: any[]; settings?: any; is_replace?: boolean }) =>
    apiClient.post('/settings/restore', data) as Promise<{ success: boolean; data: any }>,

  // Database Status
  getDatabaseStatus: () =>
    apiClient.get('/database/status') as Promise<{ success: boolean; data: any }>,
};

export default api;
