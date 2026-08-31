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

$csvContent = '';

if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
    $csvContent = file_get_contents($_FILES['file']['tmp_name']);
} else {
    $input = Response::getJsonInput();
    $csvContent = $input['csv_data'] ?? '';
}

if (empty(trim($csvContent))) {
    Response::error('No CSV content provided.', 400);
}

$lines = preg_split('/\r\n|\r|\n/', trim($csvContent));
if (count($lines) < 2) {
    Response::error('CSV must contain at least a header row and one data row.', 400);
}

// Parse header line
$headerLine = array_shift($lines);
$headers = array_map(function($h) {
    return strtolower(trim($h));
}, str_getcsv($headerLine));

// Locate column indexes
$nameIdx = -1;
$supplierIdx = -1;
$stockIdx = -1;
$thresholdIdx = -1;
$reminderIdx = -1;

foreach ($headers as $idx => $header) {
    if (str_contains($header, 'name') || str_contains($header, 'product')) {
        $nameIdx = $idx;
    } elseif (str_contains($header, 'supplier')) {
        $supplierIdx = $idx;
    } elseif (str_contains($header, 'stock') || str_contains($header, 'qty') || str_contains($header, 'quantity')) {
        $stockIdx = $idx;
    } elseif (str_contains($header, 'threshold') || str_contains($header, 'min') || str_contains($header, 'reorder')) {
        $thresholdIdx = $idx;
    } elseif (str_contains($header, 'reminder') || str_contains($header, 'date')) {
        $reminderIdx = $idx;
    }
}

if ($nameIdx === -1) {
    Response::error("CSV must contain a 'name' or 'product' column.", 400);
}

$added = 0;
$updated = 0;

try {
    $tenantDb->beginTransaction();

    $selectStmt = $tenantDb->prepare("SELECT id FROM products WHERE LOWER(name) = LOWER(:name) LIMIT 1");
    $insertStmt = $tenantDb->prepare("
        INSERT INTO products (id, name, supplier, stock, threshold_qty, reminder_date, created_at, updated_at)
        VALUES (:id, :name, :supplier, :stock, :threshold, :reminder, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ");
    $updateStmt = $tenantDb->prepare("
        UPDATE products
        SET supplier = :supplier, stock = :stock, threshold_qty = :threshold, reminder_date = :reminder, updated_at = CURRENT_TIMESTAMP
        WHERE id = :id
    ");

    foreach ($lines as $line) {
        if (empty(trim($line))) continue;
        $row = str_getcsv($line);

        $name = trim($row[$nameIdx] ?? '');
        if (empty($name)) continue;

        $supplier = $supplierIdx >= 0 ? trim($row[$supplierIdx] ?? '') : '';
        $stock = $stockIdx >= 0 ? max(0, (int)($row[$stockIdx] ?? 0)) : 0;
        $threshold = $thresholdIdx >= 0 ? max(0, (int)($row[$thresholdIdx] ?? 2)) : 2;
        $reminder = $reminderIdx >= 0 ? trim($row[$reminderIdx] ?? '') : '';

        $selectStmt->execute([':name' => $name]);
        $existing = $selectStmt->fetch();

        if ($existing) {
            $updateStmt->execute([
                ':supplier' => $supplier,
                ':stock' => $stock,
                ':threshold' => $threshold,
                ':reminder' => $reminder,
                ':id' => $existing['id']
            ]);
            $updated++;
        } else {
            $newId = 'prod_' . bin2hex(random_bytes(8));
            $insertStmt->execute([
                ':id' => $newId,
                ':name' => $name,
                ':supplier' => $supplier,
                ':stock' => $stock,
                ':threshold' => $threshold,
                ':reminder' => $reminder
            ]);
            $added++;
        }
    }

    $tenantDb->commit();

    Response::json([
        'message' => "CSV imported successfully! {$added} product(s) added, {$updated} updated.",
        'added' => $added,
        'updated' => $updated
    ]);

} catch (Exception $e) {
    if ($tenantDb->inTransaction()) {
        $tenantDb->rollBack();
    }
    Response::error('Failed to import CSV: ' . $e->getMessage(), 500);
}
