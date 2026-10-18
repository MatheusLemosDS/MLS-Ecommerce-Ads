export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {

      // =========================================================
      // HEALTH
      // =========================================================
      if (url.pathname === "/health") {
        return json({
          service: "BrazaCommerce Auth",
          status: "online",
          environment: "production",
          partner_id: String(
            env.SHOPEE_LIVE_PARTNER_ID || ""
          )
        });
      }


      // =========================================================
      // HOME
      // =========================================================
      if (url.pathname === "/") {
        return htmlPage(
          "BrazaCommerce Authorization Service",
          `
            <div class="status ok">
              Production Service Online
            </div>

            <p>
              Secure Shopee authorization service for
              MLS Commerce Ads.
            </p>

            <div class="box">
              <strong>Shopee Environment</strong>
              <span>Production / Live</span>
            </div>

            <div class="box">
              <strong>Live Partner ID</strong>
              <span>
                ${escapeHtml(
                  String(
                    env.SHOPEE_LIVE_PARTNER_ID || ""
                  )
                )}
              </span>
            </div>

            <a
              class="button"
              href="/shopee/connect"
            >
              Connect Shopee
            </a>
          `
        );
      }


      // =========================================================
      // GATEWAY STATUS
      // =========================================================
      if (
        url.pathname ===
        "/gateway/status"
      ) {

        const result =
          await gatewayRequest(
            env,
            "/api/status",
            "GET"
          );

        return json({
          worker: "online",

          gateway_http_status:
            result.status,

          gateway:
            result.body

        }, result.ok ? 200 : 502);
      }


      // =========================================================
      // GATEWAY EGRESS IP
      // =========================================================
      if (
        url.pathname ===
        "/gateway/egress-ip"
      ) {

        const result =
          await gatewayRequest(
            env,
            "/api/egress-ip",
            "GET"
          );

        return json({
          worker: "online",

          gateway_http_status:
            result.status,

          gateway:
            result.body

        }, result.ok ? 200 : 502);
      }


      // =========================================================
      // PRIVATE SHOPEE CONNECTION STATUS
      // Used only by brazacommerce-app
      // =========================================================
      if (
        url.pathname ===
        "/internal/shopee/status"
      ) {

        const authorized =
          await validateInternalApp(
            request,
            env
          );

        if (!authorized) {
          return json({
            error: "Unauthorized"
          }, 401);
        }


        const result =
          await gatewayRequest(
            env,
            "/api/shopee/shops",
            "GET"
          );


        if (!result.ok) {
          return json({
            error:
              "Gateway unavailable"
          }, 502);
        }


        return json({
          status: "ok",

          connections:
            Array.isArray(
              result.body?.connections
            )
              ? result.body.connections
              : []
        });
      }


      // =========================================================
      // PRIVATE SHOPEE ADS SUMMARY
      // Used only by brazacommerce-app
      // =========================================================
      if (
        url.pathname ===
        "/internal/shopee/ads/summary"
      ) {

        const authorized =
          await validateInternalApp(
            request,
            env
          );

        if (!authorized) {
          return json({
            error: "Unauthorized"
          }, 401);
        }


        // -------------------------------------------------------
        // Connected shops
        // -------------------------------------------------------
        const shopsResult =
          await gatewayRequest(
            env,
            "/api/shopee/shops",
            "GET"
          );


        if (!shopsResult.ok) {
          return json({
            error:
              "Unable to retrieve Shopee connections"
          }, 502);
        }


        const connections =
          Array.isArray(
            shopsResult.body?.connections
          )
            ? shopsResult.body.connections
            : [];


        const shop =
          connections.find(
            item =>
              item.principal_type === "shop"
          );


        if (!shop) {
          return json({
            status:
              "not_connected",

            connected:
              false
          });
        }


        // -------------------------------------------------------
        // Period
        // Default = last 7 days including today
        // -------------------------------------------------------
        const startDate =
          url.searchParams.get(
            "start_date"
          ) ||
          saoPauloDate(-6);


        const endDate =
          url.searchParams.get(
            "end_date"
          ) ||
          saoPauloDate(0);


        const params =
          new URLSearchParams({
            shop_id:
              String(
                shop.principal_id
              ),

            start_date:
              startDate,

            end_date:
              endDate
          });


        // -------------------------------------------------------
        // Ads data
        // -------------------------------------------------------
        const [
          dailyResult,
          balanceResult
        ] =
          await Promise.all([

            gatewayRequest(
              env,
              "/api/shopee/ads/daily?"
                + params.toString(),
              "GET"
            ),

            gatewayRequest(
              env,
              "/api/shopee/ads/balance?shop_id="
                + encodeURIComponent(
                    String(
                      shop.principal_id
                    )
                  ),
              "GET"
            )

          ]);


        if (!dailyResult.ok) {

          return json({
            status:
              "ads_api_error",

            connected:
              true,

            shop_id:
              shop.principal_id,

            error:
              dailyResult.body?.error ||
              "Unable to retrieve Ads data",

            message:
              dailyResult.body?.message ||
              ""

          }, 502);
        }


        // -------------------------------------------------------
        // Daily rows
        // -------------------------------------------------------
        const rows =
          Array.isArray(
            dailyResult.body?.response
          )
            ? dailyResult.body.response
            : [];


        // -------------------------------------------------------
        // Aggregate
        // -------------------------------------------------------
        let spend = 0;
        let gmv = 0;
        let orders = 0;
        let impressions = 0;
        let clicks = 0;
        let itemsSold = 0;


        for (
          const row of rows
        ) {

          spend +=
            toNumber(
              row.expense
            );


          gmv +=
            toNumber(
              row.broad_gmv ??
              row.direct_gmv
            );


          orders +=
            toNumber(
              row.broad_order ??
              row.direct_order
            );


          impressions +=
            toNumber(
              row.impression
            );


          clicks +=
            toNumber(
              row.clicks
            );


          itemsSold +=
            toNumber(
              row.broad_item_sold ??
              row.direct_item_sold
            );
        }


        const roas =
          spend > 0
            ? gmv / spend
            : 0;


        const ctr =
          impressions > 0
            ? clicks / impressions
            : 0;


        const conversionRate =
          clicks > 0
            ? orders / clicks
            : 0;


        const costPerOrder =
          orders > 0
            ? spend / orders
            : 0;


        const balance =
          balanceResult.ok
            ? toNumber(
                balanceResult
                  .body
                  ?.response
                  ?.total_balance
              )
            : null;


        return json({

          status:
            "ok",

          connected:
            true,


          shop: {

            id:
              shop.principal_id,

            token_status:
              shop.access_token_status

          },


          period: {

            start_date:
              startDate,

            end_date:
              endDate

          },


          balance:
            balance === null
              ? null
              : round2(balance),


          metrics: {

            spend:
              round2(spend),

            gmv:
              round2(gmv),

            roas:
              round2(roas),

            orders:
              orders,

            items_sold:
              itemsSold,

            impressions:
              impressions,

            clicks:
              clicks,

            ctr:
              round4(ctr),

            conversion_rate:
              round4(
                conversionRate
              ),

            cost_per_order:
              round2(
                costPerOrder
              )
          },


          daily:
            rows

        });
      }

      // =========================================================
// PRIVATE SHOPEE CAMPAIGN SUMMARY
// Used only by brazacommerce-app
// =========================================================
if (
  url.pathname ===
  "/internal/shopee/ads/campaigns"
) {

  const authorized =
    await validateInternalApp(
      request,
      env
    );

  if (!authorized) {
    return json({
      error: "Unauthorized"
    }, 401);
  }


  const shopsResult =
    await gatewayRequest(
      env,
      "/api/shopee/shops",
      "GET"
    );


  if (!shopsResult.ok) {
    return json({
      error:
        "Unable to retrieve Shopee connections"
    }, 502);
  }


  const connections =
    Array.isArray(
      shopsResult.body?.connections
    )
      ? shopsResult.body.connections
      : [];


  const shop =
    connections.find(
      item =>
        item.principal_type === "shop"
    );


  if (!shop) {
    return json({
      status: "not_connected",
      connected: false
    });
  }


  const startDate =
    url.searchParams.get(
      "start_date"
    ) ||
    saoPauloDate(-6);


  const endDate =
    url.searchParams.get(
      "end_date"
    ) ||
    saoPauloDate(0);


  const params =
    new URLSearchParams({
      shop_id:
        String(
          shop.principal_id
        ),

      start_date:
        startDate,

      end_date:
        endDate
    });


  const result =
    await gatewayRequest(
      env,
      "/api/shopee/ads/campaign-summary?"
        + params.toString(),
      "GET"
    );


  if (!result.ok) {
    return json({

      status:
        "campaign_api_error",

      connected:
        true,

      error:
        result.body?.error ||
        "Unable to retrieve campaigns",

      message:
        result.body?.message ||
        ""

    }, 502);
  }


  const rawCampaigns =
    Array.isArray(
      result.body
        ?.response
        ?.campaigns
    )
      ? result.body.response.campaigns
      : [];


  const campaigns =
    rawCampaigns.map(
      campaign => ({

        campaign_id:
          campaign.campaign_id,

        ad_name:
          String(
            campaign.ad_name ||
            ""
          ),

        ad_type:
          String(
            campaign.ad_type ||
            ""
          ),

        status:
          String(
            campaign.campaign_status ||
            "unknown"
          ),

        bidding_method:
          String(
            campaign.bidding_method ||
            ""
          ),

        placement:
          String(
            campaign.campaign_placement ||
            ""
          ),

        budget:
          round2(
            toNumber(
              campaign.campaign_budget
            )
          ),

        impressions:
          toNumber(
            campaign.impressions
          ),

        clicks:
          toNumber(
            campaign.clicks
          ),

        ctr:
          round4(
            toNumber(
              campaign.ctr
            )
          ),

        spend:
          round2(
            toNumber(
              campaign.spend
            )
          ),

        gmv:
          round2(
            toNumber(
              campaign.gmv
            )
          ),

        roas:
          round2(
            toNumber(
              campaign.roas
            )
          ),

        orders:
          toNumber(
            campaign.orders
          )

      })
    );


  const ongoing =
    campaigns.filter(
      campaign =>
        campaign.status === "ongoing"
    );


  const paused =
    campaigns.filter(
      campaign =>
        campaign.status === "paused"
    );


  const spending =
    campaigns.filter(
      campaign =>
        campaign.spend > 0
    );


  const spendingWithoutOrders =
    campaigns.filter(
      campaign =>
        campaign.spend > 0 &&
        campaign.orders === 0
    );


  const campaignsWithOrders =
    campaigns.filter(
      campaign =>
        campaign.orders > 0
    );


  const totalSpend =
    campaigns.reduce(
      (total, campaign) =>
        total + campaign.spend,
      0
    );


  const totalGmv =
    campaigns.reduce(
      (total, campaign) =>
        total + campaign.gmv,
      0
    );


  const totalOrders =
    campaigns.reduce(
      (total, campaign) =>
        total + campaign.orders,
      0
    );


  const spendWithoutOrders =
    spendingWithoutOrders.reduce(
      (total, campaign) =>
        total + campaign.spend,
      0
    );


  const overallRoas =
    totalSpend > 0
      ? totalGmv / totalSpend
      : 0;


  const bestRoasCampaign =
    campaignsWithOrders
      .filter(
        campaign =>
          campaign.spend > 0
      )
      .sort(
        (a, b) =>
          b.roas - a.roas
      )[0] || null;


  return json({

    status: "ok",

    connected: true,


    shop: {
      id:
        shop.principal_id,

      token_status:
        shop.access_token_status
    },


    period: {
      start_date:
        startDate,

      end_date:
        endDate
    },


    summary: {

      campaign_count:
        campaigns.length,

      ongoing_count:
        ongoing.length,

      paused_count:
        paused.length,

      spending_count:
        spending.length,

      campaigns_with_orders:
        campaignsWithOrders.length,

      spending_without_orders_count:
        spendingWithoutOrders.length,

      spend_without_orders:
        round2(
          spendWithoutOrders
        ),

      total_spend:
        round2(
          totalSpend
        ),

      total_gmv:
        round2(
          totalGmv
        ),

      total_orders:
        totalOrders,

      overall_roas:
        round2(
          overallRoas
        ),

      best_roas_campaign:
        bestRoasCampaign
          ? {
              campaign_id:
                bestRoasCampaign.campaign_id,

              ad_name:
                bestRoasCampaign.ad_name,

              roas:
                bestRoasCampaign.roas,

              spend:
                bestRoasCampaign.spend,

              gmv:
                bestRoasCampaign.gmv,

              orders:
                bestRoasCampaign.orders
            }
          : null
    },


    campaigns

  });
}
// =========================================================
// PRIVATE SHOPEE GMV MAX ITEM PERFORMANCE
// Used only by brazacommerce-app
// =========================================================
if (
  url.pathname ===
  "/internal/shopee/ads/gms-items"
) {

  const authorized =
    await validateInternalApp(
      request,
      env
    );

  if (!authorized) {
    return json({
      error: "Unauthorized"
    }, 401);
  }


  // -------------------------------------------------------
  // Connected Shopee shop
  // -------------------------------------------------------
  const shopsResult =
    await gatewayRequest(
      env,
      "/api/shopee/shops",
      "GET"
    );


  if (!shopsResult.ok) {
    return json({
      error:
        "Unable to retrieve Shopee connections"
    }, 502);
  }


  const connections =
    Array.isArray(
      shopsResult.body?.connections
    )
      ? shopsResult.body.connections
      : [];


  const shop =
    connections.find(
      item =>
        item.principal_type === "shop"
    );


  if (!shop) {
    return json({
      status: "not_connected",
      connected: false
    });
  }


  // -------------------------------------------------------
  // Analysis period
  // -------------------------------------------------------
  const startDate =
    url.searchParams.get(
      "start_date"
    ) ||
    saoPauloDate(-6);


  const endDate =
    url.searchParams.get(
      "end_date"
    ) ||
    saoPauloDate(0);


  // Current GMV Max campaign discovered in Shopee.
  const campaignId =
    url.searchParams.get(
      "campaign_id"
    ) ||
    "111751326";


  const params =
    new URLSearchParams({

      shop_id:
        String(
          shop.principal_id
        ),

      campaign_id:
        String(
          campaignId
        ),

      start_date:
        startDate,

      end_date:
        endDate
    });


  // -------------------------------------------------------
  // Gateway
  // -------------------------------------------------------
  const result =
    await gatewayRequest(
      env,
      "/api/shopee/ads/gms-items-summary?"
        + params.toString(),
      "GET"
    );


  if (!result.ok) {
    return json({

      status:
        "gms_item_api_error",

      connected:
        true,

      error:
        result.body?.error ||
        "Unable to retrieve GMV Max items",

      message:
        result.body?.message ||
        ""

    }, 502);
  }


  const response =
    result.body?.response || {};


  const rawItems =
    Array.isArray(
      response.items
    )
      ? response.items
      : [];


  // -------------------------------------------------------
  // Clean result
  // -------------------------------------------------------
  const items =
    rawItems.map(
      item => ({

        item_id:
          item.item_id,

        item_name:
          String(
            item.item_name ||
            ""
          ),

        item_sku:
          String(
            item.item_sku ||
            ""
          ),

        item_status:
          String(
            item.item_status ||
            ""
          ),

        spend:
          round2(
            toNumber(
              item.spend
            )
          ),

        gmv:
          round2(
            toNumber(
              item.gmv
            )
          ),

        roas:
          round2(
            toNumber(
              item.roas
            )
          ),

        orders:
          toNumber(
            item.orders
          ),

        clicks:
          toNumber(
            item.clicks
          ),

        impressions:
          toNumber(
            item.impressions
          ),

        ctr:
          round4(
            toNumber(
              item.ctr
            )
          )

      })
    );


  // -------------------------------------------------------
  // Additional intelligence
  // -------------------------------------------------------
  const itemsWithOrders =
    items.filter(
      item =>
        item.orders > 0
    );


  const itemsWithSpend =
    items.filter(
      item =>
        item.spend > 0
    );


  const lowEvidenceNoOrders =
    items.filter(
      item =>
        item.spend > 0 &&
        item.orders === 0 &&
        item.spend < 10
    );


  const meaningfulSpendNoOrders =
    items.filter(
      item =>
        item.spend >= 10 &&
        item.orders === 0
    );


  const bestItem =
    [...itemsWithOrders]
      .filter(
        item =>
          item.spend > 0
      )
      .sort(
        (a, b) =>
          b.roas - a.roas
      )[0] || null;


  return json({

    status: "ok",

    connected: true,


    shop: {
      id:
        shop.principal_id,

      token_status:
        shop.access_token_status
    },


    campaign: {
      id:
        Number(
          campaignId
        ),

      type:
        "gms"
    },


    period: {
      start_date:
        startDate,

      end_date:
        endDate
    },


    summary: {

      item_count:
        toNumber(
          response.item_count
        ),

      items_with_spend:
        itemsWithSpend.length,

      items_with_orders:
        itemsWithOrders.length,

      low_evidence_no_orders:
        lowEvidenceNoOrders.length,

      meaningful_spend_no_orders:
        meaningfulSpendNoOrders.length,

      spend:
        round2(
          toNumber(
            response.spend
          )
        ),

      gmv:
        round2(
          toNumber(
            response.gmv
          )
        ),

      orders:
        toNumber(
          response.orders
        ),

      clicks:
        toNumber(
          response.clicks
        ),

      impressions:
        toNumber(
          response.impressions
        ),

      roas:
        round2(
          toNumber(
            response.roas
          )
        ),

      best_item:
        bestItem
          ? {
              item_id:
                bestItem.item_id,

              item_name:
                bestItem.item_name,

              spend:
                bestItem.spend,

              gmv:
                bestItem.gmv,

              roas:
                bestItem.roas,

              orders:
                bestItem.orders
            }
          : null
    },


    items

  });
}
// =========================================================
// INTERNAL SHOPEE ADS - OPPORTUNITIES
// READ ONLY
// =========================================================
if (
  url.pathname ===
  "/internal/shopee/ads/opportunities"
) {

  const authorized =
    await validateInternalApp(
      request,
      env
    );

  if (!authorized) {
    return json(
      {
        error: "Unauthorized"
      },
      401
    );
  }


  // -------------------------------------------------------
  // Discover connected Shopee shop
  // -------------------------------------------------------

  const shopsResult =
    await gatewayRequest(
      env,
      "/api/shopee/shops",
      "GET"
    );


  if (!shopsResult.ok) {
    return json(
      {
        status: "gateway_error",
        connected: false,
        error:
          "Unable to retrieve Shopee connections"
      },
      502
    );
  }


  const connections =
    Array.isArray(
      shopsResult.body?.connections
    )
      ? shopsResult.body.connections
      : [];


  const shop =
    connections.find(
      item =>
        item.principal_type === "shop"
    );


  if (!shop) {
    return json({
      status: "not_connected",
      connected: false,
      items: []
    });
  }


  const shopId =
    Number(
      shop.principal_id
    );


  // =======================================================
  // DETAIL MODE
  // =======================================================

  const itemIdRaw =
    url.searchParams.get(
      "item_id"
    );


  if (itemIdRaw) {

    const itemId =
      Number(
        itemIdRaw
      );


    if (
      !Number.isFinite(itemId) ||
      itemId <= 0
    ) {
      return json(
        {
          error:
            "Invalid item_id"
        },
        400
      );
    }


    const params =
      new URLSearchParams({
        shop_id:
          String(shopId),

        item_id:
          String(itemId)
      });


    const roasTarget =
      url.searchParams.get(
        "roas_target"
      );


    const inputKeyword =
      url.searchParams.get(
        "input_keyword"
      );


    if (roasTarget) {
      params.set(
        "roas_target",
        roasTarget
      );
    }


    if (inputKeyword) {
      params.set(
        "input_keyword",
        inputKeyword
      );
    }


    const detail =
      await gatewayRequest(
        env,
        "/api/shopee/ads/opportunity-detail?"
          + params.toString(),
        "GET"
      );


    if (!detail.ok) {
      return json(
        {
          status:
            "opportunity_detail_error",

          connected: true,

          item_id:
            itemId,

          error:
            detail.body?.error ||
            "Unable to retrieve opportunity detail",

          message:
            detail.body?.message ||
            ""
        },
        502
      );
    }


    const response =
      detail.body?.response || {};


    return json({

      status: "ok",

      connected: true,

      mode: "detail",

      shop: {
        id: shopId
      },

      item_id:
        itemId,

      product:
        response.product ||
        null,

      keywords:
        Array.isArray(
          response.keywords
        )
          ? response.keywords
          : [],

      roi:
        response.roi || {},

      budget:
        response.budget || {},

      sources:
        response.sources || {},

      error: "",
      message: ""
    });
  }


  // =======================================================
  // LIST MODE
  // =======================================================

  const recommendedResult =
    await gatewayRequest(
      env,
      "/api/shopee/ads/recommended-items"
        + "?shop_id="
        + encodeURIComponent(
            String(shopId)
          ),
      "GET"
    );


  // -------------------------------------------------------
  // Graceful degradation
  // -------------------------------------------------------

  if (!recommendedResult.ok) {

    return json({

      status: "degraded",

      connected: true,

      mode: "list",

      shop: {
        id: shopId
      },

      item_count: 0,

      items: [],

      sources: {
        recommended_items: {
          ok: false,
          status:
            recommendedResult.status
        },

        catalog: {
          ok: false,
          status: null
        }
      },

      error:
        recommendedResult.body?.error ||
        "",

      message:
        recommendedResult.body?.message ||
        ""
    });
  }


  // Shopee schema normally returns response as array.
  // Keep compatibility with possible wrapped formats.

  let recommendedItems = [];


  if (
    Array.isArray(
      recommendedResult.body?.response
    )
  ) {

    recommendedItems =
      recommendedResult.body.response;

  } else if (
    Array.isArray(
      recommendedResult.body
        ?.response
        ?.item_list
    )
  ) {

    recommendedItems =
      recommendedResult.body
        .response
        .item_list;
  }


  // -------------------------------------------------------
  // Unique item IDs
  // Maximum 50 per product API request
  // -------------------------------------------------------

  const itemIds =
    [
      ...new Set(
        recommendedItems
          .map(
            item =>
              Number(
                item.item_id
              )
          )
          .filter(
            itemId =>
              Number.isFinite(
                itemId
              ) &&
              itemId > 0
          )
      )
    ]
    .slice(
      0,
      50
    );


  let catalogItems = [];

  let catalogSource = {
    ok: true,
    status: 200
  };


  if (itemIds.length) {

    const catalogParams =
      new URLSearchParams({

        shop_id:
          String(shopId),

        item_ids:
          itemIds.join(",")
      });


    const catalogResult =
      await gatewayRequest(
        env,
        "/api/shopee/catalog/items?"
          + catalogParams.toString(),
        "GET"
      );


    catalogSource = {
      ok:
        catalogResult.ok,

      status:
        catalogResult.status
    };


    if (catalogResult.ok) {

      catalogItems =
        Array.isArray(
          catalogResult.body
            ?.response
            ?.items
        )
          ? catalogResult.body
              .response
              .items
          : [];
    }
  }


  // -------------------------------------------------------
  // Product lookup
  // -------------------------------------------------------

  const catalogById =
    new Map();


  for (
    const product of catalogItems
  ) {

    catalogById.set(
      Number(
        product.item_id
      ),
      product
    );
  }


  // -------------------------------------------------------
  // Clean / normalized opportunities
  // -------------------------------------------------------

  const items =
    recommendedItems.map(
      item => {

        const itemId =
          Number(
            item.item_id
          );


        const product =
          catalogById.get(
            itemId
          ) || {};


        return {

          item_id:
            itemId,

          item_name:
            String(
              product.item_name ||
              ""
            ),

          item_sku:
            String(
              product.item_sku ||
              ""
            ),

          item_status:
            String(
              product.item_status ||
              ""
            ),

          item_status_list:
            Array.isArray(
              item.item_status_list
            )
              ? item.item_status_list
              : [],

          sku_tag_list:
            Array.isArray(
              item.sku_tag_list
            )
              ? item.sku_tag_list
              : [],

          ongoing_ad_type_list:
            Array.isArray(
              item.ongoing_ad_type_list
            )
              ? item.ongoing_ad_type_list
              : []
        };
      }
    );


  return json({

    status:
      catalogSource.ok
        ? "ok"
        : "degraded",

    connected: true,

    mode: "list",

    shop: {
      id: shopId
    },

    item_count:
      items.length,

    items,

    sources: {

      recommended_items: {
        ok: true,
        status:
          recommendedResult.status
      },

      catalog:
        catalogSource
    },

    error: "",
    message: ""
  });
}
      // =========================================================
      // PUBLIC SHOP STATUS BLOCKED
      // =========================================================
      if (
        url.pathname ===
        "/shopee/status"
      ) {

        return json({
          status: "protected"
        }, 403);
      }


      // =========================================================
      // SHOPEE LIVE AUTHORIZATION
      // =========================================================
      if (
        url.pathname ===
        "/shopee/connect"
      ) {

        validateProductionEnvironment(
          env
        );


        const state =
          await createOAuthState(
            env.SHOPEE_OAUTH_STATE_SECRET
          );


        const authUrl =
          new URL(
            "https://open.shopee.com.br/auth"
          );


        authUrl.searchParams.set(
          "partner_id",
          String(
            env.SHOPEE_LIVE_PARTNER_ID
          )
        );


        authUrl.searchParams.set(
          "auth_type",
          "seller"
        );


        authUrl.searchParams.set(
          "redirect_uri",
          env.SHOPEE_REDIRECT_URI
        );


        authUrl.searchParams.set(
          "response_type",
          "code"
        );


        authUrl.searchParams.set(
          "state",
          state
        );


        return new Response(
          null,
          {
            status: 302,

            headers: {

              "Location":
                authUrl.toString(),

              "Set-Cookie":
                `shopee_oauth_state=${state}; ` +
                `Path=/shopee/callback; ` +
                `HttpOnly; Secure; SameSite=Lax; ` +
                `Max-Age=600`,

              "Cache-Control":
                "no-store"
            }
          }
        );
      }


      // =========================================================
      // SHOPEE CALLBACK
      // =========================================================
      if (
        url.pathname ===
        "/shopee/callback"
      ) {

        validateProductionEnvironment(
          env
        );


        const clearCookie =
          "shopee_oauth_state=; " +
          "Path=/shopee/callback; " +
          "HttpOnly; Secure; SameSite=Lax; " +
          "Max-Age=0";


        // -------------------------------------------------------
        // OAuth error
        // -------------------------------------------------------
        const oauthError =
          url.searchParams.get(
            "error"
          );


        if (oauthError) {

          return htmlPage(
            "Shopee Authorization",
            `
              <div class="status error">
                Authorization Failed
              </div>

              <p>
                Shopee did not authorize
                the seller account.
              </p>

              <div class="box">
                <strong>Error</strong>
                <span>
                  ${escapeHtml(
                    oauthError
                  )}
                </span>
              </div>

              <a
                class="button secondary"
                href="https://app.brazacommerce.com.br/integrations"
              >
                Return to Integrations
              </a>
            `,
            400,
            {
              "Set-Cookie":
                clearCookie
            }
          );
        }


        // -------------------------------------------------------
        // Validate state
        // -------------------------------------------------------
        const returnedState =
          url.searchParams.get(
            "state"
          ) || "";


        const storedState =
          getCookie(
            request,
            "shopee_oauth_state"
          );


        const stateValid =
          storedState &&
          returnedState &&
          await safeEqual(
            storedState,
            returnedState
          ) &&
          await verifyOAuthState(
            returnedState,
            env.SHOPEE_OAUTH_STATE_SECRET
          );


        if (!stateValid) {

          return htmlPage(
            "Shopee Authorization",
            `
              <div class="status error">
                Security Validation Failed
              </div>

              <p>
                The authorization state could
                not be validated.
              </p>

              <p>
                Please start the Shopee
                connection again.
              </p>

              <a
                class="button"
                href="/shopee/connect"
              >
                Try Again
              </a>
            `,
            400,
            {
              "Set-Cookie":
                clearCookie
            }
          );
        }


        // -------------------------------------------------------
        // Authorization code
        // -------------------------------------------------------
        const code =
          url.searchParams.get(
            "code"
          );


        if (!code) {

          return htmlPage(
            "Shopee Authorization",
            `
              <div class="status error">
                Missing Authorization Code
              </div>

              <p>
                Shopee did not return an
                authorization code.
              </p>
            `,
            400,
            {
              "Set-Cookie":
                clearCookie
            }
          );
        }


        // -------------------------------------------------------
        // Account identifiers returned by callback
        // -------------------------------------------------------
        const shopId =
          url.searchParams.get(
            "shop_id"
          );


        const mainAccountId =
          url.searchParams.get(
            "main_account_id"
          );


        // -------------------------------------------------------
        // Token exchange through gateway
        // -------------------------------------------------------
        const body = {
          code
        };


        if (shopId) {
          body.shop_id =
            Number(
              shopId
            );
        }


        if (mainAccountId) {
          body.main_account_id =
            Number(
              mainAccountId
            );
        }


        const result =
          await gatewayRequest(
            env,
            "/api/shopee/token",
            "POST",
            body
          );


        if (!result.ok) {

          const errorName =
            result.body?.error ||
            "token_exchange_failed";


          const message =
            result.body?.message ||
            "Unable to complete Shopee authorization.";


          const requestId =
            result.body?.request_id ||
            "";


          return htmlPage(
            "Shopee Authorization",
            `
              <div class="status error">
                Token Exchange Failed
              </div>

              <p>
                Shopee authorization reached
                MLS Commerce Ads, but the
                production token could not
                be created.
              </p>

              <div class="box">
                <strong>Error</strong>
                <span>
                  ${escapeHtml(
                    errorName
                  )}
                </span>
              </div>

              <div class="box">
                <strong>Message</strong>
                <span>
                  ${escapeHtml(
                    message
                  )}
                </span>
              </div>

              ${
                requestId
                  ? `
                    <div class="box">
                      <strong>
                        Request ID
                      </strong>

                      <span>
                        ${escapeHtml(
                          requestId
                        )}
                      </span>
                    </div>
                  `
                  : ""
              }

              <a
                class="button"
                href="/shopee/connect"
              >
                Try Again
              </a>
            `,
            502,
            {
              "Set-Cookie":
                clearCookie
            }
          );
        }


        // -------------------------------------------------------
        // SUCCESS
        // -------------------------------------------------------
        const principalType =
          result.body
            ?.principal_type ||
          "shop";


        const principalId =
          result.body
            ?.principal_id ||
          shopId ||
          mainAccountId ||
          "";


        return htmlPage(
          "Shopee Connected",
          `
            <div class="status ok">
              Authorization Successful
            </div>

            <p>
              The Shopee seller account
              is now securely connected
              to MLS Commerce Ads.
            </p>

            <div class="box">
              <strong>
                Account Type
              </strong>

              <span>
                ${escapeHtml(
                  String(
                    principalType
                  )
                )}
              </span>
            </div>

            <div class="box">
              <strong>
                Account ID
              </strong>

              <span>
                ${escapeHtml(
                  String(
                    principalId
                  )
                )}
              </span>
            </div>

            <div class="box">
              <strong>
                Token Storage
              </strong>

              <span>
                Encrypted and stored
                on the BrazaCommerce gateway
              </span>
            </div>

            <a
              class="button"
              href="https://app.brazacommerce.com.br/integrations"
            >
              Return to MLS Commerce Ads
            </a>
          `,
          200,
          {
            "Set-Cookie":
              clearCookie
          }
        );
      }


      // =========================================================
      // NOT FOUND
      // =========================================================
      return json({
        error:
          "Not Found"
      }, 404);


    } catch (error) {

      console.error(
        "BrazaCommerce Auth error:",
        error
      );


      return htmlPage(
        "Service Error",
        `
          <div class="status error">
            Internal Service Error
          </div>

          <p>
            The authorization service
            could not complete this request.
          </p>
        `,
        500
      );
    }
  }
};


