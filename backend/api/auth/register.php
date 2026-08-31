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
$businessName = trim($input['business_name'] ?? '');
$recoveryPin = trim($input['recovery_pin'] ?? '');

// Validation
if (empty($username)) {
    Response::error('Username is required.');
}

if (!preg_match('/^[a-zA-Z0-9_\.\-]{3,30}$/', $username)) {
    Response::error('Username must be 3-30 alphanumeric characters.');
}

if (empty($password) || strlen($password) < 6) {
    Response::error('Password must be at least 6 characters.');
}

if (!empty($recoveryPin) && (!preg_match('/^\d{4}$/', $recoveryPin))) {
    Response::error('Recovery PIN must be exactly 4 digits.');
}

$mainDb = Database::getMainConnection();

// Check if username already exists
$stmt = $mainDb->prepare("SELECT id FROM users WHERE username = :username LIMIT 1");
$stmt->execute([':username' => $username]);
if ($stmt->fetch()) {
    Response::error('That username is already taken. Please choose another.');
}

// Hash password and recovery pin
$passwordHash = password_hash($password, PASSWORD_BCRYPT);
$pinHash = !empty($recoveryPin) ? hash('sha256', $recoveryPin) : null;

try {
    $mainDb->beginTransaction();

    // 1. Insert user
    $insertUser = $mainDb->prepare("
        INSERT INTO users (username, password_hash, recovery_pin, business_name, status, created_at)
        VALUES (:username, :password_hash, :recovery_pin, :business_name, 'active', CURRENT_TIMESTAMP)
    ");
    $insertUser->execute([
        ':username' => $username,
        ':password_hash' => $passwordHash,
        ':recovery_pin' => $pinHash,
        ':business_name' => $businessName
    ]);
    $userId = (int)$mainDb->lastInsertId();

    // 2. Create isolated tenant SQLite database
    $dbFileName = Database::createTenantDatabase($userId, $businessName);

    // 3. Create session token (expires in 30 days)
    $sessionToken = bin2hex(random_bytes(32));
    $expiresAt = date('Y-m-d H:i:s', strtotime('+30 days'));

    $stmtSession = $mainDb->prepare("
        INSERT INTO user_sessions (user_id, session_token, expires_at, created_at)
        VALUES (:user_id, :token, :expires, CURRENT_TIMESTAMP)
    ");
    $stmtSession->execute([
        ':user_id' => $userId,
        ':token' => $sessionToken,
        ':expires' => $expiresAt
    ]);

    $mainDb->commit();

    Response::json([
        'token' => $sessionToken,
        'user' => [
            'id' => $userId,
            'username' => $username,
            'business_name' => $businessName
        ],
        'message' => 'Registration successful!'
    ], 201);

} catch (Exception $e) {
    if ($mainDb->inTransaction()) {
        $mainDb->rollBack();
    }
    Response::error('Registration failed: ' . $e->getMessage(), 500);
}
