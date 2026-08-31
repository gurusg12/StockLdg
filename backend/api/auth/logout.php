<?php
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../services/Response.php';
require_once __DIR__ . '/../../middleware/auth.php';

use StockTrack\Config\Database;
use StockTrack\Services\Response;
use StockTrack\Middleware\Auth;

Response::handleCors();

$auth = Auth::authenticate();
$mainDb = $auth['main_db'];

// Extract token to delete session
$headers = function_exists('getallheaders') ? getallheaders() : [];
$authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$token = '';
if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
    $token = $matches[1];
}

if (!empty($token)) {
    $stmt = $mainDb->prepare("DELETE FROM user_sessions WHERE session_token = :token");
    $stmt->execute([':token' => $token]);
}

Response::json(['message' => 'Logged out successfully.']);
