# Shopee released-income research — 2026-10-25

## Evidence and source quality

Official documentation URL was attempted but unavailable through the current network (URLError/tunnel failure); no account credentials were used. The endpoint, parameters, schema and examples were crosschecked in a maintained PHP SDK, two public schema/document mirrors, and an independent Brazilian ERP implementation. These prove the public documented shape, not this account’s permission or actual units.

Pinned references:

- SDK method: https://github.com/EcomPHP/shopee-php/blob/c6210a7b79b10c842bf90f153f86c1877578757b/src/Resources/Payment.php
- Escrow-list schema: https://github.com/congminh1254/shopee-sdk/blob/196aedb4bec5fd7c9e99158a448a222f184a42ab/schemas/v2.payment.get_escrow_list.json
- Independent rendered mirror: https://github.com/nhutplus/marketplace-api-docs/blob/300344af94cf347268b50847baf14b9c28aaf1ae/shopee/api-reference/v2.payment.get_escrow_list.md
- Independent machine schema: https://github.com/lazykern/ecommerce-api-docs/blob/eba059e3e9e6ef5605117593b3c79866ed7c814e/data/raw/shopee/apis/payment/v2.payment.get_escrow_list.json
- Third-party endpoint catalog: https://github.com/ttakanawa/shopee-seller-mcp/blob/8d1a85b4798fa1260678b0524346f79e2d712d1d/public_catalog/endpoints/v2.payment.get_escrow_list.json
- BR ERP sweep: https://github.com/Hinten/next_erp/blob/156a6a7d513cd51db2c1616ee13b69f0bf996fef/apps/shopee/lib/shopee/pedidos/liquidacaoSweep.ts
- BR ERP settlement: https://github.com/Hinten/next_erp/blob/156a6a7d513cd51db2c1616ee13b69f0bf996fef/apps/shopee/lib/shopee/pedidos/liquidarPagamento.ts
- BR ERP inspection tool explicitly retaining raw payout: https://github.com/Hinten/next_erp/blob/156a6a7d513cd51db2c1616ee13b69f0bf996fef/apps/shopee/lib/shopee/pedidos/liquidarPagamentosCli.ts

## Verified API contract

GET https://partner.shopeemobile.com/api/v2/payment/get_escrow_list

Standard shop authentication signature is HMAC-SHA256 over partner_id + API path + timestamp + access_token + shop_id, using partner key. Authentication and scope must remain confined to Finance.

Required query fields are release_time_from and release_time_to (Unix timestamps). The schema only describes start and end times. page_size is optional, 1–100 with documented default40; page_no is optional, minimum/default1. Prefer explicit page_size/page_no. The error list confirms start must not be later than end. It does NOT document whether either endpoint is inclusive, a maximum range, ordering, a stable snapshot/cursor, or a late-update consistency guarantee. A15-day range is a prudent local work limit, not an API fact.

Response envelope: error, message, request_id, response. response has escrow_list array and more:boolean. Each documented row has order_sn:string, payout_amount:float, escrow_release_time:timestamp. more=true requires another page. The documented categories include Accounting And Finance, ERP System, Seller In House System and Swam ERP. This does not prove this token has the permission.

There is NO currency field, money-unit declaration or unique transaction ID in the escrow-list schema. order_sn is the unique identifier of an ORDER, not explicitly of an escrow/release transaction. Timestamp must be treated as epoch seconds, not guessed by magnitude or converted to microseconds twice.

## Critical unit uncertainty

The SAME schema prints payout_amount sample5733.04 in its field table and57334 for the same order in its response example. These examples cannot establish decimals versus cents. The type float alone is insufficient proof to multiply by100 or divide by100.

The independent BR ERP explicitly labels payoutAmount as RAW with unresolved unit. Its inspection ratio payout_amount / (escrow_amount_after_adjustment ?? escrow_amount) distinguishes approximately1 from100 in real data, but it preserves the raw payout and takes financial money from get_escrow_detail. This is an implementation policy, not Shopee documentation. Do not copy its ratio as an automatic scale-conversion guarantee.

