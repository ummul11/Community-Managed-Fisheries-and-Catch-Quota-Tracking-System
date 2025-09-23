import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;
const wallet4 = accounts.get("wallet_4")!;

describe("Fisheries System Integration Tests", () => {
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
    
    simnet.callPublicFn(
      "fishermen-registry",
      "set-fisheries-contract",
      [Cl.principal(deployer + ".fisheries-management")],
      deployer
    );
  });

  describe("Complete Fishing Season Workflow", () => {
    it("should handle a complete fishing season from setup to trading", () => {
      // 1. Register fishermen
      simnet.callPublicFn(
        "fishermen-registry",
        "register-fisherman",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Captain Jack"),
          Cl.stringAscii("FL-2024-001"),
          Cl.stringAscii("Fishing Vessel 'Ocean Explorer' - 30ft")
        ],
        deployer
      );

      simnet.callPublicFn(
        "fishermen-registry",
        "register-fisherman",
        [
          Cl.principal(wallet2),
          Cl.stringAscii("Captain Jane"),
          Cl.stringAscii("FL-2024-002"),
          Cl.stringAscii("Fishing Vessel 'Sea Hunter' - 25ft")
        ],
        deployer
      );

      simnet.callPublicFn(
        "fishermen-registry",
        "register-fisherman",
        [
          Cl.principal(wallet3),
          Cl.stringAscii("Captain Bob"),
          Cl.stringAscii("FL-2024-003"),
          Cl.stringAscii("Fishing Vessel 'Wave Rider' - 35ft")
        ],
        deployer
      );

      // 2. Issue licenses
      const expiryBlock = simnet.blockHeight + 2000;
      simnet.callPublicFn(
        "fishermen-registry",
        "issue-license",
        [Cl.principal(wallet1), Cl.stringAscii("Commercial"), Cl.uint(expiryBlock), Cl.uint(2000)],
        deployer
      );

      simnet.callPublicFn(
        "fishermen-registry",
        "issue-license",
        [Cl.principal(wallet2), Cl.stringAscii("Commercial"), Cl.uint(expiryBlock), Cl.uint(1500)],
        deployer
      );

      simnet.callPublicFn(
        "fishermen-registry",
        "issue-license",
        [Cl.principal(wallet3), Cl.stringAscii("Recreational"), Cl.uint(expiryBlock), Cl.uint(500)],
        deployer
      );

      // 3. Create fishing season
      const seasonResult = simnet.callPublicFn(
        "fisheries-management",
        "create-fishing-season",
        [
          Cl.stringAscii("Spring Cod Season 2024"),
          Cl.uint(simnet.blockHeight - 5), // Season already started
          Cl.uint(simnet.blockHeight + 1000),
          Cl.uint(20000), // Total allowable catch: 20,000 kg
          Cl.uint(20)     // Each token represents 20kg quota
        ],
        deployer
      );
      expect(seasonResult.result).toBeOk(Cl.uint(1));

      // 4. Distribute quotas to fishermen
      simnet.callPublicFn(
        "fisheries-management",
        "distribute-quota",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(8000)], // 8000kg = 400 tokens
        deployer
      );

      simnet.callPublicFn(
        "fisheries-management",
        "distribute-quota",
        [Cl.principal(wallet2), Cl.uint(1), Cl.uint(6000)], // 6000kg = 300 tokens
        deployer
      );

      simnet.callPublicFn(
        "fisheries-management",
        "distribute-quota",
        [Cl.principal(wallet3), Cl.uint(1), Cl.uint(4000)], // 4000kg = 200 tokens
        deployer
      );

      // Verify token balances
      let balance1 = simnet.callReadOnlyFn("quota-token", "get-balance", [Cl.principal(wallet1)], deployer);
      let balance2 = simnet.callReadOnlyFn("quota-token", "get-balance", [Cl.principal(wallet2)], deployer);
      let balance3 = simnet.callReadOnlyFn("quota-token", "get-balance", [Cl.principal(wallet3)], deployer);
      
      expect(balance1.result).toBeOk(Cl.uint(400));
      expect(balance2.result).toBeOk(Cl.uint(300));
      expect(balance3.result).toBeOk(Cl.uint(200));

      // 5. Fishermen start fishing and recording catches
      
      // Captain Jack catches 1000kg
      const catch1 = simnet.callPublicFn(
        "fisheries-management",
        "record-catch",
        [Cl.uint(1), Cl.uint(1000), Cl.stringAscii("North Atlantic, Zone 5A")],
        wallet1
      );
      expect(catch1.result).toBeOk(Cl.bool(true));

      // Captain Jane catches 800kg
      const catch2 = simnet.callPublicFn(
        "fisheries-management",
        "record-catch",
        [Cl.uint(1), Cl.uint(800), Cl.stringAscii("North Atlantic, Zone 5B")],
        wallet2
      );
      expect(catch2.result).toBeOk(Cl.bool(true));

      // Captain Bob catches 600kg
      const catch3 = simnet.callPublicFn(
        "fisheries-management",
        "record-catch",
        [Cl.uint(1), Cl.uint(600), Cl.stringAscii("Coastal Waters, Zone 3")],
        wallet3
      );
      expect(catch3.result).toBeOk(Cl.bool(true));

      // Verify updated balances (tokens burned for catches)
      balance1 = simnet.callReadOnlyFn("quota-token", "get-balance", [Cl.principal(wallet1)], deployer);
      balance2 = simnet.callReadOnlyFn("quota-token", "get-balance", [Cl.principal(wallet2)], deployer);
      balance3 = simnet.callReadOnlyFn("quota-token", "get-balance", [Cl.principal(wallet3)], deployer);
      
      expect(balance1.result).toBeOk(Cl.uint(350)); // 400 - 50 tokens burned
      expect(balance2.result).toBeOk(Cl.uint(260)); // 300 - 40 tokens burned
      expect(balance3.result).toBeOk(Cl.uint(170)); // 200 - 30 tokens burned

      // 6. Trading in the marketplace
      
      // Captain Bob wants to buy more quota (he's running low)
      const buyOrder = simnet.callPublicFn(
        "quota-marketplace",
        "create-buy-order",
        [
          Cl.uint(50),  // wants 50 tokens
          Cl.uint(1000), // willing to pay 1000 microSTX per token
          Cl.uint(simnet.blockHeight + 100)
        ],
        wallet3
      );
      expect(buyOrder.result).toBeOk(Cl.uint(1));

      // Captain Jack has excess quota and wants to sell
      const sellOrder = simnet.callPublicFn(
        "quota-marketplace",
        "create-sell-order",
        [
          Cl.uint(100), // selling 100 tokens
          Cl.uint(900),  // asking 900 microSTX per token
          Cl.uint(simnet.blockHeight + 100)
        ],
        wallet1
      );
      expect(sellOrder.result).toBeOk(Cl.uint(1));

      // Execute the trade
      const trade = simnet.callPublicFn(
        "quota-marketplace",
        "execute-trade",
        [Cl.uint(1), Cl.uint(1), Cl.uint(50)], // trade 50 tokens
        deployer
      );
      expect(trade.result).toBeOk(Cl.uint(1));

      // Verify post-trade balances
      balance1 = simnet.callReadOnlyFn("quota-token", "get-balance", [Cl.principal(wallet1)], deployer);
      balance3 = simnet.callReadOnlyFn("quota-token", "get-balance", [Cl.principal(wallet3)], deployer);
      
      expect(balance1.result).toBeOk(Cl.uint(300)); // 350 - 50 sold
      expect(balance3.result).toBeOk(Cl.uint(220)); // 170 + 50 bought

      // 7. Continue fishing with new quotas
      
      // Captain Bob can now catch more fish with his purchased quota
      const catch4 = simnet.callPublicFn(
        "fisheries-management",
        "record-catch",
        [Cl.uint(1), Cl.uint(400), Cl.stringAscii("Coastal Waters, Zone 3")],
        wallet3
      );
      expect(catch4.result).toBeOk(Cl.bool(true));

      // 8. Check season utilization
      const utilization = simnet.callReadOnlyFn(
        "fisheries-management",
        "get-season-utilization",
        [Cl.uint(1)],
        deployer
      );
      // Total caught: 1000 + 800 + 600 + 400 = 2800kg out of 20000kg = 14%
      expect(utilization.result).toBe(Cl.uint(14));

      // 9. Verify fisherman histories were updated
      const history1 = simnet.callReadOnlyFn(
        "fishermen-registry",
        "get-fisherman-history",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(history1.result).toBeSome(
        Cl.tuple({
          "total-catches": Cl.uint(1000),
          "total-quota-used": Cl.uint(1000),
          "seasons-participated": Cl.uint(0),
          "last-activity": Cl.uint(simnet.blockHeight)
        })
      );

      const history3 = simnet.callReadOnlyFn(
        "fishermen-registry",
        "get-fisherman-history",
        [Cl.principal(wallet3)],
        deployer
      );
      expect(history3.result).toBeSome(
        Cl.tuple({
          "total-catches": Cl.uint(1000), // 600 + 400
          "total-quota-used": Cl.uint(1000),
          "seasons-participated": Cl.uint(0),
          "last-activity": Cl.uint(simnet.blockHeight)
        })
      );

      // 10. Check marketplace statistics
      const marketStats = simnet.callReadOnlyFn("quota-marketplace", "get-marketplace-stats", [], deployer);
      expect(marketStats.result).toBeTuple({
        "total-volume": Cl.uint(45000), // 50 tokens * 900 microSTX
        "fee-rate": Cl.uint(250),
        "next-order-id": Cl.uint(3),
        "next-trade-id": Cl.uint(2),
        "is-paused": Cl.bool(false)
      });
    });
  });

  describe("Quota Enforcement", () => {
    beforeEach(() => {
      // Set up a basic scenario
      simnet.callPublicFn(
        "fishermen-registry",
        "register-fisherman",
        [Cl.principal(wallet1), Cl.stringAscii("Test Fisher"), Cl.stringAscii("TF-001"), Cl.stringAscii("Test Vessel")],
        deployer
      );

      simnet.callPublicFn(
        "fisheries-management",
        "create-fishing-season",
        [
          Cl.stringAscii("Test Season"),
          Cl.uint(simnet.blockHeight - 5),
          Cl.uint(simnet.blockHeight + 1000),
          Cl.uint(5000),
          Cl.uint(10)
        ],
        deployer
      );

      simnet.callPublicFn(
        "fisheries-management",
        "distribute-quota",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(1000)], // 100 tokens
        deployer
      );
    });

    it("should prevent overfishing beyond allocated quota", () => {
      // Try to catch more than allocated quota
      const result = simnet.callPublicFn(
        "fisheries-management",
        "record-catch",
        [Cl.uint(1), Cl.uint(1500), Cl.stringAscii("Test Location")], // Exceeds 1000kg quota
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(303)); // ERR_QUOTA_EXCEEDED
    });

    it("should prevent fishing without sufficient tokens", () => {
      // Use up most tokens first
      simnet.callPublicFn(
        "fisheries-management",
        "record-catch",
        [Cl.uint(1), Cl.uint(900), Cl.stringAscii("Test Location")],
        wallet1
      );

      // Try to catch more than remaining tokens allow
      const result = simnet.callPublicFn(
        "fisheries-management",
        "record-catch",
        [Cl.uint(1), Cl.uint(200), Cl.stringAscii("Test Location")], // Would need 20 tokens but only 10 remain
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(306)); // ERR_INSUFFICIENT_QUOTA
    });
  });

  describe("System Security", () => {
    it("should prevent unauthorized token minting", () => {
      const result = simnet.callPublicFn(
        "quota-token",
        "mint",
        [Cl.uint(1000), Cl.principal(wallet1)],
        wallet1 // Not the fisheries contract
      );
      expect(result.result).toBeErr(Cl.uint(100)); // ERR_UNAUTHORIZED
    });

    it("should prevent unauthorized fisherman registration", () => {
      const result = simnet.callPublicFn(
        "fishermen-registry",
        "register-fisherman",
        [Cl.principal(wallet1), Cl.stringAscii("Unauthorized"), Cl.stringAscii("UN-001"), Cl.stringAscii("Vessel")],
        wallet1 // Not the owner
      );
      expect(result.result).toBeErr(Cl.uint(200)); // ERR_UNAUTHORIZED
    });

    it("should prevent unregistered fishermen from trading", () => {
      const result = simnet.callPublicFn(
        "quota-marketplace",
        "create-buy-order",
        [Cl.uint(50), Cl.uint(100), Cl.uint(simnet.blockHeight + 100)],
        wallet4 // Unregistered fisherman
      );
      expect(result.result).toBeErr(Cl.uint(400)); // ERR_UNAUTHORIZED
    });
  });

  describe("Emergency Scenarios", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "fishermen-registry",
        "register-fisherman",
        [Cl.principal(wallet1), Cl.stringAscii("Test Fisher"), Cl.stringAscii("TF-001"), Cl.stringAscii("Test Vessel")],
        deployer
      );

      simnet.callPublicFn(
        "fisheries-management",
        "create-fishing-season",
        [
          Cl.stringAscii("Test Season"),
          Cl.uint(simnet.blockHeight - 5),
          Cl.uint(simnet.blockHeight + 1000),
          Cl.uint(5000),
          Cl.uint(10)
        ],
        deployer
      );
    });

    it("should allow pausing the entire system", () => {
      // Pause fisheries management
      simnet.callPublicFn(
        "fisheries-management",
        "set-contract-pause",
        [Cl.bool(true)],
        deployer
      );

      // Pause marketplace
      simnet.callPublicFn(
        "quota-marketplace",
        "set-marketplace-pause",
        [Cl.bool(true)],
        deployer
      );

      // Try to distribute quota (should fail)
      const distributeResult = simnet.callPublicFn(
        "fisheries-management",
        "distribute-quota",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(1000)],
        deployer
      );
      expect(distributeResult.result).toBeErr(Cl.uint(300)); // ERR_UNAUTHORIZED

      // Try to create marketplace order (should fail)
      const orderResult = simnet.callPublicFn(
        "quota-marketplace",
        "create-buy-order",
        [Cl.uint(50), Cl.uint(100), Cl.uint(simnet.blockHeight + 100)],
        wallet1
      );
      expect(orderResult.result).toBeErr(Cl.uint(400)); // ERR_UNAUTHORIZED
    });

    it("should allow deactivating problematic fishermen", () => {
      // Deactivate fisherman
      const result = simnet.callPublicFn(
        "fishermen-registry",
        "deactivate-fisherman",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Check that fisherman is no longer active
      const isActive = simnet.callReadOnlyFn(
        "fishermen-registry",
        "is-registered-fisherman",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(isActive.result).toBe(Cl.bool(false));
    });
  });
});
