<?php
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../services/Response.php';
require_once __DIR__ . '/../../middleware/auth.php';

use StockTrack\Services\Response;
use StockTrack\Middleware\Auth;

Response::handleCors();

$auth = Auth::authenticate();
$tenantDb = $auth['tenant_db'];
$method = $_SERVER['REQUEST_METHOD'];

$id = trim($_GET['id'] ?? '');
if (empty($id) && preg_match('#/api/transactions/([^/?]+)#', $_SERVER['REQUEST_URI'] ?? '', $matches)) {
    $id = $matches[1];
}

if (empty($id)) {
    Response::error('Transaction ID is required.', 400);
}

$stmt = $tenantDb->prepare("SELECT * FROM transactions WHERE id = :id LIMIT 1");
$stmt->execute([':id' => $id]);
$tx = $stmt->fetch();

if (!$tx) {
    Response::error('Transaction not found.', 404);
}

if ($method === 'GET') {
    Response::json($tx);

} elseif ($method === 'PUT' || $method === 'POST') {
    $input = Response::getJsonInput();

    $productId = trim($input['product_id'] ?? $tx['product_id']);
    $productName = trim($input['product_name'] ?? $tx['product_name']);
    $type = strtoupper(trim($input['type'] ?? $tx['type']));
    $quantity = isset($input['quantity']) || isset($input['qty'])
        ? max(1, (int)($input['quantity'] ?? $input['qty']))
        : (int)$tx['quantity'];
    $description = isset($input['description']) || isset($input['desc'])
        ? trim($input['description'] ?? $input['desc'])
        : ($tx['description'] ?? '');
    $date = trim($input['date'] ?? $tx['date']);

    if (!in_array($type, ['IN', 'OUT'])) {
        Response::error("Transaction type must be 'IN' or 'OUT'.", 400);
    }

    $updateStmt = $tenantDb->prepare("
        UPDATE transactions
        SET product_id = :product_id, product_name = :product_name, type = :type,
            quantity = :quantity, description = :description, date = :date
        WHERE id = :id
    ");
    $updateStmt->execute([
        ':product_id' => $productId,
        ':product_name' => $productName,
        ':type' => $type,
        ':quantity' => $quantity,
        ':description' => $description,
        ':date' => $date,
        ':id' => $id
    ]);

    Response::json([
        'id' => $id,
        'product_id' => $productId,
        'product_name' => $productName,
        'type' => $type,
        'quantity' => $quantity,
        'description' => $description,
        'date' => $date,
        'message' => 'Transaction updated successfully.'
    ]);

} elseif ($method === 'DELETE') {
    $delStmt = $tenantDb->prepare("DELETE FROM transactions WHERE id = :id");
    $delStmt->execute([':id' => $id]);

    Response::json([
        'message' => 'Transaction deleted successfully.',
        'deleted_transaction' => $tx
    ]);

} else {
    Response::error('Method not allowed', 405);
}
