import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

describe("Fisheries Management Contract", () => {
  beforeEach(() => {
    // Deploy all contracts
    simnet.deployContract("quota-token", "contracts/quota-token.clar", null, deployer);
    simnet.deployContract("fishermen-registry", "contracts/fishermen-registry.clar", null, deployer);
    simnet.deployContract("fisheries-management", "contracts/fisheries-management.clar", null, deployer);
    
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
    
    // Register a fisherman
    simnet.callPublicFn(
      "fishermen-registry",
      "register-fisherman",
      [
        Cl.principal(wallet1),
        Cl.stringAscii("John Fisher"),
        Cl.stringAscii("FL-2024-001"),
        Cl.stringAscii("Fishing Vessel 'Sea Breeze' - 25ft")
      ],
      deployer
    );
  });

  describe("Contract Pause", () => {
    it("should allow owner to pause contract", () => {
      const result = simnet.callPublicFn(
        "fisheries-management",
        "set-contract-pause",
        [Cl.bool(true)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const isPaused = simnet.callReadOnlyFn("fisheries-management", "is-contract-paused", [], deployer);
      expect(isPaused.result).toBe(Cl.bool(true));
    });

    it("should reject pause from non-owner", () => {
      const result = simnet.callPublicFn(
        "fisheries-management",
        "set-contract-pause",
        [Cl.bool(true)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(300)); // ERR_UNAUTHORIZED
    });
  });

  describe("Season Management", () => {
    it("should allow owner to create a fishing season", () => {
      const startBlock = simnet.blockHeight + 10;
      const endBlock = simnet.blockHeight + 1000;
      
      const result = simnet.callPublicFn(
        "fisheries-management",
        "create-fishing-season",
        [
          Cl.stringAscii("Spring 2024"),
          Cl.uint(startBlock),
          Cl.uint(endBlock),
          Cl.uint(10000), // total allowable catch
          Cl.uint(10)     // quota per token
        ],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(1));

      // Check season info
      const seasonInfo = simnet.callReadOnlyFn(
        "fisheries-management",
        "get-season-info",
        [Cl.uint(1)],
        deployer
      );
      
      expect(seasonInfo.result).toBeSome(
        Cl.tuple({
          name: Cl.stringAscii("Spring 2024"),
          "start-block": Cl.uint(startBlock),
          "end-block": Cl.uint(endBlock),
          "total-allowable-catch": Cl.uint(10000),
          "quota-per-token": Cl.uint(10),
          "is-active": Cl.bool(true),
          "total-distributed": Cl.uint(0),
          "total-caught": Cl.uint(0)
        })
      );

      // Check current season ID
      const currentSeasonId = simnet.callReadOnlyFn("fisheries-management", "get-current-season-id", [], deployer);
      expect(currentSeasonId.result).toBe(Cl.uint(1));
    });

    it("should reject season creation from non-owner", () => {
      const result = simnet.callPublicFn(
        "fisheries-management",
        "create-fishing-season",
        [
          Cl.stringAscii("Spring 2024"),
          Cl.uint(simnet.blockHeight + 10),
          Cl.uint(simnet.blockHeight + 1000),
          Cl.uint(10000),
          Cl.uint(10)
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(300)); // ERR_UNAUTHORIZED
    });

    it("should reject season with invalid parameters", () => {
      // End block before start block
      const result = simnet.callPublicFn(
        "fisheries-management",
        "create-fishing-season",
        [
          Cl.stringAscii("Spring 2024"),
          Cl.uint(simnet.blockHeight + 1000),
          Cl.uint(simnet.blockHeight + 10),
          Cl.uint(10000),
          Cl.uint(10)
        ],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(304)); // ERR_INVALID_PARAMETERS
    });
  });

  describe("Quota Distribution", () => {
    beforeEach(() => {
      // Create a season
      simnet.callPublicFn(
        "fisheries-management",
        "create-fishing-season",
        [
          Cl.stringAscii("Spring 2024"),
          Cl.uint(simnet.blockHeight + 10),
          Cl.uint(simnet.blockHeight + 1000),
          Cl.uint(10000),
          Cl.uint(10)
        ],
        deployer
      );
    });

    it("should allow owner to distribute quota to registered fisherman", () => {
      const result = simnet.callPublicFn(
        "fisheries-management",
        "distribute-quota",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(1000)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Check fisherman quota
      const quota = simnet.callReadOnlyFn(
        "fisheries-management",
        "get-fisherman-quota",
        [Cl.principal(wallet1), Cl.uint(1)],
        deployer
      );
      
      expect(quota.result).toBeSome(
        Cl.tuple({
          "allocated-quota": Cl.uint(1000),
          "used-quota": Cl.uint(0),
          "token-balance": Cl.uint(100), // 1000 / 10
          "last-catch-block": Cl.uint(0)
        })
      );

      // Check token balance
      const tokenBalance = simnet.callReadOnlyFn(
        "quota-token",
        "get-balance",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(tokenBalance.result).toBeOk(Cl.uint(100));
    });

    it("should reject quota distribution to unregistered fisherman", () => {
      const result = simnet.callPublicFn(
        "fisheries-management",
        "distribute-quota",
        [Cl.principal(wallet2), Cl.uint(1), Cl.uint(1000)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(305)); // ERR_FISHERMAN_NOT_REGISTERED
    });

    it("should reject quota distribution exceeding total allowable catch", () => {
      const result = simnet.callPublicFn(
        "fisheries-management",
        "distribute-quota",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(15000)], // Exceeds 10000 total
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(303)); // ERR_QUOTA_EXCEEDED
    });

    it("should reject quota distribution from non-owner", () => {
      const result = simnet.callPublicFn(
        "fisheries-management",
        "distribute-quota",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(1000)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(300)); // ERR_UNAUTHORIZED
    });
  });

  describe("Catch Recording", () => {
    beforeEach(() => {
      // Create season and distribute quota
      simnet.callPublicFn(
        "fisheries-management",
        "create-fishing-season",
        [
          Cl.stringAscii("Spring 2024"),
          Cl.uint(simnet.blockHeight - 5), // Season already started
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
    });

    it("should allow registered fisherman to record catch", () => {
      const result = simnet.callPublicFn(
        "fisheries-management",
        "record-catch",
        [
          Cl.uint(1),
          Cl.uint(100),
          Cl.stringAscii("North Atlantic, Zone 5")
        ],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Check updated quota
      const quota = simnet.callReadOnlyFn(
        "fisheries-management",
        "get-fisherman-quota",
        [Cl.principal(wallet1), Cl.uint(1)],
        deployer
      );
      
      expect(quota.result).toBeSome(
        Cl.tuple({
          "allocated-quota": Cl.uint(1000),
          "used-quota": Cl.uint(100),
          "token-balance": Cl.uint(90), // 100 - 10 tokens burned
          "last-catch-block": Cl.uint(simnet.blockHeight)
        })
      );

      // Check token balance
      const tokenBalance = simnet.callReadOnlyFn(
        "quota-token",
        "get-balance",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(tokenBalance.result).toBeOk(Cl.uint(90));
    });

    it("should reject catch recording from unregistered fisherman", () => {
      const result = simnet.callPublicFn(
        "fisheries-management",
        "record-catch",
        [
          Cl.uint(1),
          Cl.uint(100),
          Cl.stringAscii("North Atlantic, Zone 5")
        ],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(305)); // ERR_FISHERMAN_NOT_REGISTERED
    });

    it("should reject catch recording exceeding quota", () => {
      const result = simnet.callPublicFn(
        "fisheries-management",
        "record-catch",
        [
          Cl.uint(1),
          Cl.uint(1500), // Exceeds allocated quota of 1000
          Cl.stringAscii("North Atlantic, Zone 5")
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(303)); // ERR_QUOTA_EXCEEDED
    });

    it("should reject catch recording with insufficient tokens", () => {
      // Record a large catch first
      simnet.callPublicFn(
        "fisheries-management",
        "record-catch",
        [
          Cl.uint(1),
          Cl.uint(900),
          Cl.stringAscii("North Atlantic, Zone 5")
        ],
        wallet1
      );

      // Try to record another catch that would require more tokens than available
      const result = simnet.callPublicFn(
        "fisheries-management",
        "record-catch",
        [
          Cl.uint(1),
          Cl.uint(200), // Would need 20 tokens but only 10 remaining
          Cl.stringAscii("North Atlantic, Zone 5")
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(306)); // ERR_INSUFFICIENT_QUOTA
    });
  });

  describe("Season Utilization", () => {
    beforeEach(() => {
      // Create season and distribute quota
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
    });

    it("should calculate correct season utilization", () => {
      // Record some catches
      simnet.callPublicFn(
        "fisheries-management",
        "record-catch",
        [Cl.uint(1), Cl.uint(500), Cl.stringAscii("Zone 1")],
        wallet1
      );

      const utilization = simnet.callReadOnlyFn(
        "fisheries-management",
        "get-season-utilization",
        [Cl.uint(1)],
        deployer
      );
      expect(utilization.result).toBe(Cl.uint(5)); // 500/10000 * 100 = 5%
    });

    it("should return zero utilization for non-existent season", () => {
      const utilization = simnet.callReadOnlyFn(
        "fisheries-management",
        "get-season-utilization",
        [Cl.uint(999)],
        deployer
      );
      expect(utilization.result).toBe(Cl.uint(0));
    });
  });

  describe("Events", () => {
    it("should emit season creation event", () => {
      const result = simnet.callPublicFn(
        "fisheries-management",
        "create-fishing-season",
        [
          Cl.stringAscii("Spring 2024"),
          Cl.uint(simnet.blockHeight + 10),
          Cl.uint(simnet.blockHeight + 1000),
          Cl.uint(10000),
          Cl.uint(10)
        ],
        deployer
      );
      
      expect(result.events).toHaveLength(1);
      expect(result.events[0].event).toBe("print_event");
    });

    it("should emit quota distribution event", () => {
      simnet.callPublicFn(
        "fisheries-management",
        "create-fishing-season",
        [
          Cl.stringAscii("Spring 2024"),
          Cl.uint(simnet.blockHeight + 10),
          Cl.uint(simnet.blockHeight + 1000),
          Cl.uint(10000),
          Cl.uint(10)
        ],
        deployer
      );

      const result = simnet.callPublicFn(
        "fisheries-management",
        "distribute-quota",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(1000)],
        deployer
      );
      
      expect(result.events).toHaveLength(2); // Mint event + distribution event
    });

    it("should emit catch recording event", () => {
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

      const result = simnet.callPublicFn(
        "fisheries-management",
        "record-catch",
        [
          Cl.uint(1),
          Cl.uint(100),
          Cl.stringAscii("North Atlantic, Zone 5")
        ],
        wallet1
      );
      
      expect(result.events).toHaveLength(2); // Burn event + catch event
    });
  });
});
