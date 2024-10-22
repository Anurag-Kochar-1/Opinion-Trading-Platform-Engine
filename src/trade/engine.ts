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
    logger(`Engine is processing, client id - ${clientId}, message type - ${message.type}`);
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
      case MESSAGE_TYPE.GET_ORDERBOOK_BY_STOCK_SYMBOL:
        response = this.viewOrderbookBySymbol({ stockSymbol: message?.data?.stockSymbol });
        break;
      case MESSAGE_TYPE.GET_INR_BALANCES:
        response = this.getInrBalances();
        break;
      case MESSAGE_TYPE.GET_STOCK_BALANCES:
        response = this.getStockBalances();
        break;
      case MESSAGE_TYPE.GET_USER_BALANCE:
        response = this.getInrBalanceByUser({ userId: message?.data?.userId });
        break;
      case MESSAGE_TYPE.GET_USER_STOCK_BALANCE:
        response = this.getStockBalanceByUser({ userId: message?.data?.userId });
        break;
      case MESSAGE_TYPE.ONRAMP_USER_BALANCE:
        response = this.onrampInr({ userId: message?.data?.userId, amount: message?.data?.amount });
        break;
      case MESSAGE_TYPE.RESET_STATES:
        response = this.resetStates();
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

  viewOrderbookBySymbol({ stockSymbol }: { stockSymbol: string }): Response {
    const orderbook = this.ORDERBOOK[stockSymbol] || {};
    const isEmpty = Object.keys(orderbook).length === 0;
    if (isEmpty) {
      return {
        statusCode: 404,
        statusMessage: `Orderbook for ${stockSymbol} Symbol Not Found!`,
        statusType: STATUS_TYPE.ERROR,
        data: orderbook
      }
    }

    return {
      statusCode: 200,
      statusMessage: "",
      statusType: STATUS_TYPE.SUCCESS,
      data: orderbook
    }
  }


  getInrBalances(): Response {
    const data = this.INR_BALANCES
    return {
      statusCode: 200,
      statusMessage: "",
      statusType: STATUS_TYPE.SUCCESS,
      data
    }
  }

  getStockBalances(): Response {
    const data = this.STOCK_BALANCES
    return {
      statusCode: 200,
      statusMessage: "",
      statusType: STATUS_TYPE.SUCCESS,
      data
    }
  }

  getInrBalanceByUser({ userId }: { userId: string }): Response {
    const userBalance = this.INR_BALANCES[userId]
    if (!userBalance) {
      return {
        statusCode: 404,
        statusMessage: `${userId} User Not Found`,
        statusType: STATUS_TYPE.ERROR,
      }
    }
    return {
      statusCode: 200,
      statusMessage: "",
      statusType: STATUS_TYPE.SUCCESS,
      data: userBalance
    }
  }

  getStockBalanceByUser({ userId }: { userId: string }): Response {
    const userStockBalance = this.STOCK_BALANCES[userId]
    if (!userStockBalance) {
      return {
        statusCode: 404,
        statusMessage: `${userId} User Not Found`,
        statusType: STATUS_TYPE.ERROR,
      }
    }
    return {
      statusCode: 200,
      statusMessage: "",
      statusType: STATUS_TYPE.SUCCESS,
      data: userStockBalance
    }
  }

  onrampInr({ userId, amount }: { userId: string, amount: number }): Response {
    if (!this.INR_BALANCES[userId]) {
      return { statusType: STATUS_TYPE.ERROR, statusMessage: `User ${userId} not found`, statusCode: 404, }
    }
    this.INR_BALANCES[userId].balance += amount;
    return { statusType: STATUS_TYPE.SUCCESS, statusMessage: `INR ${amount} added to ${userId} user`, statusCode: 200, }
  }

  resetStates(): Response {
    this.INR_BALANCES = {}
    this.STOCK_BALANCES = {}
    this.ORDERBOOK = {}
    return {
      statusCode: 200,
      statusMessage: "Reset done!",
      statusType: STATUS_TYPE.SUCCESS,
    }
  }
}
