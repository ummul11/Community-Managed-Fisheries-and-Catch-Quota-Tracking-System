;; Quota Token (v1)
;; Community-Managed Fisheries and Catch Quota Tracking System
;;
;; Purpose:
;; - Represent catch quotas as fungible tokens on Stacks.
;; - Cooperative (contract-owner) mints tokens up to a configured TAC (Total Allowable Catch).
;; - Cooperative allocates tokens to fishermen.
;; - Fishermen burn tokens when reporting catches.
;; - Fishermen can transfer (trade) tokens peer-to-peer.
;;
;; Notes:
;; - This is a minimal, purpose-built FT (not full SIP-010 compliance).
;; - Public functions return (response bool uint) where err is an error code.

(define-constant ERR-UNAUTHORIZED u100)
(define-constant ERR-INSUFFICIENT u101)
(define-constant ERR-TAC-EXCEEDED u102)
(define-constant ERR-NO-ADMIN u103)

;; Total allowable catch (in token units, e.g., 1 token = 1 kg)
(define-data-var tac uint u0)

;; Track how many tokens have been minted against the current TAC
(define-data-var minted uint u0)

;; Fungible token state
(define-data-var total-supply uint u0)
(define-map balances { owner: principal } { amount: uint })

;; Admin (cooperative) principal. None until initialized.
(define-data-var admin (optional principal) none)

;; ============ Read-only helpers ============

;; Return the token name
(define-read-only (get-name)
  "Quota Token")

;; Return the token symbol
(define-read-only (get-symbol)
  "QUOTA")

;; Return number of decimals (0 => whole units)
(define-read-only (get-decimals)
  u0)

;; Get an account balance
(define-read-only (get-balance (who principal))
  (default-to u0 (get amount (map-get? balances { owner: who }))))

;; Get total supply
(define-read-only (get-total-supply)
  (var-get total-supply))

;; Get TAC
(define-read-only (get-tac)
  (var-get tac))

;; Get minted tokens so far (for current TAC setting)
(define-read-only (get-minted)
  (var-get minted))

;; Get admin if set
(define-read-only (get-admin)
  (var-get admin))

;; ============ Private helpers ============

(define-private (require-admin (sender principal))
  (match (var-get admin)
    current-admin (if (is-eq sender current-admin) (ok true) (err ERR-UNAUTHORIZED))
    (err ERR-NO-ADMIN)))

(define-private (credit (who principal) (amount uint))
  (let (
        (current (default-to u0 (get amount (map-get? balances { owner: who }))))
       )
    (map-set balances { owner: who } { amount: (+ current amount) })
    (ok true)
  ))

(define-private (debit (who principal) (amount uint))
  (let (
        (current (default-to u0 (get amount (map-get? balances { owner: who }))))
       )
    (if (< current amount)
        (err ERR-INSUFFICIENT)
        (begin
          (map-set balances { owner: who } { amount: (- current amount) })
          (ok true)
        ))))

;; ============ Public admin functions ============

;; Initialize or update admin. If admin is none, first caller sets admin to `who` (and must be `tx-sender`).
;; If admin is set, only current admin can update it.
(define-public (set-admin (who principal))
  (match (var-get admin)
    current (begin
              (if (not (is-eq tx-sender current))
                  (err ERR-UNAUTHORIZED)
                  (begin (var-set admin (some who)) (ok true))))
    (if (not (is-eq who tx-sender))
        (err ERR-UNAUTHORIZED)
        (begin (var-set admin (some who)) (ok true)))))

;; Set the TAC (Total Allowable Catch) cap.
;; Only contract-owner may set.
;; Does not reset already minted amount (allows incremental seasons with carry-over if desired).
(define-public (set-tac (amount uint))
  (match (require-admin tx-sender)
    okv (begin (var-set tac amount) (ok true))
    errv (err errv)))

;; Mint tokens into the cooperative (contract-owner) balance, bounded by TAC.
(define-public (mint-quota (amount uint))
  (match (require-admin tx-sender)
    okv (let (
              (t (var-get tac))
              (m (var-get minted))
             )
          (if (> (+ m amount) t)
              (err ERR-TAC-EXCEEDED)
              (begin
                (var-set minted (+ m amount))
                (var-set total-supply (+ (var-get total-supply) amount))
                (unwrap-panic (credit tx-sender amount))
                (ok true))))
    errv (err errv)))

;; Allocate tokens from cooperative to a fisher account.
(define-public (allocate-quota (fisher principal) (amount uint))
  (match (require-admin tx-sender)
    okv (match (debit tx-sender amount)
          result (begin (unwrap-panic (credit fisher amount)) (ok true))
          err-code (err err-code))
    errv (err errv)))

;; ============ Public user functions ============

;; Burn tokens from the caller (used to log catch consumption)
(define-public (burn-quota (amount uint))
  (match (debit tx-sender amount)
    result (begin
             (var-set total-supply (- (var-get total-supply) amount))
             (ok true))
    err-code (err err-code)))

;; Transfer tokens peer-to-peer
(define-public (transfer-quota (to principal) (amount uint))
  (if (is-eq to tx-sender)
      (ok true)
      (match (debit tx-sender amount)
        result (begin
                 (unwrap-panic (credit to amount))
                 (ok true))
        err-code (err err-code))))
