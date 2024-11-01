import express, { Response } from "express";
import cors from "cors";
import { createClient } from "redis";
import dotenv from "dotenv";
import { Engine } from "./trade/engine";
import { errorLogger, requestLogger } from "./middlewares/request-logger";
import { logger } from "./config/logger";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(requestLogger);
app.use(errorLogger);
const port = process.env.PORT || 4000;

app.get("/", (_, res: Response) => {
  logger.info('Home route accessed');
  res.json({ message: "ENGINE 🚂🚂🚂" });
});

app.listen(port, () => {
  console.log(`The server is running at http://localhost:${port}`);
});

async function main() {
  const creds = {
    url: process.env.REDIS_URL,
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
  };
  if (!creds.url || !creds.username || !creds.password) {
    throw new Error(
      "Missing Redis credentials: Ensure URL, username, and password are defined"
    );
  }
  const engine = new Engine();
  engine.startSnapshots(10);

  const redisClient = createClient(creds);
  await redisClient.connect();
  logger.info(`connected to redis - ${creds.url}`);

  while (true) {
    const response = await redisClient.rPop("messages" as string);
    if (response) {
      console.log(`engine got this - ${JSON.stringify(response)}`)
      engine.process(JSON.parse(response));
    } else { }
  }
}

main().catch((error) => {
  logger.info(`Fatal error: ${error.message}`);
  process.exit(1);
});

process.on('SIGINT', async () => {
  logger.info('Taking final snapshot before shutdown...');
  Engine.getInstance().snapshotManager.takeSnapshot();
  Engine.getInstance().stopSnapshots();
  process.exit(0);
});