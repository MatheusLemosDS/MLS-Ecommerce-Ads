export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        service: "MLS Commerce Ads",
        status: "online",
        version: "0.9.1"
      });
    }

    if (url.pathname === "/logout") {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          "Set-Cookie":
            "mls_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
        }
      });
    }

    if (
      url.pathname === "/login" &&
      request.method === "POST"
    ) {
      const form =
        await request.formData();

      const username =
        String(
          form.get("username") ||
          ""
        );

      const password =
        String(
          form.get("password") ||
          ""
        );

      const userOK =
        await safeEqual(
          username,
          env.REVIEW_USERNAME ||
          ""
        );

      const passOK =
        await safeEqual(
          password,
          env.REVIEW_PASSWORD ||
          ""
        );

      if (
        !userOK ||
        !passOK
      ) {
        return html(
          loginPage(true),
          401
        );
      }

      const expires =
        Math.floor(
          Date.now() / 1000
        ) +
        (
          60 *
          60 *
          8
        );

      const payload =
        base64UrlEncode(
          JSON.stringify({
            user: username,
            exp: expires
          })
        );

      const signature =
        await sign(
          payload,
          env.SESSION_SECRET
        );

      const token =
        payload +
        "." +
        signature;

      return new Response(
        null,
        {
          status: 302,

          headers: {
            Location:
              "/dashboard",

            "Set-Cookie":
              `mls_session=${token}; ` +
              `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`
          }
        }
      );
    }

    const protectedPages = [
      "/dashboard",
      "/advertising",
      "/campaigns",
      "/gmv-max",
      "/opportunities",
      "/performance",
      "/optimization",
      "/integrations"
    ];

    if (
      protectedPages.includes(
        url.pathname
      )
    ) {
      const authenticated =
        await isAuthenticated(
          request,
          env
        );

      if (!authenticated) {
        return Response.redirect(
          url.origin + "/",
          302
        );
      }

      const config = {
        targetRoas:
          safePositiveNumber(
            env.OPT_TARGET_ROAS,
            5
          ),

        minSpend:
          safePositiveNumber(
            env.OPT_MIN_SPEND,
            10
          ),

        minCoverage:
          safePositiveNumber(
            env.OPT_MIN_COVERAGE,
            95
          ),

        unitCost:
          safePositiveNumber(
            env.ECON_UNIT_COST,
            15.90
          ),

        netPayout:
          safePositiveNumber(
            env.ECON_NET_PAYOUT,
            24.77
          ),

        maxAdShareOfMargin:
          safeFraction(
            env.ECON_MAX_AD_SHARE_OF_MARGIN,
            0.40
          )
      };

      const [
        shopee,
        ads,
        campaigns,
        gms
      ] =
        await Promise.all([
          getShopeeStatus(env),
          getAdsSummary(env),
          getCampaignSummary(env),
          getGmsItems(env)
        ]);

      let opportunities =
        null;

      let opportunityDetail =
        null;

      if (
        url.pathname ===
        "/opportunities"
      ) {
        const selectedItemId =
          url.searchParams.get(
            "item_id"
          );

        const tasks = [
          getOpportunities(env)
        ];

        if (selectedItemId) {
          tasks.push(
            getOpportunityDetail(
              env,
              selectedItemId,
              config.targetRoas
            )
          );
        }

        const values =
          await Promise.all(
            tasks
          );

        opportunities =
          values[0];

        opportunityDetail =
          values[1] ||
          null;
      }

      const coverage =
        calculateCoverage(
          ads,
          campaigns,
          gms,
          config
        );

      const campaignFilter =
        url.searchParams.get(
          "filter"
        ) ||
        "all";

      return html(
        appPage(
          url.pathname,
          shopee,
          ads,
          campaigns,
          gms,
          coverage,
          campaignFilter,
          config,
          opportunities,
          opportunityDetail
        )
      );
    }

    if (
      url.pathname ===
      "/"
    ) {
      const authenticated =
        await isAuthenticated(
          request,
          env
        );

      if (authenticated) {
        return Response.redirect(
          url.origin +
          "/dashboard",
          302
        );
      }

      return html(
        loginPage(false)
      );
    }

    return new Response(
      "Not Found",
      {
        status: 404,

        headers: {
          "content-type":
            "text/plain; charset=UTF-8"
        }
      }
    );
  }
};


// ============================================================
// INTERNAL REQUEST
// ============================================================

async function internalRequest(
  env,
  pathname
) {
  if (
    !env.APP_INTERNAL_SECRET
  ) {
    return {
      ok: false,

      status: 500,

      body: {
        error:
          "APP_INTERNAL_SECRET is not configured"
      }
    };
  }

  try {
    const response =
      await fetch(
        "https://auth.brazacommerce.com.br" +
        pathname,
        {
          method:
            "GET",

          headers: {
            "X-Braza-App-Key":
              env.APP_INTERNAL_SECRET,

            Accept:
              "application/json",

            "User-Agent":
              "MLS-Commerce-Ads-App"
          }
        }
      );

    return {
      ok:
        response.ok,

      status:
        response.status,

      body:
        await safeJsonResponse(
          response
        )
    };

  } catch {
    return {
      ok: false,

      status: 502,

      body: {
        error:
          "Unable to reach authorization service"
      }
    };
  }
}


// ============================================================
// SHOPEE STATUS
// ============================================================

async function getShopeeStatus(
  env
) {
  const result =
    await internalRequest(
      env,
      "/internal/shopee/status"
    );

  if (!result.ok) {
    return {
      ok: false,

      connected: false,

      error:
        result.body?.error ||
        "Shopee status unavailable"
    };
  }

  const connections =
    Array.isArray(
      result.body?.connections
    )
      ? result.body.connections
      : [];

  const primary =
    connections.find(
      item =>
        item.principal_type ===
        "shop"
    ) ||
    connections[0] ||
    null;

  return {
    ok: true,

    connected:
      connections.length > 0,

    connections,

    primary
  };
}


// ============================================================
// ADS SUMMARY
// ============================================================

async function getAdsSummary(
  env
) {
  const result =
    await internalRequest(
      env,
      "/internal/shopee/ads/summary"
    );

  if (!result.ok) {
    return {
      ok: false,

      connected:
        result.body
          ?.connected ===
        true,

      error:
        result.body?.error ||
        "Unable to retrieve Ads data",

      message:
        result.body?.message ||
        ""
    };
  }

  const data =
    result.body ||
    {};

  return {
    ok: true,

    connected:
      data.connected ===
      true,

    shop:
      data.shop ||
      null,

    period:
      data.period ||
      null,

    balance:
      data.balance ??
      null,

    metrics:
      data.metrics ||
      {},

    daily:
      Array.isArray(
        data.daily
      )
        ? data.daily
        : []
  };
}


// ============================================================
// CAMPAIGNS
// ============================================================

async function getCampaignSummary(
  env
) {
  const result =
    await internalRequest(
      env,
      "/internal/shopee/ads/campaigns"
    );

  if (!result.ok) {
    return {
      ok: false,

      connected:
        result.body
          ?.connected ===
        true,

      error:
        result.body?.error ||
        "Unable to retrieve campaigns",

      message:
        result.body?.message ||
        ""
    };
  }

  const data =
    result.body ||
    {};

  return {
    ok: true,

    connected:
      data.connected ===
      true,

    shop:
      data.shop ||
      null,

    period:
      data.period ||
      null,

    summary:
      data.summary ||
      {},

    campaigns:
      Array.isArray(
        data.campaigns
      )
        ? data.campaigns
        : []
  };
}


// ============================================================
// GMV MAX
// ============================================================

async function getGmsItems(
  env
) {
  const result =
    await internalRequest(
      env,
      "/internal/shopee/ads/gms-items"
    );

  if (!result.ok) {
    return {
      ok: false,

      connected:
        result.body
          ?.connected ===
        true,

      error:
        result.body?.error ||
        "Unable to retrieve GMV Max data",

      message:
        result.body?.message ||
        ""
    };
  }

  const data =
    result.body ||
    {};

  return {
    ok: true,

    connected:
      data.connected ===
      true,

    shop:
      data.shop ||
      null,

    campaign:
      data.campaign ||
      null,

    period:
      data.period ||
      null,

    summary:
      data.summary ||
      {},

    items:
      Array.isArray(
        data.items
      )
        ? data.items
        : []
  };
}


// ============================================================
// OPPORTUNITIES
// ============================================================

async function getOpportunities(
  env
) {
  const result =
    await internalRequest(
      env,
      "/internal/shopee/ads/opportunities"
    );

  if (!result.ok) {
    return {
      ok: false,

      status:
        "error",

      connected:
        result.body
          ?.connected ===
        true,

      error:
        result.body?.error ||
        "Unable to retrieve opportunities",

      message:
        result.body?.message ||
        "",

      items: [],

      sources: {}
    };
  }

  const data =
    result.body ||
    {};

  return {
    ok: true,

    status:
      data.status ||
      "ok",

    connected:
      data.connected ===
      true,

    shop:
      data.shop ||
      null,

    item_count:
      number(
        data.item_count
      ),

    items:
      Array.isArray(
        data.items
      )
        ? data.items
        : [],

    sources:
      data.sources ||
      {},

    error:
      data.error ||
      "",

    message:
      data.message ||
      ""
  };
}


// ============================================================
// OPPORTUNITY DETAIL
// ============================================================

