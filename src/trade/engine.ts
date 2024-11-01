import { RedisManager } from "../lib/redis-manager";
import { SnapshotManager } from "../managers/snapshot";
import {
  INRBalances,
  StockBalances,
  Response,
  STATUS_TYPE,
  MessageFromApi,
  MESSAGE_TYPE,
  STOCK_TYPE,
  Orderbook_2,
} from "../types";
import { logger } from "../utils";

export class Engine {
  private static instance: Engine;
  private ORDERBOOK: Record<string, Orderbook_2> = {};
  private INR_BALANCES: INRBalances = {};
  private STOCK_BALANCES: StockBalances = {};
  public snapshotManager: SnapshotManager;

  constructor() {
    this.snapshotManager = new SnapshotManager(this);
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new Engine();
    }
    return this.instance;
  }

  public getSnapshotData() {
    return {
      orderbook: this.ORDERBOOK,
      stockBalances: this.STOCK_BALANCES,
      inrBalances: this.INR_BALANCES
    };
  }

  public restoreFromSnapshot(data: {
    orderbook: Record<string, Orderbook_2>;
    stockBalances: StockBalances;
    inrBalances: INRBalances;
  }) {
    this.ORDERBOOK = data.orderbook;
    this.STOCK_BALANCES = data.stockBalances;
    this.INR_BALANCES = data.inrBalances;
  }

  public startSnapshots(intervalMinutes: number = 10) {
    this.snapshotManager.startSnapshots(intervalMinutes);
  }

  public stopSnapshots() {
    this.snapshotManager.stopSnapshots();
  }


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
      case MESSAGE_TYPE.MINT_TOKENS:
        response = this.mintTokens({ stockSymbol: message?.data?.stockSymbol, quantity: message?.data?.quantity, userId: message?.data?.userId });
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
      case MESSAGE_TYPE.BUY_ORDER:
        response = this.buy({ userId: message?.data?.userId, price: message?.data?.price, quantity: message?.data?.quantity, stockSymbol: message?.data?.stockSymbol, stockType: message?.data?.stockType });
        this.publishOrderbook(message?.data?.stockSymbol)
        break;
      case MESSAGE_TYPE.SELL_ORDER:
        response = this.sell({ userId: message?.data?.userId, price: message?.data?.price, quantity: message?.data?.quantity, stockSymbol: message?.data?.stockSymbol, stockType: message?.data?.stockType });
        this.publishOrderbook(message?.data?.stockSymbol)
        break;
      case MESSAGE_TYPE.RESET_STATES:
        response = this.resetStates();
        break;
      case MESSAGE_TYPE.CRASH_SERVER:
        console.log("🔥🔥🔥🔥🔥 CRASHING 🔥🔥🔥🔥🔥")
        process.exit(1)
      case MESSAGE_TYPE.RESTORE_SERVER_STATE:
        console.log("💉 Restoring Sever States")
        const restoredData = this.snapshotManager.loadLatestSnapshot();
        console.log(restoredData)
        break;
      case MESSAGE_TYPE.GET_USER:
        response = this.getUser({ userId: message?.data?.userId });
        break;
      case MESSAGE_TYPE.GET_ALL_STOCK_SYMBOLS:
        response = this.getAllStockSymbols()
        break;
      case MESSAGE_TYPE.GET_USER_STOCK_BALANCE_BY_STOCK_SYMBOL:
        response = this.getUserStockBalanceByStockSymbol({ userId: message?.data?.userId, stockSymbol: message?.data?.stockSymbol })
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
  }
  getAllStockSymbols(): Response {
    const data: { symbol: string, totalOrders: number }[] = [];
    for (const [symbol, bookData] of Object.entries(this.ORDERBOOK)) {
      let totalOrders = 0;
      for (const priceLevel of Object.values(bookData.yes)) {
        totalOrders += Object.keys(priceLevel.orders).length;
      }
      for (const priceLevel of Object.values(bookData.no)) {
        totalOrders += Object.keys(priceLevel.orders).length;
      }
      data.push({
        symbol,
        totalOrders
      });
    }
    const sortedData = data.sort((a, b) => b.totalOrders - a.totalOrders);
    return {
      statusCode: 200,
      statusMessage: "",
      statusType: STATUS_TYPE.SUCCESS,
      data: sortedData
    }
  }


  getUserStockBalanceByStockSymbol({ userId, stockSymbol }: { userId: string, stockSymbol: string }): Response {
    if (!this.STOCK_BALANCES[userId]) {
      return {
        statusCode: 404,
        statusMessage: "User Not Found!",
        statusType: STATUS_TYPE.ERROR,
        data: {}

      }
    }
    return {
      statusCode: 200,
      statusMessage: "",
      statusType: STATUS_TYPE.SUCCESS,
      data: this.STOCK_BALANCES[userId][stockSymbol] ?? {}
    }
  }

  publishOrderbook(stockSymbol: string) {
    const channel = `orderbook.${stockSymbol}`;
    RedisManager.getInstance().publishMessage(
      `orderbook.${stockSymbol}`,
      {
        message: JSON.stringify(this.ORDERBOOK[stockSymbol]),
      }
    );
    console.log(`Published orderbook for ${stockSymbol} stock to ${channel} channel`);
  }

  createUser({ userId }: { userId: string }): Response {
    if (this.INR_BALANCES[userId]) {
      return { statusType: STATUS_TYPE.ERROR, statusMessage: "User already exists!", statusCode: 400 };
    }
    this.INR_BALANCES[userId] = { balance: 1_00_000, locked: 0 };
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
      statusMessage: "",
      statusType: STATUS_TYPE.SUCCESS,
      statusCode: 200,
      data: this.ORDERBOOK
    }
  }

  mintTokens({ userId, stockSymbol, quantity }: { userId: string, stockSymbol: string, quantity: number }): Response {
    if (!this.STOCK_BALANCES[userId]) {
      this.STOCK_BALANCES[userId] = {};
    }

    if (!this.STOCK_BALANCES[userId][stockSymbol]) {
      this.STOCK_BALANCES[userId][stockSymbol] = {
        yes: {
          quantity: 0,
          locked: 0,
        },
        no: {
          quantity: 0,
          locked: 0,
        },
      };
    }

    if (!this.STOCK_BALANCES[userId][stockSymbol].yes || !this.STOCK_BALANCES[userId][stockSymbol].no) {
      this.STOCK_BALANCES[userId][stockSymbol].yes = { quantity: 0, locked: 0 };
      this.STOCK_BALANCES[userId][stockSymbol].no = { quantity: 0, locked: 0 };
    }

    this.STOCK_BALANCES[userId][stockSymbol].yes.quantity += quantity;
    this.STOCK_BALANCES[userId][stockSymbol].no.quantity += quantity;

    return { statusType: STATUS_TYPE.SUCCESS, data: this.STOCK_BALANCES[userId][stockSymbol], statusCode: 200, statusMessage: "Minted Successfully" };

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
    return { statusType: STATUS_TYPE.SUCCESS, statusMessage: `INR ${amount} added to ${userId} user`, statusCode: 200 }
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


  getUser({ userId }: { userId: string }): Response {
    if (!this.INR_BALANCES[userId]) {
      return {
        statusCode: 404,
        statusMessage: "User not found",
        statusType: STATUS_TYPE.ERROR,
      }
    }
    return {
      statusCode: 200,
      statusMessage: "User found",
      statusType: STATUS_TYPE.SUCCESS,
    }
  }

  buy({ userId, stockSymbol, quantity, price, stockType }: { userId: string, stockSymbol: string, quantity: number, price: number, stockType: STOCK_TYPE }): Response {
    if (stockType === STOCK_TYPE.YES) {
      return this.buyYes({ price, quantity, stockSymbol, userId })
    } else if (stockType === STOCK_TYPE.NO) {
      return this.buyNo({ price, quantity, stockSymbol, userId })
    }
    return {
      statusCode: 400,
      statusMessage: "Something Went Wrong!",
      statusType: STATUS_TYPE.ERROR,
    }
  }


  validateUserExistenceAndBalance = (
    { userId, price, quantity }: {
      userId: string,
      quantity: number,
      price: number,
    }
  ): Response | void => {
    if (!this.INR_BALANCES[userId]) return {
      statusCode: 404,
      statusMessage: `${userId} User Not Found`,
      statusType: STATUS_TYPE.ERROR,
    };
    if (this.INR_BALANCES[userId].balance < (quantity * (price * 100)) || price <= 0) {
      return {
        statusCode: 400,
        statusMessage: `Low balance for this order :(`,
        statusType: STATUS_TYPE.ERROR,
      };
    }

  };

  validateStockSymbolExistence = ({ stockSymbol }: { stockSymbol: string }): Response | void => {
    if (!this.ORDERBOOK[stockSymbol]) {
      return { statusMessage: `${stockSymbol} Stock Not Found`, statusCode: 404, statusType: STATUS_TYPE.ERROR };
    }
  }



  buyYes({ userId, stockSymbol, price, quantity }: {
    userId: string,
    stockSymbol: string,
    quantity: number,
    price: number
  }
  ): Response {
    this.validateStockSymbolExistence({ stockSymbol })
    this.validateUserExistenceAndBalance({ price, quantity, userId })


    this.INR_BALANCES[userId].balance -= quantity * price * 100;
    this.INR_BALANCES[userId].locked += quantity * price * 100;

    if (!this.ORDERBOOK[stockSymbol]) {
      return { statusMessage: `${stockSymbol} Stock Not Found`, statusCode: 404, statusType: STATUS_TYPE.ERROR };
    }

    let availableQuantity = 0;
    let availableNoQuantity = 0;

    if (this.ORDERBOOK[stockSymbol].yes[price]) {
      availableQuantity = this.ORDERBOOK[stockSymbol].yes[price].total;
      logger(`availableQuantity - ${availableQuantity} `)
      logger(`availableNoQuantity - ${availableNoQuantity} `)
      availableNoQuantity = this.ORDERBOOK[stockSymbol].no[10 - price]?.total || 0;
    }

    let OUR_QUANTITY = quantity;

    if (availableQuantity > 0) {
      for (let user in this.ORDERBOOK[stockSymbol].yes[price].orders) {
        if (OUR_QUANTITY <= 0) break;

        const available = this.ORDERBOOK[stockSymbol].yes[price].orders[user].quantity;
        const toTake = Math.min(available, OUR_QUANTITY);

        this.ORDERBOOK[stockSymbol].yes[price].orders[user].quantity -= toTake;
        this.ORDERBOOK[stockSymbol].yes[price].total -= toTake;
        OUR_QUANTITY -= toTake;

        if (this.ORDERBOOK[stockSymbol].yes[price].orders[user].type == "sell") {
          if (this.STOCK_BALANCES[user][stockSymbol].yes) {
            this.STOCK_BALANCES[user][stockSymbol].yes.locked -= toTake;
            this.INR_BALANCES[user].balance += toTake * price * 100;
          }
        } else if (
          this.ORDERBOOK[stockSymbol].yes[price].orders[user].type == "system_generated"
        ) {
          if (this.STOCK_BALANCES[user][stockSymbol].no) {
            this.STOCK_BALANCES[user][stockSymbol].no.quantity += toTake;
            this.INR_BALANCES[user].locked -= toTake * price * 100;
          }
        }

        if (this.ORDERBOOK[stockSymbol].yes[price].orders[user].quantity === 0) {
          delete this.ORDERBOOK[stockSymbol].yes[price].orders[user];
        }
      }

      if (this.ORDERBOOK[stockSymbol].yes[price].total === 0) {
        delete this.ORDERBOOK[stockSymbol].yes[price];
      }
    }

    if (availableNoQuantity > 0 && this.ORDERBOOK[stockSymbol].no[10 - price]) {
      for (let user in this.ORDERBOOK[stockSymbol].no[10 - price].orders) {
        if (OUR_QUANTITY <= 0) break;

        const available =
          this.ORDERBOOK[stockSymbol].no[10 - price].orders[user].quantity;
        const toTake = Math.min(available, OUR_QUANTITY);

        this.ORDERBOOK[stockSymbol].no[10 - price].orders[user].quantity -= toTake;
        this.ORDERBOOK[stockSymbol].no[10 - price].total -= toTake;
        OUR_QUANTITY -= toTake;

        if (this.ORDERBOOK[stockSymbol].no[10 - price].orders[user].type == "sell") {
          if (this.STOCK_BALANCES[user][stockSymbol].no) {
            this.STOCK_BALANCES[user][stockSymbol].no.locked -= toTake;
            this.INR_BALANCES[user].balance += toTake * (10 - price) * 100;
          }
        } else if (
          this.ORDERBOOK[stockSymbol].no[10 - price].orders[user].type == "system_generated"
        ) {
          if (this.STOCK_BALANCES[user][stockSymbol].yes) {
            this.STOCK_BALANCES[user][stockSymbol].yes.quantity += toTake;
            this.INR_BALANCES[user].locked -= toTake * (10 - price) * 100;
          }
        }

        if (this.ORDERBOOK[stockSymbol].no[10 - price].orders[user].quantity === 0) {
          delete this.ORDERBOOK[stockSymbol].no[10 - price].orders[user];
        }
      }

      if (this.ORDERBOOK[stockSymbol].no[10 - price].total === 0) {
        delete this.ORDERBOOK[stockSymbol].no[10 - price];
      }
    }

    if (OUR_QUANTITY > 0) {
      this.mintOppositeStocks({ stockSymbol, price, quantity: OUR_QUANTITY, userId, orderType: STOCK_TYPE.YES });
    }

    this.initializeStockBalance({ userId, stockSymbol });

    if (this.STOCK_BALANCES[userId][stockSymbol]?.yes) {
      this.STOCK_BALANCES[userId][stockSymbol].yes.quantity += quantity - OUR_QUANTITY;
    }

    this.INR_BALANCES[userId].locked -= (quantity - OUR_QUANTITY) * price * 100;

    return {
      statusMessage: `Buy order for 'yes' has been added for ${stockSymbol} stock`,
      statusCode: 200,
      statusType: STATUS_TYPE.SUCCESS,
      data: {
        orderbook: this.ORDERBOOK[stockSymbol],

      }
    };

  };

  mintOppositeStocks({ stockSymbol, price, quantity, userId, orderType }: { stockSymbol: string, price: number, quantity: number, userId: string, orderType: STOCK_TYPE }) {
    const oppositePrice = 10 - price;
    if (orderType === STOCK_TYPE.YES) {
      if (!this.ORDERBOOK[stockSymbol].no[oppositePrice]) {
        this.ORDERBOOK[stockSymbol].no[oppositePrice] = { total: 0, orders: {} };
      }
      this.ORDERBOOK[stockSymbol].no[oppositePrice].total += quantity;
      this.ORDERBOOK[stockSymbol].no[oppositePrice].orders[userId] = {
        type: "system_generated",
        quantity:
          (this.ORDERBOOK[stockSymbol].no[oppositePrice].orders[userId]?.quantity ||
            0) + quantity,
      };
    } else {
      if (!this.ORDERBOOK[stockSymbol].yes[oppositePrice]) {
        this.ORDERBOOK[stockSymbol].yes[oppositePrice] = { total: 0, orders: {} };
      }
      this.ORDERBOOK[stockSymbol].yes[oppositePrice].total += quantity;
      this.ORDERBOOK[stockSymbol].yes[oppositePrice].orders[userId] = {
        type: "system_generated",
        quantity:
          (this.ORDERBOOK[stockSymbol].yes[oppositePrice].orders[userId]?.quantity ||
            0) + quantity,
      };
    }
  }

  initializeStockBalance({ userId, stockSymbol }: { userId: string, stockSymbol: string }) {
    if (!this.STOCK_BALANCES[userId]) {
      this.STOCK_BALANCES[userId] = {};
    }
    if (!this.STOCK_BALANCES[userId][stockSymbol]) {
      this.STOCK_BALANCES[userId][stockSymbol] = {
        yes: { quantity: 0, locked: 0 },
        no: { quantity: 0, locked: 0 },
      };
    }
  }

  buyNo(

    { price, quantity, stockSymbol, userId }: {
      userId: string,
      stockSymbol: string,
      quantity: number,
      price: number
    }
  ): Response {

    this.validateStockSymbolExistence({ stockSymbol })
    this.validateUserExistenceAndBalance({ price, quantity, userId })

    this.INR_BALANCES[userId].balance -= quantity * price * 100;
    this.INR_BALANCES[userId].locked += quantity * price * 100;



    let availableQuantity = 0;
    let availableYesQuantity = 0;
    if (this.ORDERBOOK[stockSymbol].no[price]) {
      availableQuantity = this.ORDERBOOK[stockSymbol].no[price].total;
      availableYesQuantity = this.ORDERBOOK[stockSymbol].yes[10 - price]?.total || 0;
    }

    let OUR_QUANTITY = quantity;

    if (availableQuantity > 0) {
      for (let user in this.ORDERBOOK[stockSymbol].no[price].orders) {
        if (!this.STOCK_BALANCES[userId]) {
          this.STOCK_BALANCES[userId] = {};
        }

        if (!this.STOCK_BALANCES[user]) {
          this.STOCK_BALANCES[user] = {};
        }

        if (!this.STOCK_BALANCES[userId][stockSymbol]) {
          this.STOCK_BALANCES[userId][stockSymbol] = {
            yes: { quantity: 0, locked: 0 },
            no: { quantity: 0, locked: 0 },
          };
        }

        if (!this.STOCK_BALANCES[user][stockSymbol]) {
          this.STOCK_BALANCES[user][stockSymbol] = {
            yes: { quantity: 0, locked: 0 },
            no: { quantity: 0, locked: 0 },
          };
        }

        if (OUR_QUANTITY <= 0) break;

        const available = this.ORDERBOOK[stockSymbol].no[price].orders[user].quantity;
        const toTake = Math.min(available, OUR_QUANTITY);

        this.ORDERBOOK[stockSymbol].no[price].orders[user].quantity -= toTake;
        this.ORDERBOOK[stockSymbol].no[price].total -= toTake;
        OUR_QUANTITY -= toTake;

        if (this.ORDERBOOK[stockSymbol].no[price].orders[user].type == "sell") {
          if (this.STOCK_BALANCES[user][stockSymbol].no) {
            this.STOCK_BALANCES[user][stockSymbol].no.locked -= toTake;
            this.INR_BALANCES[user].balance += toTake * 100 * price;
          }
        } else if (
          this.ORDERBOOK[stockSymbol].no[price].orders[user].type == "system_generated"
        ) {
          if (this.STOCK_BALANCES[user][stockSymbol].yes) {
            this.STOCK_BALANCES[user][stockSymbol].yes.quantity += toTake;
            this.INR_BALANCES[user].locked -= toTake * 100 * price;
          }
        }

        if (this.ORDERBOOK[stockSymbol].no[price].orders[user].quantity === 0) {
          delete this.ORDERBOOK[stockSymbol].no[price].orders[user];
        }
      }

      if (this.ORDERBOOK[stockSymbol].no[price].total === 0) {
        delete this.ORDERBOOK[stockSymbol].no[price];
      }
    }

    if (availableYesQuantity > 0 && this.ORDERBOOK[stockSymbol].yes[10 - price]) {
      for (let user in this.ORDERBOOK[stockSymbol].yes[10 - price].orders) {
        if (!this.STOCK_BALANCES[userId]) {
          this.STOCK_BALANCES[userId] = {};
        }

        if (!this.STOCK_BALANCES[user]) {
          this.STOCK_BALANCES[user] = {};
        }

        if (!this.STOCK_BALANCES[userId][stockSymbol]) {
          this.STOCK_BALANCES[userId][stockSymbol] = {
            yes: { quantity: 0, locked: 0 },
            no: { quantity: 0, locked: 0 },
          };
        }

        if (!this.STOCK_BALANCES[user][stockSymbol]) {
          this.STOCK_BALANCES[user][stockSymbol] = {
            yes: { quantity: 0, locked: 0 },
            no: { quantity: 0, locked: 0 },
          };
        }
        if (OUR_QUANTITY <= 0) break;

        const available =
          this.ORDERBOOK[stockSymbol].yes[10 - price].orders[user].quantity;
        const toTake = Math.min(available, OUR_QUANTITY);

        this.ORDERBOOK[stockSymbol].yes[10 - price].orders[user].quantity -= toTake;
        this.ORDERBOOK[stockSymbol].yes[10 - price].total -= toTake;
        OUR_QUANTITY -= toTake;

        if (this.ORDERBOOK[stockSymbol].yes[10 - price].orders[user].type == "sell") {
          if (this.STOCK_BALANCES[user][stockSymbol].yes) {
            this.STOCK_BALANCES[user][stockSymbol].yes.locked -= toTake;
            this.INR_BALANCES[user].balance += toTake * 100 * (10 - price);
          }
        } else if (
          this.ORDERBOOK[stockSymbol].yes[10 - price].orders[user].type == "system_generated"
        ) {
          if (this.STOCK_BALANCES[user][stockSymbol].no) {
            this.STOCK_BALANCES[user][stockSymbol].no.quantity += toTake;
            this.INR_BALANCES[user].locked -= toTake * 100 * (10 - price);
          }
        }

        if (this.ORDERBOOK[stockSymbol].yes[10 - price].orders[user].quantity === 0) {
          delete this.ORDERBOOK[stockSymbol].yes[10 - price].orders[user];
        }
      }

      if (this.ORDERBOOK[stockSymbol].yes[10 - price].total === 0) {
        delete this.ORDERBOOK[stockSymbol].yes[10 - price];
      }
    }

    if (OUR_QUANTITY > 0) {
      this.mintOppositeStocks({ stockSymbol, price, quantity: OUR_QUANTITY, userId, orderType: STOCK_TYPE.NO, });
    }

    this.initializeStockBalance({ userId, stockSymbol });

    if (this.STOCK_BALANCES[userId][stockSymbol]?.no) {
      this.STOCK_BALANCES[userId][stockSymbol].no.quantity += quantity - OUR_QUANTITY;
    }


    this.INR_BALANCES[userId].locked -= (quantity - OUR_QUANTITY) * price * 100;

    return {
      statusCode: 200,
      statusType: STATUS_TYPE.SUCCESS,
      statusMessage: `Buy order for 'no' has been added for ${stockSymbol} stock`,
      data: {
        orderbook: this.ORDERBOOK[stockSymbol],

      }
    };
  };

  sellYes = (
    { userId, stockSymbol, price, quantity }: {
      userId: string,
      stockSymbol: string,
      quantity: number,
      price: number
    }
  ): Response => {
    this.validateStockSymbolExistence({ stockSymbol })
    this.validateUserExistenceAndBalance({ price, quantity, userId })


    if (
      !this.STOCK_BALANCES[userId]?.[stockSymbol]?.yes ||
      this.STOCK_BALANCES[userId][stockSymbol].yes.quantity < quantity
    ) {
      return { statusMessage: 'Insufficient "yes" stocks to sell', statusCode: 400, statusType: STATUS_TYPE.ERROR };
    }

    this.STOCK_BALANCES[userId][stockSymbol].yes.quantity -= quantity;
    this.STOCK_BALANCES[userId][stockSymbol].yes.locked += quantity;

    let remainingQuantity = quantity;
    let opposingPrice = 10 - price;

    for (let price_2 in this.ORDERBOOK[stockSymbol].no) {
      if (remainingQuantity <= 0) break;
      if (parseFloat(price_2) > opposingPrice) continue;

      for (let user in this.ORDERBOOK[stockSymbol].no[price_2].orders) {
        if (remainingQuantity <= 0) break;

        const availableQuantity =
          this.ORDERBOOK[stockSymbol].no[price_2].orders[user].quantity;
        const matchedQuantity = Math.min(availableQuantity, remainingQuantity);

        this.ORDERBOOK[stockSymbol].no[price_2].orders[user].quantity -= matchedQuantity;
        this.ORDERBOOK[stockSymbol].no[price_2].total -= matchedQuantity;
        remainingQuantity -= matchedQuantity;

        if (this.STOCK_BALANCES[user][stockSymbol].no) {
          this.STOCK_BALANCES[user][stockSymbol].no.locked -= matchedQuantity;
        }

        this.INR_BALANCES[user].balance += matchedQuantity * parseFloat(price_2) * 100;
      }

      if (this.ORDERBOOK[stockSymbol].no[price_2].total === 0) {
        delete this.ORDERBOOK[stockSymbol].no[price_2];
      }
    }

    this.INR_BALANCES[userId].balance += (quantity - remainingQuantity) * price * 100;
    this.STOCK_BALANCES[userId][stockSymbol].yes.locked -=
      quantity - remainingQuantity;

    if (remainingQuantity > 0) {
      if (!this.ORDERBOOK[stockSymbol].yes[price]) {
        this.ORDERBOOK[stockSymbol].yes[price] = { total: 0, orders: {} };
      }

      if (!this.ORDERBOOK[stockSymbol].yes[price].orders[userId]) {
        this.ORDERBOOK[stockSymbol].yes[price].orders[userId] = {
          quantity: 0,
          type: "sell",
        };
      }

      this.ORDERBOOK[stockSymbol].yes[price].total += remainingQuantity;
      this.ORDERBOOK[stockSymbol].yes[price].orders[userId].quantity +=
        remainingQuantity;
    }

    return {
      statusMessage: `Sell order for 'yes' stock has been placed for ${stockSymbol}`,
      statusCode: 200,
      statusType: STATUS_TYPE.SUCCESS,
      data: {
        orderbook: this.ORDERBOOK[stockSymbol],
      }
    };
  };

  sellNo = ({ price, quantity, stockSymbol, userId }: {
    userId: string,
    stockSymbol: string,
    quantity: number,
    price: number
  }
  ): Response => {
    this.validateStockSymbolExistence({ stockSymbol })
    this.validateUserExistenceAndBalance({ price, quantity, userId })

    if (
      !this.STOCK_BALANCES[userId]?.[stockSymbol]?.no ||
      this.STOCK_BALANCES[userId][stockSymbol].no.quantity < quantity
    ) {
      return { statusMessage: 'Insufficient "no" stocks to sell', statusCode: 404, statusType: STATUS_TYPE.ERROR };
    }

    this.STOCK_BALANCES[userId][stockSymbol].no.quantity -= quantity;
    this.STOCK_BALANCES[userId][stockSymbol].no.locked += quantity;

    let remainingQuantity = quantity;
    let opposingPrice = 10 - price;

    for (let price_2 in this.ORDERBOOK[stockSymbol].yes) {
      if (remainingQuantity <= 0) break;
      if (parseFloat(price_2) > opposingPrice) continue;

      for (let user in this.ORDERBOOK[stockSymbol].yes[price_2].orders) {
        if (remainingQuantity <= 0) break;

        const availableQuantity =
          this.ORDERBOOK[stockSymbol].yes[price_2].orders[user].quantity;
        const matchedQuantity = Math.min(availableQuantity, remainingQuantity);

        this.ORDERBOOK[stockSymbol].yes[price_2].orders[user].quantity -= matchedQuantity;
        this.ORDERBOOK[stockSymbol].yes[price_2].total -= matchedQuantity;
        remainingQuantity -= matchedQuantity;

        if (this.STOCK_BALANCES[user][stockSymbol].yes) {
          this.STOCK_BALANCES[user][stockSymbol].yes.locked -= matchedQuantity;
        }

        this.INR_BALANCES[user].balance += matchedQuantity * parseFloat(price_2) * 100;
      }

      if (this.ORDERBOOK[stockSymbol].yes[price_2].total === 0) {
        delete this.ORDERBOOK[stockSymbol].yes[price_2];
      }
    }

    this.INR_BALANCES[userId].balance += (quantity - remainingQuantity) * price * 100;
    this.STOCK_BALANCES[userId][stockSymbol].no.locked -= quantity - remainingQuantity;

    if (remainingQuantity > 0) {
      if (!this.ORDERBOOK[stockSymbol].no[price]) {
        this.ORDERBOOK[stockSymbol].no[price] = { total: 0, orders: {} };
      }

      if (!this.ORDERBOOK[stockSymbol].no[price].orders[userId]) {
        this.ORDERBOOK[stockSymbol].no[price].orders[userId] = {
          quantity: 0,
          type: "sell",
        };
      }

      this.ORDERBOOK[stockSymbol].no[price].total += remainingQuantity;
      this.ORDERBOOK[stockSymbol].no[price].orders[userId].quantity +=
        remainingQuantity;
    }

    return {
      statusMessage: `Sell order for 'no' stock has been placed for ${stockSymbol}`,
      statusCode: 200, statusType: STATUS_TYPE.SUCCESS,
      data: { orderbook: this.ORDERBOOK[stockSymbol] }
    };
  };

  sell({ userId, stockSymbol, quantity, price, stockType }: { userId: string, stockSymbol: string, quantity: number, price: number, stockType: STOCK_TYPE }): Response {
    if (stockType === STOCK_TYPE.YES) {
      return this.sellYes({ price, quantity, stockSymbol, userId })
    } else if (stockType === STOCK_TYPE.NO) {
      return this.sellNo({ price, quantity, stockSymbol, userId })
    }

    return {
      statusCode: 400,
      statusMessage: "Something Went Wrong",
      statusType: STATUS_TYPE.ERROR,
    }
  }
}



