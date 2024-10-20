type INRBalance = {
  balance: number;
  locked: number;
};

export type INRBalances = Record<string, INRBalance>;

type Order = Record<string, number>;

type OrderLevel = {
  total: number;
  orders: Order;
};

type OrderBookSide = Record<string, OrderLevel>;

type OrderBookEntry = {
  yes: OrderBookSide;
  no: OrderBookSide;
};

export type OrderBook = Record<string, OrderBookEntry>;

type StockBalanceSide = {
  quantity: number;
  locked: number;
};

type StockBalanceEntry = Record<string, StockBalanceSide>;


export type StockBalances = Record<string, Record<string, StockBalanceEntry>>;

export type TODO = any