import express, { Response } from "express";

import cors from "cors";
import { createClient } from "redis";
import dotenv from "dotenv";
import { logger } from "./utils";
import { Engine } from "./trade/engine";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 4000;

app.get("/", (_, res: Response) => {
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
  const redisClient = createClient(creds);
  await redisClient.connect();
  logger(`connected to redis - ${creds.url}`);

  while (true) {
    const response = await redisClient.rPop("messages" as string);
    if (response) {
      console.log(`engine got this - ${JSON.stringify(response)}`)
      engine.process(JSON.parse(response));
    } else { }
  }
}

main();
