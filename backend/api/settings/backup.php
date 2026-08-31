<?php
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../services/Response.php';
require_once __DIR__ . '/../../middleware/auth.php';

use StockTrack\Middleware\Auth;

$auth = Auth::authenticate();
$tenantDb = $auth['tenant_db'];
$user = $auth['user'];

// 1. Fetch products
$prodStmt = $tenantDb->query("SELECT id, name, supplier, stock AS initial_stock, threshold_qty, reminder_date, created_at, updated_at FROM products ORDER BY name ASC");
$products = $prodStmt->fetchAll();

// 2. Fetch transactions
$txStmt = $tenantDb->query("SELECT id, product_id, product_name, type, quantity, description, date, created_at FROM transactions ORDER BY date ASC, created_at ASC");
$transactions = $txStmt->fetchAll();

// 3. Fetch settings
$setStmt = $tenantDb->query("SELECT business_name, phone, address, report_header_name FROM settings WHERE id = 1 LIMIT 1");
$settings = $setStmt->fetch() ?: [];

$backupData = [
    'app' => 'STOCKTRACK',
    'version' => '1.0',
    'exported_at' => date('c'),
    'username' => $user['username'],
    'settings' => $settings,
    'products' => $products,
    'transactions' => $transactions
];

$filename = "stocktrack_backup_" . preg_replace('/[^a-z0-9_-]/i', '_', $user['username']) . "_" . date('Y-m-d') . ".json";

header('Content-Type: application/json; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');

echo json_encode($backupData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
exit;