async function getOpportunityDetail(
  env,
  itemId,
  targetRoas
) {
  const id =
    Number(
      itemId
    );

  if (
    !Number.isFinite(id) ||
    id <= 0
  ) {
    return {
      ok: false,

      error:
        "Invalid item_id"
    };
  }

  const params =
    new URLSearchParams({
      item_id:
        String(id),

      roas_target:
        String(
          targetRoas
        )
    });

  const result =
    await internalRequest(
      env,
      "/internal/shopee/ads/opportunities?"
        +
        params.toString()
    );

  if (!result.ok) {
    return {
      ok: false,

      item_id:
        id,

      error:
        result.body?.error ||
        "Unable to retrieve opportunity detail",

      message:
        result.body?.message ||
        ""
    };
  }

  const data =
    result.body ||
    {};

  return {
    ok: true,

    item_id:
      id,

    product:
      data.product ||
      null,

    keywords:
      Array.isArray(
        data.keywords
      )
        ? data.keywords
        : [],

    roi:
      data.roi ||
      {},

    budget:
      data.budget ||
      {},

    sources:
      data.sources ||
      {}
  };
}


// ============================================================
// DATA COVERAGE
// ============================================================

function calculateCoverage(
  ads,
  campaigns,
  gms,
  config
) {
  if (
    !ads.ok ||
    !campaigns.ok ||
    !gms.ok
  ) {
    return {
      ready: false,

      locked: true,

      reason:
        "One or more data sources are unavailable."
    };
  }

  const account =
    ads.metrics ||
    {};

  const product =
    campaigns.summary ||
    {};

  const gmsSummary =
    gms.summary ||
    {};

  const accountSpend =
    number(
      account.spend
    );

  const accountGmv =
    number(
      account.gmv
    );

  const accountOrders =
    number(
      account.orders
    );

  const productSpend =
    number(
      product.total_spend
    );

  const productGmv =
    number(
      product.total_gmv
    );

  const productOrders =
    number(
      product.total_orders
    );

  const gmsSpend =
    number(
      gmsSummary.spend
    );

  const gmsGmv =
    number(
      gmsSummary.gmv
    );

  const gmsOrders =
    number(
      gmsSummary.orders
    );

  const explainedSpend =
    productSpend +
    gmsSpend;

  const explainedGmv =
    productGmv +
    gmsGmv;

  const explainedOrders =
    productOrders +
    gmsOrders;

  const spendCoverage =
    coveragePercent(
      explainedSpend,
      accountSpend
    );

  const gmvCoverage =
    coveragePercent(
      explainedGmv,
      accountGmv
    );

  const ordersCoverage =
    coveragePercent(
      explainedOrders,
      accountOrders
    );

  const coverageValues =
    [
      spendCoverage,
      gmvCoverage,
      ordersCoverage
    ]
      .filter(
        value =>
          value !==
          null
      );

  const minimumCoverage =
    coverageValues.length
      ? Math.min(
          ...coverageValues
        )
      : 0;

  const maximumCoverage =
    coverageValues.length
      ? Math.max(
          ...coverageValues
        )
      : 0;

  const threshold =
    number(
      config.minCoverage
    ) ||
    95;

  const overcountDetected =
    maximumCoverage >
    105;

  const locked =
    minimumCoverage <
      threshold ||
    overcountDetected;

  return {
    ready: true,

    locked,

    threshold,

    minimumCoverage,

    spend: {
      account:
        round2(
          accountSpend
        ),

      explained:
        round2(
          explainedSpend
        ),

      residual:
        round2(
          accountSpend -
          explainedSpend
        ),

      coverage:
        spendCoverage
    },

    gmv: {
      account:
        round2(
          accountGmv
        ),

      explained:
        round2(
          explainedGmv
        ),

      residual:
        round2(
          accountGmv -
          explainedGmv
        ),

      coverage:
        gmvCoverage
    },

    orders: {
      account:
        accountOrders,

      explained:
        explainedOrders,

      residual:
        accountOrders -
        explainedOrders,

      coverage:
        ordersCoverage
    },

    product: {
      spend:
        round2(
          productSpend
        ),

      gmv:
        round2(
          productGmv
        ),

      orders:
        productOrders
    },

    gms: {
      spend:
        round2(
          gmsSpend
        ),

      gmv:
        round2(
          gmsGmv
        ),

      orders:
        gmsOrders
    },

    reason:
      locked
        ? (
            overcountDetected
              ? "The detailed sources exceed the account totals. Reconciliation is required."
              : "Campaign-level data coverage is below the safety threshold."
          )
        : "Detailed campaign data is sufficiently reconciled with the account totals."
  };
}


function coveragePercent(
  explained,
  total
) {
  total =
    number(
      total
    );

  explained =
    number(
      explained
    );

  if (
    total <= 0
  ) {
    return explained === 0
      ? 100
      : null;
  }

  return round2(
    (
      explained /
      total
    ) *
    100
  );
}


// ============================================================
// AUTH
// ============================================================

async function isAuthenticated(
  request,
  env
) {
  const cookie =
    request.headers.get(
      "Cookie"
    ) ||
    "";

  const match =
    cookie.match(
      /(?:^|;\s*)mls_session=([^;]+)/
    );

  if (!match) {
    return false;
  }

  const parts =
    match[1]
      .split(".");

  if (
    parts.length !==
    2
  ) {
    return false;
  }

  const payload =
    parts[0];

  const receivedSignature =
    parts[1];

  const expectedSignature =
    await sign(
      payload,
      env.SESSION_SECRET
    );

  if (
    !(
      await safeEqual(
        receivedSignature,
        expectedSignature
      )
    )
  ) {
    return false;
  }

  try {
    const data =
      JSON.parse(
        base64UrlDecode(
          payload
        )
      );

    if (!data.exp) {
      return false;
    }

    return (
      Math.floor(
        Date.now() /
        1000
      ) <=
      data.exp
    );

  } catch {
    return false;
  }
}


async function sign(
  value,
  secret
) {
  const encoder =
    new TextEncoder();

  const key =
    await crypto.subtle.importKey(
      "raw",

      encoder.encode(
        secret ||
        ""
      ),

      {
        name:
          "HMAC",

        hash:
          "SHA-256"
      },

      false,

      [
        "sign"
      ]
    );

  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(
        value
      )
    );

  return bytesToBase64Url(
    new Uint8Array(
      signature
    )
  );
}


async function safeEqual(
  a,
  b
) {
  const encoder =
    new TextEncoder();

  const aa =
    encoder.encode(
      String(a)
    );

  const bb =
    encoder.encode(
      String(b)
    );

  if (
    aa.length !==
    bb.length
  ) {
    return false;
  }

  let diff = 0;

  for (
    let i = 0;
    i < aa.length;
    i++
  ) {
    diff |=
      aa[i] ^
      bb[i];
  }

  return diff === 0;
}


function base64UrlEncode(
  value
) {
  return bytesToBase64Url(
    new TextEncoder()
      .encode(
        value
      )
  );
}


