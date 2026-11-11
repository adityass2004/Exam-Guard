import crypto from 'node:crypto';

export function generateSecrets() {
  const embeddingKey = crypto.randomBytes(32).toString('base64');
  const imageKey = crypto.randomBytes(32).toString('base64');
  const visionInternalKey = crypto.randomBytes(32).toString('hex');
  const adminPassword = `Admin!${crypto.randomBytes(12).toString('base64url')}#9`;
  const studentPassword = `Student!${crypto.randomBytes(12).toString('base64url')}#9`;

  return {
    EMBEDDING_ENCRYPTION_KEY: embeddingKey,
    IMAGE_ENCRYPTION_KEY: imageKey,
    VISION_INTERNAL_KEY: visionInternalKey,
    SEED_ADMIN_PASSWORD: adminPassword,
    SEED_STUDENT_PASSWORD: studentPassword,
  };
}

if (process.argv[1] && (process.argv[1].endsWith('gen-secrets.mjs') || process.argv[1].includes('gen-secrets'))) {
  const secrets = generateSecrets();
  console.log(JSON.stringify(secrets, null, 2));
}

