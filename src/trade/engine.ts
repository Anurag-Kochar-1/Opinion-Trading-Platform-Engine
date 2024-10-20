import { RedisManager } from "../lib/redis-manager";
import { INRBalances, OrderBook, StockBalances } from "../types";
import { logger } from "../utils";

export class Engine {
  private ORDERBOOK: OrderBook = {};
  private INR_BALANCES: INRBalances = {};
  private STOCK_BALANCES: StockBalances = {};

  process({ clientId, message }: { clientId: string; message: any }) {
    logger(`Engine is processing, client id - ${clientId}`);
    RedisManager.getInstance().sendToApi(clientId, {
      type: message?.data?.type ?? "no type",
      payload: {
        message: JSON.stringify(message),
      },
    });
  }
}