// =============================================================
// INTERNAL APP AUTHENTICATION
// =============================================================

async function validateInternalApp(
  request,
  env
) {

  const suppliedKey =
    request.headers.get(
      "X-Braza-App-Key"
    ) || "";


  if (
    !env.APP_INTERNAL_SECRET ||
    !suppliedKey
  ) {
    return false;
  }


  return await safeEqual(
    suppliedKey,
    env.APP_INTERNAL_SECRET
  );
}


// =============================================================
// PRODUCTION ENVIRONMENT VALIDATION
// =============================================================

function validateProductionEnvironment(
  env
) {

  if (
    !env.SHOPEE_LIVE_PARTNER_ID
  ) {
    throw new Error(
      "SHOPEE_LIVE_PARTNER_ID is not configured"
    );
  }


  if (
    !env.SHOPEE_REDIRECT_URI
  ) {
    throw new Error(
      "SHOPEE_REDIRECT_URI is not configured"
    );
  }


  if (
    !env.SHOPEE_OAUTH_STATE_SECRET
  ) {
    throw new Error(
      "SHOPEE_OAUTH_STATE_SECRET is not configured"
    );
  }


  if (!env.GATEWAY_URL) {
    throw new Error(
      "GATEWAY_URL is not configured"
    );
  }


  if (
    !env.GATEWAY_SHARED_SECRET
  ) {
    throw new Error(
      "GATEWAY_SHARED_SECRET is not configured"
    );
  }
}


