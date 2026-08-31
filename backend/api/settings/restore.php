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
$tenantDb = $auth['tenant_db'];

$rawJson = '';
if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
    $rawJson = file_get_contents($_FILES['file']['tmp_name']);
} else {
    $input = Response::getJsonInput();
    $rawJson = is_string($input['backup_data'] ?? null) ? $input['backup_data'] : json_encode($input['backup_data'] ?? $input);
}

$data = json_decode($rawJson, true);
if (!is_array($data) || !isset($data['products']) || !is_array($data['products'])) {
    Response::error('Invalid backup file format.', 400);
}

$mode = strtolower(trim($_POST['mode'] ?? $_GET['mode'] ?? 'merge')); // 'replace' or 'merge'

try {
    $tenantDb->beginTransaction();

    if ($mode === 'replace') {
        $tenantDb->exec("DELETE FROM transactions");
        $tenantDb->exec("DELETE FROM products");
    }

    // Insert / Merge Products
    $insertProd = $tenantDb->prepare("
        INSERT INTO products (id, name, supplier, stock, threshold_qty, reminder_date, created_at, updated_at)
        VALUES (:id, :name, :supplier, :stock, :threshold, :reminder, :created, :updated)
        ON CONFLICT(name) DO UPDATE SET
            supplier = excluded.supplier,
            stock = excluded.stock,
            threshold_qty = excluded.threshold_qty,
            reminder_date = excluded.reminder_date,
            updated_at = CURRENT_TIMESTAMP
    ");

    foreach ($data['products'] as $p) {
        $name = trim($p['name'] ?? '');
        if (empty($name)) continue;

        $id = $p['id'] ?? ('prod_' . bin2hex(random_bytes(8)));
        $supplier = $p['supplier'] ?? '';
        $stock = (int)($p['initial_stock'] ?? $p['stock'] ?? $p['qty'] ?? 0);
        $threshold = (int)($p['threshold_qty'] ?? $p['threshold'] ?? 2);
        $reminder = $p['reminder_date'] ?? $p['reminder'] ?? '';
        $created = $p['created_at'] ?? date('Y-m-d H:i:s');
        $updated = $p['updated_at'] ?? date('Y-m-d H:i:s');

        $insertProd->execute([
            ':id' => $id,
            ':name' => $name,
            ':supplier' => $supplier,
            ':stock' => $stock,
            ':threshold' => $threshold,
            ':reminder' => $reminder,
            ':created' => $created,
            ':updated' => $updated
        ]);
    }

    // Insert / Merge Transactions
    if (isset($data['transactions']) && is_array($data['transactions'])) {
        $insertTx = $tenantDb->prepare("
            INSERT INTO transactions (id, product_id, product_name, type, quantity, description, date, created_at)
            VALUES (:id, :product_id, :product_name, :type, :quantity, :description, :date, :created)
            ON CONFLICT(id) DO NOTHING
        ");

        foreach ($data['transactions'] as $t) {
            $id = $t['id'] ?? ('tx_' . bin2hex(random_bytes(8)));
            $pid = $t['product_id'] ?? '';
            $pname = $t['product_name'] ?? $t['product'] ?? '';
            $type = strtoupper($t['type'] ?? 'IN');
            if ($type === 'PURCHASE') $type = 'IN';
            if ($type === 'SALES') $type = 'OUT';
            $qty = (int)($t['quantity'] ?? $t['qty'] ?? 0);
            $desc = $t['description'] ?? $t['desc'] ?? '';
            $date = $t['date'] ?? date('Y-m-d');
            $created = $t['created_at'] ?? date('Y-m-d H:i:s');

            if (empty($pname) || $qty <= 0) continue;

            $insertTx->execute([
                ':id' => $id,
                ':product_id' => $pid,
                ':product_name' => $pname,
                ':type' => $type,
                ':quantity' => $qty,
                ':description' => $desc,
                ':date' => $date,
                ':created' => $created
            ]);
        }
    }

    // Restore settings if present
    if (isset($data['settings']) && is_array($data['settings'])) {
        $s = $data['settings'];
        $setStmt = $tenantDb->prepare("
            INSERT INTO settings (id, business_name, phone, address, report_header_name, updated_at)
            VALUES (1, :bname, :phone, :address, :header, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                business_name = excluded.business_name,
                phone = excluded.phone,
                address = excluded.address,
                report_header_name = excluded.report_header_name,
                updated_at = CURRENT_TIMESTAMP
        ");
        $setStmt->execute([
            ':bname' => $s['business_name'] ?? '',
            ':phone' => $s['phone'] ?? '',
            ':address' => $s['address'] ?? '',
            ':header' => $s['report_header_name'] ?? ''
        ]);
    }

    $tenantDb->commit();

    Response::json([
        'message' => 'Data restored successfully!',
        'mode' => $mode
    ]);

} catch (Exception $e) {
    if ($tenantDb->inTransaction()) {
        $tenantDb->rollBack();
    }
    Response::error('Failed to restore backup: ' . $e->getMessage(), 500);
}
