import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

describe("Quota Token Contract", () => {
  beforeEach(() => {
    // Deploy contracts
    simnet.deployContract("quota-token", "contracts/quota-token.clar", null, deployer);
    simnet.deployContract("fisheries-management", "contracts/fisheries-management.clar", null, deployer);
  });

  describe("SIP-010 Compliance", () => {
    it("should return correct token metadata", () => {
      const name = simnet.callReadOnlyFn("quota-token", "get-name", [], deployer);
      expect(name.result).toBeOk(Cl.stringAscii("Fishing Quota Token"));

      const symbol = simnet.callReadOnlyFn("quota-token", "get-symbol", [], deployer);
      expect(symbol.result).toBeOk(Cl.stringAscii("FQT"));

      const decimals = simnet.callReadOnlyFn("quota-token", "get-decimals", [], deployer);
      expect(decimals.result).toBeOk(Cl.uint(6));

      const totalSupply = simnet.callReadOnlyFn("quota-token", "get-total-supply", [], deployer);
      expect(totalSupply.result).toBeOk(Cl.uint(0));
    });

    it("should return correct token URI", () => {
      const uri = simnet.callReadOnlyFn("quota-token", "get-token-uri", [], deployer);
      expect(uri.result).toBeOk(Cl.some(Cl.stringUtf8("https://fisheries.example.com/quota-token-metadata.json")));
    });

    it("should return zero balance for new accounts", () => {
      const balance = simnet.callReadOnlyFn("quota-token", "get-balance", [Cl.principal(wallet1)], deployer);
      expect(balance.result).toBeOk(Cl.uint(0));
    });
  });

  describe("Contract Setup", () => {
    it("should allow owner to set fisheries contract", () => {
      const result = simnet.callPublicFn(
        "quota-token",
        "set-fisheries-contract",
        [Cl.principal(deployer + ".fisheries-management")],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const contract = simnet.callReadOnlyFn("quota-token", "get-fisheries-contract", [], deployer);
      expect(contract.result).toBeSome(Cl.principal(deployer + ".fisheries-management"));
    });

    it("should reject non-owner setting fisheries contract", () => {
      const result = simnet.callPublicFn(
        "quota-token",
        "set-fisheries-contract",
        [Cl.principal(deployer + ".fisheries-management")],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(100)); // ERR_UNAUTHORIZED
    });
  });

  describe("Minting", () => {
    beforeEach(() => {
      // Set fisheries contract
      simnet.callPublicFn(
        "quota-token",
        "set-fisheries-contract",
        [Cl.principal(deployer + ".fisheries-management")],
        deployer
      );
    });

    it("should allow fisheries contract to mint tokens", () => {
      const mintResult = simnet.callPublicFn(
        "quota-token",
        "mint",
        [Cl.uint(1000), Cl.principal(wallet1)],
        deployer + ".fisheries-management"
      );
      expect(mintResult.result).toBeOk(Cl.bool(true));

      const balance = simnet.callReadOnlyFn("quota-token", "get-balance", [Cl.principal(wallet1)], deployer);
      expect(balance.result).toBeOk(Cl.uint(1000));

      const totalSupply = simnet.callReadOnlyFn("quota-token", "get-total-supply", [], deployer);
      expect(totalSupply.result).toBeOk(Cl.uint(1000));
    });

    it("should reject minting from unauthorized caller", () => {
      const mintResult = simnet.callPublicFn(
        "quota-token",
        "mint",
        [Cl.uint(1000), Cl.principal(wallet1)],
        wallet2
      );
      expect(mintResult.result).toBeErr(Cl.uint(100)); // ERR_UNAUTHORIZED
    });

    it("should reject minting zero amount", () => {
      const mintResult = simnet.callPublicFn(
        "quota-token",
        "mint",
        [Cl.uint(0), Cl.principal(wallet1)],
        deployer + ".fisheries-management"
      );
      expect(mintResult.result).toBeErr(Cl.uint(102)); // ERR_INVALID_AMOUNT
    });
  });

  describe("Burning", () => {
    beforeEach(() => {
      // Set fisheries contract and mint tokens
      simnet.callPublicFn(
        "quota-token",
        "set-fisheries-contract",
        [Cl.principal(deployer + ".fisheries-management")],
        deployer
      );
      simnet.callPublicFn(
        "quota-token",
        "mint",
        [Cl.uint(1000), Cl.principal(wallet1)],
        deployer + ".fisheries-management"
      );
    });

    it("should allow fisheries contract to burn tokens", () => {
      const burnResult = simnet.callPublicFn(
        "quota-token",
        "burn",
        [Cl.uint(500), Cl.principal(wallet1)],
        deployer + ".fisheries-management"
      );
      expect(burnResult.result).toBeOk(Cl.bool(true));

      const balance = simnet.callReadOnlyFn("quota-token", "get-balance", [Cl.principal(wallet1)], deployer);
      expect(balance.result).toBeOk(Cl.uint(500));

      const totalSupply = simnet.callReadOnlyFn("quota-token", "get-total-supply", [], deployer);
      expect(totalSupply.result).toBeOk(Cl.uint(500));
    });

    it("should reject burning more than balance", () => {
      const burnResult = simnet.callPublicFn(
        "quota-token",
        "burn",
        [Cl.uint(1500), Cl.principal(wallet1)],
        deployer + ".fisheries-management"
      );
      expect(burnResult.result).toBeErr(Cl.uint(101)); // ERR_INSUFFICIENT_BALANCE
    });

    it("should reject burning from unauthorized caller", () => {
      const burnResult = simnet.callPublicFn(
        "quota-token",
        "burn",
        [Cl.uint(500), Cl.principal(wallet1)],
        wallet2
      );
      expect(burnResult.result).toBeErr(Cl.uint(100)); // ERR_UNAUTHORIZED
    });
  });

  describe("Transfers", () => {
    beforeEach(() => {
      // Set fisheries contract and mint tokens
      simnet.callPublicFn(
        "quota-token",
        "set-fisheries-contract",
        [Cl.principal(deployer + ".fisheries-management")],
        deployer
      );
      simnet.callPublicFn(
        "quota-token",
        "mint",
        [Cl.uint(1000), Cl.principal(wallet1)],
        deployer + ".fisheries-management"
      );
    });

    it("should allow token transfers between accounts", () => {
      const transferResult = simnet.callPublicFn(
        "quota-token",
        "transfer",
        [Cl.uint(300), Cl.principal(wallet1), Cl.principal(wallet2), Cl.none()],
        wallet1
      );
      expect(transferResult.result).toBeOk(Cl.bool(true));

      const balance1 = simnet.callReadOnlyFn("quota-token", "get-balance", [Cl.principal(wallet1)], deployer);
      expect(balance1.result).toBeOk(Cl.uint(700));

      const balance2 = simnet.callReadOnlyFn("quota-token", "get-balance", [Cl.principal(wallet2)], deployer);
      expect(balance2.result).toBeOk(Cl.uint(300));
    });

    it("should reject transfer from unauthorized sender", () => {
      const transferResult = simnet.callPublicFn(
        "quota-token",
        "transfer",
        [Cl.uint(300), Cl.principal(wallet1), Cl.principal(wallet2), Cl.none()],
        wallet2
      );
      expect(transferResult.result).toBeErr(Cl.uint(100)); // ERR_UNAUTHORIZED
    });

    it("should reject transfer of zero amount", () => {
      const transferResult = simnet.callPublicFn(
        "quota-token",
        "transfer",
        [Cl.uint(0), Cl.principal(wallet1), Cl.principal(wallet2), Cl.none()],
        wallet1
      );
      expect(transferResult.result).toBeErr(Cl.uint(102)); // ERR_INVALID_AMOUNT
    });

    it("should reject transfer to self", () => {
      const transferResult = simnet.callPublicFn(
        "quota-token",
        "transfer",
        [Cl.uint(300), Cl.principal(wallet1), Cl.principal(wallet1), Cl.none()],
        wallet1
      );
      expect(transferResult.result).toBeErr(Cl.uint(103)); // ERR_INVALID_RECIPIENT
    });

    it("should reject transfer with insufficient balance", () => {
      const transferResult = simnet.callPublicFn(
        "quota-token",
        "transfer",
        [Cl.uint(1500), Cl.principal(wallet1), Cl.principal(wallet2), Cl.none()],
        wallet1
      );
      expect(transferResult.result).toBeErr(Cl.uint(101)); // ERR_INSUFFICIENT_BALANCE
    });
  });

  describe("Events", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "quota-token",
        "set-fisheries-contract",
        [Cl.principal(deployer + ".fisheries-management")],
        deployer
      );
    });

    it("should emit mint event", () => {
      const mintResult = simnet.callPublicFn(
        "quota-token",
        "mint",
        [Cl.uint(1000), Cl.principal(wallet1)],
        deployer + ".fisheries-management"
      );
      
      expect(mintResult.events).toHaveLength(1);
      expect(mintResult.events[0].event).toBe("print_event");
    });

    it("should emit burn event", () => {
      simnet.callPublicFn(
        "quota-token",
        "mint",
        [Cl.uint(1000), Cl.principal(wallet1)],
        deployer + ".fisheries-management"
      );

      const burnResult = simnet.callPublicFn(
        "quota-token",
        "burn",
        [Cl.uint(500), Cl.principal(wallet1)],
        deployer + ".fisheries-management"
      );
      
      expect(burnResult.events).toHaveLength(1);
      expect(burnResult.events[0].event).toBe("print_event");
    });

    it("should emit transfer event", () => {
      simnet.callPublicFn(
        "quota-token",
        "mint",
        [Cl.uint(1000), Cl.principal(wallet1)],
        deployer + ".fisheries-management"
      );

      const transferResult = simnet.callPublicFn(
        "quota-token",
        "transfer",
        [Cl.uint(300), Cl.principal(wallet1), Cl.principal(wallet2), Cl.none()],
        wallet1
      );
      
      expect(transferResult.events).toHaveLength(1);
      expect(transferResult.events[0].event).toBe("print_event");
    });
  });
});
