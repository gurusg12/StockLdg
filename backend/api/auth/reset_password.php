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
$pin = trim($input['recovery_pin'] ?? '');
$newPassword = (string)($input['new_password'] ?? '');

if (empty($username) || empty($pin) || empty($newPassword)) {
    Response::error('Username, 4-digit PIN, and new password are required.');
}

if (strlen($newPassword) < 6) {
    Response::error('New password must be at least 6 characters.');
}

$mainDb = Database::getMainConnection();
$stmt = $mainDb->prepare("SELECT id, recovery_pin FROM users WHERE username = :username LIMIT 1");
$stmt->execute([':username' => $username]);
$user = $stmt->fetch();

if (!$user) {
    Response::error('Account not found with that username.', 404);
}

if (empty($user['recovery_pin'])) {
    Response::error('No recovery PIN was configured for this account. Please contact an administrator.', 400);
}

$pinHash = hash('sha256', $pin);
// Support matching either sha256 hash or legacy plain string if any
if ($user['recovery_pin'] !== $pinHash && $user['recovery_pin'] !== $pin) {
    Response::error('Incorrect 4-digit recovery PIN.', 401);
}

// Update password and ensure PIN is hashed
$newPasswordHash = password_hash($newPassword, PASSWORD_BCRYPT);
$updateStmt = $mainDb->prepare("
    UPDATE users
    SET password_hash = :p_hash, recovery_pin = :pin_hash
    WHERE id = :id
");
$updateStmt->execute([
    ':p_hash' => $newPasswordHash,
    ':pin_hash' => $pinHash,
    ':id' => $user['id']
]);

// Invalidate all previous sessions
$delSessions = $mainDb->prepare("DELETE FROM user_sessions WHERE user_id = :id");
$delSessions->execute([':id' => $user['id']]);

Response::json(['message' => 'Password reset successfully! Please log in with your new password.']);
