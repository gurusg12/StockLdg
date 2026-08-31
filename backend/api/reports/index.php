<?php
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../services/Response.php';
require_once __DIR__ . '/../../middleware/auth.php';

use StockTrack\Services\Response;
use StockTrack\Middleware\Auth;

Response::handleCors();

$auth = Auth::authenticate();
$tenantDb = $auth['tenant_db'];
$user = $auth['user'];

$reportType = strtolower(trim($_GET['type'] ?? 'summary'));
$selectedProduct = trim($_GET['product_id'] ?? $_GET['product'] ?? 'ALL');
$selectedSupplier = trim($_GET['supplier'] ?? 'ALL');

// 1. STOCK SUMMARY REPORT
if ($reportType === 'summary') {
    $sql = "SELECT id, name, supplier, stock AS initial_stock, threshold_qty FROM products WHERE 1=1";
    $params = [];
    if ($selectedProduct !== 'ALL' && !empty($selectedProduct)) {
        $sql .= " AND (id = :pid OR name = :pname)";
        $params[':pid'] = $selectedProduct;
        $params[':pname'] = $selectedProduct;
    }
    $sql .= " ORDER BY name ASC";
    $stmt = $tenantDb->prepare($sql);
    $stmt->execute($params);
    $products = $stmt->fetchAll();

    $reportData = [];
    $totalAvailable = 0;

    foreach ($products as $p) {
        $txStmt = $tenantDb->prepare("
            SELECT
                COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE 0 END), 0) AS purchased,
                COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0) AS sold
            FROM transactions
            WHERE product_id = :pid OR product_name = :pname
        ");
        $txStmt->execute([':pid' => $p['id'], ':pname' => $p['name']]);
        $tx = $txStmt->fetch();

        $opening = (int)$p['initial_stock'];
        $purchased = (int)$tx['purchased'];
        $sold = (int)$tx['sold'];
        $available = $opening + $purchased - $sold;
        $totalAvailable += $available;
        $threshold = (int)($p['threshold_qty'] ?? 2);
        $isLow = $available <= $threshold;

        $reportData[] = [
            'id' => $p['id'],
            'name' => $p['name'],
            'supplier' => $p['supplier'] ?? '',
            'opening_stock' => $opening,
            'purchased' => $purchased,
            'sold' => $sold,
            'available_stock' => $available,
            'threshold_qty' => $threshold,
            'status' => $isLow ? 'Low Stock' : 'Sufficient',
            'is_low_stock' => $isLow
        ];
    }

    Response::json([
        'report_type' => 'summary',
        'title' => 'Stock Summary Report',
        'total_products' => count($reportData),
        'total_available_stock' => $totalAvailable,
        'rows' => $reportData
    ]);
}

