<?php
/**
 * STOCKTRACK Authentication Middleware
 * Validates session token and provides tenant database PDO instance
 */

namespace StockTrack\Middleware;

use StockTrack\Config\Database;
use StockTrack\Services\Response;
use PDO;

class Auth
{
    /**
     * Authenticate request and return user data & tenant database connection
     *
     * @return array{user: array, tenant_db: PDO, main_db: PDO}
     */
    public static function authenticate(): array
    {
        Response::handleCors();

        $token = self::extractToken();
        if (empty($token)) {
            Response::error('Authentication required. Missing token.', 401);
        }

        $mainDb = Database::getMainConnection();

        // Check if token exists in user_sessions and is not expired
        $stmt = $mainDb->prepare("
            SELECT s.session_token, s.expires_at, u.id, u.username, u.business_name, u.status, m.db_file
            FROM user_sessions s
            JOIN users u ON s.user_id = u.id
            JOIN user_db_mapping m ON u.id = m.user_id
            WHERE s.session_token = :token AND s.expires_at > CURRENT_TIMESTAMP
            LIMIT 1
        ");
        $stmt->execute([':token' => $token]);
        $session = $stmt->fetch();

        if (!$session) {
            Response::error('Session expired or invalid. Please log in again.', 401);
        }

        if ($session['status'] !== 'active') {
            Response::error('Account is deactivated.', 403);
        }

        // Connect to the user's isolated SQLite tenant database
        $tenantDb = Database::getTenantConnection($session['db_file']);

        return [
            'user' => [
                'id' => (int)$session['id'],
                'username' => $session['username'],
                'business_name' => $session['business_name'] ?? '',
                'db_file' => $session['db_file']
            ],
            'tenant_db' => $tenantDb,
            'main_db' => $mainDb
        ];
    }

    private static function extractToken(): ?string
    {
        // 1. Authorization: Bearer <token>
        $headers = function_exists('getallheaders') ? getallheaders() : [];
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';

        if (!empty($authHeader) && preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
            return $matches[1];
        }

        // 2. X-Session-Token
        if (!empty($headers['X-Session-Token'] ?? $headers['x-session-token'] ?? '')) {
            return $headers['X-Session-Token'] ?? $headers['x-session-token'];
        }

        // 3. Query string or POST parameter (fallback for exports)
        if (!empty($_GET['token'])) {
            return (string)$_GET['token'];
        }
        if (!empty($_POST['token'])) {
            return (string)$_POST['token'];
        }

        return null;
    }
}
