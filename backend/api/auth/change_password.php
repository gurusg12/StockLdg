<?php
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../services/Response.php';
require_once __DIR__ . '/../../middleware/auth.php';

use StockTrack\Services\Response;
use StockTrack\Middleware\Auth;

Response::handleCors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

$auth = Auth::authenticate();
$user = $auth['user'];
$mainDb = $auth['main_db'];

$input = Response::getJsonInput();
$newPassword = (string)($input['new_password'] ?? '');

if (empty($newPassword) || strlen($newPassword) < 6) {
    Response::error('New password must be at least 6 characters.');
}

$newPasswordHash = password_hash($newPassword, PASSWORD_BCRYPT);
$stmt = $mainDb->prepare("UPDATE users SET password_hash = :hash WHERE id = :id");
$stmt->execute([
    ':hash' => $newPasswordHash,
    ':id' => $user['id']
]);

Response::json(['message' => 'Password updated successfully!']);