// =============================================================
// GATEWAY REQUEST
// =============================================================

async function gatewayRequest(
  env,
  pathname,
  method = "GET",
  body = null
) {

  if (!env.GATEWAY_URL) {
    return {
      ok: false,
      status: 500,
      body: {
        error:
          "GATEWAY_URL missing"
      }
    };
  }


  if (
    !env.GATEWAY_SHARED_SECRET
  ) {
    return {
      ok: false,
      status: 500,
      body: {
        error:
          "GATEWAY_SHARED_SECRET missing"
      }
    };
  }


  const gatewayUrl =
    normalizeGatewayUrl(
      env.GATEWAY_URL
    );


  const headers = {

    "X-Braza-Gateway-Key":
      env.GATEWAY_SHARED_SECRET,

    "Accept":
      "application/json",

    "User-Agent":
      "BrazaCommerce-Auth-Worker"

  };


  const options = {
    method,
    headers
  };


  if (
    body !== null
  ) {

    headers[
      "Content-Type"
    ] =
      "application/json";


    options.body =
      JSON.stringify(
        body
      );
  }


  try {

    const response =
      await fetch(
        gatewayUrl +
        pathname,
        options
      );


    return {
      ok:
        response.ok,

      status:
        response.status,

      body:
        await safeJson(
          response
        )
    };

  } catch (error) {

    return {
      ok: false,

      status: 502,

      body: {
        error:
          "gateway_connection_error",

        message:
          "Unable to reach BrazaCommerce gateway"
      }
    };
  }
}


