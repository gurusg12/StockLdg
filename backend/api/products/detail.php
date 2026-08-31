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

// Get product ID from query parameter or URL path
$id = trim($_GET['id'] ?? '');
if (empty($id) && preg_match('#/api/products/([^/?]+)#', $_SERVER['REQUEST_URI'] ?? '', $matches)) {
    $id = $matches[1];
}

if (empty($id)) {
    Response::error('Product ID is required.', 400);
}

// Fetch existing product
$stmt = $tenantDb->prepare("SELECT * FROM products WHERE id = :id LIMIT 1");
$stmt->execute([':id' => $id]);
$product = $stmt->fetch();

if (!$product) {
    Response::error('Product not found.', 404);
}

if ($method === 'GET') {
    $txStmt = $tenantDb->prepare("
        SELECT
            COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE 0 END), 0) AS total_in,
            COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0) AS total_out
        FROM transactions
        WHERE product_id = :product_id
    ");
    $txStmt->execute([':product_id' => $id]);
    $txSum = $txStmt->fetch();
    $currentStock = (int)$product['stock'] + (int)$txSum['total_in'] - (int)$txSum['total_out'];

    Response::json([
        'id' => $product['id'],
        'name' => $product['name'],
        'supplier' => $product['supplier'] ?? '',
        'initial_stock' => (int)$product['stock'],
        'current_stock' => $currentStock,
        'threshold_qty' => (int)$product['threshold_qty'],
        'reminder_date' => $product['reminder_date'] ?? '',
        'created_at' => $product['created_at'],
        'updated_at' => $product['updated_at']
    ]);

} elseif ($method === 'PUT' || $method === 'POST') {
    $input = Response::getJsonInput();

    $name = trim($input['name'] ?? $product['name']);
    $supplier = trim($input['supplier'] ?? $product['supplier']);
    $initialStock = isset($input['initial_stock']) || isset($input['stock'])
        ? max(0, (int)($input['initial_stock'] ?? $input['stock']))
        : (int)$product['stock'];
    $threshold = isset($input['threshold_qty']) || isset($input['threshold'])
        ? max(0, (int)($input['threshold_qty'] ?? $input['threshold']))
        : (int)$product['threshold_qty'];
    $reminderDate = isset($input['reminder_date']) || isset($input['reminder'])
        ? trim($input['reminder_date'] ?? $input['reminder'])
        : ($product['reminder_date'] ?? '');

    if (empty($name)) {
        Response::error('Product name is required.');
    }

    // Check duplicate name on other products
    $checkStmt = $tenantDb->prepare("SELECT id FROM products WHERE LOWER(name) = LOWER(:name) AND id != :id LIMIT 1");
    $checkStmt->execute([':name' => $name, ':id' => $id]);
    if ($checkStmt->fetch()) {
        Response::error('Another product already exists with that name.');
    }

    try {
        $tenantDb->beginTransaction();

        $updateStmt = $tenantDb->prepare("
            UPDATE products
            SET name = :name, supplier = :supplier, stock = :stock, threshold_qty = :threshold,
                reminder_date = :reminder, updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
        ");
        $updateStmt->execute([
            ':name' => $name,
            ':supplier' => $supplier,
            ':stock' => $initialStock,
            ':threshold' => $threshold,
            ':reminder' => $reminderDate,
            ':id' => $id
        ]);

        // If product name changed, update product_name in transactions
        if (strcasecmp($product['name'], $name) !== 0) {
            $updTx = $tenantDb->prepare("UPDATE transactions SET product_name = :name WHERE product_id = :id");
            $updTx->execute([':name' => $name, ':id' => $id]);
        }

        $tenantDb->commit();

        Response::json([
            'id' => $id,
            'name' => $name,
            'supplier' => $supplier,
            'initial_stock' => $initialStock,
            'threshold_qty' => $threshold,
            'reminder_date' => $reminderDate,
            'message' => "Product '{$name}' updated successfully."
        ]);
    } catch (Exception $e) {
        if ($tenantDb->inTransaction()) {
            $tenantDb->rollBack();
        }
        Response::error('Failed to update product: ' . $e->getMessage(), 500);
    }

} elseif ($method === 'DELETE') {
    try {
        $tenantDb->beginTransaction();

        // Delete associated transactions
        $delTx = $tenantDb->prepare("DELETE FROM transactions WHERE product_id = :id");
        $delTx->execute([':id' => $id]);

        // Delete product
        $delProd = $tenantDb->prepare("DELETE FROM products WHERE id = :id");
        $delProd->execute([':id' => $id]);

        $tenantDb->commit();

        Response::json([
            'message' => "Product '{$product['name']}' deleted successfully.",
            'deleted_product' => $product
        ]);
    } catch (Exception $e) {
        if ($tenantDb->inTransaction()) {
            $tenantDb->rollBack();
        }
        Response::error('Failed to delete product: ' . $e->getMessage(), 500);
    }

} else {
    Response::error('Method not allowed', 405);
}
