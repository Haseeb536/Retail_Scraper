// content.js
console.log("Retail Scraper Content Script Loaded.");

(function initRetailScraper() {
  if (window.__RETAIL_SCRAPER_INIT__) {
    console.log("Retail Scraper already initialized.");
    return;
  }
  window.__RETAIL_SCRAPER_INIT__ = true;

  const STORAGE_KEYS = {
    ACTIVE: "retail_scraper_active",
    DATA: "retail_scraper_data",
    PAGE: "retail_scraper_page",
    TOKEN: "retail_scraper_token",
    MODE: "retail_scraper_mode",
    NAV_STARTED: "retail_scraper_nav_started"
  };

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const PAGE_SETTLE_MS = 5000;

  const getStorage = (keys) => new Promise(r => chrome.storage.local.get(keys, r));
  const setStorage = (obj) => new Promise(r => chrome.storage.local.set(obj, r));

  function updateOverlay(text, count = 0, page = 1) {
    console.log(`[Progress] Status: ${text}, Page: ${page}, Valid Rows: ${count}`);
  }

  function getPageFromUrl(url = window.location.href) {
    try {
      const match = new URL(url).pathname.match(/\/pg-(\d+)\/?$/i);
      return match ? parseInt(match[1], 10) : 1;
    } catch {
      return 1;
    }
  }

  function buildPageUrl(pageNum, baseUrl = window.location.href) {
    const url = new URL(baseUrl);
    let path = url.pathname.replace(/\/pg-\d+\/?$/i, "");
    if (pageNum > 1) {
      path = `${path.replace(/\/$/, "")}/pg-${pageNum}`;
    }
    url.pathname = path;
    return url.href;
  }

  function isListingPage(url = window.location.href) {
    try {
      const path = new URL(url).pathname;
      return (
        path.includes("/apartments/") ||
        path.includes("/realestateandhomes-search/") ||
        path.includes("/realestateandhomes-detail/")
      );
    } catch {
      return false;
    }
  }

  function getNextData() {
    const el = document.getElementById("__NEXT_DATA__");
    if (!el?.textContent) return null;
    try {
      return JSON.parse(el.textContent);
    } catch {
      return null;
    }
  }

  function getSearchResultsPayload() {
    const data = getNextData();
    const searchResults = data?.props?.pageProps?.searchResults;
    if (!searchResults) return null;

    const preferredKeys = [
      "home_search",
      "rent_search",
      "apartment_search",
      "for_rent_search",
      "for_rent"
    ];
    for (const key of preferredKeys) {
      const block = searchResults[key];
      if (block?.results?.length) return block;
    }

    for (const key of Object.keys(searchResults)) {
      const block = searchResults[key];
      if (block && Array.isArray(block.results) && block.results.length > 0) {
        return block;
      }
    }

    return (
      searchResults.home_search ||
      searchResults.rent_search ||
      searchResults.apartment_search ||
      searchResults
    );
  }

  function getListingResults() {
    const payload = getSearchResultsPayload();
    if (!payload) return [];
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload)) return payload;
    return [];
  }

  function getSearchMeta() {
    const payload = getSearchResultsPayload();
    if (!payload) return null;

    const total = payload.total || payload.count || 0;
    const results = getListingResults();
    const pageSize = results.length || payload.page_size || 25;
    const currentPage = getPageFromUrl();

    return {
      total,
      pageSize,
      currentPage,
      resultCount: results.length,
      hasMore: total > 0 ? currentPage * pageSize < total : results.length >= pageSize
    };
  }

  function formatListingAddress(location) {
    const addr = location?.address || location || {};
    return [
      addr.line || addr.address_formatted_line_1,
      addr.city,
      addr.state_code || addr.state,
      addr.postal_code || addr.zip
    ].filter(Boolean).join(", ");
  }

  function scrapeListingsFromNextData() {
    const results = getListingResults();
    const listings = [];

    for (const listing of results) {
      const id = listing.property_id || listing.listing_id || listing.permalink || "";
      const desc = listing.description || listing;
      const address = formatListingAddress(listing.location);
      const price = listing.list_price ?? listing.price ?? listing.list_price_min ?? "";
      const beds = desc.beds ?? desc.beds_min ?? "";
      const baths = desc.baths ?? desc.baths_consolidated ?? desc.baths_full ?? "";
      const sqft = desc.sqft ?? desc.sqft_min ?? "";
      const url = listing.permalink
        ? `https://www.realtor.com${listing.permalink.startsWith("/") ? "" : "/"}${listing.permalink}`
        : "";

      let agentName = "";
      let agentPhone = "";
      for (const item of listing.branding || []) {
        if (item.phone) {
          agentName = item.name || agentName;
          agentPhone = item.phone;
          if ((item.type || "").toLowerCase() === "agent") break;
        }
      }

      listings.push({ id: String(id || url || address), address, price, beds, baths, sqft, agentName, agentPhone, url });
    }

    return listings;
  }

  function scrapeListingsFromDOM() {
    const listings = [];
    document.querySelectorAll('[data-testid="property-card"], [data-testid*="property-card"]').forEach((card) => {
      const address = card.querySelector('[data-testid="card-address"]')?.textContent?.trim() || "";
      const price = card.querySelector('[data-testid="card-price"]')?.textContent?.trim() || "";
      const url = card.querySelector('a[data-testid="card-anchor"]')?.href || "";
      const beds = card.querySelector('[data-testid="property-meta-beds"]')?.textContent?.trim() || "";
      const baths = card.querySelector('[data-testid="card-meta-baths"], [data-testid="property-meta-baths"]')?.textContent?.trim() || "";
      const sqft = card.querySelector('[data-testid="card-meta-sqft"], [data-testid="property-meta-sqft"]')?.textContent?.trim() || "";
      const id = url || address;
      if (!id) return;
      listings.push({ id, address, price, beds, baths, sqft, agentName: "", agentPhone: "", url });
    });
    return listings;
  }

  function scrapeFromNextData() {
    const results = getListingResults();
    const uniqueAgents = new Map();

    for (const listing of results) {
      const listingAddress = formatListingAddress(listing.location);
      const branding = listing.branding || [];

      for (const item of branding) {
        if (!item.phone && !item.name) continue;

        const id =
          item.agent_id ||
          item.advertiser_id ||
          item.profile_id ||
          `listing-${String(item.name || "agent").replace(/\s+/g, "-")}-${String(item.phone || "").replace(/\D/g, "")}`;

        uniqueAgents.set(id, {
          url: item.href || item.profile_url || "",
          name: item.name || "",
          phone: item.phone || "",
          address: listingAddress,
          fromListing: true
        });
      }

      const advertisers = listing.advertisers || [];
      for (const ad of advertisers) {
        const agentId =
          ad.agent_id || ad.profile_id || ad.advertiser_id || extractAgentId(ad.href || ad.profile_url || "");
        if (!agentId) continue;

        uniqueAgents.set(agentId, {
          url: ad.href || ad.profile_url || `https://www.realtor.com/realestateagents/${agentId}`,
          name: ad.name || ad.fullname || "",
          phone: ad.phone || "",
          address: listingAddress,
          fromListing: Boolean(ad.phone)
        });
      }
    }

    return Array.from(uniqueAgents.entries());
  }

  function extractAgentId(href) {
    try {
      const url = new URL(href);
      const match = url.pathname.match(/\/(?:realestateagents|agentprofile)\/([^/?#]+)/i);
      if (!match) return null;

      const id = match[1].split("?")[0];
      if (!id || id.includes("pg-")) return null;

      // 24-char hex profile ID (current Realtor.com format)
      if (/^[a-f0-9]{24}$/i.test(id)) return id;

      // Legacy slug: Name_City_ST_fulfillmentId (must contain underscore beyond city_state)
      if (id.includes("_") && !/^[a-z0-9-]+_[a-z]{2}$/i.test(id)) return id;

      return null;
    } catch {
      return null;
    }
  }

  const QUERY = `
    query AgentBrandingProfile($agentBrandingInput: AgentBrandingInput) {
      agent_branding(agent_branding_input: $agentBrandingInput) {
        branding {
          fullname
          phones { type value }
          office {
            address {
              address_formatted_line_1
              address_formatted_line_2
              city
              state_code
              postal_code
            }
          }
        }
      }
    }
    `;

  async function fetchAgentDetails(agentId) {
    try {
      const res = await fetch("https://www.realtor.com/frontdoor/graphql", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "rdc-client-name": "agent-branding-profile",
          "rdc-client-version": "3.0.0"
        },
        body: JSON.stringify({
          operationName: "AgentBrandingProfile",
          query: QUERY,
          variables: {
            agentBrandingInput: {
              profile_id: agentId,
              fulfillment_id: null,
              nrds_id: null
            }
          }
        })
      });

      if (!res.ok) {
        console.warn(`GraphQL HTTP ${res.status} for agent ${agentId}`);
        return null;
      }

      const data = await res.json();
      if (data.errors?.length) {
        console.warn(`GraphQL errors for ${agentId}:`, data.errors[0]?.message);
        return null;
      }

      const branding = data.data?.agent_branding?.branding;
      if (!branding) return null;

      const name = branding.fullname || "";
      const phones = branding.phones || [];
      let phone = "";
      for (const p of phones) {
        if (p.value) { phone = p.value; break; }
      }
      const addr = branding.office?.address || {};
      const address = [
        addr.address_formatted_line_1,
        addr.address_formatted_line_2,
        addr.city,
        addr.state_code,
        addr.postal_code
      ].filter(Boolean).join(", ");

      return { name, phone, address };
    } catch (e) {
      console.error("Fetch error for " + agentId, e);
      return null;
    }
  }

  async function scrapeCurrentPage() {
    const uniqueAgents = new Map();

    function addAgent(href, name, extra = {}) {
      const agentId = extractAgentId(href);
      if (!agentId) return;
      if (!uniqueAgents.has(agentId) || (name && !uniqueAgents.get(agentId).name)) {
        uniqueAgents.set(agentId, { url: href, name: name || "", ...extra });
      }
    }

    function addDirectAgent(id, info) {
      if (!id) return;
      if (!uniqueAgents.has(id) || (info.name && !uniqueAgents.get(id).name)) {
        uniqueAgents.set(id, info);
      }
    }

    // Listing / apartment pages — parse embedded Next.js data first
    if (isListingPage()) {
      for (const [id, info] of scrapeFromNextData()) {
        addDirectAgent(id, info);
      }
    }

    // Agent cards (agent search pages)
    const cards = document.querySelectorAll(
      '[data-testid="component-agentCard"], [data-testid*="agentCard"], [data-testid*="AgentCard"]'
    );
    cards.forEach((card) => {
      const link = card.querySelector('a[href*="/realestateagents/"], a[href*="/agentprofile/"]');
      if (link) {
        addAgent(link.href, (link.innerText || link.textContent || "").trim());
      }
    });

    // Property listing cards (apartments / homes search)
    const propertyCards = document.querySelectorAll(
      '[data-testid="property-card"], [data-testid*="property-card"], [class*="PropertyCard"], [class*="property-card"]'
    );
    propertyCards.forEach((card) => {
      card.querySelectorAll('a[href*="/realestateagents/"], a[href*="/agentprofile/"]').forEach((link) => {
        addAgent(link.href, (link.innerText || link.textContent || "").trim());
      });
    });

    if (uniqueAgents.size === 0) {
      const selectors = [
        'a[href*="/realestateagents/"]',
        'a[href*="/agentprofile/"]',
        '[data-testid*="agent"] a[href*="realestateagents"]',
        '[data-testid*="property"] a[href*="realestateagents"]'
      ];
      Array.from(document.querySelectorAll(selectors.join(", "))).forEach((link) => {
        addAgent(link.href, (link.innerText || link.textContent || "").trim());
      });
    }

    return Array.from(uniqueAgents.entries());
  }

  async function waitForDocumentReady(timeoutMs = 15000) {
    if (document.readyState === "complete") return;
    await Promise.race([
      new Promise((resolve) => window.addEventListener("load", resolve, { once: true })),
      delay(timeoutMs)
    ]);
  }

  function isPageStillLoading() {
    if (document.readyState !== "complete") return true;

    const busy = document.querySelector(
      '[data-testid*="loading"], [data-testid*="spinner"], [aria-busy="true"]'
    );
    if (busy) return true;

    const skeletons = document.querySelectorAll(
      '[data-testid*="skeleton"], [class*="Skeleton"], [class*="skeleton"]'
    );
    if (skeletons.length >= 3) return true;

    return false;
  }

  function hasScrapableContent() {
    if (isListingPage()) {
      return getListingResults().length > 0 || scrapeListingsFromDOM().length > 0;
    }

    const agentCards = document.querySelectorAll(
      '[data-testid="component-agentCard"], [data-testid*="agentCard"], [data-testid*="AgentCard"]'
    );
    return agentCards.length > 0 || scrapeFromNextData().length > 0;
  }

  async function waitForPageReady(expectedPage, maxWaitMs = 25000) {
    const targetPage = expectedPage || getPageFromUrl();
    console.log(`Waiting for page ${targetPage} to finish loading...`);
    updateOverlay(`Waiting for page ${targetPage}...`);

    await waitForDocumentReady();
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      const urlPage = getPageFromUrl();
      if (urlPage !== targetPage) {
        await delay(400);
        continue;
      }

      if (!getNextData()) {
        await delay(400);
        continue;
      }

      if (isPageStillLoading()) {
        await delay(500);
        continue;
      }

      if (hasScrapableContent()) {
        console.log(`Page ${targetPage} is ready (${Date.now() - start}ms)`);
        await delay(600);
        return true;
      }

      await delay(500);
    }

    console.warn(`Page ${targetPage} load wait timed out after ${maxWaitMs}ms — continuing`);
    return false;
  }

  async function scrollDown() {
    const maxScroll = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    window.scrollTo({ top: maxScroll, behavior: "smooth" });
    await delay(1500);
  }

  async function scrollUp() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    await delay(1000);
  }

  async function scrollPageFull() {
    console.log("Scrolling down...");
    updateOverlay("Scrolling down...");
    await scrollDown();
    console.log("Scrolling up...");
    updateOverlay("Scrolling up...");
    await scrollUp();
  }

  async function preparePageForScrape(pageNum) {
    if (pageNum > 1) {
      console.log(`Page ${pageNum}: waiting ${PAGE_SETTLE_MS / 1000}s after navigation...`);
      updateOverlay(`Waiting ${PAGE_SETTLE_MS / 1000}s on page ${pageNum}...`);
      await delay(PAGE_SETTLE_MS);
      return;
    }
    await waitForDocumentReady();
  }

  async function scrapeListingsAfterScroll() {
    const byId = new Map();

    for (const item of scrapeListingsFromNextData()) {
      byId.set(item.id, item);
    }
    for (const item of scrapeListingsFromDOM()) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }

    return Array.from(byId.values());
  }

  async function waitForPageData(maxWaitMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const listings = scrapeListingsFromNextData();
      if (listings.length > 0) {
        return { type: "listings", data: listings };
      }

      const agents = await scrapeCurrentPage();
      if (agents.length > 0) {
        return { type: "agents", data: agents };
      }

      const meta = getSearchMeta();
      if (meta?.resultCount > 0) {
        const retryListings = scrapeListingsFromNextData();
        if (retryListings.length > 0) {
          return { type: "listings", data: retryListings };
        }
      }

      if (getNextData()) {
        const domListings = scrapeListingsFromDOM();
        if (domListings.length > 0) {
          return { type: "listings", data: domListings };
        }
        if (Date.now() - start > 4000) break;
      }

      await delay(800);
    }

    const domListings = scrapeListingsFromDOM();
    if (domListings.length > 0) {
      return { type: "listings", data: domListings };
    }

    const agents = await scrapeCurrentPage();
    return { type: "agents", data: agents };
  }

  function shouldTryNextPage(collectedCount) {
    const meta = getSearchMeta();
    if (meta?.total > 0) {
      return meta.hasMore;
    }
    if (collectedCount > 0) {
      const pageSize = meta?.pageSize || meta?.resultCount || 20;
      return collectedCount >= Math.min(pageSize, 20);
    }
    return false;
  }

  async function ensureOnPage(targetPage) {
    const urlPage = getPageFromUrl();
    if (urlPage === targetPage) return true;

    const targetUrl = buildPageUrl(targetPage);
    console.log(`Navigating from URL page ${urlPage} to page ${targetPage}: ${targetUrl}`);
    await setStorage({
      [STORAGE_KEYS.PAGE]: targetPage,
      [STORAGE_KEYS.NAV_STARTED]: Date.now()
    });
    window.location.href = targetUrl;
    return false;
  }

  async function tryClickNextPage() {
    const paginationRoot = document.querySelector(
      "[data-testid*='pagination'], nav[aria-label*='Pagination'], nav[aria-label*='pagination'], [class*='Pagination']"
    );
    const searchRoot = paginationRoot || document;

    const nextSelectors = [
      "a[data-testid='pagination-next']",
      "button[data-testid='pagination-next']",
      "a[data-testid*='pagination-next']",
      "button[data-testid*='pagination-next']",
      "a[aria-label='Go to next page']",
      "a[aria-label='Next page']",
      "button[aria-label='Go to next page']",
      "button[aria-label='Next page']",
      "a[rel='next']"
    ];

    for (const sel of nextSelectors) {
      const btn = searchRoot.querySelector(sel);
      if (btn && !btn.hasAttribute("disabled") && btn.getAttribute("aria-disabled") !== "true") {
        console.log("Found next button by selector:", sel);
        btn.scrollIntoView({ block: "center", behavior: "smooth" });
        await delay(500);
        btn.click();
        return true;
      }
    }

    if (paginationRoot) {
      const currentPage = getPageFromUrl();
      const pageLinks = Array.from(paginationRoot.querySelectorAll("a, button"));
      const nextNumLink = pageLinks.find((el) => {
        const text = (el.textContent || "").trim();
        return text === String(currentPage + 1);
      });
      if (nextNumLink) {
        console.log("Found next page number link:", currentPage + 1);
        nextNumLink.scrollIntoView({ block: "center", behavior: "smooth" });
        await delay(500);
        nextNumLink.click();
        return true;
      }
    }

    return false;
  }

  async function goToNextPage(collectedOnPage = 0) {
    const urlPage = getPageFromUrl();
    const nextPage = urlPage + 1;
    const searchMeta = getSearchMeta();

    if (searchMeta?.total > 0 && !searchMeta.hasMore) {
      console.log(`No more listing pages (${searchMeta.currentPage} of ~${Math.ceil(searchMeta.total / searchMeta.pageSize)}).`);
      return "done";
    }

    if (!shouldTryNextPage(collectedOnPage)) {
      console.log(`Skipping next page — only ${collectedOnPage} results on page ${urlPage}.`);
      return "done";
    }

    if (await tryClickNextPage()) {
      await delay(1500);
      if (getPageFromUrl() > urlPage) {
        console.log(`Clicked through to page ${getPageFromUrl()}`);
        await setStorage({ [STORAGE_KEYS.PAGE]: getPageFromUrl() });
        return "continued";
      }
    }

    const nextUrl = buildPageUrl(nextPage);
    if (nextUrl === window.location.href) {
      return "done";
    }

    console.log(`Navigating to page ${nextPage} via URL: ${nextUrl}`);
    await setStorage({
      [STORAGE_KEYS.PAGE]: nextPage,
      [STORAGE_KEYS.NAV_STARTED]: Date.now()
    });
    window.location.href = nextUrl;
    return "navigating";
  }

  async function runScraperLogic() {
    try {
      const storage = await getStorage([
        STORAGE_KEYS.DATA,
        STORAGE_KEYS.PAGE,
        STORAGE_KEYS.TOKEN,
        STORAGE_KEYS.MODE,
        "retail_scraper_stop_requested"
      ]);
      let currentData = storage[STORAGE_KEYS.DATA] || [];
      let page = storage[STORAGE_KEYS.PAGE] || 1;
      const jwt = storage[STORAGE_KEYS.TOKEN];
      const listingMode = isListingPage() || storage[STORAGE_KEYS.MODE] === "listings";

      if (!jwt) {
        await setStorage({ [STORAGE_KEYS.ACTIVE]: false });
        return;
      }

      if (storage.retail_scraper_stop_requested) {
        console.log("Stop requested at start of loop.");
        await finalizeScrape(currentData, listingMode ? "listings" : "agents");
        return;
      }
      const seenIds = new Set(currentData.map(row => row[0]));
      const urlPage = getPageFromUrl();

      if (page === 1 && urlPage !== 1) {
        console.log(`Session starts on page 1 but browser is on page ${urlPage}. Redirecting...`);
        const onFirst = await ensureOnPage(1);
        if (!onFirst) return;
      }

      if (page !== urlPage) {
        console.log(`Syncing to page ${page} (URL shows page ${urlPage})...`);
        const synced = await ensureOnPage(page);
        if (!synced) return;
      }

      if (listingMode) {
        await setStorage({ [STORAGE_KEYS.MODE]: "listings" });
      }

      updateOverlay("SCANNING...", currentData.length, page);
      await preparePageForScrape(page);
      await scrollPageFull();

      updateOverlay("Scraping...", currentData.length, page);
      let listings = [];
      let agents = [];

      if (listingMode) {
        listings = await scrapeListingsAfterScroll();
        if (listings.length === 0) {
          const pageData = await waitForPageData();
          listings = pageData.type === "listings" ? pageData.data : await scrapeListingsAfterScroll();
        }
      } else {
        const pageData = await waitForPageData();
        agents = pageData.type === "agents" ? pageData.data : await scrapeCurrentPage();
      }

      if (listingMode || listings.length > 0) {
        console.log(`Found ${listings.length} listings on page ${page} (URL page ${getPageFromUrl()})`);

        for (const item of listings) {
          if (seenIds.has(item.id)) continue;
          currentData.push([
            item.id,
            item.address,
            item.price,
            item.beds,
            item.baths,
            item.sqft,
            item.agentName,
            item.agentPhone,
            item.url
          ]);
          seenIds.add(item.id);
        }

        await setStorage({ [STORAGE_KEYS.DATA]: currentData });
        updateOverlay("COLLECTED", currentData.length, page);

        const finalStatus = await getStorage(["retail_scraper_stop_requested"]);
        if (finalStatus.retail_scraper_stop_requested) {
          await finalizeScrape(currentData, "listings");
          return;
        }

        if (listings.length === 0) {
          console.log("No listings found on this page.");
          if (shouldTryNextPage(0)) {
            updateOverlay("No listings on page, moving to next...", currentData.length, page);
            const navResult = await goToNextPage(0);
            if (navResult === "continued" || navResult === "navigating") {
              if (navResult === "continued") {
                await setStorage({ [STORAGE_KEYS.PAGE]: getPageFromUrl() });
                runScraperLogic();
              }
              return;
            }
          }
          await finalizeScrape(currentData, "listings");
          return;
        }

        updateOverlay("NAVIGATING...", currentData.length, page);
        const navResult = await goToNextPage(listings.length);
        if (navResult === "continued") {
          await setStorage({ [STORAGE_KEYS.PAGE]: getPageFromUrl() });
          runScraperLogic();
        } else if (navResult === "navigating") {
          return;
        } else {
          await finalizeScrape(currentData, "listings");
        }
        return;
      }

      console.log(`Found ${agents.length} potential agents on page ${page} (URL page ${getPageFromUrl()})`);

      if (agents.length === 0) {
        console.log("No agents found on this page.");
        if (shouldTryNextPage(0)) {
          updateOverlay("No agents on page, moving to next...", currentData.length, page);
          const navResult = await goToNextPage(0);
          if (navResult === "continued") {
            await setStorage({ [STORAGE_KEYS.PAGE]: getPageFromUrl() });
            runScraperLogic();
          } else if (navResult === "navigating") {
            return;
          }
        }
        await finalizeScrape(currentData, "agents");
        return;
      }

      const BATCH_SIZE = 5;
      const toProcess = agents.filter(([id]) => !seenIds.has(id));

      for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
        const status = await getStorage(["retail_scraper_stop_requested"]);
        if (status.retail_scraper_stop_requested) break;

        const batch = toProcess.slice(i, i + BATCH_SIZE);
        updateOverlay(`EXTRACTING ${i + 1}-${Math.min(i + BATCH_SIZE, toProcess.length)} of ${toProcess.length}...`, currentData.length, page);

        const results = await Promise.all(batch.map(async ([id, info]) => {
          if (info.fromListing && info.phone) {
            return [id, info.name || id, info.phone, info.address || "", info.url || ""];
          }

          const details = await fetchAgentDetails(id);
          if (details?.phone) {
            const name = details.name || info.name || id.split("_")[0].replace(/-/g, " ");
            return [id, name, details.phone, details.address || info.address || "", info.url];
          }

          if (info.phone) {
            return [id, info.name || id, info.phone, info.address || "", info.url || ""];
          }

          return null;
        }));

        results.filter(Boolean).forEach(row => {
          if (!seenIds.has(row[0])) {
            currentData.push(row);
            seenIds.add(row[0]);
          }
        });

        await setStorage({ [STORAGE_KEYS.DATA]: currentData });
        updateOverlay("COLLECTED", currentData.length, page);
        await delay(200);
      }

      const finalStatus = await getStorage(["retail_scraper_stop_requested"]);
      if (finalStatus.retail_scraper_stop_requested) {
        console.log("Stop requested by user.");
        await finalizeScrape(currentData, "agents");
        return;
      }

      updateOverlay("NAVIGATING...", currentData.length, page);
      const navResult = await goToNextPage(agents.length);

      if (navResult === "continued") {
        await setStorage({ [STORAGE_KEYS.PAGE]: getPageFromUrl() });
        runScraperLogic();
      } else if (navResult === "navigating") {
        return;
      } else {
        await finalizeScrape(currentData, "agents");
      }
    } catch (err) {
      console.error("Scraper Error:", err);
      updateOverlay(`ERROR: ${err.message}`);
      await setStorage({ [STORAGE_KEYS.ACTIVE]: false });
    }
  }

  async function finalizeScrape(data, mode) {
    const stored = await getStorage([STORAGE_KEYS.MODE]);
    const scrapeMode = mode || stored[STORAGE_KEYS.MODE] || "agents";

    if (data.length === 0) {
      updateOverlay("No data collected.");
      await setStorage({ [STORAGE_KEYS.ACTIVE]: false, [STORAGE_KEYS.MODE]: "" });
      return;
    }

    updateOverlay(`Finalizing... Processing ${data.length} records.`);

    const header = scrapeMode === "listings"
      ? [["Listing ID", "Address", "Price", "Beds", "Baths", "Sqft", "Agent Name", "Agent Phone", "URL"]]
      : [["Profile ID", "Name", "Phone", "Address", "URL"]];
    const allRows = header.concat(data);
    const csvContent = allRows.map(e => e.map(i => `"${String(i || "").replace(/"/g, '""')}"`).join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `retail_scraper_${scrapeMode}_${data.length}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    const label = scrapeMode === "listings" ? "listings" : "agents";
    updateOverlay(`Completed! Exported ${data.length} ${label}.`);

    await setStorage({
      [STORAGE_KEYS.ACTIVE]: false,
      [STORAGE_KEYS.DATA]: [],
      [STORAGE_KEYS.PAGE]: 1,
      [STORAGE_KEYS.MODE]: ""
    });
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "executeScraperInContent") {
      (async () => {
        try {
          const storage = await getStorage([STORAGE_KEYS.ACTIVE]);
          if (storage[STORAGE_KEYS.ACTIVE]) {
            console.log("Scraper already active. Ignoring start command.");
            sendResponse({ success: true, alreadyRunning: true });
            return;
          }

          console.log("Starting new scraper session...");
          await setStorage({
            [STORAGE_KEYS.ACTIVE]: true,
            [STORAGE_KEYS.DATA]: [],
            [STORAGE_KEYS.PAGE]: 1,
            [STORAGE_KEYS.MODE]: isListingPage() ? "listings" : "agents",
            retail_scraper_stop_requested: false,
            [STORAGE_KEYS.TOKEN]: request.token
          });
          runScraperLogic();
          sendResponse({ success: true });
        } catch (err) {
          console.error("Failed to start scraper:", err);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    if (request.action === "ping") {
      sendResponse({ success: true, ready: true });
      return true;
    }
  });

  // Auto-resume after full-page navigation (pagination)
  getStorage([STORAGE_KEYS.ACTIVE, STORAGE_KEYS.PAGE]).then((state) => {
    if (state[STORAGE_KEYS.ACTIVE]) {
      console.log("Resuming active scraper session on Page " + (state[STORAGE_KEYS.PAGE] || 1));
      runScraperLogic();
    }
  });
})();
