<?php
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../services/Response.php';
require_once __DIR__ . '/../../middleware/auth.php';

use StockTrack\Services\Response;
use StockTrack\Middleware\Auth;

Response::handleCors();

$auth = Auth::authenticate();
$tenantDb = $auth['tenant_db'];
$mainDb = $auth['main_db'];
$user = $auth['user'];
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $tenantDb->query("SELECT business_name, phone, address, report_header_name FROM settings WHERE id = 1 LIMIT 1");
    $settings = $stmt->fetch();

    if (!$settings) {
        $settings = [
            'business_name' => $user['business_name'] ?? '',
            'phone' => '',
            'address' => '',
            'report_header_name' => ($user['business_name'] ?? '') ? $user['business_name'] . ' — Inventory Report' : 'StockTrack Inventory Report'
        ];
    }

    Response::json($settings);

} elseif ($method === 'POST' || $method === 'PUT') {
    $input = Response::getJsonInput();

    $businessName = trim($input['business_name'] ?? '');
    $phone = trim($input['phone'] ?? '');
    $address = trim($input['address'] ?? '');
    $reportHeader = trim($input['report_header_name'] ?? '');

    if (empty($reportHeader) && !empty($businessName)) {
        $reportHeader = $businessName . ' — Inventory Report';
    }

    // Update settings in tenant DB
    $stmt = $tenantDb->prepare("
        INSERT INTO settings (id, business_name, phone, address, report_header_name, updated_at)
        VALUES (1, :bname, :phone, :address, :header, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            business_name = :bname,
            phone = :phone,
            address = :address,
            report_header_name = :header,
            updated_at = CURRENT_TIMESTAMP
    ");
    $stmt->execute([
        ':bname' => $businessName,
        ':phone' => $phone,
        ':address' => $address,
        ':header' => $reportHeader
    ]);

    // Also sync business_name in main database for user record
    $mainStmt = $mainDb->prepare("UPDATE users SET business_name = :bname WHERE id = :id");
    $mainStmt->execute([
        ':bname' => $businessName,
        ':id' => $user['id']
    ]);

    Response::json([
        'business_name' => $businessName,
        'phone' => $phone,
        'address' => $address,
        'report_header_name' => $reportHeader,
        'message' => 'Organization settings saved successfully.'
    ]);

} else {
    Response::error('Method not allowed', 405);
}
