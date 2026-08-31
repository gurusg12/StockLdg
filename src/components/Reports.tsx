import React, { useState, useMemo, useRef } from 'react';
import {
  BarChart3,
  Calendar,
  Package,
  Building2,
  Download,
  ArrowLeft,
  ChevronRight,
  Printer,
  FileText,
  Boxes,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Product, Transaction } from '../types';
import { calculateCurrentStock } from '../utils/storage';
import { useAuth } from '../context/AuthContext';

interface ReportsProps {
  products: Product[];
  transactions: Transaction[];
  onOpenProductStatement?: (product: Product) => void;
}

type ReportCategory = 'inventory' | 'time' | 'supplier';
type ReportType =
  | 'summary'
  | 'stockledger'
  | 'lowstock'
  | 'daywise'
  | 'monthwise'
  | 'yearwise'
  | 'supplier';

export const Reports: React.FC<ReportsProps> = ({ products, transactions }) => {
  const { settings, updateSettings } = useAuth();

  const [activeCategory, setActiveCategory] = useState<ReportCategory>('inventory');
  const [activeReport, setActiveReport] = useState<ReportType | null>(null);
  const [statementProduct, setStatementProduct] = useState<Product | null>(null);

  const [selectedProductFilter, setSelectedProductFilter] = useState<string>('ALL');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('ALL');

  const [isExportingPDF, setIsExportingPDF] = useState<boolean>(false);
  const reportPrintRef = useRef<HTMLDivElement>(null);

  // All unique suppliers
  const suppliers = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.supplier && p.supplier.trim()) set.add(p.supplier.trim());
    });
    return Array.from(set).sort();
  }, [products]);

  // Report Catalog definitions
  const reportCatalog = {
    inventory: {
      title: 'Inventory Reports',
      icon: Package,
      items: [
        {
          id: 'summary' as ReportType,
          title: 'Stock Summary',
          desc: 'Opening, purchased, sold, and available stock per product',
        },
        {
          id: 'stockledger' as ReportType,
          title: 'Stock Ledger',
          desc: 'Detailed chronological movement history and running balance',
        },
        {
          id: 'lowstock' as ReportType,
          title: 'Low Stock & Reorder Report',
          desc: 'Items at or below threshold with suggested reorder quantities',
        },
      ],
    },
    time: {
      title: 'Time-wise Reports',
      icon: Calendar,
      items: [
        {
          id: 'daywise' as ReportType,
          title: 'Day-wise Summary',
          desc: 'Purchases and sales movements grouped by day',
        },
        {
          id: 'monthwise' as ReportType,
          title: 'Month-wise Summary',
          desc: 'Purchases and sales movements grouped by month',
        },
        {
          id: 'yearwise' as ReportType,
          title: 'Year-wise Summary',
          desc: 'Purchases and sales movements grouped by year',
        },
      ],
    },
    supplier: {
      title: 'Supplier Reports',
      icon: Building2,
      items: [
        {
          id: 'supplier' as ReportType,
          title: 'Supplier-wise Stock Report',
          desc: 'Stock movements and active balances grouped by supplier',
        },
      ],
    },
  };

  // Get active report title
  const getActiveReportTitle = () => {
    if (statementProduct) return `Product Statement: ${statementProduct.name}`;
    if (!activeReport) return 'Reports';
    for (const cat of Object.values(reportCatalog)) {
      const match = cat.items.find((i) => i.id === activeReport);
      if (match) return match.title;
    }
    return 'Report';
  };

  // PDF Export
  const handleExportPDF = async () => {
    if (!reportPrintRef.current) return;
    setIsExportingPDF(true);

    try {
      const canvas = await html2canvas(reportPrintRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4',
      });

      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      let heightLeft = pdfHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pdf.internal.pageSize.getHeight();

      while (heightLeft >= 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pdf.internal.pageSize.getHeight();
      }

      const reportName = (getActiveReportTitle() || 'stocktrack_report')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_');
      pdf.save(`${reportName}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF Generation failed', err);
    } finally {
      setIsExportingPDF(false);
    }
  };

  // 1. STOCK SUMMARY DATA
  const stockSummaryData = useMemo(() => {
    let filtered = products;
    if (selectedProductFilter !== 'ALL') {
      filtered = filtered.filter((p) => p.id === selectedProductFilter);
    }
    if (selectedSupplierFilter !== 'ALL') {
      filtered = filtered.filter((p) => p.supplier === selectedSupplierFilter);
    }

    return filtered.map((prod) => {
      let pur = 0;
      let sal = 0;
      transactions.forEach((tx) => {
        if (
          tx.productId === prod.id ||
          tx.productName.trim().toLowerCase() === prod.name.trim().toLowerCase()
        ) {
          const q = Number(tx.quantity) || 0;
          if (tx.type === 'IN') pur += q;
          if (tx.type === 'OUT') sal += q;
        }
      });
      const available = Number(prod.initialStock || 0) + pur - sal;
      const isLow = available <= (prod.threshold ?? 2);
      return {
        product: prod,
        opening: prod.initialStock || 0,
        purchased: pur,
        sold: sal,
        available,
        isLow,
      };
    });
  }, [products, transactions, selectedProductFilter, selectedSupplierFilter]);

  // 2. STOCK LEDGER DATA (with running balance)
  const stockLedgerData = useMemo(() => {
    let targetProds = products;
    if (selectedProductFilter !== 'ALL') {
      targetProds = targetProds.filter((p) => p.id === selectedProductFilter);
    }
    if (selectedSupplierFilter !== 'ALL') {
      targetProds = targetProds.filter((p) => p.supplier === selectedSupplierFilter);
    }

    return targetProds.map((prod) => {
      let running = Number(prod.initialStock) || 0;
      const prodTx = transactions
        .filter(
          (t) =>
            t.productId === prod.id ||
            t.productName.trim().toLowerCase() === prod.name.trim().toLowerCase()
        )
        .slice()
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const ledgerEntries = prodTx.map((tx) => {
        const q = Number(tx.quantity) || 0;
        const isPur = tx.type === 'IN';
        if (isPur) {
          running += q;
        } else {
          running -= q;
        }
        return {
          ...tx,
          inQty: isPur ? q : 0,
          outQty: isPur ? 0 : q,
          balance: running,
        };
      });

      return {
        product: prod,
        initialStock: prod.initialStock || 0,
        entries: ledgerEntries,
        finalBalance: running,
      };
    });
  }, [products, transactions, selectedProductFilter, selectedSupplierFilter]);

  // 3. LOW STOCK DATA
  const lowStockData = useMemo(() => {
    return products
      .map((p) => {
        const currentStock = calculateCurrentStock(p, transactions);
        const threshold = p.threshold ?? 2;
        const reorderNeeded = Math.max(0, threshold * 2 - currentStock || threshold);
        return {
          product: p,
          currentStock,
          threshold,
          reorderNeeded,
          isLow: currentStock <= threshold,
        };
      })
      .filter((item) => item.isLow)
      .sort((a, b) => a.currentStock - b.currentStock);
  }, [products, transactions]);

  // 4. TIME-WISE GROUPINGS (Day / Month / Year)
  const timeGroupedData = useMemo(() => {
    let filteredTx = transactions;
    if (selectedProductFilter !== 'ALL') {
      filteredTx = filteredTx.filter((t) => t.productId === selectedProductFilter);
    }

    const groupMap: Record<
      string,
      { period: string; productName: string; inQty: number; outQty: number; count: number }
    > = {};

    filteredTx.forEach((tx) => {
      if (!tx.date) return;
      const [y, m] = tx.date.split('-');
      let periodKey = tx.date;
      if (activeReport === 'monthwise') periodKey = `${y}-${m}`;
      if (activeReport === 'yearwise') periodKey = y;

      const comboKey = `${periodKey}___${tx.productName}`;
      if (!groupMap[comboKey]) {
        groupMap[comboKey] = {
          period: periodKey,
          productName: tx.productName,
          inQty: 0,
          outQty: 0,
          count: 0,
        };
      }
      const q = Number(tx.quantity) || 0;
      if (tx.type === 'IN') groupMap[comboKey].inQty += q;
      if (tx.type === 'OUT') groupMap[comboKey].outQty += q;
      groupMap[comboKey].count += 1;
    });

    return Object.values(groupMap).sort((a, b) => b.period.localeCompare(a.period));
  }, [transactions, selectedProductFilter, activeReport]);

  // 5. SUPPLIER REPORT DATA
  const supplierReportData = useMemo(() => {
    const suppMap: Record<
      string,
      {
        supplier: string;
        productsCount: number;
        inQty: number;
        outQty: number;
        totalAvailableStock: number;
      }
    > = {};

    products.forEach((prod) => {
      const supp = prod.supplier?.trim() || 'Unassigned';
      if (!suppMap[supp]) {
        suppMap[supp] = {
          supplier: supp,
          productsCount: 0,
          inQty: 0,
          outQty: 0,
          totalAvailableStock: 0,
        };
      }

      suppMap[supp].productsCount += 1;
      const stock = calculateCurrentStock(prod, transactions);
      suppMap[supp].totalAvailableStock += stock;
    });

    transactions.forEach((tx) => {
      const prod = products.find(
        (p) =>
          p.id === tx.productId ||
          p.name.trim().toLowerCase() === tx.productName.trim().toLowerCase()
      );
      const supp = prod?.supplier?.trim() || 'Unassigned';
      if (suppMap[supp]) {
        const q = Number(tx.quantity) || 0;
        if (tx.type === 'IN') suppMap[supp].inQty += q;
        if (tx.type === 'OUT') suppMap[supp].outQty += q;
      }
    });

    let list = Object.values(suppMap);
    if (selectedSupplierFilter !== 'ALL') {
      list = list.filter((s) => s.supplier === selectedSupplierFilter);
    }
    return list;
  }, [products, transactions, selectedSupplierFilter]);

  // Render Product Statement
  if (statementProduct) {
    let runningBalance = Number(statementProduct.initialStock) || 0;
    let totalIn = 0;
    let totalOut = 0;

    const prodTx = transactions
      .filter(
        (t) =>
          t.productId === statementProduct.id ||
          t.productName.trim().toLowerCase() === statementProduct.name.trim().toLowerCase()
      )
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return (
      <div className="space-y-4 pb-8">
        {/* Header bar */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              id="statement-back-btn"
              onClick={() => setStatementProduct(null)}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                Product Statement: {statementProduct.name}
              </h2>
              <p className="text-xs text-slate-500">
                Supplier: {statementProduct.supplier || 'Unassigned'} • Threshold:{' '}
                {statementProduct.threshold ?? 2}
              </p>
            </div>
          </div>

          <button
            onClick={handleExportPDF}
            disabled={isExportingPDF}
            className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExportingPDF ? 'Generating...' : 'Download PDF'}</span>
          </button>
        </div>

        {/* Statement Printable Area */}
        <div
          ref={reportPrintRef}
          className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-5"
        >
          {/* Printable Report Header */}
          <div className="border-b border-slate-200 pb-4 flex justify-between items-start">
            <div>
              <h1 className="text-lg font-black text-slate-900">
                {settings.businessName || 'STOCKTRACK'}
              </h1>
              <p className="text-xs font-bold text-sky-700 mt-0.5">
                Product Statement — {statementProduct.name}
              </p>
              {statementProduct.supplier && (
                <p className="text-xs text-slate-500">Supplier: {statementProduct.supplier}</p>
              )}
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>Generated: {new Date().toLocaleDateString()}</p>
              <p className="font-semibold text-slate-700">Stock Units History</p>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3 text-right text-emerald-700">Stock In (+)</th>
                  <th className="py-3 px-3 text-right text-rose-700">Stock Out (-)</th>
                  <th className="py-3 px-3 text-right">Balance</th>
                  <th className="py-3 px-3">Description / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {/* Opening Row */}
                <tr className="bg-slate-50/50 font-bold">
                  <td className="py-2.5 px-3 text-slate-500">—</td>
                  <td className="py-2.5 px-3 text-right text-slate-400">—</td>
                  <td className="py-2.5 px-3 text-right text-slate-400">—</td>
                  <td className="py-2.5 px-3 text-right font-black text-slate-900">
                    {statementProduct.initialStock || 0}
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 text-xs italic">
                    Opening Stock Balance
                  </td>
                </tr>

                {prodTx.map((tx) => {
                  const isPur = tx.type === 'IN';
                  const q = Number(tx.quantity) || 0;
                  if (isPur) {
                    runningBalance += q;
                    totalIn += q;
                  } else {
                    runningBalance -= q;
                    totalOut += q;
                  }

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-slate-600">{tx.date}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-600">
                        {isPur ? `+${q}` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-600">
                        {!isPur ? `-${q}` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-slate-900">
                        {runningBalance}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 text-xs">
                        {tx.description || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Statement Summary Bar */}
          <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200/80 text-xs sm:text-sm">
            <div>
              <span className="text-slate-500 font-semibold block text-[11px]">
                Total Received (In)
              </span>
              <span className="font-extrabold text-emerald-600">+{totalIn} units</span>
            </div>
            <div>
              <span className="text-slate-500 font-semibold block text-[11px]">
                Total Dispatched (Out)
              </span>
              <span className="font-extrabold text-rose-600">-{totalOut} units</span>
            </div>
            <div>
              <span className="text-slate-500 font-semibold block text-[11px]">
                Current Available Stock
              </span>
              <span className="font-black text-slate-900">{runningBalance} units</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Category Tabs & Header */}
      {!activeReport ? (
        <div className="space-y-5">
          {/* Top Banner */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-sky-600" />
              <span>Inventory & Stock Reports</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Select a report category to analyze inventory levels, chronological movement ledgers,
              and supplier activity.
            </p>

            {/* Category Selector Tabs */}
            <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
              {(['inventory', 'time', 'supplier'] as ReportCategory[]).map((catKey) => {
                const cat = reportCatalog[catKey];
                const Icon = cat.icon;
                const isActive = activeCategory === catKey;
                return (
                  <button
                    key={catKey}
                    id={`report-category-tab-${catKey}`}
                    onClick={() => setActiveCategory(catKey)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      isActive
                        ? 'bg-sky-600 text-white shadow-sm shadow-sky-200'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{cat.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Category Report Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {reportCatalog[activeCategory].items.map((item) => (
              <div
                key={item.id}
                id={`open-report-${item.id}`}
                onClick={() => setActiveReport(item.id)}
                className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-sky-300 transition-all cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mb-3 group-hover:bg-sky-600 group-hover:text-white transition-colors">
                    <FileText className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 mb-1">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                </div>

                <div className="pt-4 mt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-sky-600">
                  <span>View Report</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* REPORT DETAIL VIEW */
        <div className="space-y-4">
          {/* Report Top Control Bar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                id="report-detail-back-btn"
                onClick={() => setActiveReport(null)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors"
                title="Back to Reports"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                  {getActiveReportTitle()}
                </h2>
                <p className="text-xs text-slate-500">
                  Click any product row to open its detailed statement ledger.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                id="report-pdf-export-btn"
                onClick={handleExportPDF}
                disabled={isExportingPDF}
                className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-sm shadow-sky-200 transition-colors shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isExportingPDF ? 'Generating PDF...' : 'Download PDF'}</span>
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-sm flex flex-wrap gap-3 items-center text-xs">
            {/* Product Filter */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600">Product:</span>
              <select
                id="report-filter-product"
                value={selectedProductFilter}
                onChange={(e) => setSelectedProductFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-semibold text-slate-700 outline-none focus:border-sky-500"
              >
                <option value="ALL">-- All Products --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Supplier Filter (when applicable) */}
            {(activeReport === 'summary' ||
              activeReport === 'stockledger' ||
              activeReport === 'supplier') && (
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-600">Supplier:</span>
                <select
                  id="report-filter-supplier"
                  value={selectedSupplierFilter}
                  onChange={(e) => setSelectedSupplierFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-semibold text-slate-700 outline-none focus:border-sky-500"
                >
                  <option value="ALL">-- All Suppliers --</option>
                  {suppliers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* PRINTABLE REPORT CONTAINER */}
          <div
            ref={reportPrintRef}
            className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-4"
          >
            {/* Print Header */}
            <div className="border-b border-slate-200 pb-3 flex justify-between items-start">
              <div>
                <h1 className="text-base sm:text-lg font-black text-slate-900">
                  {settings.businessName || 'STOCKTRACK'}
                </h1>
                <p className="text-xs font-bold text-sky-700 mt-0.5">{getActiveReportTitle()}</p>
              </div>
              <div className="text-right text-[11px] text-slate-500">
                <p>Date: {new Date().toLocaleDateString()}</p>
                <p className="font-semibold text-slate-700">Inventory Stock Report</p>
              </div>
            </div>

            {/* 1. STOCK SUMMARY TABLE */}
            {activeReport === 'summary' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-3">Product Name</th>
                      <th className="py-3 px-3">Supplier</th>
                      <th className="py-3 px-3 text-right">Opening</th>
                      <th className="py-3 px-3 text-right text-emerald-700">Purchased (In)</th>
                      <th className="py-3 px-3 text-right text-rose-700">Sold (Out)</th>
                      <th className="py-3 px-3 text-right">Available Stock</th>
                      <th className="py-3 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {stockSummaryData.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          No matching records.
                        </td>
                      </tr>
                    ) : (
                      stockSummaryData.map((row) => (
                        <tr
                          key={row.product.id}
                          onClick={() => setStatementProduct(row.product)}
                          className="hover:bg-sky-50/50 cursor-pointer transition-colors"
                          title="Click to view detailed product statement"
                        >
                          <td className="py-3 px-3 font-bold text-slate-900">
                            {row.product.name}
                          </td>
                          <td className="py-3 px-3 text-slate-500 text-xs">
                            {row.product.supplier || '—'}
                          </td>
                          <td className="py-3 px-3 text-right">{row.opening}</td>
                          <td className="py-3 px-3 text-right font-bold text-emerald-600">
                            +{row.purchased}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-rose-600">
                            -{row.sold}
                          </td>
                          <td className="py-3 px-3 text-right font-black text-slate-900">
                            {row.available}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                row.isLow
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {row.isLow ? 'Low Stock' : 'Adequate'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* 2. STOCK LEDGER TABLE */}
            {activeReport === 'stockledger' && (
              <div className="space-y-6">
                {stockLedgerData.map((prodLedger) => (
                  <div
                    key={prodLedger.product.id}
                    className="border border-slate-200 rounded-xl p-4 bg-slate-50/30"
                  >
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200">
                      <div>
                        <h4
                          onClick={() => setStatementProduct(prodLedger.product)}
                          className="font-extrabold text-sm text-slate-900 hover:text-sky-600 cursor-pointer transition-colors inline-flex items-center gap-1"
                        >
                          <span>{prodLedger.product.name}</span>
                          <span className="text-[10px] text-sky-600 font-semibold underline">
                            (View Statement)
                          </span>
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Supplier: {prodLedger.product.supplier || 'Unassigned'}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] text-slate-500 block">Final Balance:</span>
                        <span className="font-black text-xs sm:text-sm text-slate-900">
                          {prodLedger.finalBalance} units
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100/70 text-slate-600 font-bold text-[10px] uppercase">
                          <tr>
                            <th className="py-2 px-2.5">Date</th>
                            <th className="py-2 px-2.5 text-right text-emerald-700">Stock In (+)</th>
                            <th className="py-2 px-2.5 text-right text-rose-700">Stock Out (-)</th>
                            <th className="py-2 px-2.5 text-right">Running Balance</th>
                            <th className="py-2 px-2.5">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                          <tr className="bg-white font-bold">
                            <td className="py-2 px-2.5 text-slate-400">—</td>
                            <td className="py-2 px-2.5 text-right text-slate-400">—</td>
                            <td className="py-2 px-2.5 text-right text-slate-400">—</td>
                            <td className="py-2 px-2.5 text-right font-black text-slate-900">
                              {prodLedger.initialStock}
                            </td>
                            <td className="py-2 px-2.5 text-slate-400 italic">Opening Stock</td>
                          </tr>
                          {prodLedger.entries.map((entry) => (
                            <tr key={entry.id} className="hover:bg-white transition-colors">
                              <td className="py-2 px-2.5 text-slate-600">{entry.date}</td>
                              <td className="py-2 px-2.5 text-right font-bold text-emerald-600">
                                {entry.inQty > 0 ? `+${entry.inQty}` : '—'}
                              </td>
                              <td className="py-2 px-2.5 text-right font-bold text-rose-600">
                                {entry.outQty > 0 ? `-${entry.outQty}` : '—'}
                              </td>
                              <td className="py-2 px-2.5 text-right font-black text-slate-900">
                                {entry.balance}
                              </td>
                              <td className="py-2 px-2.5 text-slate-500 text-[11px]">
                                {entry.description || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 3. LOW STOCK / REORDER REPORT */}
            {activeReport === 'lowstock' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-3">Product Name</th>
                      <th className="py-3 px-3">Supplier</th>
                      <th className="py-3 px-3 text-right">Available Stock</th>
                      <th className="py-3 px-3 text-right">Threshold</th>
                      <th className="py-3 px-3 text-right text-emerald-700">
                        Suggested Reorder Qty
                      </th>
                      <th className="py-3 px-3">Reminder Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {lowStockData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                          <p className="font-semibold text-slate-700">All Items Well Stocked</p>
                          <p className="text-xs text-slate-400">
                            No products are currently at or below their low-stock threshold.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      lowStockData.map((row) => (
                        <tr
                          key={row.product.id}
                          onClick={() => setStatementProduct(row.product)}
                          className="hover:bg-rose-50/40 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-3 font-bold text-slate-900">
                            {row.product.name}
                          </td>
                          <td className="py-3 px-3 text-slate-500 text-xs">
                            {row.product.supplier || '—'}
                          </td>
                          <td className="py-3 px-3 text-right font-black text-rose-600">
                            {row.currentStock} units
                          </td>
                          <td className="py-3 px-3 text-right text-slate-600">
                            {row.threshold} units
                          </td>
                          <td className="py-3 px-3 text-right font-extrabold text-emerald-600">
                            +{row.reorderNeeded} units
                          </td>
                          <td className="py-3 px-3 text-slate-500 text-xs">
                            {row.product.reminderDate || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* 4. TIME-WISE (Day / Month / Year) */}
            {(activeReport === 'daywise' ||
              activeReport === 'monthwise' ||
              activeReport === 'yearwise') && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-3">
                        {activeReport === 'daywise'
                          ? 'Date'
                          : activeReport === 'monthwise'
                          ? 'Month'
                          : 'Year'}
                      </th>
                      <th className="py-3 px-3">Product Name</th>
                      <th className="py-3 px-3 text-right text-emerald-700">Stock In (+)</th>
                      <th className="py-3 px-3 text-right text-rose-700">Stock Out (-)</th>
                      <th className="py-3 px-3 text-right">Net Movement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {timeGroupedData.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          No transactions found for this period.
                        </td>
                      </tr>
                    ) : (
                      timeGroupedData.map((row, idx) => {
                        const net = row.inQty - row.outQty;
                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-3 font-bold text-slate-900">{row.period}</td>
                            <td className="py-3 px-3 font-semibold text-slate-800">
                              {row.productName}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-emerald-600">
                              +{row.inQty}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-rose-600">
                              -{row.outQty}
                            </td>
                            <td
                              className={`py-3 px-3 text-right font-black ${
                                net >= 0 ? 'text-emerald-700' : 'text-rose-700'
                              }`}
                            >
                              {net >= 0 ? `+${net}` : net} units
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* 5. SUPPLIER-WISE REPORT */}
            {activeReport === 'supplier' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-3">Supplier Name</th>
                      <th className="py-3 px-3 text-center">Products Count</th>
                      <th className="py-3 px-3 text-right text-emerald-700">Total Stock In</th>
                      <th className="py-3 px-3 text-right text-rose-700">Total Stock Out</th>
                      <th className="py-3 px-3 text-right">Active Available Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {supplierReportData.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          No supplier data recorded.
                        </td>
                      </tr>
                    ) : (
                      supplierReportData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-3 font-bold text-slate-900">{row.supplier}</td>
                          <td className="py-3 px-3 text-center font-semibold text-slate-700">
                            {row.productsCount} item{row.productsCount === 1 ? '' : 's'}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-emerald-600">
                            +{row.inQty}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-rose-600">
                            -{row.outQty}
                          </td>
                          <td className="py-3 px-3 text-right font-black text-slate-900">
                            {row.totalAvailableStock} units
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
