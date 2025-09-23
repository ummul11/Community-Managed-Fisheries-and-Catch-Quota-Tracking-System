;; Quota Marketplace Contract
;; P2P trading platform for fishing quota tokens

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u400))
(define-constant ERR_ORDER_NOT_FOUND (err u401))
(define-constant ERR_INVALID_AMOUNT (err u402))
(define-constant ERR_INSUFFICIENT_BALANCE (err u403))
(define-constant ERR_ORDER_EXPIRED (err u404))
(define-constant ERR_INVALID_PRICE (err u405))
(define-constant ERR_SELF_TRADE (err u406))
(define-constant ERR_ORDER_ALREADY_FILLED (err u407))

;; Contract references
(define-constant QUOTA_TOKEN_CONTRACT .quota-token)
(define-constant FISHERMEN_REGISTRY_CONTRACT .fishermen-registry)

;; Data structures
(define-map buy-orders
  uint ;; order-id
  {
    buyer: principal,
    amount: uint,
    price-per-token: uint,
    total-price: uint,
    expiry-block: uint,
    is-active: bool,
    filled-amount: uint
  }
)

(define-map sell-orders
  uint ;; order-id
  {
    seller: principal,
    amount: uint,
    price-per-token: uint,
    total-price: uint,
    expiry-block: uint,
    is-active: bool,
    filled-amount: uint
  }
)

(define-map trade-history
  uint ;; trade-id
  {
    buyer: principal,
    seller: principal,
    amount: uint,
    price-per-token: uint,
    total-price: uint,
    buy-order-id: uint,
    sell-order-id: uint,
    timestamp: uint
  }
)

(define-map user-orders
  principal
  {
    active-buy-orders: (list 20 uint),
    active-sell-orders: (list 20 uint),
    total-trades: uint
  }
)

;; Data variables
(define-data-var next-order-id uint u1)
(define-data-var next-trade-id uint u1)
(define-data-var marketplace-fee-rate uint u250) ;; 2.5% (250 basis points)
(define-data-var total-volume uint u0)
(define-data-var marketplace-paused bool false)

;; Private functions
(define-private (min (a uint) (b uint))
  (if (<= a b) a b)
)

(define-private (add-order-to-user (user principal) (order-id uint) (is-buy-order bool))
  (let ((user-data (default-to
    { active-buy-orders: (list), active-sell-orders: (list), total-trades: u0 }
    (map-get? user-orders user)
  )))
    (if is-buy-order
      (begin
        (map-set user-orders user
          (merge user-data {
            active-buy-orders: (unwrap! (as-max-len? (append (get active-buy-orders user-data) order-id) u20) (err u999))
          })
        )
        (ok true)
      )
      (begin
        (map-set user-orders user
          (merge user-data {
            active-sell-orders: (unwrap! (as-max-len? (append (get active-sell-orders user-data) order-id) u20) (err u999))
          })
        )
        (ok true)
      )
    )
  )
)

(define-private (calculate-fee (amount uint))
  (/ (* amount (var-get marketplace-fee-rate)) u10000)
)

;; Admin functions
(define-public (set-marketplace-pause (paused bool))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (var-set marketplace-paused paused)
    (ok true)
  )
)

