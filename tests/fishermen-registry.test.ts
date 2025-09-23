import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

describe("Fishermen Registry Contract", () => {
  beforeEach(() => {
    simnet.deployContract("fishermen-registry", "contracts/fishermen-registry.clar", null, deployer);
    simnet.deployContract("fisheries-management", "contracts/fisheries-management.clar", null, deployer);
  });

  describe("Contract Setup", () => {
    it("should allow owner to set fisheries contract", () => {
      const result = simnet.callPublicFn(
        "fishermen-registry",
        "set-fisheries-contract",
        [Cl.principal(deployer + ".fisheries-management")],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const contract = simnet.callReadOnlyFn("fishermen-registry", "get-fisheries-contract", [], deployer);
      expect(contract.result).toBeSome(Cl.principal(deployer + ".fisheries-management"));
    });

    it("should reject non-owner setting fisheries contract", () => {
      const result = simnet.callPublicFn(
        "fishermen-registry",
        "set-fisheries-contract",
        [Cl.principal(deployer + ".fisheries-management")],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(200)); // ERR_UNAUTHORIZED
    });
  });

  describe("Fisherman Registration", () => {
    it("should allow owner to register a fisherman", () => {
      const result = simnet.callPublicFn(
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
      expect(result.result).toBeOk(Cl.bool(true));

      // Check if fisherman is registered
      const isRegistered = simnet.callReadOnlyFn(
        "fishermen-registry",
        "is-registered-fisherman",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(isRegistered.result).toBe(Cl.bool(true));

      // Check total registered count
      const totalRegistered = simnet.callReadOnlyFn("fishermen-registry", "get-total-registered", [], deployer);
      expect(totalRegistered.result).toBe(Cl.uint(1));
    });

    it("should reject registration from non-owner", () => {
      const result = simnet.callPublicFn(
        "fishermen-registry",
        "register-fisherman",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("John Fisher"),
          Cl.stringAscii("FL-2024-001"),
          Cl.stringAscii("Fishing Vessel 'Sea Breeze' - 25ft")
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(200)); // ERR_UNAUTHORIZED
    });

    it("should reject duplicate registration", () => {
      // Register first time
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

      // Try to register again
      const result = simnet.callPublicFn(
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
      expect(result.result).toBeErr(Cl.uint(201)); // ERR_ALREADY_REGISTERED
    });

    it("should reject registration with empty name", () => {
      const result = simnet.callPublicFn(
        "fishermen-registry",
        "register-fisherman",
        [
          Cl.principal(wallet1),
          Cl.stringAscii(""),
          Cl.stringAscii("FL-2024-001"),
          Cl.stringAscii("Fishing Vessel 'Sea Breeze' - 25ft")
        ],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(205)); // ERR_INVALID_PARAMETERS
    });
  });

  describe("Fisherman Information", () => {
    beforeEach(() => {
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

    it("should return correct fisherman information", () => {
      const info = simnet.callReadOnlyFn(
        "fishermen-registry",
        "get-fisherman-info",
        [Cl.principal(wallet1)],
        deployer
      );
      
      expect(info.result).toBeSome(
        Cl.tuple({
          name: Cl.stringAscii("John Fisher"),
          "license-number": Cl.stringAscii("FL-2024-001"),
          "registration-date": Cl.uint(simnet.blockHeight),
          "is-active": Cl.bool(true),
          "vessel-info": Cl.stringAscii("Fishing Vessel 'Sea Breeze' - 25ft")
        })
      );
    });

    it("should return none for unregistered fisherman", () => {
      const info = simnet.callReadOnlyFn(
        "fishermen-registry",
        "get-fisherman-info",
        [Cl.principal(wallet2)],
        deployer
      );
      expect(info.result).toBeNone();
    });
  });

  describe("License Management", () => {
    beforeEach(() => {
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

    it("should allow owner to issue a license", () => {
      const expiryBlock = simnet.blockHeight + 1000;
      const result = simnet.callPublicFn(
        "fishermen-registry",
        "issue-license",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Commercial"),
          Cl.uint(expiryBlock),
          Cl.uint(5000)
        ],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Check license validity
      const isValid = simnet.callReadOnlyFn(
        "fishermen-registry",
        "is-license-valid",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(isValid.result).toBe(Cl.bool(true));
    });

    it("should reject license issuance for unregistered fisherman", () => {
      const expiryBlock = simnet.blockHeight + 1000;
      const result = simnet.callPublicFn(
        "fishermen-registry",
        "issue-license",
        [
          Cl.principal(wallet2),
          Cl.stringAscii("Commercial"),
          Cl.uint(expiryBlock),
          Cl.uint(5000)
        ],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(202)); // ERR_NOT_REGISTERED
    });

    it("should reject license with past expiry date", () => {
      const pastBlock = simnet.blockHeight - 100;
      const result = simnet.callPublicFn(
        "fishermen-registry",
        "issue-license",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Commercial"),
          Cl.uint(pastBlock),
          Cl.uint(5000)
        ],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(205)); // ERR_INVALID_PARAMETERS
    });

    it("should return license information", () => {
      const expiryBlock = simnet.blockHeight + 1000;
      simnet.callPublicFn(
        "fishermen-registry",
        "issue-license",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Commercial"),
          Cl.uint(expiryBlock),
          Cl.uint(5000)
        ],
        deployer
      );

      const licenseInfo = simnet.callReadOnlyFn(
        "fishermen-registry",
        "get-license-info",
        [Cl.principal(wallet1)],
        deployer
      );
      
      expect(licenseInfo.result).toBeSome(
        Cl.tuple({
          "license-type": Cl.stringAscii("Commercial"),
          "issue-date": Cl.uint(simnet.blockHeight),
          "expiry-date": Cl.uint(expiryBlock),
          "quota-allocation": Cl.uint(5000),
          "is-valid": Cl.bool(true)
        })
      );
    });
  });

  describe("Fisherman Deactivation", () => {
    beforeEach(() => {
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

    it("should allow owner to deactivate a fisherman", () => {
      const result = simnet.callPublicFn(
        "fishermen-registry",
        "deactivate-fisherman",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Check if fisherman is no longer active
      const isRegistered = simnet.callReadOnlyFn(
        "fishermen-registry",
        "is-registered-fisherman",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(isRegistered.result).toBe(Cl.bool(false));
    });

    it("should reject deactivation from non-owner", () => {
      const result = simnet.callPublicFn(
        "fishermen-registry",
        "deactivate-fisherman",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(200)); // ERR_UNAUTHORIZED
    });

    it("should reject deactivation of unregistered fisherman", () => {
      const result = simnet.callPublicFn(
        "fishermen-registry",
        "deactivate-fisherman",
        [Cl.principal(wallet2)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(202)); // ERR_NOT_REGISTERED
    });
  });

  describe("Activity Updates", () => {
    beforeEach(() => {
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
      
      simnet.callPublicFn(
        "fishermen-registry",
        "set-fisheries-contract",
        [Cl.principal(deployer + ".fisheries-management")],
        deployer
      );
    });

    it("should allow fisheries contract to update activity", () => {
      const result = simnet.callPublicFn(
        "fishermen-registry",
        "update-fisherman-activity",
        [Cl.principal(wallet1), Cl.uint(100), Cl.uint(50)],
        deployer + ".fisheries-management"
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const history = simnet.callReadOnlyFn(
        "fishermen-registry",
        "get-fisherman-history",
        [Cl.principal(wallet1)],
        deployer
      );
      
      expect(history.result).toBeSome(
        Cl.tuple({
          "total-catches": Cl.uint(100),
          "total-quota-used": Cl.uint(50),
          "seasons-participated": Cl.uint(0),
          "last-activity": Cl.uint(simnet.blockHeight)
        })
      );
    });

    it("should reject activity update from unauthorized caller", () => {
      const result = simnet.callPublicFn(
        "fishermen-registry",
        "update-fisherman-activity",
        [Cl.principal(wallet1), Cl.uint(100), Cl.uint(50)],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(200)); // ERR_UNAUTHORIZED
    });
  });

  describe("Events", () => {
    it("should emit registration event", () => {
      const result = simnet.callPublicFn(
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
      
      expect(result.events).toHaveLength(1);
      expect(result.events[0].event).toBe("print_event");
    });

    it("should emit license issuance event", () => {
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

      const result = simnet.callPublicFn(
        "fishermen-registry",
        "issue-license",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Commercial"),
          Cl.uint(simnet.blockHeight + 1000),
          Cl.uint(5000)
        ],
        deployer
      );
      
      expect(result.events).toHaveLength(1);
      expect(result.events[0].event).toBe("print_event");
    });
  });
});
