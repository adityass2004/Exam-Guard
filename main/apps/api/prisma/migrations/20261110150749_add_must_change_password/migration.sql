-- AlterTable
ALTER TABLE `users` ADD COLUMN `must_change_password` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `users_role_deleted_at_idx` ON `users`(`role`, `deleted_at`);
