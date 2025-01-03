type INRBalance = {
  balance: number;
  locked: number;
};

export type INRBalances = Record<string, INRBalance>;

type Order = Record<string, number>; // string is userId, and number is quantity

type OrderLevel = {
  total: number;
  orders: Order;
};

type OrderBookSide = Record<string, OrderLevel>; // string is price

type OrderBookEntry = {
  yes: OrderBookSide;
  no: OrderBookSide;
};

export type OrderBook = Record<string, OrderBookEntry>;

export interface IndividualEntry {
  type: 'sell' | 'system_generated',
  quantity: number
}

export interface OrderEntry {
  total: number;
  orders: Record<string, IndividualEntry>;
}

export interface Orderbook_2 {
  yes: Record<number, OrderEntry>;
  no: Record<number, OrderEntry>;
}

type StockBalanceSide = {
  quantity: number;
  locked: number;
};

type StockBalanceEntry = Record<string, StockBalanceSide>;

export type StockBalances = Record<string, Record<string, StockBalanceEntry>>;

export type TODO = any;

export enum STATUS_TYPE {
  SUCCESS = "SUCCESS",
  ERROR = "ERROR",
}

export type Response<T = unknown> = {
  statusType: STATUS_TYPE;
  statusMessage: string;
  statusCode: number;
  data?: T;
};

export enum MESSAGE_TYPE {
  CREATE_USER = "CREATE_USER",
  CREATE_SYMBOL = "CREATE_SYMBOL",
  VIEW_ORDERBOOK = "VIEW_ORDERBOOK",
  GET_ORDERBOOK_BY_STOCK_SYMBOL = "GET_ORDERBOOK_BY_STOCK_SYMBOL",
  BUY_ORDER = "BUY_ORDER",
  SELL_ORDER = "SELL_ORDER",
  MINT_TOKENS = "MINT_TOKENS",
  GET_INR_BALANCES = "GET_INR_BALANCES",
  GET_STOCK_BALANCES = "GET_STOCK_BALANCES",
  GET_USER_STOCK_BALANCE = "GET_USER_STOCK_BALANCE",
  GET_USER_BALANCE = "GET_USER_BALANCE",
  ONRAMP_USER_BALANCE = "ONRAMP_USER_BALANCE",
  RESET_STATES = "RESET_STATES",
  CRASH_SERVER = "CRASH_SERVER",
  RESTORE_SERVER_STATE = "RESTORE_SERVER_STATE",
  GET_USER = "GET_USER",
  GET_ALL_STOCK_SYMBOLS = "GET_ALL_STOCK_SYMBOLS",
  GET_USER_STOCK_BALANCE_BY_STOCK_SYMBOL = "GET_USER_STOCK_BALANCE_BY_STOCK_SYMBOL",
}
export enum STOCK_TYPE {
  YES = "yes",
  NO = "no"
}


export type MessageFromApi =
  | {
    type: MESSAGE_TYPE.CREATE_USER;
    data: { userId: string };
  }
  | {
    type: MESSAGE_TYPE.MINT_TOKENS,
    data: { userId: string, stockSymbol: string, quantity: number }
  } | {
    type: MESSAGE_TYPE.CREATE_SYMBOL;
    data: { stockSymbol: string };
  } | {
    type: MESSAGE_TYPE.VIEW_ORDERBOOK;
    data: {};
  } | {
    type: MESSAGE_TYPE.GET_ORDERBOOK_BY_STOCK_SYMBOL,
    data: { stockSymbol: string };
  } | {
    type: MESSAGE_TYPE.GET_INR_BALANCES,
    data: {};
  } | {
    type: MESSAGE_TYPE.GET_STOCK_BALANCES;
    data: {}
  } | {
    type: MESSAGE_TYPE.GET_USER_BALANCE;
    data: { userId: string }
  } | {
    type: MESSAGE_TYPE.GET_USER_STOCK_BALANCE;
    data: { userId: string }
  } | {
    type: MESSAGE_TYPE.ONRAMP_USER_BALANCE,
    data: { userId: string, amount: number }
  } | {
    type: MESSAGE_TYPE.RESET_STATES,
    data: {}
  } | {
    type: MESSAGE_TYPE.BUY_ORDER | MESSAGE_TYPE.SELL_ORDER,
    data: { userId: string, stockSymbol: string, quantity: number, price: number, stockType: STOCK_TYPE }
  } | {
    type: MESSAGE_TYPE.CRASH_SERVER,
    data: {}
  } | {
    type: MESSAGE_TYPE.RESTORE_SERVER_STATE,
    data: {}
  } | {
    type: MESSAGE_TYPE.GET_USER,
    data: { userId: string }
  } | {
    type: MESSAGE_TYPE.GET_ALL_STOCK_SYMBOLS,
    data: {}
  } | {
    type: MESSAGE_TYPE.GET_USER_STOCK_BALANCE_BY_STOCK_SYMBOL,
    data: { userId: string, stockSymbol: string }
  }; 