function bytesToBase64Url(
  bytes
) {
  let binary =
    "";

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


function base64UrlDecode(
  value
) {
  value =
    value
      .replace(
        /-/g,
        "+"
      )
      .replace(
        /_/g,
        "/"
      );

  while (
    value.length %
    4
  ) {
    value +=
      "=";
  }

  const binary =
    atob(
      value
    );

  const bytes =
    Uint8Array.from(
      binary,
      c =>
        c.charCodeAt(
          0
        )
    );

  return new TextDecoder()
    .decode(
      bytes
    );
}


// ============================================================
// MAIN PAGE
// ============================================================

function appPage(
  currentPath,
  shopee,
  ads,
  campaigns,
  gms,
  coverage,
  campaignFilter,
  config,
  opportunities,
  opportunityDetail
) {
  let title =
    "Advertising Dashboard";

  let subtitle =
    "Real Shopee advertising performance";

  let content =
    dashboardContent(
      shopee,
      ads,
      coverage,
      config
    );

  if (
    currentPath ===
    "/advertising"
  ) {
    title =
      "Advertising";

    subtitle =
      "Shopee advertising account overview";

    content =
      advertisingContent(
        shopee,
        ads
      );
  }

  if (
    currentPath ===
    "/campaigns"
  ) {
    title =
      "Campaigns";

    subtitle =
      "Product Ads campaign intelligence";

    content =
      campaignsContent(
        shopee,
        campaigns,
        campaignFilter,
        config
      );
  }

  if (
    currentPath ===
    "/gmv-max"
  ) {
    title =
      "GMV Max Products";

    subtitle =
      "Product-level GMV Max performance";

    content =
      gmvMaxContent(
        shopee,
        gms,
        config
      );
  }

  if (
    currentPath ===
    "/opportunities"
  ) {
    title =
      "Opportunities";

    subtitle =
      "Shopee recommendation intelligence - advisory only";

    content =
      opportunitiesContent(
        shopee,
        opportunities,
        opportunityDetail,
        config
      );
  }

  if (
    currentPath ===
    "/performance"
  ) {
    title =
      "Performance";

    subtitle =
      "Advertising performance and reconciliation";

    content =
      performanceContent(
        shopee,
        ads,
        coverage,
        config
      );
  }

  if (
    currentPath ===
    "/optimization"
  ) {
    title =
      "Optimization";

    subtitle =
      "Campaign optimization intelligence";

    content =
      optimizationContent(
        shopee,
        ads,
        campaigns,
        coverage,
        config
      );
  }

  if (
    currentPath ===
    "/integrations"
  ) {
    title =
      "Integrations";

    subtitle =
      "Connected commerce platforms";

    content =
      integrationsContent(
        shopee,
        ads,
        gms,
        opportunities
      );
  }

  return `<!doctype html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1">

<title>
${escapeHtml(title)} - MLS Commerce Ads
</title>

<style>

*{
  box-sizing:border-box
}

body{
  margin:0;
  background:#f6f7fb;
  color:#1f2937;
  font-family:Inter,Arial,sans-serif
}

.app{
  display:flex;
  min-height:100vh
}

.sidebar{
  width:245px;
  background:#111827;
  color:#fff;
  padding:28px 18px;
  flex-shrink:0
}

.logo{
  font-size:21px;
  font-weight:800;
  margin-bottom:38px
}

.logo span{
  color:#ff5a1f
}

.nav{
  display:block;
  padding:13px 14px;
  border-radius:8px;
  margin:5px 0;
  color:#cbd5e1;
  text-decoration:none
}

.nav:hover{
  color:#fff;
  background:#1f2937
}

.nav.active{
  color:#fff;
  background:#ff5a1f
}

.logout{
  display:block;
  color:#94a3b8;
  padding:13px 14px;
  margin-top:30px;
  text-decoration:none
}

.main{
  flex:1;
  min-width:0;
  padding:34px
}

.top{
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:30px
}

h1{
  margin:0;
  font-size:28px
}

.subtitle{
  color:#6b7280;
  margin-top:7px
}

.system{
  background:#dcfce7;
  color:#166534;
  padding:8px 13px;
  border-radius:20px;
  font-size:13px;
  font-weight:700
}

.cards{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:18px
}

.card,
.panel,
.mini{
  background:#fff;
  border:1px solid #e5e7eb;
  border-radius:12px;
  box-shadow:0 2px 8px #00000008
}

.card{
  padding:20px
}

.label{
  color:#6b7280;
  font-size:13px
}

.value{
  font-size:27px;
  font-weight:800;
  margin-top:9px
}

.green{
  color:#15803d
}

.red{
  color:#b91c1c
}

.orange{
  color:#ea580c
}

.grid{
  display:grid;
  grid-template-columns:2fr 1fr;
  gap:20px;
  margin-top:22px
}

.panel{
  padding:22px
}

.panel h2{
  margin-top:0;
  font-size:18px
}

.panel-title-row{
  display:flex;
  justify-content:space-between;
  gap:15px;
  align-items:center
}

.note{
  color:#6b7280;
  font-size:13px;
  line-height:1.7
}

.period{
  font-size:12px;
  color:#6b7280;
  background:#f3f4f6;
  padding:7px 10px;
  border-radius:20px
}

.mini-grid{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:12px;
  margin-top:22px
}

.mini{
  padding:16px
}

.mini strong{
  display:block;
  margin-top:7px;
  font-size:20px
}

.table-wrap{
  overflow-x:auto
}

table{
  width:100%;
  border-collapse:collapse;
  margin-top:18px
}

th,
td{
  padding:12px 10px;
  text-align:left;
  border-bottom:1px solid #eee;
  font-size:13px;
  vertical-align:middle
}

th{
  color:#6b7280;
  white-space:nowrap
}

.campaign-name{
  min-width:300px;
  max-width:450px
}

.badge,
.connection-status{
  display:inline-block;
  padding:6px 10px;
  border-radius:20px;
  font-size:12px;
  font-weight:700
}

.good,
.connected,
.status-ongoing{
  background:#dcfce7;
  color:#166534
}

.warning,
.status-paused{
  background:#fef3c7;
  color:#92400e
}

.danger{
  background:#fee2e2;
  color:#991b1b
}

.neutral,
.status-ended,
.status-closed,
.status-unknown{
  background:#f3f4f6;
  color:#4b5563
}

.feature{
  padding:15px 0;
  border-bottom:1px solid #eee
}

.feature:last-child{
  border-bottom:0
}

.feature strong{
  display:block;
  margin-bottom:6px
}

.filters{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  margin:20px 0
}

.filter{
  padding:8px 12px;
  border:1px solid #d1d5db;
  border-radius:20px;
  color:#4b5563;
  text-decoration:none;
  font-size:12px;
  font-weight:700;
  background:#fff
}

.filter.active{
  background:#111827;
  color:#fff;
  border-color:#111827
}

.signal{
  padding:15px;
  border-radius:10px;
  margin-top:12px
}

.signal.good{
  background:#f0fdf4;
  border:1px solid #bbf7d0
}

.signal.warning{
  background:#fffbeb;
  border:1px solid #fde68a
}

.signal.danger{
  background:#fff1f2;
  border:1px solid #fecdd3
}

.signal.info{
  background:#f8fafc;
  border:1px solid #e2e8f0
}

.coverage-bar,
.score-bar{
  height:9px;
  background:#e5e7eb;
  border-radius:10px;
  overflow:hidden;
  margin-top:8px
}

.coverage-fill,
.score-fill{
  height:100%;
  background:#16a34a
}

.coverage-fill.low{
  background:#dc2626
}

.locked{
  border:1px solid #fecaca;
  background:#fff7f7;
  padding:18px;
  border-radius:10px
}

.unlocked{
  border:1px solid #bbf7d0;
  background:#f0fdf4;
  padding:18px;
  border-radius:10px
}

.connect,
.button{
  display:inline-block;
  margin-top:15px;
  padding:11px 14px;
  text-align:center;
  text-decoration:none;
  border-radius:8px;
  background:#ee4d2d;
  color:white;
  font-weight:700;
  border:0
}

.connect{
  display:block;
  width:100%;
  padding:13px
}

.button.secondary{
  background:#111827
}

.source-row{
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  margin-top:12px
}

.tags{
  display:flex;
  gap:6px;
  flex-wrap:wrap
}

.tag{
  background:#eef2ff;
  color:#3730a3;
  border-radius:20px;
  padding:5px 8px;
  font-size:11px;
  font-weight:700
}

.score{
  font-size:28px;
  font-weight:800
}

.detail-head{
  display:flex;
  justify-content:space-between;
  gap:20px;
  align-items:flex-start
}

.muted-card{
  background:#f8fafc;
  border:1px solid #e2e8f0;
  border-radius:10px;
  padding:15px
}

@media(max-width:1100px){
  .cards,
  .mini-grid{
    grid-template-columns:1fr 1fr
  }
}

@media(max-width:850px){
  .sidebar{
    display:none
  }

  .main{
    padding:20px
  }

  .grid{
    grid-template-columns:1fr
  }
}

@media(max-width:550px){
  .cards,
  .mini-grid{
    grid-template-columns:1fr
  }
}

</style>

</head>

<body>

<div class="app">

<aside class="sidebar">

<div class="logo">
MLS Commerce <span>Ads</span>
</div>

${navLink(
  "/dashboard",
  "Dashboard",
  currentPath
)}

${navLink(
  "/advertising",
  "Advertising",
  currentPath
)}

${navLink(
  "/campaigns",
  "Campaigns",
  currentPath
)}

${navLink(
  "/gmv-max",
  "GMV Max",
  currentPath
)}

${navLink(
  "/opportunities",
  "Opportunities",
  currentPath
)}

${navLink(
  "/performance",
  "Performance",
  currentPath
)}

${navLink(
  "/optimization",
  "Optimization",
  currentPath
)}

${navLink(
  "/integrations",
  "Integrations",
  currentPath
)}

<a
class="logout"
href="/logout">
Sign out
</a>

</aside>

<main class="main">

<div class="top">

<div>

<h1>
${escapeHtml(title)}
</h1>

<div class="subtitle">
${escapeHtml(subtitle)}
</div>

</div>

<div class="system">
System Online
</div>

</div>

${content}

</main>

</div>

</body>

</html>`;
}


// ============================================================
// NAV
// ============================================================

function navLink(
  href,
  label,
  current
) {
  return `
<a
class="nav ${
  current === href
    ? "active"
    : ""
}"
href="${href}">
${escapeHtml(label)}
</a>`;
}


// ============================================================
// DASHBOARD
// ============================================================

function dashboardContent(
  shopee,
  ads,
  coverage,
  config
) {
  if (
    !shopee.connected
  ) {
    return disconnectedPanel();
  }

  if (!ads.ok) {
    return errorPanel(
      "Shopee Ads data unavailable",
      ads.error
    );
  }

  const m =
    ads.metrics ||
    {};

  const economics =
    economicPolicy(
      config
    );

  return `
<div class="cards">

${metricCard(
  "Advertising Spend",
  money(m.spend)
)}

${metricCard(
  "Attributed GMV",
  money(m.gmv),
  "green"
)}

${metricCard(
  "ROAS",
  formatRoas(m.roas),
  "green"
)}

${metricCard(
  "Orders",
  integer(m.orders)
)}

</div>

<div class="mini-grid">

${miniMetric(
  "Ads Balance",
  money(ads.balance)
)}

${miniMetric(
  "Safe CPA",
  money(economics.safeCpa)
)}

${miniMetric(
  "Break-even CPA",
  money(
    economics.hardBreakEvenCpa
  )
)}

${miniMetric(
  "Data Coverage",
  coverage.ready
    ? percentNumber(
        coverage.minimumCoverage
      )
    : "Unavailable"
)}

</div>

<div class="grid">

<section class="panel">

<h2>
Daily Performance
</h2>

${dailyTable(
  ads.daily
)}

</section>

<section class="panel">

<h2>
Automation Safety
</h2>

${coverageGate(
  coverage
)}

<div class="signal warning">

<strong>
Economic Safety Guard
</strong>

<div class="note">
Unit cost:
${money(
  economics.unitCost
)}
· Net payout used:
${money(
  economics.netPayout
)}
· Contribution margin:
${money(
  economics.contributionMargin
)}
· Safe CPA:
${money(
  economics.safeCpa
)}
· Break-even CPA:
${money(
  economics.hardBreakEvenCpa
)}.
</div>

</div>

</section>

</div>`;
}


// ============================================================
// ADVERTISING
// ============================================================

function advertisingContent(
  shopee,
  ads
) {
  if (
    !shopee.connected
  ) {
    return disconnectedPanel();
  }

  if (!ads.ok) {
    return errorPanel(
      "Advertising data unavailable",
      ads.error
    );
  }

  const m =
    ads.metrics ||
    {};

  return `
<div class="cards">

${metricCard(
  "Ads Balance",
  money(ads.balance),
  "green"
)}

${metricCard(
  "Spend",
  money(m.spend)
)}

${metricCard(
  "GMV",
  money(m.gmv)
)}

${metricCard(
  "ROAS",
  formatRoas(m.roas),
  "green"
)}

</div>

<div
class="panel"
style="margin-top:22px">

<h2>
Account Performance
</h2>

<div class="feature">
<strong>
Impressions
</strong>
${integer(
  m.impressions
)}
</div>

<div class="feature">
<strong>
Clicks
</strong>
${integer(
  m.clicks
)}
</div>

<div class="feature">
<strong>
CTR
</strong>
${percent(
  m.ctr
)}
</div>

<div class="feature">
<strong>
Orders
</strong>
${integer(
  m.orders
)}
</div>

<div class="feature">
<strong>
Cost per Order
</strong>
${money(
  m.cost_per_order
)}
</div>

</div>`;
}


// ============================================================
// CAMPAIGNS
// ============================================================

function campaignsContent(
  shopee,
  data,
  filter,
  config
) {
  if (
    !shopee.connected
  ) {
    return disconnectedPanel();
  }

  if (!data.ok) {
    return errorPanel(
      "Campaign data unavailable",
      data.error
    );
  }

  const campaigns =
    Array.isArray(
      data.campaigns
    )
      ? data.campaigns.map(
          campaign => ({
            ...campaign,

            recommendation:
              analyzeCampaign(
                campaign,
                config
              )
          })
        )
      : [];

  const rec =
    summarizeRecommendations(
      campaigns
    );

  const allowed = [
    "all",
    "scale",
    "maintain",
    "observe",
    "reduce",
    "pause-review"
  ];

  if (
    !allowed.includes(
      filter
    )
  ) {
    filter =
      "all";
  }

  let filtered =
    campaigns;

  if (
    filter !==
    "all"
  ) {
    const wanted =
      filter ===
      "pause-review"
        ? "pause_review"
        : filter;

    filtered =
      campaigns.filter(
        c =>
          c.recommendation
            ?.action ===
          wanted
      );
  }

  const summary =
    data.summary ||
    {};

  return `
<div class="cards">

${metricCard(
  "Campaigns",
  integer(
    summary.campaign_count
  )
)}

${metricCard(
  "Scale",
  integer(
    rec.scale
  ),
  "green"
)}

${metricCard(
  "Reduce",
  integer(
    rec.reduce
  ),
  "orange"
)}

${metricCard(
  "Pause Review",
  integer(
    rec.pauseReview
  ),
  rec.pauseReview > 0
    ? "red"
    : ""
)}

</div>

<div class="filters">

${filterLink(
  "all",
  "All",
  filter
)}

${filterLink(
  "scale",
  "Scale",
  filter
)}

${filterLink(
  "maintain",
  "Maintain",
  filter
)}

${filterLink(
  "observe",
  "Observe",
  filter
)}

${filterLink(
  "reduce",
  "Reduce",
  filter
)}

${filterLink(
  "pause-review",
  "Pause Review",
  filter
)}

</div>

<div class="panel">

<h2>
Product Campaigns
</h2>

${campaignTable(
  filtered
)}

</div>`;
}


// ============================================================
// GMV MAX
// ============================================================

function gmvMaxContent(
  shopee,
  gms,
  config
) {
  if (
    !shopee.connected
  ) {
    return disconnectedPanel();
  }

  if (!gms.ok) {
    return errorPanel(
      "GMV Max data unavailable",
      gms.error
    );
  }

  const s =
    gms.summary ||
    {};

  return `
<div class="cards">

${metricCard(
  "GMV Max Spend",
  money(
    s.spend
  )
)}

${metricCard(
  "GMV Max GMV",
  money(
    s.gmv
  ),
  "green"
)}

${metricCard(
  "GMV Max ROAS",
  formatRoas(
    s.roas
  ),
  "green"
)}

${metricCard(
  "Orders",
  integer(
    s.orders
  )
)}

</div>

<div class="mini-grid">

${miniMetric(
  "Products",
  integer(
    s.item_count
  )
)}

${miniMetric(
  "Products with Orders",
  integer(
    s.items_with_orders
  )
)}

${miniMetric(
  "Clicks",
  integer(
    s.clicks
  )
)}

${miniMetric(
  "Impressions",
  integer(
    s.impressions
  )
)}

</div>

<div class="grid">

<section class="panel">

<h2>
Top GMV Max Product
</h2>

${bestGmsItem(
  s.best_item
)}

</section>

<section class="panel">

<h2>
Safety Analysis
</h2>

<div class="feature">

<strong>
Meaningful spend without orders
</strong>

${integer(
  s.meaningful_spend_no_orders
)}

</div>

<div class="feature">

<strong>
Low-evidence products without orders
</strong>

${integer(
  s.low_evidence_no_orders
)}

</div>

<p class="note">
Products with only a few cents of spend
are not treated as waste.
</p>

</section>

</div>

<div
class="panel"
style="margin-top:22px">

<h2>
GMV Max Product Performance
</h2>

${gmsItemTable(
  gms.items,
  config
)}

</div>`;
}


// ============================================================
// OPPORTUNITIES
// ============================================================

function opportunitiesContent(
  shopee,
  opportunities,
  detail,
  config
) {
  if (
    !shopee.connected
  ) {
    return disconnectedPanel();
  }

  if (
    !opportunities
  ) {
    return errorPanel(
      "Opportunities unavailable",
      "Opportunity source was not loaded."
    );
  }

  if (
    !opportunities.ok
  ) {
    return errorPanel(
      "Opportunities unavailable",
      opportunities.error
    );
  }

  const items =
    Array.isArray(
      opportunities.items
    )
      ? opportunities.items
      : [];

  const bestRoi =
    items.filter(
      item =>
        tagContains(
          item,
          "best roi"
        ) ||
        tagContains(
          item,
          "best_roi"
        )
    ).length;

  const bestSelling =
    items.filter(
      item =>
        tagContains(
          item,
          "best selling"
        ) ||
        tagContains(
          item,
          "best_selling"
        )
    ).length;

  const topSearch =
    items.filter(
      item =>
        tagContains(
          item,
          "top search"
        ) ||
        tagContains(
          item,
          "top_search"
        )
    ).length;

  let degraded =
    "";

  if (
    opportunities.status ===
    "degraded"
  ) {
    degraded = `
<div class="signal warning">

<strong>
Degraded mode
</strong>

<div class="note">
One or more recommendation sources are unavailable.
The rest of the dashboard remains read-only and operational.
</div>

</div>`;
  }

  const selectedItem =
    detail
      ? (
          items.find(
            item =>
              Number(
                item.item_id
              ) ===
              Number(
                detail.item_id
              )
          ) ||
          null
        )
      : null;

  return `
${degraded}

<div class="cards">

${metricCard(
  "Recommended Products",
  integer(
    items.length
  )
)}

${metricCard(
  "Best ROI",
  integer(
    bestRoi
  ),
  "green"
)}

${metricCard(
  "Best Selling",
  integer(
    bestSelling
  )
)}

${metricCard(
  "Top Search",
  integer(
    topSearch
  )
)}

</div>

<div class="grid">

<section class="panel">

<div class="panel-title-row">

<h2>
Product Opportunities
</h2>

<span class="period">
Read-only
</span>

</div>

${opportunityTable(
  items
)}

</section>

<section class="panel">

<h2>
Recommendation Sources
</h2>

${sourceHealth(
  opportunities.sources
)}

<p class="note">
Shopee recommendations are advisory signals.
MLS does not make automatic changes in this version.
</p>

</section>

</div>

${
  detail
    ? opportunityDetailPanel(
        detail,
        config,
        selectedItem
      )
    : `
<div
class="panel"
style="margin-top:22px">

<h2>
Product Intelligence
</h2>

<p class="note">
Select a product above to load ROI target,
budget suggestion and recommended keywords.
</p>

</div>
`
}`;
}


// ============================================================
// OPPORTUNITY TABLE
// ============================================================

function opportunityTable(
  items
) {
  if (
    !items.length
  ) {
    return `
<p class="note">
No recommended products were returned
by Shopee for this shop.
</p>`;
  }

  const sorted =
    [
      ...items
    ].sort(
      (
        a,
        b
      ) =>
        opportunityScore(
          b
        ).score -
        opportunityScore(
          a
        ).score
    );

  return `
<div class="table-wrap">

<table>

<thead>

<tr>
<th>Product</th>
<th>Shopee Tags</th>
<th>Current Ads</th>
<th>Score</th>
<th></th>
</tr>

</thead>

<tbody>

${
  sorted.map(
    item => {

      const score =
        opportunityScore(
          item
        );

      return `
<tr>

<td class="campaign-name">

<strong>
${escapeHtml(
  item.item_name ||
  "Unnamed product"
)}
</strong>

<div class="note">
Item ${escapeHtml(
  String(
    item.item_id ||
    ""
  )
)}
</div>

</td>

<td>
${tagList(
  item.sku_tag_list
)}
</td>

<td>
${tagList(
  item.ongoing_ad_type_list,
  "neutral"
)}
</td>

<td>

<strong>
${score.score}/100
</strong>

<div class="note">
${escapeHtml(
  score.confidence
)}
 confidence · rule-based
</div>

</td>

<td>

<a
class="button secondary"
href="/opportunities?item_id=${encodeURIComponent(
  String(
    item.item_id
  )
)}">
View intelligence
</a>

