;; Fisheries Management Contract
;; Core contract for managing fishing seasons, quotas, and catch recording

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u300))
(define-constant ERR_SEASON_NOT_FOUND (err u301))
(define-constant ERR_SEASON_CLOSED (err u302))
(define-constant ERR_QUOTA_EXCEEDED (err u303))
(define-constant ERR_INVALID_PARAMETERS (err u304))
(define-constant ERR_FISHERMAN_NOT_REGISTERED (err u305))
(define-constant ERR_INSUFFICIENT_QUOTA (err u306))
(define-constant ERR_SEASON_ALREADY_EXISTS (err u307))

;; Contract references
(define-constant QUOTA_TOKEN_CONTRACT .quota-token)
(define-constant FISHERMEN_REGISTRY_CONTRACT .fishermen-registry)

;; Data structures
(define-map fishing-seasons
  uint ;; season-id
  {
    name: (string-ascii 50),
    start-block: uint,
    end-block: uint,
    total-allowable-catch: uint,
    quota-per-token: uint,
    is-active: bool,
    total-distributed: uint,
    total-caught: uint
  }
)

(define-map fisherman-season-quotas
  {fisherman: principal, season-id: uint}
  {
    allocated-quota: uint,
    used-quota: uint,
    token-balance: uint,
    last-catch-block: uint
  }
)

(define-map catch-records
  uint ;; record-id
  {
    fisherman: principal,
    season-id: uint,
    catch-amount: uint,
    quota-burned: uint,
    timestamp: uint,
    location: (string-ascii 100)
  }
)

;; Data variables
(define-data-var current-season-id uint u0)
(define-data-var current-record-id uint u0)
(define-data-var contract-paused bool false)

;; Private functions
(define-private (is-season-active (season-id uint))
  (match (map-get? fishing-seasons season-id)
    season-data (and 
      (get is-active season-data)
      (>= stacks-block-height (get start-block season-data))
      (<= stacks-block-height (get end-block season-data))
    )
    false
  )
)

;; Admin functions

;; Pause/unpause contract
(define-public (set-contract-pause (paused bool))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (var-set contract-paused paused)
    (ok true)
  )
)

;; Create a new fishing season
(define-public (create-fishing-season
  (name (string-ascii 50))
  (start-block uint)
  (end-block uint)
  (total-allowable-catch uint)
  (quota-per-token uint)
)
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (asserts! (not (var-get contract-paused)) ERR_UNAUTHORIZED)
    (asserts! (> end-block start-block) ERR_INVALID_PARAMETERS)
    (asserts! (> total-allowable-catch u0) ERR_INVALID_PARAMETERS)
    (asserts! (> quota-per-token u0) ERR_INVALID_PARAMETERS)
    
    (let ((season-id (+ (var-get current-season-id) u1)))
      (asserts! (is-none (map-get? fishing-seasons season-id)) ERR_SEASON_ALREADY_EXISTS)
      
      (map-set fishing-seasons season-id {
        name: name,
        start-block: start-block,
        end-block: end-block,
        total-allowable-catch: total-allowable-catch,
        quota-per-token: quota-per-token,
        is-active: true,
        total-distributed: u0,
        total-caught: u0
      })
      
      (var-set current-season-id season-id)
      
      (print {
        action: "season-created",
        season-id: season-id,
        name: name,
        total-allowable-catch: total-allowable-catch
      })
      
      (ok season-id)
    )
  )
)

;; Distribute quota tokens to a fisherman for a season
(define-public (distribute-quota
  (fisherman principal)
  (season-id uint)
  (quota-amount uint)
)
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (asserts! (not (var-get contract-paused)) ERR_UNAUTHORIZED)
    (asserts! (contract-call? FISHERMEN_REGISTRY_CONTRACT is-registered-fisherman fisherman) ERR_FISHERMAN_NOT_REGISTERED)
    
    (let ((season-data (unwrap! (map-get? fishing-seasons season-id) ERR_SEASON_NOT_FOUND)))
      (asserts! (get is-active season-data) ERR_SEASON_CLOSED)
      (asserts! (<= (+ (get total-distributed season-data) quota-amount) (get total-allowable-catch season-data)) ERR_QUOTA_EXCEEDED)
      
      ;; Calculate tokens to mint
      (let ((tokens-to-mint (/ quota-amount (get quota-per-token season-data))))
        
        ;; Mint quota tokens
        (try! (contract-call? QUOTA_TOKEN_CONTRACT mint tokens-to-mint fisherman))
        
        ;; Update fisherman quota allocation
        (map-set fisherman-season-quotas {fisherman: fisherman, season-id: season-id} {
          allocated-quota: quota-amount,
          used-quota: u0,
          token-balance: tokens-to-mint,
          last-catch-block: u0
        })
        
        ;; Update season totals
        (map-set fishing-seasons season-id 
          (merge season-data { total-distributed: (+ (get total-distributed season-data) quota-amount) })
        )
        
        (print {
          action: "quota-distributed",
          fisherman: fisherman,
          season-id: season-id,
          quota-amount: quota-amount,
          tokens-minted: tokens-to-mint
        })
        
        (ok true)
      )
    )
  )
)

