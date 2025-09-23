;; Fishermen Registry Contract
;; Manages registration and licensing of fishermen in the cooperative

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u200))
(define-constant ERR_ALREADY_REGISTERED (err u201))
(define-constant ERR_NOT_REGISTERED (err u202))
(define-constant ERR_INVALID_LICENSE (err u203))
(define-constant ERR_LICENSE_EXPIRED (err u204))
(define-constant ERR_INVALID_PARAMETERS (err u205))

;; Data structures
(define-map registered-fishermen 
  principal 
  {
    name: (string-ascii 50),
    license-number: (string-ascii 20),
    registration-date: uint,
    is-active: bool,
    vessel-info: (string-ascii 100)
  }
)

(define-map fishing-licenses
  principal
  {
    license-type: (string-ascii 20),
    issue-date: uint,
    expiry-date: uint,
    quota-allocation: uint,
    is-valid: bool
  }
)

(define-map fisherman-history
  principal
  {
    total-catches: uint,
    total-quota-used: uint,
    seasons-participated: uint,
    last-activity: uint
  }
)

;; Data variables
(define-data-var total-registered uint u0)
(define-data-var fisheries-contract (optional principal) none)

;; Private functions
(define-private (is-valid-string (str (string-ascii 50)))
  (> (len str) u0)
)

;; Admin functions

;; Set the fisheries management contract (only owner)
(define-public (set-fisheries-contract (contract principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (var-set fisheries-contract (some contract))
    (ok true)
  )
)

;; Register a new fisherman
(define-public (register-fisherman 
  (fisherman principal)
  (name (string-ascii 50))
  (license-number (string-ascii 20))
  (vessel-info (string-ascii 100))
)
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (asserts! (is-none (map-get? registered-fishermen fisherman)) ERR_ALREADY_REGISTERED)
    (asserts! (is-valid-string name) ERR_INVALID_PARAMETERS)
    (asserts! (is-valid-string license-number) ERR_INVALID_PARAMETERS)
    
    (map-set registered-fishermen fisherman {
      name: name,
      license-number: license-number,
      registration-date: stacks-block-height,
      is-active: true,
      vessel-info: vessel-info
    })
    
    (map-set fisherman-history fisherman {
      total-catches: u0,
      total-quota-used: u0,
      seasons-participated: u0,
      last-activity: stacks-block-height
    })
    
    (var-set total-registered (+ (var-get total-registered) u1))
    
    (print {
      action: "fisherman-registered",
      fisherman: fisherman,
      name: name,
      license-number: license-number
    })
    
    (ok true)
  )
)

;; Issue a fishing license
(define-public (issue-license
  (fisherman principal)
  (license-type (string-ascii 20))
  (expiry-date uint)
  (quota-allocation uint)
)
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (asserts! (is-some (map-get? registered-fishermen fisherman)) ERR_NOT_REGISTERED)
    (asserts! (> expiry-date stacks-block-height) ERR_INVALID_PARAMETERS)
    
    (map-set fishing-licenses fisherman {
      license-type: license-type,
      issue-date: stacks-block-height,
      expiry-date: expiry-date,
      quota-allocation: quota-allocation,
      is-valid: true
    })
    
    (print {
      action: "license-issued",
      fisherman: fisherman,
      license-type: license-type,
      quota-allocation: quota-allocation
    })
    
    (ok true)
  )
)

;; Deactivate a fisherman
(define-public (deactivate-fisherman (fisherman principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (asserts! (is-some (map-get? registered-fishermen fisherman)) ERR_NOT_REGISTERED)
    
    (let ((fisherman-data (unwrap-panic (map-get? registered-fishermen fisherman))))
      (map-set registered-fishermen fisherman 
        (merge fisherman-data { is-active: false })
      )
    )
    
    (print {
      action: "fisherman-deactivated",
      fisherman: fisherman
    })
    
    (ok true)
  )
)

;; Update fisherman activity (called by fisheries contract)
(define-public (update-fisherman-activity 
  (fisherman principal)
  (catch-amount uint)
  (quota-used uint)
)
  (begin
    (asserts! (is-some (var-get fisheries-contract)) ERR_UNAUTHORIZED)
    (asserts! (is-eq tx-sender (unwrap-panic (var-get fisheries-contract))) ERR_UNAUTHORIZED)
    (asserts! (is-some (map-get? registered-fishermen fisherman)) ERR_NOT_REGISTERED)
    
    (let ((history (default-to 
      { total-catches: u0, total-quota-used: u0, seasons-participated: u0, last-activity: u0 }
      (map-get? fisherman-history fisherman)
    )))
      (map-set fisherman-history fisherman {
        total-catches: (+ (get total-catches history) catch-amount),
        total-quota-used: (+ (get total-quota-used history) quota-used),
        seasons-participated: (get seasons-participated history),
        last-activity: stacks-block-height
      })
    )
    
    (ok true)
  )
)

;; Read-only functions

;; Check if fisherman is registered and active
(define-read-only (is-registered-fisherman (fisherman principal))
  (match (map-get? registered-fishermen fisherman)
    fisherman-data (get is-active fisherman-data)
    false
  )
)

;; Get fisherman information
(define-read-only (get-fisherman-info (fisherman principal))
  (map-get? registered-fishermen fisherman)
)

;; Get fishing license information
(define-read-only (get-license-info (fisherman principal))
  (map-get? fishing-licenses fisherman)
)

;; Check if license is valid and not expired
(define-read-only (is-license-valid (fisherman principal))
  (match (map-get? fishing-licenses fisherman)
    license-data (and 
      (get is-valid license-data)
      (> (get expiry-date license-data) stacks-block-height)
    )
    false
  )
)

;; Get fisherman history
(define-read-only (get-fisherman-history (fisherman principal))
  (map-get? fisherman-history fisherman)
)

;; Get total registered fishermen count
(define-read-only (get-total-registered)
  (var-get total-registered)
)

;; Get fisheries contract
(define-read-only (get-fisheries-contract)
  (var-get fisheries-contract)
)