</td>

</tr>`;
    }
  ).join("")
}

</tbody>

</table>

</div>`;
}


// ============================================================
// OPPORTUNITY DETAIL
// ============================================================

function opportunityDetailPanel(
  detail,
  config,
  selectedItem =
    null
) {
  if (
    !detail.ok
  ) {
    return `
<div
class="panel"
style="margin-top:22px">

${errorPanel(
  "Product intelligence unavailable",
  detail.error
)}

</div>`;
  }

  const product =
    detail.product ||
    {};

  const roi =
    detail.roi ||
    {};

  const budget =
    detail.budget ||
    {};

  const keywords =
    Array.isArray(
      detail.keywords
    )
      ? detail.keywords
      : [];

  const pseudoItem = {
    item_status:
      product.item_status,

    sku_tag_list: [],

    ongoing_ad_type_list: []
  };

  const score =
    opportunityScore(
      selectedItem ||
      pseudoItem,
      detail
    );

  const economics =
    economicPolicy(
      config
    );

  return `
<div
class="panel"
style="margin-top:22px">

<div class="detail-head">

<div>

<h2>
${escapeHtml(
  product.item_name ||
  `Item ${detail.item_id}`
)}
</h2>

<div class="note">
Item ${escapeHtml(
  String(
    detail.item_id
  )
)}
 ·
${escapeHtml(
  product.item_status ||
  ""
)}
</div>

</div>

<a
class="button secondary"
href="/opportunities">
Back to opportunities
</a>

</div>

<div class="mini-grid">

${miniMetric(
  "Opportunity Score",
  `${score.score}/100`
)}

${miniMetric(
  "MLS Confidence",
  score.confidence
)}

${miniMetric(
  "Shopee ROI Exact",
  roiValue(
    roi.exact
  )
)}

${miniMetric(
  "Safe CPA",
  money(
    economics.safeCpa
  )
)}

</div>

<div class="grid">

<section class="panel">

<h2>
ROI Intelligence
</h2>

<div class="feature">

<strong>
Lower Target
</strong>

${roiValueWithPercentile(
  roi.lower_bound
)}

</div>

<div class="feature">

<strong>
Exact Target
</strong>

${roiValueWithPercentile(
  roi.exact
)}

</div>

<div class="feature">

<strong>
Upper Target
</strong>

${roiValueWithPercentile(
  roi.upper_bound
)}

</div>

<div class="signal info">

<strong>
MLS Target
</strong>

<div class="note">
Current configured target:
${formatRoas(
  config.targetRoas
)}.

Shopee's values are reference signals,
not automatic instructions.
</div>

</div>

</section>

<section class="panel">

<h2>
Budget Intelligence
</h2>

<div class="feature">

<strong>
Minimum
</strong>

${moneyOrDash(
  budget.min_budget
)}

</div>

<div class="feature">

<strong>
Recommended
</strong>

${moneyOrDash(
  budget.recommended_budget
)}

</div>

<div class="feature">

<strong>
Maximum
</strong>

${budgetMaximum(
  budget.max_budget
)}

</div>

<p class="note">
Very large maximum values returned by the API
are treated as technical limits
and are never used directly as a spending recommendation.

Shopee budget suggestions are market signals only;
MLS economic safety takes priority.
</p>

<div class="signal warning">

<strong>
Economic Guard
</strong>

<div class="note">

Safe CPA:
${money(
  economics.safeCpa
)}

· Break-even CPA:
${money(
  economics.hardBreakEvenCpa
)}

· Contribution margin before Ads:
${money(
  economics.contributionMargin
)}.

</div>

</div>

</section>

</div>

<div class="grid">

<section class="panel">

<h2>
Recommended Keywords
</h2>

${keywordTable(
  keywords
)}

</section>

<section class="panel">

<h2>
Source Health
</h2>

${sourceHealth(
  detail.sources
)}

<div
class="locked"
style="margin-top:16px">

<strong>
🔒 Automatic changes locked
</strong>

<p class="note">
This page is recommendation-only.
No budget, ROAS, keyword or campaign status is changed.
</p>

</div>

</section>

</div>

</div>`;
}


