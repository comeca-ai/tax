import { drizzle } from "drizzle-orm/mysql2";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";
import * as pocSchema from "@db/pocSchema";
import * as nfeioSchema from "@db/nfeioSchema";
import * as authSchema from "@db/authSchema";
import * as fiscalSchema from "@db/fiscalSchema";

const fullSchema = { ...schema, ...relations, ...pocSchema, ...nfeioSchema, ...authSchema, ...fiscalSchema };

let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

export function getDb() {
  if (!instance) {
    instance = drizzle(env.databaseUrl, {
      mode: "planetscale",
      schema: fullSchema,
    });
  }
  return instance;
}