(define-public (set-fee-rate (new-rate uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (asserts! (<= new-rate u1000) ERR_INVALID_PRICE) ;; Max 10%
    (var-set marketplace-fee-rate new-rate)
    (ok true)
  )
)

;; Trading functions

;; Create a buy order
(define-public (create-buy-order 
  (amount uint)
  (price-per-token uint)
  (expiry-block uint)
)
  (begin
    (asserts! (not (var-get marketplace-paused)) ERR_UNAUTHORIZED)
    (asserts! (contract-call? FISHERMEN_REGISTRY_CONTRACT is-registered-fisherman tx-sender) ERR_UNAUTHORIZED)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (> price-per-token u0) ERR_INVALID_PRICE)
    (asserts! (> expiry-block stacks-block-height) ERR_ORDER_EXPIRED)
    
    (let (
      (order-id (var-get next-order-id))
      (total-price (* amount price-per-token))
    )
      
      ;; Check if buyer has enough STX for the order
      (asserts! (>= (stx-get-balance tx-sender) total-price) ERR_INSUFFICIENT_BALANCE)
      
      ;; Create the buy order
      (map-set buy-orders order-id {
        buyer: tx-sender,
        amount: amount,
        price-per-token: price-per-token,
        total-price: total-price,
        expiry-block: expiry-block,
        is-active: true,
        filled-amount: u0
      })
      
      ;; Add order to user's active orders
      (try! (add-order-to-user tx-sender order-id true))
      
      (var-set next-order-id (+ order-id u1))
      
      (print {
        action: "buy-order-created",
        order-id: order-id,
        buyer: tx-sender,
        amount: amount,
        price-per-token: price-per-token
      })
      
      (ok order-id)
    )
  )
)

;; Create a sell order
(define-public (create-sell-order
  (amount uint)
  (price-per-token uint)
  (expiry-block uint)
)
  (begin
    (asserts! (not (var-get marketplace-paused)) ERR_UNAUTHORIZED)
    (asserts! (contract-call? FISHERMEN_REGISTRY_CONTRACT is-registered-fisherman tx-sender) ERR_UNAUTHORIZED)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (> price-per-token u0) ERR_INVALID_PRICE)
    (asserts! (> expiry-block stacks-block-height) ERR_ORDER_EXPIRED)
    
    ;; Check if seller has enough quota tokens
    (let ((seller-balance (unwrap-panic (contract-call? QUOTA_TOKEN_CONTRACT get-balance tx-sender))))
      (asserts! (>= seller-balance amount) ERR_INSUFFICIENT_BALANCE)
      
      (let (
        (order-id (var-get next-order-id))
        (total-price (* amount price-per-token))
      )
        
        ;; Create the sell order
        (map-set sell-orders order-id {
          seller: tx-sender,
          amount: amount,
          price-per-token: price-per-token,
          total-price: total-price,
          expiry-block: expiry-block,
          is-active: true,
          filled-amount: u0
        })
        
        ;; Add order to user's active orders
        (try! (add-order-to-user tx-sender order-id false))
        
        (var-set next-order-id (+ order-id u1))
        
        (print {
          action: "sell-order-created",
          order-id: order-id,
          seller: tx-sender,
          amount: amount,
          price-per-token: price-per-token
        })
        
        (ok order-id)
      )
    )
  )
)

