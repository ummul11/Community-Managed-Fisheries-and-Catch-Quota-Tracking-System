import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

describe("Quota Marketplace Contract", () => {
  beforeEach(() => {
    // Deploy all contracts
    simnet.deployContract("quota-token", "contracts/quota-token.clar", null, deployer);
    simnet.deployContract("fishermen-registry", "contracts/fishermen-registry.clar", null, deployer);
    simnet.deployContract("fisheries-management", "contracts/fisheries-management.clar", null, deployer);
    simnet.deployContract("quota-marketplace", "contracts/quota-marketplace.clar", null, deployer);
    
    // Set up contract relationships
    simnet.callPublicFn(
      "quota-token",
      "set-fisheries-contract",
      [Cl.principal(deployer + ".fisheries-management")],
      deployer
    );
    
    // Register fishermen
    simnet.callPublicFn(
      "fishermen-registry",
      "register-fisherman",
      [
        Cl.principal(wallet1),
        Cl.stringAscii("John Fisher"),
        Cl.stringAscii("FL-2024-001"),
        Cl.stringAscii("Vessel 1")
      ],
      deployer
    );
    
    simnet.callPublicFn(
      "fishermen-registry",
      "register-fisherman",
      [
        Cl.principal(wallet2),
        Cl.stringAscii("Jane Fisher"),
        Cl.stringAscii("FL-2024-002"),
        Cl.stringAscii("Vessel 2")
      ],
      deployer
    );
    
    // Create season and distribute quotas
    simnet.callPublicFn(
      "fisheries-management",
      "create-fishing-season",
      [
        Cl.stringAscii("Spring 2024"),
        Cl.uint(simnet.blockHeight - 5),
        Cl.uint(simnet.blockHeight + 1000),
        Cl.uint(10000),
        Cl.uint(10)
      ],
      deployer
    );
    
    simnet.callPublicFn(
      "fisheries-management",
      "distribute-quota",
      [Cl.principal(wallet1), Cl.uint(1), Cl.uint(1000)],
      deployer
    );
    
    simnet.callPublicFn(
      "fisheries-management",
      "distribute-quota",
      [Cl.principal(wallet2), Cl.uint(1), Cl.uint(1000)],
      deployer
    );
  });

  describe("Marketplace Administration", () => {
    it("should allow owner to pause marketplace", () => {
      const result = simnet.callPublicFn(
        "quota-marketplace",
        "set-marketplace-pause",
        [Cl.bool(true)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const stats = simnet.callReadOnlyFn("quota-marketplace", "get-marketplace-stats", [], deployer);
      expect(stats.result).toBeTuple({
        "total-volume": Cl.uint(0),
        "fee-rate": Cl.uint(250),
        "next-order-id": Cl.uint(1),
        "next-trade-id": Cl.uint(1),
        "is-paused": Cl.bool(true)
      });
    });

    it("should allow owner to set fee rate", () => {
      const result = simnet.callPublicFn(
        "quota-marketplace",
        "set-fee-rate",
        [Cl.uint(500)], // 5%
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const stats = simnet.callReadOnlyFn("quota-marketplace", "get-marketplace-stats", [], deployer);
      expect(stats.result).toBeTuple({
        "total-volume": Cl.uint(0),
        "fee-rate": Cl.uint(500),
        "next-order-id": Cl.uint(1),
        "next-trade-id": Cl.uint(1),
        "is-paused": Cl.bool(false)
      });
    });

    it("should reject fee rate above 10%", () => {
      const result = simnet.callPublicFn(
        "quota-marketplace",
        "set-fee-rate",
        [Cl.uint(1500)], // 15%
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(405)); // ERR_INVALID_PRICE
    });

    it("should reject admin functions from non-owner", () => {
      const pauseResult = simnet.callPublicFn(
        "quota-marketplace",
        "set-marketplace-pause",
        [Cl.bool(true)],
        wallet1
      );
      expect(pauseResult.result).toBeErr(Cl.uint(400)); // ERR_UNAUTHORIZED

      const feeResult = simnet.callPublicFn(
        "quota-marketplace",
        "set-fee-rate",
        [Cl.uint(500)],
        wallet1
      );
      expect(feeResult.result).toBeErr(Cl.uint(400)); // ERR_UNAUTHORIZED
    });
  });

  describe("Buy Orders", () => {
    it("should allow registered fisherman to create buy order", () => {
      const result = simnet.callPublicFn(
        "quota-marketplace",
        "create-buy-order",
        [
          Cl.uint(50),  // amount
          Cl.uint(100), // price per token (in microSTX)
          Cl.uint(simnet.blockHeight + 100) // expiry
        ],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(1));

      const order = simnet.callReadOnlyFn(
        "quota-marketplace",
        "get-buy-order",
        [Cl.uint(1)],
        deployer
      );
      
      expect(order.result).toBeSome(
        Cl.tuple({
          buyer: Cl.principal(wallet1),
          amount: Cl.uint(50),
          "price-per-token": Cl.uint(100),
          "total-price": Cl.uint(5000),
          "expiry-block": Cl.uint(simnet.blockHeight + 100),
          "is-active": Cl.bool(true),
          "filled-amount": Cl.uint(0)
        })
      );
    });

    it("should reject buy order from unregistered fisherman", () => {
      const result = simnet.callPublicFn(
        "quota-marketplace",
        "create-buy-order",
        [
          Cl.uint(50),
          Cl.uint(100),
          Cl.uint(simnet.blockHeight + 100)
        ],
        wallet3
      );
      expect(result.result).toBeErr(Cl.uint(400)); // ERR_UNAUTHORIZED
    });

    it("should reject buy order with invalid parameters", () => {
      // Zero amount
      let result = simnet.callPublicFn(
        "quota-marketplace",
        "create-buy-order",
        [
          Cl.uint(0),
          Cl.uint(100),
          Cl.uint(simnet.blockHeight + 100)
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(402)); // ERR_INVALID_AMOUNT

      // Zero price
      result = simnet.callPublicFn(
        "quota-marketplace",
        "create-buy-order",
        [
          Cl.uint(50),
          Cl.uint(0),
          Cl.uint(simnet.blockHeight + 100)
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(405)); // ERR_INVALID_PRICE

      // Past expiry
      result = simnet.callPublicFn(
        "quota-marketplace",
        "create-buy-order",
        [
          Cl.uint(50),
          Cl.uint(100),
          Cl.uint(simnet.blockHeight - 10)
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(404)); // ERR_ORDER_EXPIRED
    });

    it("should allow cancelling buy order", () => {
      // Create order
      simnet.callPublicFn(
        "quota-marketplace",
        "create-buy-order",
        [
          Cl.uint(50),
          Cl.uint(100),
          Cl.uint(simnet.blockHeight + 100)
        ],
        wallet1
      );

      // Cancel order
      const result = simnet.callPublicFn(
        "quota-marketplace",
        "cancel-buy-order",
        [Cl.uint(1)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const order = simnet.callReadOnlyFn(
        "quota-marketplace",
        "get-buy-order",
        [Cl.uint(1)],
        deployer
      );
      
      expect(order.result).toBeSome(
        Cl.tuple({
          buyer: Cl.principal(wallet1),
          amount: Cl.uint(50),
          "price-per-token": Cl.uint(100),
          "total-price": Cl.uint(5000),
          "expiry-block": Cl.uint(simnet.blockHeight + 100),
          "is-active": Cl.bool(false),
          "filled-amount": Cl.uint(0)
        })
      );
    });
  });

  describe("Sell Orders", () => {
    it("should allow registered fisherman to create sell order", () => {
      const result = simnet.callPublicFn(
        "quota-marketplace",
        "create-sell-order",
        [
          Cl.uint(30),  // amount
          Cl.uint(90),  // price per token
          Cl.uint(simnet.blockHeight + 100) // expiry
        ],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(1));

      const order = simnet.callReadOnlyFn(
        "quota-marketplace",
        "get-sell-order",
        [Cl.uint(1)],
        deployer
      );
      
      expect(order.result).toBeSome(
        Cl.tuple({
          seller: Cl.principal(wallet1),
          amount: Cl.uint(30),
          "price-per-token": Cl.uint(90),
          "total-price": Cl.uint(2700),
          "expiry-block": Cl.uint(simnet.blockHeight + 100),
          "is-active": Cl.bool(true),
          "filled-amount": Cl.uint(0)
        })
      );
    });

    it("should reject sell order with insufficient token balance", () => {
      const result = simnet.callPublicFn(
        "quota-marketplace",
        "create-sell-order",
        [
          Cl.uint(200), // More than wallet1's 100 tokens
          Cl.uint(90),
          Cl.uint(simnet.blockHeight + 100)
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(403)); // ERR_INSUFFICIENT_BALANCE
    });

    it("should allow cancelling sell order", () => {
      // Create order
      simnet.callPublicFn(
        "quota-marketplace",
        "create-sell-order",
        [
          Cl.uint(30),
          Cl.uint(90),
          Cl.uint(simnet.blockHeight + 100)
        ],
        wallet1
      );

      // Cancel order
      const result = simnet.callPublicFn(
        "quota-marketplace",
        "cancel-sell-order",
        [Cl.uint(1)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const order = simnet.callReadOnlyFn(
        "quota-marketplace",
        "get-sell-order",
        [Cl.uint(1)],
        deployer
      );
      
      expect(order.result).toBeSome(
        Cl.tuple({
          seller: Cl.principal(wallet1),
          amount: Cl.uint(30),
          "price-per-token": Cl.uint(90),
          "total-price": Cl.uint(2700),
          "expiry-block": Cl.uint(simnet.blockHeight + 100),
          "is-active": Cl.bool(false),
          "filled-amount": Cl.uint(0)
        })
      );
    });
  });

  describe("Trade Execution", () => {
    beforeEach(() => {
      // Create buy order from wallet2
      simnet.callPublicFn(
        "quota-marketplace",
        "create-buy-order",
        [
          Cl.uint(50),
          Cl.uint(100),
          Cl.uint(simnet.blockHeight + 100)
        ],
        wallet2
      );

      // Create sell order from wallet1
      simnet.callPublicFn(
        "quota-marketplace",
        "create-sell-order",
        [
          Cl.uint(30),
          Cl.uint(90),
          Cl.uint(simnet.blockHeight + 100)
        ],
        wallet1
      );
    });

    it("should execute trade between compatible orders", () => {
      const wallet1BalanceBefore = simnet.callReadOnlyFn(
        "quota-token",
        "get-balance",
        [Cl.principal(wallet1)],
        deployer
      );
      const wallet2BalanceBefore = simnet.callReadOnlyFn(
        "quota-token",
        "get-balance",
        [Cl.principal(wallet2)],
        deployer
      );

      const result = simnet.callPublicFn(
        "quota-marketplace",
        "execute-trade",
        [
          Cl.uint(1), // buy order id
          Cl.uint(1), // sell order id
          Cl.uint(25) // trade amount
        ],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(1));

      // Check token balances changed
      const wallet1BalanceAfter = simnet.callReadOnlyFn(
        "quota-token",
        "get-balance",
        [Cl.principal(wallet1)],
        deployer
      );
      const wallet2BalanceAfter = simnet.callReadOnlyFn(
        "quota-token",
        "get-balance",
        [Cl.principal(wallet2)],
        deployer
      );

      expect(wallet1BalanceAfter.result).toBeOk(Cl.uint(75)); // 100 - 25
      expect(wallet2BalanceAfter.result).toBeOk(Cl.uint(125)); // 100 + 25

      // Check trade record
      const trade = simnet.callReadOnlyFn(
        "quota-marketplace",
        "get-trade",
        [Cl.uint(1)],
        deployer
      );
      
      expect(trade.result).toBeSome(
        Cl.tuple({
          buyer: Cl.principal(wallet2),
          seller: Cl.principal(wallet1),
          amount: Cl.uint(25),
          "price-per-token": Cl.uint(90),
          "total-price": Cl.uint(2250),
          "buy-order-id": Cl.uint(1),
          "sell-order-id": Cl.uint(1),
          timestamp: Cl.uint(simnet.blockHeight)
        })
      );
    });

    it("should reject trade with incompatible prices", () => {
      // Create sell order with higher price than buy order
      simnet.callPublicFn(
        "quota-marketplace",
        "create-sell-order",
        [
          Cl.uint(30),
          Cl.uint(150), // Higher than buy order price of 100
          Cl.uint(simnet.blockHeight + 100)
        ],
        wallet1
      );

      const result = simnet.callPublicFn(
        "quota-marketplace",
        "execute-trade",
        [
          Cl.uint(1), // buy order id
          Cl.uint(2), // new sell order id
          Cl.uint(25)
        ],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(405)); // ERR_INVALID_PRICE
    });

    it("should reject self-trading", () => {
      // Create both orders from same wallet
      simnet.callPublicFn(
        "quota-marketplace",
        "create-buy-order",
        [
          Cl.uint(50),
          Cl.uint(100),
          Cl.uint(simnet.blockHeight + 100)
        ],
        wallet1
      );

      const result = simnet.callPublicFn(
        "quota-marketplace",
        "execute-trade",
        [
          Cl.uint(2), // new buy order from wallet1
          Cl.uint(1), // sell order from wallet1
          Cl.uint(25)
        ],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(406)); // ERR_SELF_TRADE
    });
  });

  describe("Marketplace Statistics", () => {
    it("should track marketplace volume", () => {
      // Create and execute a trade
      simnet.callPublicFn(
        "quota-marketplace",
        "create-buy-order",
        [Cl.uint(50), Cl.uint(100), Cl.uint(simnet.blockHeight + 100)],
        wallet2
      );

      simnet.callPublicFn(
        "quota-marketplace",
        "create-sell-order",
        [Cl.uint(30), Cl.uint(90), Cl.uint(simnet.blockHeight + 100)],
        wallet1
      );

      simnet.callPublicFn(
        "quota-marketplace",
        "execute-trade",
        [Cl.uint(1), Cl.uint(1), Cl.uint(25)],
        deployer
      );

      const stats = simnet.callReadOnlyFn("quota-marketplace", "get-marketplace-stats", [], deployer);
      expect(stats.result).toBeTuple({
        "total-volume": Cl.uint(2250), // 25 * 90
        "fee-rate": Cl.uint(250),
        "next-order-id": Cl.uint(3),
        "next-trade-id": Cl.uint(2),
        "is-paused": Cl.bool(false)
      });
    });
  });

  describe("Events", () => {
    it("should emit order creation events", () => {
      const buyResult = simnet.callPublicFn(
        "quota-marketplace",
        "create-buy-order",
        [Cl.uint(50), Cl.uint(100), Cl.uint(simnet.blockHeight + 100)],
        wallet1
      );
      expect(buyResult.events).toHaveLength(1);
      expect(buyResult.events[0].event).toBe("print_event");

      const sellResult = simnet.callPublicFn(
        "quota-marketplace",
        "create-sell-order",
        [Cl.uint(30), Cl.uint(90), Cl.uint(simnet.blockHeight + 100)],
        wallet2
      );
      expect(sellResult.events).toHaveLength(1);
      expect(sellResult.events[0].event).toBe("print_event");
    });

    it("should emit trade execution event", () => {
      simnet.callPublicFn(
        "quota-marketplace",
        "create-buy-order",
        [Cl.uint(50), Cl.uint(100), Cl.uint(simnet.blockHeight + 100)],
        wallet2
      );

      simnet.callPublicFn(
        "quota-marketplace",
        "create-sell-order",
        [Cl.uint(30), Cl.uint(90), Cl.uint(simnet.blockHeight + 100)],
        wallet1
      );

      const result = simnet.callPublicFn(
        "quota-marketplace",
        "execute-trade",
        [Cl.uint(1), Cl.uint(1), Cl.uint(25)],
        deployer
      );
      
      expect(result.events).toHaveLength(3); // Transfer + STX transfers + trade event
    });
  });
});
