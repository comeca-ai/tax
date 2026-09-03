import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
  appId: required("APP_ID"),
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  appUrl: process.env.APP_URL || "http://localhost:3000",
  // Webhook 360dialog (v1.10.0) — opcionais; sem `dialog360WebhookSecret` a
  // rota /api/webhooks/360dialog fica sempre 403 (fail-closed).
  dialog360WebhookSecret: process.env.DIALOG_360_WEBHOOK_SECRET,
  dialog360ApiKey: process.env.DIALOG_360_API_KEY,
};