The shop-info schema returns region and is_cb, but no currency. Our fixed Brazil shop profile and existing per-order BRL detail are useful matching context. They do not independently establish the unit of every escrow-list amount, especially unmatched release rows from other creation months.

Zero and negative payout are not explicitly prohibited or explained by this endpoint’s documentation. Preserve exact canonical signed numeric observations; do not take abs, clamp, round sub-cents or treat zero as missing. Currency/unit-gated reports must remain pending when missing or inconsistent.

## Identity, duplicates and page safety

No documented transaction identity or guarantee of one row per order was found. A composite hash(order_sn,release_time,payout_raw) can identify an OBSERVATION, not certify a transaction ID. Repetition may reflect pagination overlap, duplicated provider data, or indistinguishable events. Do not silently sum repeated rows or merge different releases for the same order into a final payment.

A safe first collector freezes the requested time window and cutoff, uses numbered pages, commits each page and next page atomically under a lease, and retains the last completed publication. A repeated page/cursor, empty page with more=true, conflicting duplicate, out-of-scope timestamp, unsafe number, identity mismatch or budget limit must prevent a complete monetary total. The existing ERP chooses to continue empty more=true pages under a cap; a conservative product may instead label it unavailable. Never advance the coverage watermark past an incomplete page.

For unknown inclusive/exclusive bounds, define the accounting scope as [from,to) in epoch seconds derived from Brasilia dates. A one-second request guard-band [from−1,to] can include boundary evidence without assigning it twice: count only from<=release_time<to, store/recognize guard observations separately. This is local policy, not a documented vendor rule. A repeated exact observation across a KNOWN guard overlap is different from an ambiguous duplicated event within the same target scope.

## Joining the order-creation cohort

Keep the release-date ledger independent of the published order-creation month. Match exact SHA256(order_sn) to the committed private order evidence for the run IDs and revisions selected by the publication. Never join by amount, date proximity, product or title. Missing prior-month orders remain unmatched; they are not zero, cancelled or proof of missing sales.

Useful first results independent of payout unit are release-record coverage, matched-order counts, unmatched records, release timestamps, conflicts and expected payout FROM THE ORIGINAL VALIDATED MONTHLY SOURCE for orders whose release reference was located. Label that last number as expected payout of matched orders, not money received or total released.

For monetary matching per order, compare raw payout to the exact-cent BRL get_escrow_detail values only after identity and source times are known. Equal numeric values are evidence of agreement, not universal unit proof. Missing after-adjustment values cannot become zero; positive signed adjustments must not be subtracted again. Neither released escrow nor completed return status proves a bank deposit or final profit.

## Adjacent APIs and limits

get_payout_detail, get_payout_info and get_billing_transaction_info are explicitly Cross Border only in the SDK/schema. Do not select those as a BR-local bank proof.

get_wallet_transaction_list is explicitly local-shops only. It documents15-day create-time ranges and types101/102 (positive/negative escrow),452/459 (first and second fast escrow disbursement),458 (fast escrow refund deduction),450/451 (Ads charges/refunds), and BR Pix/Open Finance filtering caveats. This shows financial flows can contain partial releases and adjustments. However, its schema also omits a generic transaction ID and currency; only withdrawals have withdrawal_id. Its page_no description is ambiguous (default0/offset), so it is not a safer drop-in ledger for this increment.

Pinned wallet and shop schemas:
- https://github.com/congminh1254/shopee-sdk/blob/196aedb4bec5fd7c9e99158a448a222f184a42ab/schemas/v2.payment.get_wallet_transaction_list.json
- https://github.com/congminh1254/shopee-sdk/blob/196aedb4bec5fd7c9e99158a448a222f184a42ab/schemas/v2.shop.get_shop_info.json
