/// <reference types="vitest" />
// clarinet vitest environment provides global `simnet` types via tsconfig include
// declare the global symbol for editor type safety
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const simnet: any;
import { describe, it, expect, beforeAll } from "vitest";
import { uintCV, principalCV, ClarityType, cvToString } from "@stacks/transactions";

// The environment is provided by vitest-environment-clarinet
// global `simnet` is available for deploying and calling contracts.

const CONTRACT = "quota-token";

describe("quota-token", () => {
  beforeAll(() => {
    // nothing required here; deployment happens lazily on first use in simnet
  });

  function initAdminAndMint(deployer: string) {
    // set admin
    let r1 = simnet.callPublicFn(CONTRACT, "set-admin", [principalCV(deployer)], deployer);
    // ignore if already set by previous tests; ensure it's ok or err unauthorized
    if (r1.result.type !== ClarityType.ResponseOk && r1.result.type !== ClarityType.ResponseErr) {
      throw new Error("unexpected result from set-admin");
    }
    // high TAC to avoid limit issues across tests
    const r2 = simnet.callPublicFn(CONTRACT, "set-tac", [uintCV(100000)], deployer);
    if (r2.result.type !== ClarityType.ResponseOk) throw new Error("set-tac failed");
    // mint some tokens to deployer for allocations
    const r3 = simnet.callPublicFn(CONTRACT, "mint-quota", [uintCV(600)], deployer);
    if (r3.result.type !== ClarityType.ResponseOk && r3.result.type !== ClarityType.ResponseErr) {
      throw new Error("unexpected result from mint-quota");
    }
  }

  it("allows admin to set TAC and mint within limits", () => {
    const accounts = simnet.getAccounts();
    const deployer = accounts.get("deployer");
  initAdminAndMint(deployer);

  const ownerBal = simnet.callReadOnlyFn(CONTRACT, "get-balance", [principalCV(deployer)], deployer).result;
  expect(cvToString(ownerBal)).toBe("u600");

    // cannot exceed TAC
  // tighten TAC to 1000 so 600 + 500 exceeds
  let res = simnet.callPublicFn(CONTRACT, "set-tac", [uintCV(1000)], deployer);
  expect(res.result.type).toBe(ClarityType.ResponseOk);
  res = simnet.callPublicFn(CONTRACT, "mint-quota", [uintCV(500)], deployer);
  expect(res.result.type).toBe(ClarityType.ResponseErr);
  });

  it("allocates to a fisher and supports burn on catch", () => {
  const accounts = simnet.getAccounts();
  const deployer = accounts.get("deployer");
  const alice = accounts.get("wallet_1");
  initAdminAndMint(deployer);

    // allocate 200 to alice from owner
  let res = simnet.callPublicFn(CONTRACT, "allocate-quota", [principalCV(alice), uintCV(200)], deployer);
  expect(res.result.type).toBe(ClarityType.ResponseOk);

  const aliceBal = simnet.callReadOnlyFn(CONTRACT, "get-balance", [principalCV(alice)], alice).result;
  expect(cvToString(aliceBal)).toBe("u200");

    // alice burns 50 after catch
  res = simnet.callPublicFn(CONTRACT, "burn-quota", [uintCV(50)], alice);
  expect(res.result.type).toBe(ClarityType.ResponseOk);

  const aliceBalAfter = simnet.callReadOnlyFn(CONTRACT, "get-balance", [principalCV(alice)], alice).result;
  expect(cvToString(aliceBalAfter)).toBe("u150");

  const totalSupply = simnet.callReadOnlyFn(CONTRACT, "get-total-supply", [], deployer).result;
  expect(cvToString(totalSupply)).toBe("u550"); // minted 600, burned 50
  });

  it("supports peer-to-peer transfer between fishers", () => {
  const accounts = simnet.getAccounts();
  const deployer = accounts.get("deployer");
  const alice = accounts.get("wallet_1");
  const bob = accounts.get("wallet_2");
  initAdminAndMint(deployer);
  // allocate some quota to Alice to enable transfer
  const alloc = simnet.callPublicFn(CONTRACT, "allocate-quota", [principalCV(alice), uintCV(50)], deployer);
  expect(alloc.result.type).toBe(ClarityType.ResponseOk);

  let res = simnet.callPublicFn(CONTRACT, "transfer-quota", [principalCV(bob), uintCV(25)], alice);
  expect(res.result.type).toBe(ClarityType.ResponseOk);

  const bobBal = simnet.callReadOnlyFn(CONTRACT, "get-balance", [principalCV(bob)], bob).result;
  expect(cvToString(bobBal)).toBe("u25");
  });

  it("prevents unauthorized actions and insufficient balances", () => {
  const accounts = simnet.getAccounts();
  const alice = accounts.get("wallet_1");

    // non-owner cannot set TAC
  let res = simnet.callPublicFn(CONTRACT, "set-tac", [uintCV(1)], alice);
  expect(res.result.type).toBe(ClarityType.ResponseErr);

    // cannot burn more than balance
  res = simnet.callPublicFn(CONTRACT, "burn-quota", [uintCV(9999)], alice);
  expect(res.result.type).toBe(ClarityType.ResponseErr);
  });
});
