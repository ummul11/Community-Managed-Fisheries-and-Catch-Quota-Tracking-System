;; Quota Token Contract
;; SIP-010 compliant fungible token representing fishing quotas
;; Only the fisheries management contract can mint and burn tokens

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u100))
(define-constant ERR_INSUFFICIENT_BALANCE (err u101))
(define-constant ERR_INVALID_AMOUNT (err u102))
(define-constant ERR_INVALID_RECIPIENT (err u103))

;; Token metadata
(define-constant TOKEN_NAME "Fishing Quota Token")
(define-constant TOKEN_SYMBOL "FQT")
(define-constant TOKEN_DECIMALS u6)

;; Data variables
(define-data-var total-supply uint u0)
(define-data-var fisheries-contract (optional principal) none)

;; Data maps
(define-map balances principal uint)
(define-map allowances {owner: principal, spender: principal} uint)

;; SIP-010 trait implementation
(define-trait sip-010-trait
  (
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
    (get-name () (response (string-ascii 32) uint))
    (get-symbol () (response (string-ascii 32) uint))
    (get-decimals () (response uint uint))
    (get-balance (principal) (response uint uint))
    (get-total-supply () (response uint uint))
    (get-token-uri () (response (optional (string-utf8 256)) uint))
  )
)

;; Private functions
(define-private (get-balance-or-default (account principal))
  (default-to u0 (map-get? balances account))
)

;; Public functions

;; Set the fisheries management contract (only owner)
(define-public (set-fisheries-contract (contract principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (var-set fisheries-contract (some contract))
    (ok true)
  )
)

;; SIP-010 transfer function
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (is-eq tx-sender sender) ERR_UNAUTHORIZED)
    (asserts! (not (is-eq sender recipient)) ERR_INVALID_RECIPIENT)
    
    (let ((sender-balance (get-balance-or-default sender)))
      (asserts! (>= sender-balance amount) ERR_INSUFFICIENT_BALANCE)
      
      (map-set balances sender (- sender-balance amount))
      (map-set balances recipient (+ (get-balance-or-default recipient) amount))
      
      (print {
        action: "transfer",
        sender: sender,
        recipient: recipient,
        amount: amount,
        memo: memo
      })
      
      (ok true)
    )
  )
)

;; Mint tokens (only fisheries contract)
(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (is-some (var-get fisheries-contract)) ERR_UNAUTHORIZED)
    (asserts! (is-eq tx-sender (unwrap-panic (var-get fisheries-contract))) ERR_UNAUTHORIZED)
    
    (map-set balances recipient (+ (get-balance-or-default recipient) amount))
    (var-set total-supply (+ (var-get total-supply) amount))
    
    (print {
      action: "mint",
      recipient: recipient,
      amount: amount
    })
    
    (ok true)
  )
)

;; Burn tokens (only fisheries contract)
(define-public (burn (amount uint) (owner principal))
  (begin
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (is-some (var-get fisheries-contract)) ERR_UNAUTHORIZED)
    (asserts! (is-eq tx-sender (unwrap-panic (var-get fisheries-contract))) ERR_UNAUTHORIZED)
    
    (let ((owner-balance (get-balance-or-default owner)))
      (asserts! (>= owner-balance amount) ERR_INSUFFICIENT_BALANCE)
      
      (map-set balances owner (- owner-balance amount))
      (var-set total-supply (- (var-get total-supply) amount))
      
      (print {
        action: "burn",
        owner: owner,
        amount: amount
      })
      
      (ok true)
    )
  )
)

;; SIP-010 read-only functions
(define-read-only (get-name)
  (ok TOKEN_NAME)
)

(define-read-only (get-symbol)
  (ok TOKEN_SYMBOL)
)

(define-read-only (get-decimals)
  (ok TOKEN_DECIMALS)
)

(define-read-only (get-balance (account principal))
  (ok (get-balance-or-default account))
)

(define-read-only (get-total-supply)
  (ok (var-get total-supply))
)

(define-read-only (get-token-uri)
  (ok (some u"https://fisheries.example.com/quota-token-metadata.json"))
)

;; Additional read-only functions
(define-read-only (get-fisheries-contract)
  (var-get fisheries-contract)
)
