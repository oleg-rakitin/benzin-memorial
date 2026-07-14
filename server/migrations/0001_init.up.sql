-- Базовая схема "Карты скорби": заправки и отметки их статуса.

CREATE TABLE IF NOT EXISTS stations (
    id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(200) NOT NULL,
    address    VARCHAR(300) NULL,
    lat        DOUBLE NOT NULL,
    lng        DOUBLE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS status_records (
    id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    station_id BIGINT UNSIGNED NOT NULL,
    status     ENUM('AVAILABLE', 'SHORTAGE_92', 'SHORTAGE_95', 'QUEUE_ONLY', 'CLOSED') NOT NULL,
    comment    VARCHAR(500) NULL,
    author     VARCHAR(100) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_status_records_station
        FOREIGN KEY (station_id) REFERENCES stations (id)
        ON DELETE CASCADE,
    INDEX idx_status_records_station_id (station_id),
    INDEX idx_status_records_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
