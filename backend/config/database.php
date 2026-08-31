<?php
/**
 * STOCKTRACK SaaS Database Configuration & Multi-Tenant Manager
 * Manages physical isolation of SQLite database files per tenant.
 */

namespace StockTrack\Config;

use PDO;
use PDOException;

class Database
{
    private static ?PDO $mainConnection = null;
    private static array $tenantConnections = [];

    private static function getBaseDir(): string
    {
        return dirname(__DIR__);
    }

    public static function getMainDbPath(): string
    {
        $dbDir = self::getBaseDir() . '/databases';
        if (!is_dir($dbDir)) {
            mkdir($dbDir, 0755, true);
        }
        return $dbDir . '/main.sqlite';
    }

    public static function getTenantsDir(): string
    {
        $tenantsDir = self::getBaseDir() . '/databases/tenants';
        if (!is_dir($tenantsDir)) {
            mkdir($tenantsDir, 0755, true);
        }
        return $tenantsDir;
    }

    /**
     * Get connection to the main authentication database
     */
    public static function getMainConnection(): PDO
    {
        if (self::$mainConnection !== null) {
            return self::$mainConnection;
        }

        $dbPath = self::getMainDbPath();
        $isNew = !file_exists($dbPath) || filesize($dbPath) === 0;

        try {
            $pdo = new PDO("sqlite:" . $dbPath);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
            $pdo->exec("PRAGMA foreign_keys = ON;");
            $pdo->exec("PRAGMA journal_mode = WAL;");

            if ($isNew) {
                self::initMainSchema($pdo);
            }

            self::$mainConnection = $pdo;
            return $pdo;
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Main database connection failed: ' . $e->getMessage()]);
            exit;
        }
    }

    /**
     * Get connection to a specific tenant's SQLite database
     */
    public static function getTenantConnection(string $dbFile): PDO
    {
        // Sanitize file name to prevent directory traversal
        $cleanFileName = basename($dbFile);
        if (!str_ends_with($cleanFileName, '.sqlite')) {
            $cleanFileName .= '.sqlite';
        }

        if (isset(self::$tenantConnections[$cleanFileName])) {
            return self::$tenantConnections[$cleanFileName];
        }

        $tenantsDir = self::getTenantsDir();
        $tenantPath = $tenantsDir . '/' . $cleanFileName;
        $isNew = !file_exists($tenantPath) || filesize($tenantPath) === 0;

        try {
            $pdo = new PDO("sqlite:" . $tenantPath);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
            $pdo->exec("PRAGMA foreign_keys = ON;");
            $pdo->exec("PRAGMA journal_mode = WAL;");

            if ($isNew) {
                self::initTenantSchema($pdo);
            }

            self::$tenantConnections[$cleanFileName] = $pdo;
            return $pdo;
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Tenant database connection failed: ' . $e->getMessage()]);
            exit;
        }
    }

    /**
     * Create and provision a brand new tenant SQLite database
     */
    public static function createTenantDatabase(int $userId, string $businessName = ''): string
    {
        $uuid = bin2hex(random_bytes(16));
        $dbFileName = "store_{$uuid}.sqlite";
        $tenantPdo = self::getTenantConnection($dbFileName);

        // Save mapping in main database
        $mainPdo = self::getMainConnection();
        $stmt = $mainPdo->prepare("INSERT INTO user_db_mapping (user_id, db_file) VALUES (:user_id, :db_file)");
        $stmt->execute([
            ':user_id' => $userId,
            ':db_file' => $dbFileName
        ]);

        // If a business name is provided, initialize settings in tenant DB
        if (!empty($businessName)) {
            $stmtSet = $tenantPdo->prepare("
                INSERT OR REPLACE INTO settings (id, business_name, report_header_name, updated_at)
                VALUES (1, :bname, :header, CURRENT_TIMESTAMP)
            ");
            $stmtSet->execute([
                ':bname' => $businessName,
                ':header' => $businessName . ' — Inventory Report'
            ]);
        }

        return $dbFileName;
    }

    /**
     * Initialize tables in main.sqlite
     */
    private static function initMainSchema(PDO $pdo): void
    {
        $schemaFile = self::getBaseDir() . '/schema/main_schema.sql';
        if (file_exists($schemaFile)) {
            $sql = file_get_contents($schemaFile);
            $pdo->exec($sql);
        } else {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    recovery_pin TEXT,
                    business_name TEXT,
                    status TEXT DEFAULT 'active',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS user_db_mapping (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    db_file TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS user_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    session_token TEXT UNIQUE NOT NULL,
                    expires_at DATETIME NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ");
        }
    }

    /**
     * Initialize tables in <uuid>.sqlite
     */
    private static function initTenantSchema(PDO $pdo): void
    {
        $schemaFile = self::getBaseDir() . '/schema/tenant_schema.sql';
        if (file_exists($schemaFile)) {
            $sql = file_get_contents($schemaFile);
            $pdo->exec($sql);
        } else {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS products (
                    id TEXT PRIMARY KEY,
                    name TEXT UNIQUE NOT NULL,
                    supplier TEXT DEFAULT '',
                    stock INTEGER DEFAULT 0,
                    threshold_qty INTEGER DEFAULT 2,
                    reminder_date TEXT DEFAULT '',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS transactions (
                    id TEXT PRIMARY KEY,
                    product_id TEXT NOT NULL,
                    product_name TEXT NOT NULL,
                    type TEXT NOT NULL CHECK(type IN ('IN', 'OUT')),
                    quantity INTEGER NOT NULL,
                    description TEXT DEFAULT '',
                    date TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS settings (
                    id INTEGER PRIMARY KEY DEFAULT 1,
                    business_name TEXT DEFAULT '',
                    phone TEXT DEFAULT '',
                    address TEXT DEFAULT '',
                    report_header_name TEXT DEFAULT '',
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ");
        }
    }
}
