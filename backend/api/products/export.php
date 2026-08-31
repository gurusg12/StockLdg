<?php
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../services/Response.php';
require_once __DIR__ . '/../../middleware/auth.php';

use StockTrack\Middleware\Auth;

$auth = Auth::authenticate();
$tenantDb = $auth['tenant_db'];
$user = $auth['user'];

$stmt = $tenantDb->query("SELECT name, supplier, stock, threshold_qty, reminder_date FROM products ORDER BY name ASC");
$products = $stmt->fetchAll();

$filename = "stock_products_" . preg_replace('/[^a-z0-9_-]/i', '_', $user['username']) . "_" . date('Y-m-d') . ".csv";

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');

$output = fopen('php://output', 'w');
fputcsv($output, ['name', 'supplier', 'qty', 'threshold', 'reminder']);

foreach ($products as $p) {
    fputcsv($output, [
        $p['name'],
        $p['supplier'] ?? '',
        $p['stock'] ?? 0,
        $p['threshold_qty'] ?? 2,
        $p['reminder_date'] ?? ''
    ]);
}

fclose($output);
exit;
