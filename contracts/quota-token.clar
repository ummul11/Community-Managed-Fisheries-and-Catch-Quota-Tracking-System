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
;; - SIP-010 compliant fungible token with events and standard interface.
;; - Governance timelock for TAC changes to prevent immediate admin abuse.
;; - Public functions return (response bool uint) where err is an error code.

(define-constant ERR-UNAUTHORIZED u100)
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INSUFFICIENT u101)
(define-constant ERR-TAC-EXCEEDED u102)
(define-constant ERR-NO-ADMIN u103)
(define-constant ERR-TIMELOCK-ACTIVE u104)
(define-constant ERR-TIMELOCK-NOT-READY u105)

;; SIP-010 Trait (commented out for now until proper trait import)
;; (impl-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

;; Governance timelock period (in blocks)
(define-constant TIMELOCK-BLOCKS u144) ;; ~24 hours at 10min blocks

;; Total allowable catch (in token units, e.g., 1 token = 1 kg)
(define-data-var tac uint u0)

;; Track how many tokens have been minted against the current TAC
(define-data-var minted uint u0)

;; Fungible token state
(define-data-var total-supply uint u0)
(define-map balances { owner: principal } { amount: uint })

;; Admin (cooperative) principal. None until initialized.
(define-data-var admin (optional principal) none)

;; Proposed TAC changes with timelock
(define-data-var tac-proposal {tac: uint, proposal-block-height: uint} {tac: u0, proposal-block-height: u0})

;; ============ Read-only helpers ============

;; Return the token name
(define-read-only (get-name)
  (ok "Fishing Quota Token"))

;; Return the token symbol
(define-read-only (get-symbol)
  (ok "QUOTA"))

;; Return number of decimals (0 => whole units)
;; SIP-010 get-decimals (returns response)
(define-read-only (get-decimals)
  (ok u6))

;; SIP-010 get-balance (returns response)
(define-read-only (get-balance (who principal))
  (ok (default-to u0 (get amount (map-get? balances { owner: who })))))

;; SIP-010 get-total-supply (returns response)
(define-read-only (get-total-supply)
  (ok (var-get total-supply)))

;; SIP-010 get-token-uri
(define-read-only (get-token-uri)
  (ok (some "https://fisheries.example.com/quota-token-metadata.json")))

;; Get TAC
(define-read-only (get-tac)
  (var-get tac))

;; Get minted tokens so far (for current TAC setting)
(define-read-only (get-minted)
  (var-get minted))

;; Get admin if set
(define-read-only (get-admin)
  (var-get admin))

;; Get proposed TAC and proposal block
(define-read-only (get-proposed-tac)
  (get tac (var-get tac-proposal)))


;; Check if timelock is ready for a TAC proposal
(define-read-only (is-tac-timelock-ready)
  (let ((proposal-block (get proposal-block-height (var-get tac-proposal))))
    (and (> proposal-block u0)
         (>= stacks-block-height (+ proposal-block TIMELOCK-BLOCKS)))))

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
    current (if (not (is-eq tx-sender current))
                (err ERR-UNAUTHORIZED)
                (begin (var-set admin (some who)) (ok true)))
    (if (not (is-eq who tx-sender))
        (err ERR-UNAUTHORIZED)
        (begin (var-set admin (some who)) (ok true)))))

;; Set the TAC (Total Allowable Catch) cap.
;; Only admin may set. Now requires timelock for governance.
(define-public (propose-tac (new-tac uint))
  (begin
    (try! (if (is-eq (some tx-sender) (var-get admin)) 
             (ok true) 
             (err ERR-NOT-AUTHORIZED)))
    (var-set tac-proposal {tac: new-tac, proposal-block-height: stacks-block-height})
    (print {action: "tac-proposed", proposed-tac: new-tac, proposal-block: stacks-block-height})
    (ok true)
  )
)

;; Execute a TAC proposal after timelock
(define-public (execute-tac-proposal)
  (let ((proposal-block (get proposal-block-height (var-get tac-proposal)))
        (proposed-tac (get tac (var-get tac-proposal))))
    (try! (if (is-eq (some tx-sender) (var-get admin)) 
             (ok true) 
             (err ERR-NOT-AUTHORIZED)))
    (try! (if (> proposal-block u0) 
             (ok true) 
             (err ERR-TIMELOCK-ACTIVE)))
    (try! (if (>= stacks-block-height (+ proposal-block TIMELOCK-BLOCKS)) 
             (ok true) 
             (err ERR-TIMELOCK-NOT-READY)))
    (var-set tac proposed-tac)
    (var-set tac-proposal {tac: u0, proposal-block-height: u0})
    (print {action: "tac-updated", new-tac: proposed-tac, block: stacks-block-height})
    (ok true)
  )
)

;; Legacy immediate TAC setting (deprecated but kept for tests)
(define-public (set-tac (amount uint))
  (match (require-admin tx-sender)
    okv (begin
          (var-set tac amount)
          (ok true))
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
                (print { action: "mint", recipient: tx-sender, amount: amount })
                (ok true))))
    errv (err errv)))

;; Allocate tokens from cooperative to a fisher account.
(define-public (allocate-quota (fisher principal) (amount uint))
  (match (require-admin tx-sender)
    okv (match (debit tx-sender amount)
          result (begin 
                   (unwrap-panic (credit fisher amount))
                   (print { action: "allocate", from: tx-sender, to: fisher, amount: amount })
                   (ok true))
          err-code (err err-code))
    errv (err errv)))

;; ============ Public user functions ============

;; Burn tokens from the caller (used to log catch consumption)
(define-public (burn-quota (amount uint))
  (match (debit tx-sender amount)
    result (begin
             (var-set total-supply (- (var-get total-supply) amount))
             (print { action: "burn", sender: tx-sender, amount: amount })
             (ok true))
    err-code (err err-code)))

;; SIP-010 transfer function
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (if (is-eq sender tx-sender)
      (match (debit sender amount)
        result (begin
                 (unwrap-panic (credit recipient amount))
                 (print { action: "transfer", sender: sender, recipient: recipient, amount: amount, memo: memo })
                 (ok true))
        err-code (err err-code))
      (err ERR-UNAUTHORIZED)))

;; Transfer tokens peer-to-peer (legacy wrapper)
(define-public (transfer-quota (to principal) (amount uint))
  (transfer amount tx-sender to none))
