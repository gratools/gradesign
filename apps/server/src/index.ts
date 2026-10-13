import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";

const db = new PrismaClient();
const config = readConfig();
const server = createApp(db, config).listen(config.port, () => {
  console.log(`Forma API listening on port ${config.port}`);
});

async function shutdown() {
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
