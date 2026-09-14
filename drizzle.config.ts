import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: ["./db/schema.ts", "./db/pocSchema.ts", "./db/nfeioSchema.ts", "./db/authSchema.ts", "./db/equipeSchema.ts", "./db/fiscalSchema.ts"],
  out: "./db/migrations",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});
