-- SQLite / Cloudflare D1
-- 将超级管理员 admin 的密码重置为：admin@123
UPDATE users
SET password_hash = 'pbkdf2$210000$a2FuYmFuLWFkbWluLXJlc2V0LXYx$SHH5SdEi2VBEgLeXlkX-9EGs1Pc920AmntgF3GkTUQ0',
    updated_at = CURRENT_TIMESTAMP
WHERE username = 'admin' AND role = 'super_admin';
