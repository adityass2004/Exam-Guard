-- Automatically create test database if running in Docker container
CREATE DATABASE IF NOT EXISTS examguard_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON examguard_test.* TO 'examguard'@'%';
FLUSH PRIVILEGES;