// 2. STOCK LEDGER REPORT
if ($reportType === 'ledger' || $reportType === 'stockledger') {
    $sql = "SELECT id, name, supplier, stock AS initial_stock, threshold_qty FROM products WHERE 1=1";
    $params = [];
    if ($selectedProduct !== 'ALL' && !empty($selectedProduct)) {
        $sql .= " AND (id = :pid OR name = :pname)";
        $params[':pid'] = $selectedProduct;
        $params[':pname'] = $selectedProduct;
    }
    $sql .= " ORDER BY name ASC";
    $stmt = $tenantDb->prepare($sql);
    $stmt->execute($params);
    $products = $stmt->fetchAll();

    $ledgerRows = [];
    $totalIn = 0;
    $totalOut = 0;

    foreach ($products as $p) {
        $runningBal = (int)$p['initial_stock'];
        $threshold = (int)($p['threshold_qty'] ?? 2);

        // Opening stock entry
        $ledgerRows[] = [
            'date' => '--',
            'product_id' => $p['id'],
            'product_name' => $p['name'],
            'supplier' => $p['supplier'] ?? '',
            'type' => 'OPENING',
            'in' => 0,
            'out' => 0,
            'balance' => $runningBal,
            'description' => 'Opening Stock',
            'is_opening' => true
        ];

        // Fetch transactions sorted by date ASC
        $txStmt = $tenantDb->prepare("
            SELECT id, type, quantity, description, date
            FROM transactions
            WHERE product_id = :pid OR product_name = :pname
            ORDER BY date ASC, created_at ASC
        ");
        $txStmt->execute([':pid' => $p['id'], ':pname' => $p['name']]);
        $txs = $txStmt->fetchAll();

        foreach ($txs as $t) {
            $qty = (int)$t['quantity'];
            $inQty = $t['type'] === 'IN' ? $qty : 0;
            $outQty = $t['type'] === 'OUT' ? $qty : 0;

            if ($t['type'] === 'IN') {
                $runningBal += $qty;
                $totalIn += $qty;
            } else {
                $runningBal -= $qty;
                $totalOut += $qty;
            }

            $ledgerRows[] = [
                'id' => $t['id'],
                'date' => $t['date'],
                'product_id' => $p['id'],
                'product_name' => $p['name'],
                'supplier' => $p['supplier'] ?? '',
                'type' => $t['type'],
                'in' => $inQty,
                'out' => $outQty,
                'balance' => $runningBal,
                'description' => $t['description'] ?? '',
                'is_opening' => false,
                'is_low' => $runningBal <= $threshold
            ];
        }
    }

    Response::json([
        'report_type' => 'ledger',
        'title' => 'Stock Ledger Report',
        'total_purchased' => $totalIn,
        'total_sold' => $totalOut,
        'rows' => $ledgerRows
    ]);
}

// 3. PRODUCT STATEMENT (Single product ledger drilldown)
if ($reportType === 'statement') {
    $productStmt = $tenantDb->prepare("SELECT * FROM products WHERE id = :pid OR name = :pname LIMIT 1");
    $productStmt->execute([':pid' => $selectedProduct, ':pname' => $selectedProduct]);
    $prod = $productStmt->fetch();

    if (!$prod) {
        Response::error('Product not found for statement generation.', 404);
    }

    $runningBal = (int)$prod['stock'];
    $threshold = (int)($prod['threshold_qty'] ?? 2);
    $totalIn = 0;
    $totalOut = 0;

    $statementRows = [];

    $txStmt = $tenantDb->prepare("
        SELECT id, type, quantity, description, date
        FROM transactions
        WHERE product_id = :pid OR product_name = :pname
        ORDER BY date ASC, created_at ASC
    ");
    $txStmt->execute([':pid' => $prod['id'], ':pname' => $prod['name']]);
    $txs = $txStmt->fetchAll();

    foreach ($txs as $t) {
        $qty = (int)$t['quantity'];
        $inQty = $t['type'] === 'IN' ? $qty : 0;
        $outQty = $t['type'] === 'OUT' ? $qty : 0;

        if ($t['type'] === 'IN') {
            $runningBal += $qty;
            $totalIn += $qty;
        } else {
            $runningBal -= $qty;
            $totalOut += $qty;
        }

        $statementRows[] = [
            'id' => $t['id'],
            'date' => $t['date'],
            'in' => $inQty,
            'out' => $outQty,
            'balance' => $runningBal,
            'description' => $t['description'] ?? '',
            'is_low' => $runningBal <= $threshold
        ];
    }

    Response::json([
        'report_type' => 'statement',
        'product' => [
            'id' => $prod['id'],
            'name' => $prod['name'],
            'supplier' => $prod['supplier'] ?? '',
            'opening_stock' => (int)$prod['stock'],
            'current_stock' => $runningBal,
            'threshold_qty' => $threshold,
            'total_purchased' => $totalIn,
            'total_sold' => $totalOut
        ],
        'rows' => $statementRows
    ]);
}

// 4. DAY-WISE / MONTH-WISE / YEAR-WISE REPORT
if (in_array($reportType, ['daywise', 'monthwise', 'yearwise'])) {
    $sql = "SELECT date, product_name, type, quantity FROM transactions WHERE 1=1";
    $params = [];
    if ($selectedProduct !== 'ALL' && !empty($selectedProduct)) {
        $sql .= " AND product_name = :pname";
        $params[':pname'] = $selectedProduct;
    }
    $stmt = $tenantDb->prepare($sql);
    $stmt->execute($params);
    $allTx = $stmt->fetchAll();

    $grouping = [];
    foreach ($allTx as $t) {
        $d = $t['date'];
        if (empty($d)) continue;

        $periodKey = $d;
        if ($reportType === 'monthwise') {
            $periodKey = substr($d, 0, 7); // YYYY-MM
        } elseif ($reportType === 'yearwise') {
            $periodKey = substr($d, 0, 4); // YYYY
        }

        $comboKey = $periodKey . '___' . $t['product_name'];
        if (!isset($grouping[$comboKey])) {
            $grouping[$comboKey] = [
                'period' => $periodKey,
                'product_name' => $t['product_name'],
                'purchase' => 0,
                'sales' => 0,
                'count' => 0
            ];
        }

        $qty = (int)$t['quantity'];
        if ($t['type'] === 'IN') {
            $grouping[$comboKey]['purchase'] += $qty;
        } else {
            $grouping[$comboKey]['sales'] += $qty;
        }
        $grouping[$comboKey]['count']++;
    }

    krsort($grouping);

    $rows = [];
    $grandIn = 0;
    $grandOut = 0;

    foreach ($grouping as $item) {
        $net = $item['purchase'] - $item['sales'];
        $grandIn += $item['purchase'];
        $grandOut += $item['sales'];

        $rows[] = [
            'period' => $item['period'],
            'product_name' => $item['product_name'],
            'purchase' => $item['purchase'],
            'sales' => $item['sales'],
            'net_change' => $net,
            'transaction_count' => $item['count']
        ];
    }

    Response::json([
        'report_type' => $reportType,
        'title' => ucfirst($reportType) . ' Movement Summary',
        'total_purchased' => $grandIn,
        'total_sold' => $grandOut,
        'net_movement' => $grandIn - $grandOut,
        'rows' => $rows
    ]);
}

// 5. SUPPLIER REPORT
if ($reportType === 'supplier') {
    $sql = "SELECT id, name, supplier, stock AS initial_stock FROM products WHERE 1=1";
    $params = [];
    if ($selectedSupplier !== 'ALL' && !empty($selectedSupplier)) {
        $sql .= " AND supplier = :supplier";
        $params[':supplier'] = $selectedSupplier;
    }
    $stmt = $tenantDb->prepare($sql);
    $stmt->execute($params);
    $products = $stmt->fetchAll();

    $supplierRows = [];
    $grandIn = 0;
    $grandOut = 0;

    foreach ($products as $p) {
        $txStmt = $tenantDb->prepare("
            SELECT
                COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE 0 END), 0) AS purchased,
                COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0) AS sold
            FROM transactions
            WHERE product_id = :pid OR product_name = :pname
        ");
        $txStmt->execute([':pid' => $p['id'], ':pname' => $p['name']]);
        $tx = $txStmt->fetch();

        $opening = (int)$p['initial_stock'];
        $pur = (int)$tx['purchased'];
        $sal = (int)$tx['sold'];
        $avail = $opening + $pur - $sal;

        $grandIn += $pur;
        $grandOut += $sal;

        $supplierRows[] = [
            'supplier' => $p['supplier'] ?: 'Unassigned',
            'product_name' => $p['name'],
            'opening_stock' => $opening,
            'purchased' => $pur,
            'sold' => $sal,
            'available_stock' => $avail
        ];
    }

    Response::json([
        'report_type' => 'supplier',
        'title' => 'Supplier Stock Report',
        'total_purchased' => $grandIn,
        'total_sold' => $grandOut,
        'rows' => $supplierRows
    ]);
}