// =============================================================
// OAUTH STATE
// =============================================================

async function createOAuthState(
  secret
) {

  if (!secret) {
    throw new Error(
      "OAuth state secret missing"
    );
  }


  const timestamp =
    Math.floor(
      Date.now() / 1000
    );


  const randomBytes =
    crypto.getRandomValues(
      new Uint8Array(24)
    );


  const nonce =
    bytesToBase64Url(
      randomBytes
    );


  const payload =
    `${timestamp}.${nonce}`;


  const signature =
    await hmacHex(
      secret,
      payload
    );


  return (
    `${payload}.${signature}`
  );
}


async function verifyOAuthState(
  token,
  secret
) {

  try {

    const parts =
      token.split(".");


    if (
      parts.length !== 3
    ) {
      return false;
    }


    const timestamp =
      Number(
        parts[0]
      );


    const nonce =
      parts[1];


    const receivedSignature =
      parts[2];


    if (
      !Number.isInteger(
        timestamp
      ) ||
      !nonce ||
      !receivedSignature
    ) {
      return false;
    }


    const now =
      Math.floor(
        Date.now() / 1000
      );


    // 10 minutes validity
    if (
      timestamp > now + 60 ||
      now - timestamp > 600
    ) {
      return false;
    }


    const payload =
      `${timestamp}.${nonce}`;


    const expectedSignature =
      await hmacHex(
        secret,
        payload
      );


    return await safeEqual(
      receivedSignature,
      expectedSignature
    );

  } catch {
    return false;
  }
}