;; Execute a trade between buy and sell orders
(define-public (execute-trade (buy-order-id uint) (sell-order-id uint) (trade-amount uint))
  (begin
    (asserts! (not (var-get marketplace-paused)) ERR_UNAUTHORIZED)
    
    (let (
      (buy-order (unwrap! (map-get? buy-orders buy-order-id) ERR_ORDER_NOT_FOUND))
      (sell-order (unwrap! (map-get? sell-orders sell-order-id) ERR_ORDER_NOT_FOUND))
    )
      
      ;; Validate orders
      (asserts! (get is-active buy-order) ERR_ORDER_ALREADY_FILLED)
      (asserts! (get is-active sell-order) ERR_ORDER_ALREADY_FILLED)
      (asserts! (> (get expiry-block buy-order) stacks-block-height) ERR_ORDER_EXPIRED)
      (asserts! (> (get expiry-block sell-order) stacks-block-height) ERR_ORDER_EXPIRED)
      (asserts! (not (is-eq (get buyer buy-order) (get seller sell-order))) ERR_SELF_TRADE)
      
      ;; Check price compatibility (buy price >= sell price)
      (asserts! (>= (get price-per-token buy-order) (get price-per-token sell-order)) ERR_INVALID_PRICE)
      
      ;; Calculate trade details
      (let (
        (max-trade-amount (min 
          (- (get amount buy-order) (get filled-amount buy-order))
          (- (get amount sell-order) (get filled-amount sell-order))
        ))
        (actual-trade-amount (min trade-amount max-trade-amount))
        (trade-price (get price-per-token sell-order)) ;; Use seller's price
        (total-cost (* actual-trade-amount trade-price))
        (marketplace-fee (calculate-fee total-cost))
        (seller-proceeds (- total-cost marketplace-fee))
        (trade-id (var-get next-trade-id))
      )
        
        (asserts! (> actual-trade-amount u0) ERR_INVALID_AMOUNT)
        
        ;; Transfer quota tokens from seller to buyer
        (try! (contract-call? QUOTA_TOKEN_CONTRACT transfer 
          actual-trade-amount 
          (get seller sell-order) 
          (get buyer buy-order) 
          none
        ))
        
        ;; Transfer STX from buyer to seller (minus fee)
        (try! (stx-transfer? seller-proceeds (get buyer buy-order) (get seller sell-order)))
        
        ;; Transfer marketplace fee to contract owner
        (try! (stx-transfer? marketplace-fee (get buyer buy-order) CONTRACT_OWNER))
        
        ;; Record the trade
        (map-set trade-history trade-id {
          buyer: (get buyer buy-order),
          seller: (get seller sell-order),
          amount: actual-trade-amount,
          price-per-token: trade-price,
          total-price: total-cost,
          buy-order-id: buy-order-id,
          sell-order-id: sell-order-id,
          timestamp: stacks-block-height
        })
        
        ;; Update order filled amounts
        (map-set buy-orders buy-order-id 
          (merge buy-order { filled-amount: (+ (get filled-amount buy-order) actual-trade-amount) })
        )
        
        (map-set sell-orders sell-order-id 
          (merge sell-order { filled-amount: (+ (get filled-amount sell-order) actual-trade-amount) })
        )
        
        ;; Update total volume
        (var-set total-volume (+ (var-get total-volume) total-cost))
        (var-set next-trade-id (+ trade-id u1))
        
        (print {
          action: "trade-executed",
          trade-id: trade-id,
          buyer: (get buyer buy-order),
          seller: (get seller sell-order),
          amount: actual-trade-amount,
          price: trade-price
        })
        
        (ok trade-id)
      )
    )
  )
)

;; Cancel an order
(define-public (cancel-buy-order (order-id uint))
  (begin
    (let ((order (unwrap! (map-get? buy-orders order-id) ERR_ORDER_NOT_FOUND)))
      (asserts! (is-eq tx-sender (get buyer order)) ERR_UNAUTHORIZED)
      (asserts! (get is-active order) ERR_ORDER_ALREADY_FILLED)
      
      (map-set buy-orders order-id (merge order { is-active: false }))
      
      (print {
        action: "buy-order-cancelled",
        order-id: order-id,
        buyer: tx-sender
      })
      
      (ok true)
    )
  )
)

(define-public (cancel-sell-order (order-id uint))
  (begin
    (let ((order (unwrap! (map-get? sell-orders order-id) ERR_ORDER_NOT_FOUND)))
      (asserts! (is-eq tx-sender (get seller order)) ERR_UNAUTHORIZED)
      (asserts! (get is-active order) ERR_ORDER_ALREADY_FILLED)
      
      (map-set sell-orders order-id (merge order { is-active: false }))
      
      (print {
        action: "sell-order-cancelled",
        order-id: order-id,
        seller: tx-sender
      })
      
      (ok true)
    )
  )
)

;; Read-only functions
(define-read-only (get-buy-order (order-id uint))
  (map-get? buy-orders order-id)
)

(define-read-only (get-sell-order (order-id uint))
  (map-get? sell-orders order-id)
)

(define-read-only (get-trade (trade-id uint))
  (map-get? trade-history trade-id)
)

(define-read-only (get-user-orders (user principal))
  (map-get? user-orders user)
)

(define-read-only (get-marketplace-stats)
  {
    total-volume: (var-get total-volume),
    fee-rate: (var-get marketplace-fee-rate),
    next-order-id: (var-get next-order-id),
    next-trade-id: (var-get next-trade-id),
    is-paused: (var-get marketplace-paused)
  }
)
