# Shopee financial research — 2026-10-25

Evidence level: official open.shopee.com documentation host returned tunnel HTTP403. Endpoint/method crosschecked in EcomPHP SDK; field descriptions copied from API schemas maintained by community, so these are not proof of availability or permissions on this specific BR shop.

## Sources (pinned where possible)
- https://github.com/EcomPHP/shopee-php/blob/master/src/Resources/Payment.php
- https://github.com/EcomPHP/shopee-php/blob/master/src/Resources/Returns.php
- https://github.com/congminh1254/shopee-sdk/blob/196aedb4bec5fd7c9e99158a448a222f184a42ab/schemas/v2.payment.get_escrow_detail.json
- https://github.com/congminh1254/shopee-sdk/blob/196aedb4bec5fd7c9e99158a448a222f184a42ab/schemas/v2.payment.get_escrow_list.json
- https://github.com/congminh1254/shopee-sdk/blob/196aedb4bec5fd7c9e99158a448a222f184a42ab/schemas/v2.returns.get_return_detail.json
- https://github.com/congminh1254/shopee-sdk/blob/196aedb4bec5fd7c9e99158a448a222f184a42ab/schemas/v2.returns.get_return_list.json
- Human readable independent mirror: https://github.com/nhutplus/marketplace-api-docs/blob/300344af94cf347268b50847baf14b9c28aaf1ae/shopee/api-reference/v2.payment.get_escrow_detail.md

## Payment detail
GET /api/v2/payment/get_escrow_detail?order_sn=...
response.order_sn must match requested order. return_order_sn_list:string[] are return serials, not buyerrefund money.
order_income.escrow_amount:float is total expected seller income and changes before completion. Formula already contains fees, reverse shipping, and +seller_return_refund. seller_return_refund:float means Amount returned to Seller in the event of Partial Return, not refund to buyer.
Optional fields:
- escrow_amount_after_adjustment:float: Final income seller can get from this order after deduct the order-level adjustment.
- total_adjustment_amount:float: Total adjustment made to the order.
- order_adjustment:object[]: absent if order has no adjustment; each amount:float, date:timestamp, currency:string, adjustment_reason:string. Reasons include Return Refund deduction or compensation, logistics deduction/compensation, marketing fees, payment fees.
No documented mandatory/default/status guarantee found for after_adjustment or total_adjustment. Never treat explicit zero as absence. Canonical doc example escrow100, total+10.1, after110.1, so total is a signed delta in this example; wording after deduct does not justify blind minus. Another documented example has escrow6.06,total0,after6.06. Capture separate fields; compare using exact cents only when both present and currency supported. No release_time field found inside order_income.

## Returns
GET /api/v2/returns/get_return_detail?return_sn=...
response return_sn:string, order_sn:string, status:string, refund_amount:float, currency:string, create_time/update_time:timestamp, item:object[] (item_id,model_id,amount). Other fields return_refund_type:RRBOC/RRAOC; return_solution 0=return+refund,1=refund-only; is_partial_quantity_return:boolean; is_refund_amount_adjusted:boolean. Item refund_amount only for PartialQtyRR whitelisted shops, sometimes string in bundle activity.
CRITICAL: doc get_return_list sample is CANCELLED yet refund_amount1409; get_return_detail sample ACCEPTED yet refund_amount13.97. A nonzero amount is not proof that money moved. Unknown or future status must not become closed/paid. RRAOC means after-order-completion, so completed orders can change later.
get_return_list GET uses page_no/page_size, <=100; create/update ranges <=15days; update_from>=create_from documented. Pagination description says default0/offset while SDK defaults page1: unresolved ambiguity. Prefer known serials from payment and direct detail for initial feature.
Application categories shown for Returns: ERP System, Seller In House System, Customer Service, SwamERP; Payment also lists AccountingAndFinance. These are not proof of this token access. A denied Returns call must not invalidate the working Payment connection.

## Released income
GET /api/v2/payment/get_escrow_list?release_time_from=&release_time_to=&page_size=&page_no=
page_size1..100 default40; page_no>=1 default1. response.escrow_list:[{order_sn:string,payout_amount:float,escrow_release_time:timestamp}], more:boolean. No verified extra max date window found. This is release date cohort, not order creation date cohort. It is settlement/released income inside Shopee, not proof of bank receipt. Do not replace the order-create-month expected repass using a calendar release total. Need per-order matching and original timestamps.
SDK labels get_payout_detail/get_payout_info cross-border sellers only, so not a safe BR-local bank proof. No verified transaction-identity semantics for multiple releases/adjustments per same order found; do not invent a dedup key.

## Safe implementation progression
1. Persist signed optional income adjustment evidence and return reference coverage privately, from existing Payment responses, with nulls for missing fields, no extra provider calls. Preserve old monthly payout/strict net until semantics verified; expose audit counts and difference instead.
2. Read exact known return serials with bounded cached queue and exact order/return identity checks, BRL checks, pure cent parsing. Retain requested, cancelled, pending, paid, unknown separately, and never subtract refund_amount directly from an escrow total that may already contain it. No confirm/dispute/offer endpoints.
3. Add independent release-date ledger only after actual endpoint responses/permissions prove contract. Link to order-create cohort; keep bank-received profit unavailable until reconciliation data exist.
