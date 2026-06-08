import { pbkdf2Sync, randomBytes } from "node:crypto";

const username = process.argv[2] ?? "admin";
if (!/^[A-Za-z0-9]+$/.test(username)) {
  console.error("Username must contain only English letters and numbers.");
  process.exit(1);
}

const password = process.argv[3] ?? `${username}@123`;
const iterations = 210000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
const encoded = `pbkdf2$${iterations}$${base64Url(salt)}$${base64Url(hash)}`;
const escapedUsername = username.replaceAll("'", "''");
const escapedHash = encoded.replaceAll("'", "''");
const updatedAt = new Date().toISOString().replaceAll("'", "''");

console.log(`-- Reset ${username} password (hash generated, plaintext not logged)`);
console.log(`UPDATE users SET password_hash = '${escapedHash}', updated_at = '${updatedAt}' WHERE username = '${escapedUsername}';`);

function base64Url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}