// ============================================================
// PERFORMANCE
// ============================================================

function performanceContent(
  shopee,
  ads,
  coverage,
  config
) {
  if (
    !shopee.connected
  ) {
    return disconnectedPanel();
  }

  if (!ads.ok) {
    return errorPanel(
      "Performance unavailable",
      ads.error
    );
  }

  const m =
    ads.metrics ||
    {};

  const economics =
    economicPolicy(
      config
    );

  return `
<div class="cards">

${metricCard(
  "Spend",
  money(
    m.spend
  )
)}

${metricCard(
  "GMV",
  money(
    m.gmv
  ),
  "green"
)}

${metricCard(
  "ROAS",
  formatRoas(
    m.roas
  ),
  "green"
)}

${metricCard(
  "Orders",
  integer(
    m.orders
  )
)}

</div>

<div class="mini-grid">

${miniMetric(
  "Safe CPA",
  money(
    economics.safeCpa
  )
)}

${miniMetric(
  "Break-even CPA",
  money(
    economics.hardBreakEvenCpa
  )
)}

${miniMetric(
  "Unit Cost",
  money(
    economics.unitCost
  )
)}

${miniMetric(
  "Retained Profit",
  money(
    economics.retainedProfit
  )
)}

</div>

<div class="grid">

<section class="panel">

<h2>
Data Reconciliation
</h2>

${coverageDetails(
  coverage
)}

</section>

<section class="panel">

<h2>
Automation Gate
</h2>

${coverageGate(
  coverage
)}

</section>

</div>

<div
class="panel"
style="margin-top:22px">

<h2>
Daily Account Performance
</h2>

${dailyTable(
  ads.daily
)}

</div>`;
}


// ============================================================
// OPTIMIZATION
// ============================================================

function optimizationContent(
  shopee,
  ads,
  campaigns,
  coverage,
  config
) {
  if (
    !shopee.connected
  ) {
    return disconnectedPanel();
  }

  if (
    !ads.ok ||
    !campaigns.ok
  ) {
    return errorPanel(
      "Optimization data unavailable",
      ""
    );
  }

  const list =
    campaigns.campaigns.map(
      campaign => ({
        ...campaign,

        recommendation:
          analyzeCampaign(
            campaign,
            config
          )
      })
    );

  const rec =
    summarizeRecommendations(
      list
    );

  const economics =
    economicPolicy(
      config
    );

  return `
<div class="cards">

${metricCard(
  "Scale Candidates",
  integer(
    rec.scale
  ),
  "green"
)}

${metricCard(
  "Maintain",
  integer(
    rec.maintain
  )
)}

${metricCard(
  "Reduce",
  integer(
    rec.reduce
  ),
  "orange"
)}

${metricCard(
  "Pause Review",
  integer(
    rec.pauseReview
  ),
  rec.pauseReview
    ? "red"
    : ""
)}

</div>

<div class="mini-grid">

${miniMetric(
  "Unit Cost",
  money(
    economics.unitCost
  )
)}

${miniMetric(
  "Contribution Margin",
  money(
    economics.contributionMargin
  )
)}

${miniMetric(
  "Safe CPA",
  money(
    economics.safeCpa
  )
)}

${miniMetric(
  "Break-even CPA",
  money(
    economics.hardBreakEvenCpa
  )
)}

</div>

<div class="grid">

<section class="panel">

<h2>
Optimization Intelligence
</h2>

<div class="signal good">

<strong>
Scale
</strong>

${integer(
  rec.scale
)}
 campaign(s)

</div>

<div class="signal warning">

<strong>
Reduce
</strong>

${integer(
  rec.reduce
)}
 campaign(s)

</div>

<div class="signal danger">

<strong>
Pause Review
</strong>

${integer(
  rec.pauseReview
)}
 campaign(s)

</div>

</section>

<section class="panel">

<h2>
Economic Safety Guard
</h2>

<div class="locked">

<strong>
🔒 Automatic changes locked
</strong>

<p class="note">
Scale is allowed as a recommendation only when
CPA is at or below
${money(
  economics.safeCpa
)}.

At
${money(
  economics.hardBreakEvenCpa
)}
or more per order,
the campaign is flagged as Economic Risk.
</p>

</div>

<div class="feature">

<strong>
Target ROAS
</strong>

${formatRoas(
  config.targetRoas
)}

</div>

<div class="feature">

<strong>
Safe ad share of margin
</strong>

${percent(
  economics.maxAdShare
)}

</div>

<div class="feature">

<strong>
Profit preserved at Safe CPA
</strong>

${money(
  economics.retainedProfit
)}

</div>

${coverageGate(
  coverage
)}

</section>

</div>`;
}


// ============================================================
// INTEGRATIONS
// ============================================================

function integrationsContent(
  shopee,
  ads,
  gms,
  opportunities
) {
  if (
    !shopee.connected
  ) {
    return disconnectedPanel();
  }

  return `
<div class="grid">

<section class="panel">

<h2>
Shopee
</h2>

<div class="connection-status connected">
Connected ✓
</div>

<div class="feature">

<strong>
Shop ID
</strong>

${escapeHtml(
  String(
    shopee.primary
      ?.principal_id ||
    ""
  )
)}

</div>

<div class="feature">

<strong>
Access Token
</strong>

Active

</div>

<div class="feature">

<strong>
Token Renewal
</strong>

Automatic

</div>

</section>

<section class="panel">

<h2>
Advertising APIs
</h2>

<div class="feature">

<strong>
Account Ads
</strong>

${
  ads.ok
    ? "Online ✓"
    : "Unavailable"
}

</div>

<div class="feature">

<strong>
GMV Max
</strong>

${
  gms.ok
    ? "Online ✓"
    : "Unavailable"
}

</div>

<div class="feature">

<strong>
Opportunity Intelligence
</strong>

${
  opportunities?.ok
    ? "Online ✓"
    : "Loaded on demand"
}

</div>

<div class="feature">

<strong>
Gateway
</strong>

Fixed outbound IP

</div>

</section>

</div>`;
}


