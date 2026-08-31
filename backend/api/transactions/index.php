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

if ($method === 'GET') {
    $search = trim($_GET['search'] ?? '');
    $productId = trim($_GET['product_id'] ?? '');
    $type = strtoupper(trim($_GET['type'] ?? ''));
    $startDate = trim($_GET['start_date'] ?? '');
    $endDate = trim($_GET['end_date'] ?? '');

    $sql = "SELECT id, product_id, product_name, type, quantity, description, date, created_at FROM transactions WHERE 1=1";
    $params = [];

    if (!empty($productId) && $productId !== 'ALL') {
        $sql .= " AND (product_id = :product_id OR product_name = :pname)";
        $params[':product_id'] = $productId;
        $params[':pname'] = $productId;
    }

    if (!empty($type) && in_array($type, ['IN', 'OUT'])) {
        $sql .= " AND type = :type";
        $params[':type'] = $type;
    }

    if (!empty($startDate)) {
        $sql .= " AND date >= :start_date";
        $params[':start_date'] = $startDate;
    }

    if (!empty($endDate)) {
        $sql .= " AND date <= :end_date";
        $params[':end_date'] = $endDate;
    }

    if (!empty($search)) {
        $sql .= " AND (product_name LIKE :search OR description LIKE :search)";
        $params[':search'] = '%' . $search . '%';
    }

    $sql .= " ORDER BY date DESC, created_at DESC";
    $stmt = $tenantDb->prepare($sql);
    $stmt->execute($params);
    $transactions = $stmt->fetchAll();

    Response::json($transactions);

} elseif ($method === 'POST') {
    $input = Response::getJsonInput();

    $productId = trim($input['product_id'] ?? '');
    $productName = trim($input['product_name'] ?? '');
    $type = strtoupper(trim($input['type'] ?? ''));
    $quantity = max(1, (int)($input['quantity'] ?? $input['qty'] ?? 0));
    $description = trim($input['description'] ?? $input['desc'] ?? '');
    $date = trim($input['date'] ?? date('Y-m-d'));

    if (!in_array($type, ['IN', 'OUT'])) {
        Response::error("Transaction type must be 'IN' (Stock In) or 'OUT' (Stock Out).", 400);
    }

    if ($quantity <= 0) {
        Response::error('Quantity must be greater than 0.', 400);
    }

    // Match product by ID or Name
    $product = null;
    if (!empty($productId)) {
        $stmt = $tenantDb->prepare("SELECT * FROM products WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $productId]);
        $product = $stmt->fetch();
    }

    if (!$product && !empty($productName)) {
        $stmt = $tenantDb->prepare("SELECT * FROM products WHERE LOWER(name) = LOWER(:name) LIMIT 1");
        $stmt->execute([':name' => $productName]);
        $product = $stmt->fetch();
    }

    if (!$product) {
        Response::error('Product not found in catalog. Please select or add the product first.', 404);
    }

    $productId = $product['id'];
    $productName = $product['name'];

    // If OUT, calculate current available stock to verify
    $txStmt = $tenantDb->prepare("
        SELECT
            COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE 0 END), 0) AS total_in,
            COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0) AS total_out
        FROM transactions
        WHERE product_id = :product_id
    ");
    $txStmt->execute([':product_id' => $productId]);
    $txSum = $txStmt->fetch();
    $currentStock = (int)$product['stock'] + (int)$txSum['total_in'] - (int)$txSum['total_out'];

    $id = 'tx_' . bin2hex(random_bytes(8));

    $insertStmt = $tenantDb->prepare("
        INSERT INTO transactions (id, product_id, product_name, type, quantity, description, date, created_at)
        VALUES (:id, :product_id, :product_name, :type, :quantity, :description, :date, CURRENT_TIMESTAMP)
    ");
    $insertStmt->execute([
        ':id' => $id,
        ':product_id' => $productId,
        ':product_name' => $productName,
        ':type' => $type,
        ':quantity' => $quantity,
        ':description' => $description,
        ':date' => $date
    ]);

    $newStock = $type === 'IN' ? $currentStock + $quantity : $currentStock - $quantity;

    Response::json([
        'id' => $id,
        'product_id' => $productId,
        'product_name' => $productName,
        'type' => $type,
        'quantity' => $quantity,
        'description' => $description,
        'date' => $date,
        'current_stock' => $newStock,
        'message' => ($type === 'IN' ? 'Stock In (+)' : 'Stock Out (-)') . " recorded for {$productName}."
    ], 201);

} else {
    Response::error('Method not allowed', 405);
}
