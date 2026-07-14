<?php
/**
 * Обратный прокси до Go-бэкенда "Карты скорби".
 *
 * ПОЧЕМУ ЭТОТ ФАЙЛ ВООБЩЕ НУЖЕН: сервер 37.140.192.133 — shared-хостинг
 * reg.ru за файрволом, где снаружи открыты только "обычные" веб/почтовые
 * порты (80, 443, 22, 25 и т.п.), а произвольный порт (например 8082,
 * на котором слушает сам Go-бэкенд) файрвол снаружи не пропускает —
 * это подтверждено практической проверкой (см. README.md в /server).
 * Поднять права/открыть порт через firewalld/iptables нельзя: у
 * пользователя u3577787 нет root/sudo на этом хостинге.
 *
 * Go-бэкенд живёт ТОЛЬКО на VPS 5.188.19.170 (порт 8082 снаружи
 * закрыт; с reg.ru доступен nginx на :80). На shared-хостинге reg.ru
 * ЗАПРЕЩЕНО слушать порты >1024 — backend здесь не запускаем.
 *
 * Поэтому вместо прямого обращения фронтенда на api.benzinopedia.ru
 * (DNS может не резолвиться) используется этот PHP-скрипт на том же
 * домене benzinopedia.ru: исходящий curl к VPS, без listen >1024.
 * Заодно это бесплатно решает и CORS (запрос идёт на тот же домен,
 * что и сам сайт), и mixed content (если сайт открыт по https,
 * то и путь до /api.php будет https, а backend вызывается изнутри
 * сервера по http, что браузеру не видно и не важно).
 *
 * Маршрутизация: используется PATH_INFO, то есть запрос вида
 *   GET /api.php/stations
 * приходит в этот файл с $_SERVER['PATH_INFO'] === '/stations', и мы
 * просто перекладываем его на backend как GET /api/stations.
 */

$backendBase = getenv('BACKEND_INTERNAL_URL') ?: 'http://5.188.19.170';

$allowedOrigins = [
    'https://benzinopedia.ru',
    'https://www.benzinopedia.ru',
    'https://oleg-rakitin.github.io',
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
} else {
    // Разрешаем "*" как простой фолбэк на первом этапе (см. задачу),
    // но только когда Origin не входит в белый список выше.
    header('Access-Control-Allow-Origin: *');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Max-Age: 3600');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$pathInfo = $_SERVER['PATH_INFO'] ?? '';
if ($pathInfo === '' && isset($_GET['path'])) {
    // Запасной вариант маршрутизации через query-параметр ?path=/stations,
    // на случай если PATH_INFO по какой-то причине не дойдёт до PHP
    // на конкретной конфигурации хостинга.
    $pathInfo = '/' . ltrim((string) $_GET['path'], '/');
}
if ($pathInfo === '') {
    $pathInfo = '/stations';
}

$targetUrl = $backendBase . '/api' . $pathInfo;

$query = $_SERVER['QUERY_STRING'] ?? '';
if (isset($_GET['path'])) {
    // не пробрасываем служебный параметр path= дальше в backend
    parse_str($query, $qsParams);
    unset($qsParams['path']);
    $query = http_build_query($qsParams);
}
if ($query !== '') {
    $targetUrl .= '?' . $query;
}

$method = $_SERVER['REQUEST_METHOD'];
$body = file_get_contents('php://input');

$ch = curl_init($targetUrl);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 20);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
if ($method === 'POST' || $method === 'PUT') {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

$response = curl_exec($ch);
if ($response === false) {
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'backend недоступен: ' . curl_error($ch)]);
    curl_close($ch);
    exit;
}

$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$responseBody = substr($response, $headerSize);
curl_close($ch);

http_response_code($statusCode ?: 502);
header('Content-Type: application/json; charset=utf-8');
echo $responseBody;
