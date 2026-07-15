<?php
/**
 * Прокси к Nominatim OpenStreetMap для поиска городов на карте.
 * Нужен из‑за CORS (публичный Nominatim не отдаёт Access-Control-Allow-Origin)
 * и политики User-Agent (браузер не может задать свой UA в fetch).
 *
 * GET /geocode.php?q=Москва&limit=5
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, max-age=300');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$q = trim((string) ($_GET['q'] ?? ''));
if ($q === '') {
    http_response_code(400);
    echo json_encode(['error' => 'параметр q обязателен']);
    exit;
}

$limit = (int) ($_GET['limit'] ?? 5);
$limit = max(1, min(10, $limit));

$params = http_build_query([
    'q' => $q,
    'format' => 'json',
    'limit' => $limit,
    'countrycodes' => 'ru',
    'addressdetails' => '1',
]);

$url = 'https://nominatim.openstreetmap.org/search?' . $params;

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 12);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'User-Agent: benzinopedia.ru / contact',
    'Accept-Language: ru',
]);

$response = curl_exec($ch);
$statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    echo json_encode(['error' => 'геокодинг недоступен: ' . $curlError]);
    exit;
}

http_response_code($statusCode ?: 502);
echo $response;