// ============================================================
// CAMPAIGN ANALYSIS + ECONOMIC GUARD
// ============================================================

function analyzeCampaign(
  campaign,
  config
) {
  const spend =
    number(
      campaign.spend
    );

  const roas =
    number(
      campaign.roas
    );

  const orders =
    number(
      campaign.orders
    );

  const clicks =
    number(
      campaign.clicks
    );

  const status =
    String(
      campaign.status ||
      ""
    ).toLowerCase();

  const target =
    config.targetRoas;

  const minSpend =
    config.minSpend;

  const economics =
    economicPolicy(
      config
    );

  const cpa =
    orders > 0
      ? spend /
        orders
      : null;


  if (
    status === "ended" ||
    status === "closed"
  ) {
    return {
      action:
        "inactive",

      label:
        "Inactive",

      confidence:
        "high",

      cpa,

      economic_status:
        "inactive"
    };
  }


  if (
    status ===
    "paused"
  ) {
    return {
      action:
        "observe",

      label:
        "Observe",

      confidence:
        "medium",

      cpa,

      economic_status:
        "paused"
    };
  }


  // HARD PROTECTION
  if (
    orders > 0 &&
    cpa >=
      economics.hardBreakEvenCpa
  ) {
    return {
      action:
        "pause_review",

      label:
        "Economic Risk",

      confidence:
        confidenceLevel(
          clicks,
          orders,
          spend,
          minSpend
        ),

      cpa,

      economic_status:
        "hard_limit"
    };
  }


  if (
    orders === 0 &&
    spend >=
      economics.hardBreakEvenCpa
  ) {
    return {
      action:
        "pause_review",

      label:
        "Economic Risk",

      confidence:
        confidenceLevel(
          clicks,
          orders,
          spend,
          minSpend
        ),

      cpa:
        null,

      economic_status:
        "hard_limit"
    };
  }


  // SAFE CPA GUARD
  if (
    orders > 0 &&
    cpa >
      economics.safeCpa
  ) {
    const confidence =
      confidenceLevel(
        clicks,
        orders,
        spend,
        minSpend
      );

    return {
      action:
        confidence === "low"
          ? "observe"
          : "reduce",

      label:
        confidence === "low"
          ? "Observe Margin"
          : "Reduce Spend",

      confidence,

      cpa,

      economic_status:
        "above_safe_cpa"
    };
  }


  if (
    orders === 0 &&
    spend >=
      economics.safeCpa
  ) {
    return {
      action:
        "observe",

      label:
        "Margin Watch",

      confidence:
        confidenceLevel(
          clicks,
          orders,
          spend,
          minSpend
        ),

      cpa:
        null,

      economic_status:
        "margin_watch"
    };
  }


  if (
    spend <
      minSpend &&
    orders === 0
  ) {
    return {
      action:
        "observe",

      label:
        "Observe",

      confidence:
        "low",

      cpa:
        null,

      economic_status:
        "safe"
    };
  }


  // SCALE ONLY IF ROAS + CPA ARE GOOD
  if (
    orders >= 2 &&
    roas >=
      target * 1.5 &&
    cpa !== null &&
    cpa <=
      economics.safeCpa
  ) {
    return {
      action:
        "scale",

      label:
        "Scale",

      confidence:
        confidenceLevel(
          clicks,
          orders,
          spend,
          minSpend
        ),

      cpa,

      economic_status:
        "safe"
    };
  }


  if (
    orders >= 1 &&
    roas >= target &&
    cpa !== null &&
    cpa <=
      economics.safeCpa
  ) {
    return {
      action:
        "maintain",

      label:
        "Maintain",

      confidence:
        confidenceLevel(
          clicks,
          orders,
          spend,
          minSpend
        ),

      cpa,

      economic_status:
        "safe"
    };
  }


  if (
    spend >=
      minSpend &&
    orders > 0 &&
    roas <
      target * 0.7
  ) {
    return {
      action:
        "reduce",

      label:
        "Reduce",

      confidence:
        confidenceLevel(
          clicks,
          orders,
          spend,
          minSpend
        ),

      cpa,

      economic_status:
        cpa !== null &&
        cpa >
          economics.safeCpa
          ? "above_safe_cpa"
          : "safe"
    };
  }


  return {
    action:
      "observe",

    label:
      "Observe",

    confidence:
      confidenceLevel(
        clicks,
        orders,
        spend,
        minSpend
      ),

    cpa,

    economic_status:
      "safe"
  };
}


function confidenceLevel(
  clicks,
  orders,
  spend,
  minSpend
) {
  if (
    orders >= 3 ||
    clicks >= 100 ||
    spend >=
      minSpend * 4
  ) {
    return "high";
  }

  if (
    orders >= 1 ||
    clicks >= 30 ||
    spend >=
      minSpend * 2
  ) {
    return "medium";
  }

  return "low";
}


function summarizeRecommendations(
  campaigns
) {
  const result = {
    scale: 0,
    maintain: 0,
    observe: 0,
    reduce: 0,
    pauseReview: 0
  };

  for (
    const c of campaigns
  ) {
    const action =
      c.recommendation
        ?.action;

    if (
      action ===
      "scale"
    ) {
      result.scale++;
    }

    if (
      action ===
      "maintain"
    ) {
      result.maintain++;
    }

    if (
      action ===
      "observe"
    ) {
      result.observe++;
    }

    if (
      action ===
      "reduce"
    ) {
      result.reduce++;
    }

    if (
      action ===
      "pause_review"
    ) {
      result.pauseReview++;
    }
  }

  return result;
}


// ============================================================
// OPPORTUNITY SCORE
// ============================================================

function opportunityScore(
  item,
  detail =
    null
) {
  let score =
    0;

  const tags =
    (
      Array.isArray(
        item?.sku_tag_list
      )
        ? item.sku_tag_list
        : []
    ).map(
      v =>
        String(v)
          .toLowerCase()
          .replace(
            /_/g,
            " "
          )
    );

  if (
    tags.some(
      v =>
        v.includes(
          "best roi"
        )
    )
  ) {
    score +=
      35;
  }

  if (
    tags.some(
      v =>
        v.includes(
          "best selling"
        )
    )
  ) {
    score +=
      25;
  }

  if (
    tags.some(
      v =>
        v.includes(
          "top search"
        )
    )
  ) {
    score +=
      20;
  }

  if (
    String(
      item?.item_status ||
      ""
    ).toUpperCase() ===
    "NORMAL"
  ) {
    score +=
      5;
  }

  if (
    Array.isArray(
      item?.ongoing_ad_type_list
    ) &&
    item.ongoing_ad_type_list.length ===
      0
  ) {
    score +=
      5;
  }

  if (
    detail
      ?.roi
      ?.exact
      ?.value !=
    null
  ) {
    score +=
      5;
  }

  if (
    number(
      detail
        ?.budget
        ?.recommended_budget
    ) > 0
  ) {
    score +=
      3;
  }

  if (
    Array.isArray(
      detail?.keywords
    ) &&
    detail.keywords.length > 0
  ) {
    score +=
      2;
  }

  score =
    Math.max(
      0,
      Math.min(
        100,
        score
      )
    );

  const confidence =
    score >= 70
      ? "HIGH"
      : (
          score >= 40
            ? "MEDIUM"
            : "LOW"
        );

  return {
    score,
    confidence
  };
}


function tagContains(
  item,
  target
) {
  return (
    Array.isArray(
      item?.sku_tag_list
    )
      ? item.sku_tag_list
      : []
  )
    .map(
      v =>
        String(v)
          .toLowerCase()
          .replace(
            /_/g,
            " "
          )
    )
    .some(
      v =>
        v.includes(
          String(
            target
          )
            .toLowerCase()
            .replace(
              /_/g,
              " "
            )
        )
    );
}


// ============================================================
// CAMPAIGN TABLE
// ============================================================

function campaignTable(
  campaigns
) {
  if (
    !campaigns.length
  ) {
    return `
<p class="note">
No campaigns.
</p>`;
  }

  return `
<div class="table-wrap">

<table>

<thead>

<tr>
<th>Campaign</th>
<th>Status</th>
<th>Spend</th>
<th>GMV</th>
<th>ROAS</th>
<th>Orders</th>
<th>CPA</th>
<th>Margin</th>
<th>Recommendation</th>
</tr>

</thead>

<tbody>

${
  campaigns.map(
    c => `
<tr>

<td class="campaign-name">

<strong>
${escapeHtml(
  c.ad_name ||
  "Unnamed campaign"
)}
</strong>

<div class="note">
ID ${escapeHtml(
  String(
    c.campaign_id
  )
)}
</div>

</td>

<td>
${statusBadge(
  c.status
)}
</td>

<td>
${money(
  c.spend
)}
</td>

<td>
${money(
  c.gmv
)}
</td>

<td>
${formatRoas(
  c.roas
)}
</td>

<td>
${integer(
  c.orders
)}
</td>

<td>
${
  c.recommendation?.cpa ==
  null
    ? "—"
    : money(
        c.recommendation.cpa
      )
}
</td>

<td>
${economicBadge(
  c.recommendation
)}
</td>

<td>
${recommendationBadge(
  c.recommendation
)}
</td>

</tr>`
  ).join("")
}

</tbody>

</table>

</div>`;
}


// ============================================================
// GMV ITEM TABLE
// ============================================================

