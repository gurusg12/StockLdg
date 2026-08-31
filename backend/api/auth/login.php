<?php
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../services/Response.php';

use StockTrack\Config\Database;
use StockTrack\Services\Response;

Response::handleCors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

$input = Response::getJsonInput();

$username = strtolower(trim($input['username'] ?? ''));
$password = (string)($input['password'] ?? '');

if (empty($username) || empty($password)) {
    Response::error('Please enter both username and password.');
}

$mainDb = Database::getMainConnection();

$stmt = $mainDb->prepare("
    SELECT u.id, u.username, u.password_hash, u.business_name, u.status, m.db_file
    FROM users u
    LEFT JOIN user_db_mapping m ON u.id = m.user_id
    WHERE u.username = :username
    LIMIT 1
");
$stmt->execute([':username' => $username]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    Response::error('Invalid username or password.', 401);
}

if ($user['status'] !== 'active') {
    Response::error('Your account is currently disabled. Please contact support.', 403);
}

// Check or create tenant DB mapping if somehow missing
if (empty($user['db_file'])) {
    $dbFile = Database::createTenantDatabase((int)$user['id'], $user['business_name'] ?? '');
}

// Generate new session token
$sessionToken = bin2hex(random_bytes(32));
$expiresAt = date('Y-m-d H:i:s', strtotime('+30 days'));

$stmtSession = $mainDb->prepare("
    INSERT INTO user_sessions (user_id, session_token, expires_at, created_at)
    VALUES (:user_id, :token, :expires, CURRENT_TIMESTAMP)
");
$stmtSession->execute([
    ':user_id' => (int)$user['id'],
    ':token' => $sessionToken,
    ':expires' => $expiresAt
]);

Response::json([
    'token' => $sessionToken,
    'user' => [
        'id' => (int)$user['id'],
        'username' => $user['username'],
        'business_name' => $user['business_name'] ?? ''
    ],
    'message' => 'Login successful!'
]);