// 6. LOW STOCK REPORT
if ($reportType === 'lowstock') {
    $stmt = $tenantDb->query("SELECT id, name, supplier, stock AS initial_stock, threshold_qty, reminder_date FROM products ORDER BY name ASC");
    $products = $stmt->fetchAll();

    $lowRows = [];
    foreach ($products as $p) {
        $txStmt = $tenantDb->prepare("
            SELECT
                COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE 0 END), 0) AS purchased,
                COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0) AS sold
            FROM transactions
            WHERE product_id = :pid OR product_name = :pname
        ");
        $txStmt->execute([':pid' => $p['id'], ':pname' => $p['name']]);
        $tx = $txStmt->fetch();

        $available = (int)$p['initial_stock'] + (int)$tx['purchased'] - (int)$tx['sold'];
        $threshold = (int)($p['threshold_qty'] ?? 2);

        if ($available <= $threshold) {
            $lowRows[] = [
                'id' => $p['id'],
                'name' => $p['name'],
                'supplier' => $p['supplier'] ?? '',
                'available_stock' => $available,
                'threshold_qty' => $threshold,
                'suggested_reorder_qty' => max($threshold * 2 - $available, $threshold, 1),
                'reminder_date' => $p['reminder_date'] ?? ''
            ];
        }
    }

    Response::json([
        'report_type' => 'lowstock',
        'title' => 'Low Stock & Reorder Report',
        'total_low_stock' => count($lowRows),
        'rows' => $lowRows
    ]);
}

Response::error("Unknown report type '{$reportType}'.", 400);