function gmsItemTable(
  items,
  config
) {
  if (
    !Array.isArray(
      items
    ) ||
    !items.length
  ) {
    return `
<p class="note">
No GMV Max items.
</p>`;
  }

  const economics =
    economicPolicy(
      config
    );

  return `
<div class="table-wrap">

<table>

<thead>

<tr>
<th>Product</th>
<th>Spend</th>
<th>GMV</th>
<th>ROAS</th>
<th>Orders</th>
<th>CPA</th>
<th>Clicks</th>
<th>Impressions</th>
<th>Signal</th>
</tr>

</thead>

<tbody>

${
  items.map(
    item => {

      const spend =
        number(
          item.spend
        );

      const orders =
        number(
          item.orders
        );

      const roas =
        number(
          item.roas
        );

      const cpa =
        orders > 0
          ? spend /
            orders
          : null;

      let signal = `
<span class="badge neutral">
Observe
</span>`;


      if (
        orders > 0 &&
        cpa >=
          economics.hardBreakEvenCpa
      ) {
        signal = `
<span class="badge danger">
Economic Risk
</span>`;

      } else if (
        orders === 0 &&
        spend >=
          economics.hardBreakEvenCpa
      ) {
        signal = `
<span class="badge danger">
Economic Risk
</span>`;

      } else if (
        orders > 0 &&
        cpa >
          economics.safeCpa
      ) {
        signal = `
<span class="badge warning">
Margin Watch
</span>`;

      } else if (
        orders === 0 &&
        spend >=
          economics.safeCpa
      ) {
        signal = `
<span class="badge warning">
Margin Watch
</span>`;

      } else if (
        orders > 0 &&
        roas >=
          config.targetRoas &&
        cpa !== null &&
        cpa <=
          economics.safeCpa
      ) {
        signal = `
<span class="badge good">
Economically Safe
</span>`;
      }


      return `
<tr>

<td class="campaign-name">

<strong>
${escapeHtml(
  item.item_name ||
  "Unnamed product"
)}
</strong>

<div class="note">
Item ${escapeHtml(
  String(
    item.item_id
  )
)}
</div>

</td>

<td>
${money(
  spend
)}
</td>

<td>
${money(
  item.gmv
)}
</td>

<td>
${formatRoas(
  roas
)}
</td>

<td>
${integer(
  orders
)}
</td>

<td>
${
  cpa === null
    ? "—"
    : money(
        cpa
      )
}
</td>

<td>
${integer(
  item.clicks
)}
</td>

<td>
${integer(
  item.impressions
)}
</td>

<td>
${signal}
</td>

</tr>`;
    }
  ).join("")
}

</tbody>

</table>

</div>`;
}


// ============================================================
// DAILY TABLE
// ============================================================

function dailyTable(
  rows
) {
  if (
    !Array.isArray(
      rows
    ) ||
    !rows.length
  ) {
    return `
<p class="note">
No data.
</p>`;
  }

  return `
<div class="table-wrap">

<table>

<thead>

<tr>
<th>Date</th>
<th>Spend</th>
<th>GMV</th>
<th>ROAS</th>
<th>Orders</th>
</tr>

</thead>

<tbody>

${
  rows.map(
    row => {

      const spend =
        number(
          row.expense
        );

      const gmv =
        number(
          row.broad_gmv ??
          row.direct_gmv
        );

      const orders =
        number(
          row.broad_order ??
          row.direct_order
        );

      return `
<tr>

<td>
${escapeHtml(
  formatApiDate(
    row.date
  )
)}
</td>

<td>
${money(
  spend
)}
</td>

<td>
${money(
  gmv
)}
</td>

<td>
${formatRoas(
  spend > 0
    ? gmv /
      spend
    : 0
)}
</td>

<td>
${integer(
  orders
)}
</td>

</tr>`;
    }
  ).join("")
}

</tbody>

</table>

</div>`;
}


// ============================================================
// KEYWORDS
// ============================================================

function keywordTable(
  keywords
) {
  if (
    !keywords.length
  ) {
    return `
<p class="note">
Shopee authorized the keyword recommendation source,
but no recommended keywords were returned for this product.
</p>`;
  }

  return `
<div class="table-wrap">

<table>

<thead>

<tr>
<th>Keyword</th>
<th>Quality</th>
<th>30d Search Volume</th>
<th>Suggested Bid</th>
</tr>

</thead>

<tbody>

${
  keywords.map(
    k => `
<tr>

<td>
<strong>
${escapeHtml(
  k.keyword ||
  ""
)}
</strong>
</td>

<td>
${integer(
  k.quality_score
)}
</td>

<td>
${integer(
  k.search_volume
)}
</td>

<td>
${moneyOrDash(
  k.suggested_bid
)}
</td>

</tr>`
  ).join("")
}

</tbody>

</table>

</div>`;
}


// ============================================================
// SOURCE HEALTH
// ============================================================

function sourceHealth(
  sources
) {
  if (
    !sources ||
    !Object.keys(
      sources
    ).length
  ) {
    return `
<p class="note">
No source diagnostics.
</p>`;
  }

  return `
<div class="source-row">

${
  Object.entries(
    sources
  ).map(
    (
      [
        name,
        info
      ]
    ) => `
<span
class="badge ${
  info?.ok
    ? "good"
    : "danger"
}">

${escapeHtml(
  humanize(
    name
  )
)}:

${
  info?.ok
    ? "OK"
    : "Unavailable"
}

${
  info?.status
    ? ` (${escapeHtml(
        String(
          info.status
        )
      )})`
    : ""
}

</span>`
  ).join("")
}

</div>`;
}


// ============================================================
// TAGS
// ============================================================

function tagList(
  values,
  css =
    ""
) {
  if (
    !Array.isArray(
      values
    ) ||
    !values.length
  ) {
    return `
<span class="note">
—
</span>`;
  }

  return `
<div class="tags">

${
  values.map(
    v => `
<span class="tag ${css}">
${escapeHtml(
  humanize(
    v
  )
)}
</span>`
  ).join("")
}

</div>`;
}


// ============================================================
// COVERAGE
// ============================================================

function coverageGate(
  coverage
) {
  if (
    !coverage.ready
  ) {
    return `
<div class="locked">

<strong>
Automation Locked
</strong>

<p class="note">
${escapeHtml(
  coverage.reason ||
  "Coverage unavailable."
)}
</p>

</div>`;
  }

  if (
    coverage.locked
  ) {
    return `
<div class="locked">

<strong>
🔒 Automation Locked
</strong>

<p class="note">
Minimum reconciled coverage:
<strong>
${percentNumber(
  coverage.minimumCoverage
)}
</strong>
</p>

<p class="note">
Required:
${percentNumber(
  coverage.threshold
)}
</p>

<p class="note">
${escapeHtml(
  coverage.reason
)}
</p>

</div>`;
  }

  return `
<div class="unlocked">

<strong>
✓ Data Coverage Passed
</strong>

<p class="note">
Minimum coverage:
${percentNumber(
  coverage.minimumCoverage
)}
</p>

<p class="note">
Automatic actions are technically eligible,
but remain disabled until explicitly enabled.
</p>

</div>`;
}


function coverageDetails(
  coverage
) {
  if (
    !coverage.ready
  ) {
    return `
<p class="note">
Coverage unavailable.
</p>`;
  }

  return `
${coverageLine(
  "Spend",
  coverage.spend
)}

${coverageLine(
  "GMV",
  coverage.gmv
)}

${coverageLine(
  "Orders",
  coverage.orders,
  true
)}

<div class="feature">

<strong>
Minimum Coverage
</strong>

${percentNumber(
  coverage.minimumCoverage
)}

</div>`;
}


function coverageLine(
  label,
  data,
  integerMode =
    false
) {
  const coverage =
    data.coverage ??
    0;

  const width =
    Math.min(
      100,
      Math.max(
        0,
        coverage
      )
    );

  return `
<div class="feature">

<strong>
${escapeHtml(
  label
)}
</strong>

<div class="note">

Account:
${
  integerMode
    ? integer(
        data.account
      )
    : money(
        data.account
      )
}

&nbsp;•&nbsp;

Explained:
${
  integerMode
    ? integer(
        data.explained
      )
    : money(
        data.explained
      )
}

&nbsp;•&nbsp;

Residual:
${
  integerMode
    ? integer(
        data.residual
      )
    : money(
        data.residual
      )
}

</div>

<div class="coverage-bar">

<div
class="coverage-fill ${
  coverage < 95
    ? "low"
    : ""
}"
style="width:${width}%">
</div>

</div>

<div class="note">
${percentNumber(
  coverage
)}
</div>

</div>`;
}


// ============================================================
// UI HELPERS
// ============================================================

function metricCard(
  label,
  value,
  css =
    ""
) {
  return `
<div class="card">

<div class="label">
${escapeHtml(
  label
)}
</div>

<div class="value ${css}">
${escapeHtml(
  value
)}
</div>

</div>`;
}


function miniMetric(
  label,
  value
) {
  return `
<div class="mini">

<div class="label">
${escapeHtml(
  label
)}
</div>

<strong>
${escapeHtml(
  value
)}
</strong>

</div>`;
}


function filterLink(
  value,
  label,
  active
) {
  return `
<a
class="filter ${
  value === active
    ? "active"
    : ""
}"
href="/campaigns?filter=${encodeURIComponent(
  value
)}">

${escapeHtml(
  label
)}

</a>`;
}


function recommendationBadge(
  recommendation
) {
  const map = {
    scale: [
      "Scale",
      "good"
    ],

    maintain: [
      "Maintain",
      "good"
    ],

    observe: [
      "Observe",
      "neutral"
    ],

    reduce: [
      "Reduce",
      "warning"
    ],

    pause_review: [
      "Review Pause",
      "danger"
    ],

    inactive: [
      "Inactive",
      "neutral"
    ]
  };

  const [
    defaultLabel,
    css
  ] =
    map[
      recommendation
        ?.action
    ] ||
    [
      "Observe",
      "neutral"
    ];

  const label =
    recommendation?.label ||
    defaultLabel;

  return `
<span class="badge ${css}">
${escapeHtml(
  label
)}
</span>`;
}


