/**
 * Node test harness for scraper logic (extractAgentId + GraphQL API)
 * Run: node test-scraper.mjs
 */

function extractAgentId(href) {
  try {
    const url = new URL(href);
    const match = url.pathname.match(/\/(?:realestateagents|agentprofile)\/([^/?#]+)/i);
    if (!match) return null;

    const id = match[1].split("?")[0];
    if (!id || id.includes("pg-")) return null;

    if (/^[a-f0-9]{24}$/i.test(id)) return id;

    if (id.includes("_") && !/^[a-z0-9-]+_[a-z]{2}$/i.test(id)) return id;

    return null;
  } catch {
    return null;
  }
}

function getPageFromUrl(url) {
  try {
    const match = new URL(url).pathname.match(/\/pg-(\d+)\/?$/i);
    return match ? parseInt(match[1], 10) : 1;
  } catch {
    return 1;
  }
}

function buildPageUrl(pageNum, baseUrl) {
  const url = new URL(baseUrl);
  let path = url.pathname.replace(/\/pg-\d+\/?$/i, "");
  if (pageNum > 1) {
    path = `${path.replace(/\/$/, "")}/pg-${pageNum}`;
  }
  url.pathname = path;
  return url.href;
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
            city
            state_code
            postal_code
          }
        }
      }
    }
  }
`;

async function fetchAgentDetails(agentId, clientVersion) {
  const res = await fetch("https://www.realtor.com/frontdoor/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "rdc-client-name": "agent-branding-profile",
      "rdc-client-version": clientVersion
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

  const data = await res.json();
  const branding = data.data?.agent_branding?.branding;
  return { status: res.status, errors: data.errors, branding };
}

function scrapeLinksFromHtml(html) {
  const hrefRegex = /href="(https:\/\/www\.realtor\.com\/realestateagents\/[^"]+)"/gi;
  const uniqueAgents = new Map();
  let m;
  while ((m = hrefRegex.exec(html)) !== null) {
    const href = m[1].replace(/&amp;/g, "&");
    const agentId = extractAgentId(href);
    if (agentId && !uniqueAgents.has(agentId)) {
      uniqueAgents.set(agentId, href);
    }
  }
  return Array.from(uniqueAgents.entries());
}

function pass(label) {
  console.log(`  PASS: ${label}`);
}

function fail(label, detail) {
  console.log(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("=== Scraper Logic Tests ===\n");

  // 1. extractAgentId unit tests
  console.log("1. extractAgentId");
  const idTests = [
    ["https://www.realtor.com/realestateagents/65f3ed848029047ef7e5966a", "65f3ed848029047ef7e5966a"],
    ["https://www.realtor.com/realestateagents/new-york_ny", null],
    ["https://www.realtor.com/realestateagents/los-angeles_ca/pg-2", null],
    ["https://www.realtor.com/realestateagents/John-Smith_New-York_NY_12345678", "John-Smith_New-York_NY_12345678"],
    ["https://www.realtor.com/agentprofile/5673e3debb954c010067f9da", "5673e3debb954c010067f9da"],
  ];
  for (const [url, expected] of idTests) {
    const got = extractAgentId(url);
    if (got === expected) pass(url.split("/").pop());
    else fail(url.split("/").pop(), `expected ${expected}, got ${got}`);
  }

  // 2. Pagination URL helpers
  console.log("\n2. Pagination URL helpers");
  const base = "https://www.realtor.com/realestateagents/new-york_ny/intent-buy/sort-relevantagents/agenttype-all";
  const pageTests = [
    [base, 1],
    [`${base}/pg-1`, 1],
    [`${base}/pg-3`, 3],
    ["https://www.realtor.com/realestateagents/los-angeles_ca", 1],
    ["https://www.realtor.com/realestateagents/los-angeles_ca/pg-2", 2],
  ];
  for (const [url, expected] of pageTests) {
    const got = getPageFromUrl(url);
    if (got === expected) pass(`getPageFromUrl ${url.split("/").slice(-2).join("/")}`);
    else fail(`getPageFromUrl`, `expected ${expected}, got ${got} for ${url}`);
  }
  const built = buildPageUrl(2, base);
  if (built.endsWith("/pg-2")) pass("buildPageUrl page 2");
  else fail("buildPageUrl page 2", built);
  const backToOne = buildPageUrl(1, `${base}/pg-5`);
  if (!backToOne.includes("/pg-")) pass("buildPageUrl back to page 1");
  else fail("buildPageUrl back to page 1", backToOne);

  // 3. GraphQL API — old vs new client version
  console.log("\n3. GraphQL API (known agent ID)");
  const sampleId = "5673e3debb954c010067f9da";

  for (const ver of ["0.0.670", "3.0.0"]) {
    try {
      const { status, errors, branding } = await fetchAgentDetails(sampleId, ver);
      if (branding?.fullname) {
        pass(`client v${ver} — ${branding.fullname}, phone: ${branding.phones?.[0]?.value || "none"}`);
      } else {
        fail(`client v${ver}`, `HTTP ${status}, errors: ${JSON.stringify(errors?.slice(0, 1))}`);
      }
    } catch (e) {
      fail(`client v${ver}`, e.message);
    }
  }

  // 3. Fetch live agent listing page and parse links
  console.log("\n3. Live page link extraction");
  try {
    const pageRes = await fetch("https://www.realtor.com/realestateagents/new-york_ny", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    const html = await pageRes.text();
    const agents = scrapeLinksFromHtml(html);

    if (pageRes.status !== 200) {
      fail("page fetch", `HTTP ${pageRes.status}`);
    } else if (agents.length === 0) {
      fail("link extraction", "0 agent profile links found (page may be JS-rendered)");
      console.log("     Note: Realtor.com renders agents client-side; extension scraper runs in browser DOM.");
    } else {
      pass(`found ${agents.length} agent IDs in HTML`);
      console.log(`     Sample: ${agents.slice(0, 3).map(([id]) => id).join(", ")}`);

      // 5. Fetch details for first agent found
      console.log("\n5. Fetch details for first extracted agent");
      const [firstId] = agents[0];
      const { branding, errors } = await fetchAgentDetails(firstId, "3.0.0");
      if (branding?.fullname) {
        pass(`${branding.fullname} | ${branding.phones?.[0]?.value || "no phone"}`);
      } else {
        fail(firstId, JSON.stringify(errors?.slice(0, 1)));
      }
    }
  } catch (e) {
    fail("live page test", e.message);
  }

  // 5. Syntax check scraper.js
  console.log("\n5. scraper.js syntax check");
  const { execSync } = await import("child_process");
  try {
    execSync('node --check "chrome-extension/scraper.js"', { cwd: new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1") });
    pass("scraper.js parses without syntax errors");
  } catch {
    // Windows path fix — run from cwd
    try {
      execSync("node --check chrome-extension/scraper.js");
      pass("scraper.js parses without syntax errors");
    } catch (e2) {
      fail("scraper.js syntax", e2.message);
    }
  }

  console.log("\n=== Done ===");
}

main().catch((e) => {
  console.error("Test runner error:", e);
  process.exit(1);
});
