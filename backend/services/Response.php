<?php
/**
 * STOCKTRACK Response Helper & CORS Handler
 */

namespace StockTrack\Services;

class Response
{
    public static function handleCors(): void
    {
        header("Access-Control-Allow-Origin: *");
        header("Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With, Accept");
        header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
        header("Content-Type: application/json; charset=UTF-8");

        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(200);
            exit;
        }
    }

    public static function json(mixed $data, int $statusCode = 200): void
    {
        self::handleCors();
        http_response_code($statusCode);
        echo json_encode([
            'success' => true,
            'data' => $data
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function error(string $message, int $statusCode = 400, array $extra = []): void
    {
        self::handleCors();
        http_response_code($statusCode);
        $payload = array_merge([
            'success' => false,
            'error' => $message
        ], $extra);
        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function getJsonInput(): array
    {
        $raw = file_get_contents('php://input');
        if (empty($raw)) {
            return $_POST ?: [];
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
}
