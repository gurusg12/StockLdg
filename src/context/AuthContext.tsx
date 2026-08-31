import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserAccount, BusinessSettings } from '../types';
import { api } from '../services/api';
import {
  getAllUsers,
  saveAllUsers,
  hashString,
  generateId,
  loadUserSettings,
  saveUserSettings,
} from '../utils/storage';

interface AuthContextType {
  currentUser: UserAccount | null;
  settings: BusinessSettings;
  isLoading: boolean;
  login: (username: string, password: string, remember: boolean) => Promise<{ success: boolean; message?: string }>;
  register: (
    username: string,
    password: string,
    businessName?: string,
    securityCode?: string
  ) => Promise<{ success: boolean; message?: string }>;
  forgotPassword: (
    username: string,
    securityCode: string,
    newPassword: string
  ) => Promise<{ success: boolean; message?: string }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; message?: string }>;
  updateSettings: (newSettings: Partial<BusinessSettings>) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACTIVE_USER_SESSION_KEY = 'stocktrack_session_user';
export const REMEMBERED_USERNAME_KEY = 'stocktrack_remembered_username';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [settings, setSettings] = useState<BusinessSettings>({
    businessName: '',
    phone: '',
    address: '',
    reportHeaderName: '',
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Restore session on mount
  useEffect(() => {
    async function restoreSession() {
      const token = localStorage.getItem('stocktrack_token');
      if (token) {
        try {
          const res = await api.getMe();
          if (res?.data?.user) {
            const u: UserAccount = {
              id: String(res.data.user.id),
              username: res.data.user.username,
              passwordHash: '',
              businessName: res.data.user.business_name || '',
              createdAt: new Date().toISOString(),
            };
            setCurrentUser(u);
            const bSettings: BusinessSettings = {
              businessName: res.data.settings?.business_name || res.data.user.business_name || '',
              phone: res.data.settings?.phone || '',
              address: res.data.settings?.address || '',
              reportHeaderName: res.data.settings?.report_header_name || '',
            };
            setSettings(bSettings);
            setIsLoading(false);
            return;
          }
        } catch {
          // Token expired, fallback to local cache
        }
      }

      const sessionUserStr = localStorage.getItem(ACTIVE_USER_SESSION_KEY);
      if (sessionUserStr) {
        try {
          const user: UserAccount = JSON.parse(sessionUserStr);
          setCurrentUser(user);
          const userSettings = loadUserSettings(user.username);
          setSettings(userSettings);
        } catch {
          localStorage.removeItem(ACTIVE_USER_SESSION_KEY);
        }
      }
      setIsLoading(false);
    }

    restoreSession();
  }, []);

  const login = async (username: string, password: string, remember: boolean) => {
    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      return { success: false, message: 'Please enter both username and password.' };
    }

    try {
      // 1. Authenticate with real SQLite Database API
      const res = await api.login({ username: trimmedUser, password });
      if (res?.data?.token) {
        localStorage.setItem('stocktrack_token', res.data.token);
        const u: UserAccount = {
          id: String(res.data.user.id),
          username: res.data.user.username,
          passwordHash: '',
          businessName: res.data.user.business_name || '',
          createdAt: new Date().toISOString(),
        };

        localStorage.setItem(ACTIVE_USER_SESSION_KEY, JSON.stringify(u));
        if (remember) {
          localStorage.setItem(REMEMBERED_USERNAME_KEY, trimmedUser);
        } else {
          localStorage.removeItem(REMEMBERED_USERNAME_KEY);
        }

        setCurrentUser(u);

        // Fetch settings from SQLite
        try {
          const setRes = await api.getSettings();
          if (setRes?.data) {
            setSettings({
              businessName: setRes.data.business_name || u.businessName || '',
              phone: setRes.data.phone || '',
              address: setRes.data.address || '',
              reportHeaderName: setRes.data.report_header_name || '',
            });
          }
        } catch {
          // fallback
        }

        return { success: true };
      }
    } catch (apiErr: any) {
      // If error from backend, return error message
      if (apiErr?.message && !apiErr.message.includes('Network')) {
        return { success: false, message: apiErr.message };
      }
    }

    // Fallback: Local offline check
    const users = getAllUsers();
    const user = users.find((u) => u.username.toLowerCase() === trimmedUser.toLowerCase());
    if (!user) {
      return { success: false, message: 'Incorrect username or password.' };
    }

    const pwHash = await hashString(password);
    if (user.passwordHash !== pwHash) {
      return { success: false, message: 'Incorrect username or password.' };
    }

    localStorage.setItem(ACTIVE_USER_SESSION_KEY, JSON.stringify(user));
    if (remember) {
      localStorage.setItem(REMEMBERED_USERNAME_KEY, trimmedUser);
    } else {
      localStorage.removeItem(REMEMBERED_USERNAME_KEY);
    }

    setCurrentUser(user);
    const userSettings = loadUserSettings(user.username);
    setSettings(userSettings);

    return { success: true };
  };

  const register = async (
    username: string,
    password: string,
    businessName?: string,
    securityCode?: string
  ) => {
    const trimmedUser = username.trim();
    if (!trimmedUser) {
      return { success: false, message: 'Username is required.' };
    }
    if (password.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters.' };
    }
    if (securityCode && !/^\d{4}$/.test(securityCode.trim())) {
      return { success: false, message: 'Security code must be exactly 4 numeric digits.' };
    }

    try {
      // 1. Write user and provision SQLite database in backend/databases/main.sqlite
      const res = await api.register({
        username: trimmedUser,
        password,
        business_name: businessName?.trim() || '',
        recovery_pin: securityCode?.trim() || '',
      });

      if (res?.data?.token) {
        localStorage.setItem('stocktrack_token', res.data.token);
        const newUser: UserAccount = {
          id: String(res.data.user.id),
          username: res.data.user.username,
          passwordHash: '',
          businessName: res.data.user.business_name || '',
          createdAt: new Date().toISOString(),
        };

        localStorage.setItem(ACTIVE_USER_SESSION_KEY, JSON.stringify(newUser));
        setCurrentUser(newUser);

        const initialSettings: BusinessSettings = {
          businessName: businessName?.trim() || '',
          phone: '',
          address: '',
          reportHeaderName: businessName?.trim() ? `${businessName.trim()} — Inventory Report` : 'StockTrack Inventory Report',
        };
        setSettings(initialSettings);

        // Also update local storage cache
        const users = getAllUsers();
        users.push(newUser);
        saveAllUsers(users);
        saveUserSettings(trimmedUser, initialSettings);

        return { success: true };
      }
    } catch (apiErr: any) {
      return { success: false, message: apiErr.message || 'Registration failed.' };
    }

    return { success: false, message: 'Registration failed.' };
  };

  const forgotPassword = async (
    username: string,
    securityCode: string,
    newPassword: string
  ) => {
    const trimmedUser = username.trim();
    const trimmedCode = securityCode.trim();

    if (!trimmedUser || !trimmedCode || !newPassword) {
      return { success: false, message: 'Please complete all required fields.' };
    }
    if (newPassword.length < 6) {
      return { success: false, message: 'New password must be at least 6 characters.' };
    }

    try {
      // Update in SQLite main.sqlite
      await api.resetPassword({
        username: trimmedUser,
        recovery_pin: trimmedCode,
        new_password: newPassword,
      });

      // Update local storage
      const users = getAllUsers();
      const userIndex = users.findIndex((u) => u.username.toLowerCase() === trimmedUser.toLowerCase());
      if (userIndex !== -1) {
        const newHash = await hashString(newPassword);
        users[userIndex].passwordHash = newHash;
        saveAllUsers(users);
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Reset failed.' };
    }
  };

  const updatePassword = async (newPassword: string) => {
    if (!currentUser) {
      return { success: false, message: 'Not logged in.' };
    }
    if (newPassword.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters.' };
    }

    try {
      await api.changePassword({ new_password: newPassword });
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Update failed.' };
    }
  };

  const updateSettings = async (newSettings: Partial<BusinessSettings>) => {
    if (!currentUser) return;
    const merged = { ...settings, ...newSettings };
    setSettings(merged);
    saveUserSettings(currentUser.username, merged);

    try {
      await api.updateSettings({
        business_name: merged.businessName,
        phone: merged.phone,
        address: merged.address,
        report_header_name: merged.reportHeaderName,
      });
    } catch {
      // Keep local state
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore
    }
    localStorage.removeItem('stocktrack_token');
    localStorage.removeItem(ACTIVE_USER_SESSION_KEY);
    setCurrentUser(null);
    setSettings({
      businessName: '',
      phone: '',
      address: '',
      reportHeaderName: '',
    });
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        settings,
        isLoading,
        login,
        register,
        forgotPassword,
        updatePassword,
        updateSettings,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
