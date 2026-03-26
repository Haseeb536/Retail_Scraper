// scraper.js
// Mirror of content.js ? used for manual injection via chrome.scripting.executeScript
console.log("Retail Scraper Scraper Script Loaded.");

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
    TOKEN: "retail_scraper_token"
  };

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

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

    function addAgent(href, name) {
      const agentId = extractAgentId(href);
      if (!agentId) return;
      if (!uniqueAgents.has(agentId) || (name && !uniqueAgents.get(agentId).name)) {
        uniqueAgents.set(agentId, { url: href, name: name || "" });
      }
    }

    // Prefer agent cards (Realtor.com standard layout)
    const cards = document.querySelectorAll(
      '[data-testid="component-agentCard"], [data-testid*="agentCard"], [data-testid*="AgentCard"]'
    );
    cards.forEach((card) => {
      const link = card.querySelector('a[href*="/realestateagents/"], a[href*="/agentprofile/"]');
      if (link) {
        addAgent(link.href, (link.innerText || link.textContent || "").trim());
      }
    });

    if (uniqueAgents.size === 0) {
      const selectors = [
        'a[href*="/realestateagents/"]',
        'a[href*="/agentprofile/"]',
        '[data-testid*="agent"] a[href*="realestateagents"]'
      ];
      Array.from(document.querySelectorAll(selectors.join(", "))).forEach((link) => {
        addAgent(link.href, (link.innerText || link.textContent || "").trim());
      });
    }

    return Array.from(uniqueAgents.entries());
  }

  async function waitForAgents(maxAttempts = 8) {
    for (let i = 0; i < maxAttempts; i++) {
      const agents = await scrapeCurrentPage();
      if (agents.length > 0) return agents;

      const scrollTarget = (i % 2 === 0) ? document.body.scrollHeight : 0;
      window.scrollTo({ top: scrollTarget, behavior: "smooth" });
      await delay(i === 0 ? 2000 : 1500);
    }
    return [];
  }

  async function ensureOnPage(targetPage) {
    const urlPage = getPageFromUrl();
    if (urlPage === targetPage) return true;

    const targetUrl = buildPageUrl(targetPage);
    console.log(`Navigating from URL page ${urlPage} to page ${targetPage}: ${targetUrl}`);
    await setStorage({ [STORAGE_KEYS.PAGE]: targetPage });
    window.location.href = targetUrl;
    return false;
  }

  async function tryClickNextPage() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    await delay(1500);

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
      "button[aria-label='Next page']"
    ];

    for (const sel of nextSelectors) {
      const btn = searchRoot.querySelector(sel);
      if (btn && !btn.hasAttribute("disabled") && btn.getAttribute("aria-disabled") !== "true") {
        console.log("Found next button by selector:", sel);
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
        nextNumLink.click();
        return true;
      }
    }

    return false;
  }

  async function goToNextPage() {
    const urlPage = getPageFromUrl();
    const nextPage = urlPage + 1;

    const disabledNext = document.querySelector(
      "button[data-testid='pagination-next'][disabled], a[data-testid='pagination-next'][aria-disabled='true']"
    );
    if (disabledNext) {
      console.log("Next button disabled ? last page reached.");
      return "done";
    }

    if (await tryClickNextPage()) {
      await delay(3500);
      if (getPageFromUrl() > urlPage) {
        console.log(`Clicked through to page ${getPageFromUrl()}`);
        return "continued";
      }
    }

    const nextUrl = buildPageUrl(nextPage);
    if (nextUrl === window.location.href) {
      return "done";
    }

    console.log(`Navigating to page ${nextPage} via URL: ${nextUrl}`);
    await setStorage({ [STORAGE_KEYS.PAGE]: nextPage });
    window.location.href = nextUrl;
    return "navigating";
  }

  async function runScraperLogic() {
    try {
      const storage = await getStorage([STORAGE_KEYS.DATA, STORAGE_KEYS.PAGE, STORAGE_KEYS.TOKEN, "retail_scraper_stop_requested"]);
      let currentData = storage[STORAGE_KEYS.DATA] || [];
      let page = storage[STORAGE_KEYS.PAGE] || 1;
      const jwt = storage[STORAGE_KEYS.TOKEN];

      if (!jwt) {
        await setStorage({ [STORAGE_KEYS.ACTIVE]: false });
        return;
      }

      if (storage.retail_scraper_stop_requested) {
        console.log("Stop requested at start of loop.");
        await finalizeScrape(currentData);
        return;
      }
      const seenIds = new Set(currentData.map(row => row[0]));
      const urlPage = getPageFromUrl();

      // Always start from page 1 on a fresh session
      if (page === 1 && urlPage !== 1) {
        console.log(`Session starts on page 1 but browser is on page ${urlPage}. Redirecting...`);
        const onFirst = await ensureOnPage(1);
        if (!onFirst) return;
      }

      // Keep storage page in sync with the URL after navigation/resume
      if (page !== urlPage) {
        console.log(`Syncing to page ${page} (URL shows page ${urlPage})...`);
        const synced = await ensureOnPage(page);
        if (!synced) return;
      }

      updateOverlay("SCANNING...", currentData.length, page);
      let agents = await waitForAgents();
      console.log(`Found ${agents.length} potential agents on page ${page} (URL page ${getPageFromUrl()})`);

      if (agents.length === 0) {
        await finalizeScrape(currentData);
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
          const details = await fetchAgentDetails(id);
          if (details?.phone) {
            const name = details.name || info.name || id.split("_")[0].replace(/-/g, " ");
            return [id, name, details.phone, details.address || "", info.url];
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
        await finalizeScrape(currentData);
        return;
      }

      updateOverlay("NAVIGATING...", currentData.length, page);
      const navResult = await goToNextPage();

      if (navResult === "continued") {
        await setStorage({ [STORAGE_KEYS.PAGE]: getPageFromUrl() });
        runScraperLogic();
      } else if (navResult === "navigating") {
        return;
      } else {
        await finalizeScrape(currentData);
      }
    } catch (err) {
      console.error("Scraper Error:", err);
      updateOverlay(`ERROR: ${err.message}`);
      await setStorage({ [STORAGE_KEYS.ACTIVE]: false });
    }
  }

  async function finalizeScrape(data) {
    if (data.length === 0) {
      updateOverlay("No data collected.");
      await setStorage({ [STORAGE_KEYS.ACTIVE]: false });
      return;
    }

    updateOverlay(`Finalizing... Processing ${data.length} records.`);

    const header = [["Profile ID", "Name", "Phone", "Address", "URL"]];
    const allRows = header.concat(data);
    const csvContent = allRows.map(e => e.map(i => `"${String(i || "").replace(/"/g, '""')}"`).join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `retail_scraper_complete_${data.length}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    updateOverlay(`Completed! Exported ${data.length} agents.`);

    await setStorage({
      [STORAGE_KEYS.ACTIVE]: false,
      [STORAGE_KEYS.DATA]: [],
      [STORAGE_KEYS.PAGE]: 1
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

  // Auto-resume check on load
  getStorage([STORAGE_KEYS.ACTIVE, STORAGE_KEYS.PAGE]).then((state) => {
    if (state[STORAGE_KEYS.ACTIVE]) {
      console.log("Resuming active scraper session on Page " + (state[STORAGE_KEYS.PAGE] || 1));
      runScraperLogic();
    }
  });
})();