async function hmacHex(
  secret,
  value
) {

  const encoder =
    new TextEncoder();


  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(
        secret
      ),
      {
        name:
          "HMAC",

        hash:
          "SHA-256"
      },
      false,
      ["sign"]
    );


  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(
        value
      )
    );


  return Array.from(
    new Uint8Array(
      signature
    )
  )
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(
            2,
            "0"
          )
    )
    .join("");
}


// =============================================================
// CONSTANT-TIME COMPARISON
// =============================================================

async function safeEqual(
  a,
  b
) {

  const encoder =
    new TextEncoder();


  const aBytes =
    encoder.encode(
      String(a)
    );


  const bBytes =
    encoder.encode(
      String(b)
    );


  if (
    aBytes.length !==
    bBytes.length
  ) {
    return false;
  }


  let result = 0;


  for (
    let i = 0;
    i < aBytes.length;
    i++
  ) {
    result |=
      aBytes[i] ^
      bBytes[i];
  }


  return result === 0;
}


// =============================================================
// COOKIE
// =============================================================

function getCookie(
  request,
  name
) {

  const cookieHeader =
    request.headers.get(
      "Cookie"
    ) || "";


  const cookies =
    cookieHeader.split(
      ";"
    );


  for (
    const cookie of cookies
  ) {

    const index =
      cookie.indexOf(
        "="
      );


    if (
      index < 0
    ) {
      continue;
    }


    const key =
      cookie
        .slice(
          0,
          index
        )
        .trim();


    const value =
      cookie
        .slice(
          index + 1
        )
        .trim();


    if (
      key === name
    ) {
      return value;
    }
  }


  return "";
}


