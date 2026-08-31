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

$todayStr = date('Y-m-d');

// 1. Fetch all products
$prodStmt = $tenantDb->query("SELECT id, name, supplier, stock AS initial_stock, threshold_qty, reminder_date FROM products ORDER BY name ASC");
$products = $prodStmt->fetchAll();

// 2. Fetch transaction aggregates per product
$txAggStmt = $tenantDb->query("
    SELECT
        product_id,
        COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE 0 END), 0) AS total_in,
        COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0) AS total_out
    FROM transactions
    GROUP BY product_id
");
$txAggs = [];
while ($row = $txAggStmt->fetch()) {
    $txAggs[$row['product_id']] = [
        'in' => (int)$row['total_in'],
        'out' => (int)$row['total_out']
    ];
}

$totalStockUnits = 0;
$lowStockProducts = [];
$reminderProducts = [];

foreach ($products as $p) {
    $pid = $p['id'];
    $in = $txAggs[$pid]['in'] ?? 0;
    $out = $txAggs[$pid]['out'] ?? 0;
    $currentStock = (int)$p['initial_stock'] + $in - $out;
    $totalStockUnits += $currentStock;
    $threshold = (int)($p['threshold_qty'] ?? 2);

    if ($currentStock <= $threshold) {
        $lowStockProducts[] = [
            'id' => $p['id'],
            'name' => $p['name'],
            'supplier' => $p['supplier'] ?? '',
            'current_stock' => $currentStock,
            'threshold_qty' => $threshold,
            'suggested_reorder' => max($threshold * 2 - $currentStock, $threshold, 1)
        ];
    }

    if (!empty($p['reminder_date']) && $p['reminder_date'] <= $todayStr) {
        $reminderProducts[] = [
            'id' => $p['id'],
            'name' => $p['name'],
            'reminder_date' => $p['reminder_date']
        ];
    }
}

// 3. Global transaction totals
$totalsStmt = $tenantDb->query("
    SELECT
        COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE 0 END), 0) AS grand_in,
        COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0) AS grand_out
    FROM transactions
");
$totals = $totalsStmt->fetch();

// 4. Recent transactions (latest 5)
$recentStmt = $tenantDb->query("SELECT id, product_id, product_name, type, quantity, description, date FROM transactions ORDER BY date DESC, created_at DESC LIMIT 5");
$recentTransactions = $recentStmt->fetchAll();

// 5. Settings
$setStmt = $tenantDb->query("SELECT business_name, phone, address, report_header_name FROM settings WHERE id = 1 LIMIT 1");
$settings = $setStmt->fetch() ?: [];

Response::json([
    'business_name' => $settings['business_name'] ?: ($user['business_name'] ?? 'My Business'),
    'username' => $user['username'],
    'total_products' => count($products),
    'total_stock_units' => $totalStockUnits,
    'total_purchased' => (int)$totals['grand_in'],
    'total_sold' => (int)$totals['grand_out'],
    'low_stock_count' => count($lowStockProducts),
    'low_stock_items' => $lowStockProducts,
    'reminder_items' => $reminderProducts,
    'recent_transactions' => $recentTransactions
]);
