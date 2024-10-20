import { RedisClientType, createClient } from "redis";
import { TODO } from "../types";

export class RedisManager {
  private client: RedisClientType;
  private static instance: RedisManager;

  constructor() {
    const creds = {
      url: process.env.REDIS_URL,
      username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
    };
    this.client = createClient(creds);
    this.client.connect();
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new RedisManager();
    }
    return this.instance;
  }

  public pushMessage(message: TODO) {
    this.client.lPush("db_processor", JSON.stringify(message));
  }

  public publishMessage(channel: string, message: TODO) {
    this.client.publish(channel, JSON.stringify(message));
  }

  public sendToApi(clientId: string, message: TODO) {
    this.client.publish(clientId, JSON.stringify(message));
  }
}