// =============================================================
// DATE HELPERS
// =============================================================

function saoPauloDate(
  offsetDays = 0
) {

  const date =
    new Date(
      Date.now() +
      (
        offsetDays *
        24 *
        60 *
        60 *
        1000
      )
    );


  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/Sao_Paulo",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit"
      }
    )
    .formatToParts(
      date
    );


  const values = {};


  for (
    const part of parts
  ) {

    values[
      part.type
    ] =
      part.value;
  }


  return (
    values.day +
    "-" +
    values.month +
    "-" +
    values.year
  );
}


// =============================================================
// NUMBER HELPERS
// =============================================================

function toNumber(
  value
) {

  const parsed =
    Number(
      value
    );


  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}


function round2(
  value
) {

  return Math.round(
    (
      Number(value) +
      Number.EPSILON
    ) * 100
  ) / 100;
}


function round4(
  value
) {

  return Math.round(
    (
      Number(value) +
      Number.EPSILON
    ) * 10000
  ) / 10000;
}


// =============================================================
// GENERAL HELPERS
// =============================================================

function normalizeGatewayUrl(
  value
) {

  return String(
    value || ""
  )
    .replace(
      /\/+$/,
      ""
    );
}


async function safeJson(
  response
) {

  const text =
    await response.text();


  try {

    return JSON.parse(
      text
    );

  } catch {

    return {
      raw:
        text
    };
  }
}


