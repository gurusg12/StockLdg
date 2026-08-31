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

// Helper function to calculate current stock for a product
function calculateProductStock(PDO $db, string $productId, int $initialStock): int {
    $stmt = $db->prepare("
        SELECT
            COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE 0 END), 0) AS total_in,
            COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0) AS total_out
        FROM transactions
        WHERE product_id = :product_id
    ");
    $stmt->execute([':product_id' => $productId]);
    $row = $stmt->fetch();
    return $initialStock + (int)$row['total_in'] - (int)$row['total_out'];
}

if ($method === 'GET') {
    $search = trim($_GET['search'] ?? '');
    $supplier = trim($_GET['supplier'] ?? '');
    $lowStockOnly = filter_var($_GET['low_stock'] ?? false, FILTER_VALIDATE_BOOLEAN);

    $sql = "SELECT id, name, supplier, stock AS initial_stock, threshold_qty, reminder_date, created_at, updated_at FROM products WHERE 1=1";
    $params = [];

    if (!empty($search)) {
        $sql .= " AND (name LIKE :search OR supplier LIKE :search)";
        $params[':search'] = '%' . $search . '%';
    }

    if (!empty($supplier) && $supplier !== 'ALL') {
        $sql .= " AND supplier = :supplier";
        $params[':supplier'] = $supplier;
    }

    $sql .= " ORDER BY name ASC";
    $stmt = $tenantDb->prepare($sql);
    $stmt->execute($params);
    $products = $stmt->fetchAll();

    // Attach computed live available stock
    $enrichedProducts = [];
    foreach ($products as $p) {
        $currentStock = calculateProductStock($tenantDb, $p['id'], (int)$p['initial_stock']);
        $threshold = (int)($p['threshold_qty'] ?? 2);
        $isLowStock = $currentStock <= $threshold;

        if ($lowStockOnly && !$isLowStock) {
            continue;
        }

        $enrichedProducts[] = [
            'id' => $p['id'],
            'name' => $p['name'],
            'supplier' => $p['supplier'] ?? '',
            'initial_stock' => (int)$p['initial_stock'],
            'current_stock' => $currentStock,
            'threshold_qty' => $threshold,
            'reminder_date' => $p['reminder_date'] ?? '',
            'is_low_stock' => $isLowStock,
            'created_at' => $p['created_at'],
            'updated_at' => $p['updated_at']
        ];
    }

    Response::json($enrichedProducts);

} elseif ($method === 'POST') {
    $input = Response::getJsonInput();

    $name = trim($input['name'] ?? '');
    $supplier = trim($input['supplier'] ?? '');
    $initialStock = max(0, (int)($input['stock'] ?? $input['initial_stock'] ?? 0));
    $threshold = max(0, (int)($input['threshold_qty'] ?? $input['threshold'] ?? 2));
    $reminderDate = trim($input['reminder_date'] ?? $input['reminder'] ?? '');

    if (empty($name)) {
        Response::error('Product name is required.');
    }

    // Check duplicate name
    $checkStmt = $tenantDb->prepare("SELECT id FROM products WHERE LOWER(name) = LOWER(:name) LIMIT 1");
    $checkStmt->execute([':name' => $name]);
    if ($checkStmt->fetch()) {
        Response::error('A product with this name already exists in your inventory.');
    }

    $id = 'prod_' . bin2hex(random_bytes(8));

    $stmt = $tenantDb->prepare("
        INSERT INTO products (id, name, supplier, stock, threshold_qty, reminder_date, created_at, updated_at)
        VALUES (:id, :name, :supplier, :stock, :threshold, :reminder, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ");
    $stmt->execute([
        ':id' => $id,
        ':name' => $name,
        ':supplier' => $supplier,
        ':stock' => $initialStock,
        ':threshold' => $threshold,
        ':reminder' => $reminderDate
    ]);

    Response::json([
        'id' => $id,
        'name' => $name,
        'supplier' => $supplier,
        'initial_stock' => $initialStock,
        'current_stock' => $initialStock,
        'threshold_qty' => $threshold,
        'reminder_date' => $reminderDate,
        'message' => "Product '{$name}' created successfully."
    ], 201);

} else {
    Response::error('Method not allowed', 405);
}