function economicBadge(
  recommendation
) {
  const status =
    String(
      recommendation
        ?.economic_status ||
      "safe"
    );

  if (
    status ===
    "hard_limit"
  ) {
    return `
<span class="badge danger">
Economic Risk
</span>`;
  }

  if (
    status ===
    "above_safe_cpa"
  ) {
    return `
<span class="badge warning">
Above Safe CPA
</span>`;
  }

  if (
    status ===
    "margin_watch"
  ) {
    return `
<span class="badge warning">
Margin Watch
</span>`;
  }

  if (
    status ===
    "inactive"
  ) {
    return `
<span class="badge neutral">
Inactive
</span>`;
  }

  if (
    status ===
    "paused"
  ) {
    return `
<span class="badge neutral">
Paused
</span>`;
  }

  return `
<span class="badge good">
Safe
</span>`;
}


function statusBadge(
  status
) {
  const normalized =
    String(
      status ||
      "unknown"
    ).toLowerCase();

  const allowed = [
    "ongoing",
    "paused",
    "closed",
    "ended"
  ];

  const css =
    allowed.includes(
      normalized
    )
      ? normalized
      : "unknown";

  return `
<span
class="badge status-${css}">
${escapeHtml(
  normalized
)}
</span>`;
}


function bestGmsItem(
  item
) {
  if (!item) {
    return `
<p class="note">
No product with attributed orders yet.
</p>`;
  }

  return `
<div class="signal good">

<strong>
${escapeHtml(
  item.item_name ||
  String(
    item.item_id
  )
)}
</strong>

<div class="note">

Spend:
${money(
  item.spend
)}

<br>

GMV:
${money(
  item.gmv
)}

<br>

ROAS:
${formatRoas(
  item.roas
)}

<br>

Orders:
${integer(
  item.orders
)}

</div>

</div>`;
}


function errorPanel(
  title,
  message
) {
  return `
<div class="panel">

<div class="signal danger">

<strong>
${escapeHtml(
  title
)}
</strong>

<div class="note">
${escapeHtml(
  message ||
  ""
)}
</div>

</div>

</div>`;
}


function disconnectedPanel() {
  return `
<div class="panel">

<h2>
Shopee
</h2>

<div class="connection-status warning">
Not connected
</div>

<a
class="connect"
href="https://auth.brazacommerce.com.br/shopee/connect">
Connect Shopee
</a>

</div>`;
}


// ============================================================
// LOGIN
// ============================================================

function loginPage(
  error
) {
  return `<!doctype html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1">

<title>
MLS Commerce Ads
</title>

<style>

*{
  box-sizing:border-box
}

body{
  margin:0;
  min-height:100vh;
  display:flex;
  font-family:Arial,sans-serif;
  background:#f5f7fb
}

.left{
  width:52%;
  background:#111827;
  color:white;
  padding:60px;
  display:flex;
  align-items:center
}

.right{
  width:48%;
  display:flex;
  justify-content:center;
  align-items:center;
  padding:40px
}

.card{
  max-width:420px;
  width:100%;
  background:white;
  border:1px solid #e5e7eb;
  border-radius:14px;
  padding:38px
}

.brand{
  font-size:26px;
  font-weight:800
}

.brand span{
  color:#ee4d2d
}

h1{
  font-size:44px
}

input{
  width:100%;
  padding:13px;
  margin:7px 0 14px;
  border:1px solid #d1d5db;
  border-radius:8px
}

button{
  width:100%;
  padding:14px;
  background:#ee4d2d;
  color:white;
  border:0;
  border-radius:8px;
  font-weight:700
}

.error{
  background:#fee2e2;
  color:#991b1b;
  padding:10px;
  border-radius:8px;
  margin-bottom:15px
}

@media(max-width:800px){
  .left{
    display:none
  }

  .right{
    width:100%
  }
}

</style>

</head>

<body>

<div class="left">

<div>

<div class="brand">
MLS Commerce <span>Ads</span>
</div>

<h1>
Shopee Ads Intelligence
</h1>

<p>
Product Ads, GMV Max,
recommendation intelligence
and optimization guidance.
</p>

</div>

</div>

<div class="right">

<div class="card">

<h2>
Sign in
</h2>

${
  error
    ? `
<div class="error">
Invalid username or password.
</div>
`
    : ""
}

<form
method="POST"
action="/login">

<label>
Username
</label>

<input
name="username"
required>

<label>
Password
</label>

<input
name="password"
type="password"
required>

<button>
Sign in
</button>

</form>

</div>

</div>

</body>

</html>`;
}


// ============================================================
// FORMATTERS + ECONOMIC POLICY
// ============================================================

function number(
  value
) {
  const n =
    Number(
      value
    );

  return Number.isFinite(
    n
  )
    ? n
    : 0;
}


function round2(
  value
) {
  return Math.round(
    (
      number(
        value
      ) +
      Number.EPSILON
    ) *
    100
  ) /
  100;
}


function money(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  return new Intl.NumberFormat(
    "pt-BR",
    {
      style:
        "currency",

      currency:
        "BRL"
    }
  ).format(
    number(
      value
    )
  );
}


function moneyOrDash(
  value
) {
  return (
    value === null ||
    value === undefined ||
    value === ""
  )
    ? "—"
    : money(
        value
      );
}


function integer(
  value
) {
  return new Intl.NumberFormat(
    "pt-BR",
    {
      maximumFractionDigits:
        0
    }
  ).format(
    number(
      value
    )
  );
}


function percent(
  value
) {
  return new Intl.NumberFormat(
    "pt-BR",
    {
      style:
        "percent",

      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2
    }
  ).format(
    number(
      value
    )
  );
}


function percentNumber(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  return (
    number(
      value
    )
      .toLocaleString(
        "pt-BR",
        {
          minimumFractionDigits:
            2,

          maximumFractionDigits:
            2
        }
      ) +
    "%"
  );
}


function formatRoas(
  value
) {
  return (
    number(
      value
    )
      .toLocaleString(
        "pt-BR",
        {
          minimumFractionDigits:
            2,

          maximumFractionDigits:
            2
        }
      ) +
    "x"
  );
}


function roiValue(
  value
) {
  return value
    ?.value ==
    null
      ? "—"
      : formatRoas(
          value.value
        );
}


function roiValueWithPercentile(
  value
) {
  if (
    !value ||
    value.value ==
      null
  ) {
    return "—";
  }

  return (
    formatRoas(
      value.value
    ) +
    (
      value.percentile !=
      null
        ? ` · percentile ${escapeHtml(
            String(
              value.percentile
            )
          )}`
        : ""
    )
  );
}


function budgetMaximum(
  value
) {
  const n =
    number(
      value
    );

  if (!n) {
    return "—";
  }

  if (
    n >=
    10000000
  ) {
    return "Technical limit";
  }

  return money(
    n
  );
}


function formatApiDate(
  value
) {
  const text =
    String(
      value ||
      ""
    );

  const match =
    text.match(
      /^(\d{2})-(\d{2})-(\d{4})$/
    );

  return match
    ? (
        match[1] +
        "/" +
        match[2] +
        "/" +
        match[3]
      )
    : text;
}


function safePositiveNumber(
  value,
  fallback
) {
  const n =
    Number(
      value
    );

  return (
    Number.isFinite(
      n
    ) &&
    n > 0
  )
    ? n
    : fallback;
}


function safeFraction(
  value,
  fallback
) {
  const n =
    Number(
      value
    );

  return (
    Number.isFinite(
      n
    ) &&
    n > 0 &&
    n <= 1
  )
    ? n
    : fallback;
}


function economicPolicy(
  config
) {
  const unitCost =
    number(
      config.unitCost
    );

  const netPayout =
    number(
      config.netPayout
    );

  const contributionMargin =
    Math.max(
      0,
      netPayout -
      unitCost
    );

  const maxAdShare =
    number(
      config.maxAdShareOfMargin
    ) ||
    0.40;

  const safeCpa =
    round2(
      contributionMargin *
      maxAdShare
    );

  const hardBreakEvenCpa =
    round2(
      contributionMargin
    );

  const retainedProfit =
    round2(
      contributionMargin -
      safeCpa
    );

  return {
    unitCost:
      round2(
        unitCost
      ),

    netPayout:
      round2(
        netPayout
      ),

    contributionMargin:
      round2(
        contributionMargin
      ),

    safeCpa,

    hardBreakEvenCpa,

    retainedProfit,

    maxAdShare
  };
}


function humanize(
  value
) {
  return String(
    value ??
    ""
  )
    .replace(
      /_/g,
      " "
    )
    .replace(
      /\b\w/g,
      c =>
        c.toUpperCase()
    );
}


// ============================================================
// RESPONSES
// ============================================================

function html(
  content,
  status =
    200
) {
  return new Response(
    content,
    {
      status,

      headers: {
        "content-type":
          "text/html; charset=UTF-8",

        "cache-control":
          "no-store",

        "x-content-type-options":
          "nosniff",

        "x-frame-options":
          "DENY",

        "referrer-policy":
          "no-referrer",

        "content-security-policy":
          "default-src 'self'; " +
          "style-src 'unsafe-inline'; " +
          "form-action 'self'; " +
          "base-uri 'none'; " +
          "frame-ancestors 'none'"
      }
    }
  );
}


function json(
  data,
  status =
    200
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
        "content-type":
          "application/json; charset=UTF-8",

        "cache-control":
          "no-store"
      }
    }
  );
}


async function safeJsonResponse(
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


function escapeHtml(
  value
) {
  return String(
    value ??
    ""
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