function bytesToBase64Url(
  bytes
) {

  let binary = "";


  for (
    const byte of bytes
  ) {

    binary +=
      String.fromCharCode(
        byte
      );
  }


  return btoa(
    binary
  )
    .replace(
      /\+/g,
      "-"
    )
    .replace(
      /\//g,
      "_"
    )
    .replace(
      /=+$/,
      ""
    );
}


// =============================================================
// JSON RESPONSE
// =============================================================

function json(
  data,
  status = 200
) {

  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,

      headers: {

        "Content-Type":
          "application/json; charset=UTF-8",

        "Cache-Control":
          "no-store",

        "X-Content-Type-Options":
          "nosniff",

        "X-Frame-Options":
          "DENY",

        "Referrer-Policy":
          "no-referrer"

      }
    }
  );
}


// =============================================================
// HTML PAGE
// =============================================================

function htmlPage(
  title,
  content,
  status = 200,
  extraHeaders = {}
) {

  const headers = {

    "Content-Type":
      "text/html; charset=UTF-8",

    "Cache-Control":
      "no-store",

    "X-Content-Type-Options":
      "nosniff",

    "X-Frame-Options":
      "DENY",

    "Referrer-Policy":
      "no-referrer",

    "Content-Security-Policy":
      "default-src 'none'; " +
      "style-src 'unsafe-inline'; " +
      "base-uri 'none'; " +
      "frame-ancestors 'none';",

    ...extraHeaders

  };


  return new Response(
`<!doctype html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>
${escapeHtml(title)}
</title>

<style>

*{
  box-sizing:border-box;
}

body{
  margin:0;
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:30px;
  font-family:
    Inter,
    Arial,
    sans-serif;
  background:#f5f7fb;
  color:#111827;
}

.container{
  width:100%;
  max-width:620px;
  background:#fff;
  border:1px solid #e5e7eb;
  border-radius:14px;
  padding:36px;
  box-shadow:
    0 12px 35px
    rgba(0,0,0,.07);
}

.logo{
  font-size:22px;
  font-weight:800;
  margin-bottom:30px;
}

.logo span{
  color:#ee4d2d;
}

h1{
  margin:0 0 20px;
  font-size:27px;
}

p{
  color:#4b5563;
  line-height:1.7;
}

.status{
  display:inline-block;
  padding:8px 12px;
  margin-bottom:18px;
  border-radius:20px;
  font-size:13px;
  font-weight:700;
}

.status.ok{
  background:#dcfce7;
  color:#166534;
}

.status.waiting{
  background:#fef3c7;
  color:#92400e;
}

.status.error{
  background:#fee2e2;
  color:#991b1b;
}

.box{
  border:1px solid #e5e7eb;
  border-radius:9px;
  padding:15px;
  margin:12px 0;
}

.box strong{
  display:block;
  margin-bottom:5px;
}

.box span{
  color:#6b7280;
  font-size:14px;
  overflow-wrap:anywhere;
}

.button{
  display:inline-block;
  background:#ee4d2d;
  color:#fff;
  text-decoration:none;
  padding:12px 18px;
  border-radius:8px;
  font-weight:700;
  margin-top:12px;
}

.button.secondary{
  background:#111827;
}

</style>

</head>

<body>

<div class="container">

<div class="logo">
MLS Commerce <span>Ads</span>
</div>

<h1>
${escapeHtml(title)}
</h1>

${content}

</div>

</body>

</html>`,
    {
      status,
      headers
    }
  );
}


// =============================================================
// ESCAPE HTML
// =============================================================

function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}