;; Record a catch and burn corresponding quota tokens
(define-public (record-catch
  (season-id uint)
  (catch-amount uint)
  (location (string-ascii 100))
)
  (begin
    (asserts! (not (var-get contract-paused)) ERR_UNAUTHORIZED)
    (asserts! (contract-call? FISHERMEN_REGISTRY_CONTRACT is-registered-fisherman tx-sender) ERR_FISHERMAN_NOT_REGISTERED)
    (asserts! (is-season-active season-id) ERR_SEASON_CLOSED)
    
    (let (
      (season-data (unwrap! (map-get? fishing-seasons season-id) ERR_SEASON_NOT_FOUND))
      (fisherman-quota (unwrap! (map-get? fisherman-season-quotas {fisherman: tx-sender, season-id: season-id}) ERR_INSUFFICIENT_QUOTA))
      (quota-per-token (get quota-per-token season-data))
      (tokens-to-burn (/ catch-amount quota-per-token))
    )
      
      ;; Check if fisherman has enough quota tokens
      (asserts! (>= (get token-balance fisherman-quota) tokens-to-burn) ERR_INSUFFICIENT_QUOTA)
      (asserts! (<= (+ (get used-quota fisherman-quota) catch-amount) (get allocated-quota fisherman-quota)) ERR_QUOTA_EXCEEDED)
      
      ;; Burn quota tokens
      (try! (contract-call? QUOTA_TOKEN_CONTRACT burn tokens-to-burn tx-sender))
      
      ;; Create catch record
      (let ((record-id (+ (var-get current-record-id) u1)))
        (map-set catch-records record-id {
          fisherman: tx-sender,
          season-id: season-id,
          catch-amount: catch-amount,
          quota-burned: tokens-to-burn,
          timestamp: stacks-block-height,
          location: location
        })
        
        (var-set current-record-id record-id)
      )
      
      ;; Update fisherman quota usage
      (map-set fisherman-season-quotas {fisherman: tx-sender, season-id: season-id}
        (merge fisherman-quota {
          used-quota: (+ (get used-quota fisherman-quota) catch-amount),
          token-balance: (- (get token-balance fisherman-quota) tokens-to-burn),
          last-catch-block: stacks-block-height
        })
      )
      
      ;; Update season totals
      (map-set fishing-seasons season-id
        (merge season-data { total-caught: (+ (get total-caught season-data) catch-amount) })
      )
      
      ;; Update fisherman activity in registry
      (try! (contract-call? FISHERMEN_REGISTRY_CONTRACT update-fisherman-activity tx-sender catch-amount catch-amount))
      
      (print {
        action: "catch-recorded",
        fisherman: tx-sender,
        season-id: season-id,
        catch-amount: catch-amount,
        tokens-burned: tokens-to-burn
      })
      
      (ok true)
    )
  )
)

;; Read-only functions

;; Get season information
(define-read-only (get-season-info (season-id uint))
  (map-get? fishing-seasons season-id)
)

;; Get fisherman quota for a season
(define-read-only (get-fisherman-quota (fisherman principal) (season-id uint))
  (map-get? fisherman-season-quotas {fisherman: fisherman, season-id: season-id})
)

;; Get catch record
(define-read-only (get-catch-record (record-id uint))
  (map-get? catch-records record-id)
)

;; Get current season ID
(define-read-only (get-current-season-id)
  (var-get current-season-id)
)

;; Check if contract is paused
(define-read-only (is-contract-paused)
  (var-get contract-paused)
)

;; Get season utilization percentage
(define-read-only (get-season-utilization (season-id uint))
  (match (map-get? fishing-seasons season-id)
    season-data (if (> (get total-allowable-catch season-data) u0)
      (/ (* (get total-caught season-data) u100) (get total-allowable-catch season-data))
      u0
    )
    u0
  )
)
