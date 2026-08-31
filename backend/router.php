<?php
/**
 * STOCKTRACK SaaS PHP Router
 * Handles unified REST API routing for PHP built-in server and Apache/Nginx
 */

require_once __DIR__ . '/services/Response.php';
use StockTrack\Services\Response;

Response::handleCors();

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Serve static files if existing
$publicFile = __DIR__ . $uri;
if ($uri !== '/' && file_exists($publicFile) && !is_dir($publicFile)) {
    return false;
}

// Remove trailing slash
$uri = rtrim($uri, '/');

// Router table
if (str_starts_with($uri, '/api/auth/register')) {
    require __DIR__ . '/api/auth/register.php';
    exit;
}
if (str_starts_with($uri, '/api/auth/login')) {
    require __DIR__ . '/api/auth/login.php';
    exit;
}
if (str_starts_with($uri, '/api/auth/logout')) {
    require __DIR__ . '/api/auth/logout.php';
    exit;
}
if (str_starts_with($uri, '/api/auth/me')) {
    require __DIR__ . '/api/auth/me.php';
    exit;
}
if (str_starts_with($uri, '/api/auth/reset-password') || str_starts_with($uri, '/api/auth/reset_password')) {
    require __DIR__ . '/api/auth/reset_password.php';
    exit;
}
if (str_starts_with($uri, '/api/auth/change-password') || str_starts_with($uri, '/api/auth/change_password')) {
    require __DIR__ . '/api/auth/change_password.php';
    exit;
}

// Products
if (str_starts_with($uri, '/api/products/import')) {
    require __DIR__ . '/api/products/import.php';
    exit;
}
if (str_starts_with($uri, '/api/products/export')) {
    require __DIR__ . '/api/products/export.php';
    exit;
}
if (preg_match('#^/api/products/([^/]+)$#', $uri, $m)) {
    $_GET['id'] = $m[1];
    require __DIR__ . '/api/products/detail.php';
    exit;
}
if ($uri === '/api/products') {
    require __DIR__ . '/api/products/index.php';
    exit;
}

// Transactions
if (preg_match('#^/api/transactions/([^/]+)$#', $uri, $m)) {
    $_GET['id'] = $m[1];
    require __DIR__ . '/api/transactions/detail.php';
    exit;
}
if ($uri === '/api/transactions') {
    require __DIR__ . '/api/transactions/index.php';
    exit;
}

// Dashboard
if ($uri === '/api/dashboard') {
    require __DIR__ . '/api/dashboard/index.php';
    exit;
}

// Reports
if (str_starts_with($uri, '/api/reports')) {
    require __DIR__ . '/api/reports/index.php';
    exit;
}

// Settings
if ($uri === '/api/settings/backup') {
    require __DIR__ . '/api/settings/backup.php';
    exit;
}
if ($uri === '/api/settings/restore') {
    require __DIR__ . '/api/settings/restore.php';
    exit;
}
if ($uri === '/api/settings') {
    require __DIR__ . '/api/settings/index.php';
    exit;
}

// Health check / API Welcome
if ($uri === '/api' || $uri === '/api/health') {
    Response::json([
        'app' => 'STOCKTRACK SaaS Inventory API',
        'status' => 'operational',
        'version' => '1.0',
        'timestamp' => date('c')
    ]);
}

// Fallback 404
Response::error('Endpoint not found: ' . $uri, 404);
