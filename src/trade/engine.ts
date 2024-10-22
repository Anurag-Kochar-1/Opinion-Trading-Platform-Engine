import { RedisManager } from "../lib/redis-manager";
import {
  INRBalances,
  OrderBook,
  StockBalances,
  Response,
  STATUS_TYPE,
  MessageFromApi,
  MESSAGE_TYPE,
} from "../types";
import { logger } from "../utils";

export class Engine {
  private ORDERBOOK: OrderBook = {};
  private INR_BALANCES: INRBalances = {};
  private STOCK_BALANCES: StockBalances = {};

  process({
    clientId,
    message,
  }: {
    clientId: string;
    message: MessageFromApi;
  }) {
    logger(`Engine is processing, client id - ${clientId}`);
    console.log(JSON.stringify(message));
    // @ts-nocheck
    let response;
    switch (message.type) {
      case MESSAGE_TYPE.CREATE_USER:
        response = this.createUser({ userId: message?.data?.userId });
        break;
      case MESSAGE_TYPE.CREATE_SYMBOL:
        response = this.createSymbol({ stockSymbol: message?.data?.stockSymbol });
        break;
      case MESSAGE_TYPE.VIEW_ORDERBOOK:
        response = this.viewOrderbook();
        break;
      default:
        throw new Error("This message type is not supported by engine");
    }

    RedisManager.getInstance().sendToApi(clientId, {
      type: message?.type,
      payload: {
        message: JSON.stringify(response),
      },
    });

    RedisManager.getInstance().publishMessage(
      `orderbook.${message?.type}`,
      {
        message: JSON.stringify(response),
      }
    );

  }

  createUser({ userId }: { userId: string }): Response {
    if (this.INR_BALANCES[userId]) {
      return { statusType: STATUS_TYPE.ERROR, statusMessage: "User already exists!", statusCode: 400 };
    }
    this.INR_BALANCES[userId] = { balance: 0, locked: 0 };
    this.STOCK_BALANCES[userId] = {};
    return {
      statusType: STATUS_TYPE.SUCCESS,
      statusMessage: `User ${userId} created successfully`,
      statusCode: 201
    };
  }

  createSymbol({ stockSymbol }: { stockSymbol: string }): Response {
    if (this.ORDERBOOK[stockSymbol]) {
      return { statusMessage: "Symbol already exists", statusType: STATUS_TYPE.ERROR, statusCode: 400 };
    }

    this.ORDERBOOK[stockSymbol] = {
      yes: {},
      no: {},
    };

    return {
      statusType: STATUS_TYPE.SUCCESS,
      statusCode: 201,
      statusMessage: "Symbol created successfully",
    }
  }

  viewOrderbook(): Response {
    return {
      statusMessage: "Here is the orderbook",
      statusType: STATUS_TYPE.SUCCESS,
      statusCode: 200,
      data: this.ORDERBOOK
    }
  }
}
