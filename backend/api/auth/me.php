<?php
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../services/Response.php';
require_once __DIR__ . '/../../middleware/auth.php';

use StockTrack\Services\Response;
use StockTrack\Middleware\Auth;

Response::handleCors();

$auth = Auth::authenticate();
$user = $auth['user'];
$tenantDb = $auth['tenant_db'];

// Fetch settings from tenant db
$stmt = $tenantDb->query("SELECT business_name, phone, address, report_header_name FROM settings WHERE id = 1 LIMIT 1");
$settings = $stmt->fetch() ?: [
    'business_name' => $user['business_name'] ?? '',
    'phone' => '',
    'address' => '',
    'report_header_name' => ($user['business_name'] ?? '') ? $user['business_name'] . ' — Inventory Report' : 'StockTrack Inventory Report'
];

Response::json([
    'user' => [
        'id' => $user['id'],
        'username' => $user['username'],
        'business_name' => $settings['business_name'] ?: ($user['business_name'] ?? '')
    ],
    'settings' => $settings
]);
