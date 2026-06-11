// Safar gem scraper — a tiny standalone service that fetches Reddit's public
// JSON from inside a real browser context (Playwright), so the request carries
// genuine TLS fingerprint / headers / cookies and looks like normal browsing.
// Reddit killed unauthenticated API access + free keys, but old.reddit.com still
// serves JSON to a real browser. This service exists because Playwright can't run
// on Vercel serverless — the Safar app (Vercel-deployable) calls this for the
// Reddit source only; Google Places + Atlas Obscura stay inside the app.
const http = require("http");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 3001);
// Trimmed so a stray newline/space in the host's env var (a very common
// copy-paste artifact) doesn't silently reject every request.
const TOKEN = (process.env.SCRAPER_TOKEN || "").trim();
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }
  return browserPromise;
}

async function fetchRedditPosts(city) {
  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: UA, locale: "en-US" });
  try {
    const page = await context.newPage();
    // Load the site first so we pick up a session cookie. A direct navigation
    // to /search.json gets 403 from datacenter IPs, but a *same-origin* fetch
    // from inside the loaded page then succeeds.
    await page.goto("https://old.reddit.com/", {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    // City-specific threads (itineraries / "things to do in <city>") whose
    // comments name local spots — not generic "underrated Indian cities"
    // megathreads, which only list other destinations.
    const query = `${city} (itinerary OR "things to do" OR "places to visit" OR "hidden gems")`;
    const data = await page.evaluate(async (q) => {
      try {
        const response = await fetch(
          `/search.json?q=${encodeURIComponent(q)}&limit=20&sort=relevance&t=all`,
          { headers: { Accept: "application/json" } },
        );
        if (!response.ok) return null;
        return await response.json();
      } catch {
        return null;
      }
    }, query);
    const children = (data && data.data && data.data.children) || [];
    const posts = children
      .map((child) => child.data)
      .filter(Boolean)
      .map((post) => ({
        title: post.title || "",
        selftext: (post.selftext || "").slice(0, 600),
        subreddit: post.subreddit || "",
        score: post.score || 0,
        permalink: post.permalink || "",
        url: post.permalink ? `https://www.reddit.com${post.permalink}` : "",
        comments: [],
      }));
    // Relevance-first: threads whose title actually names the city (then by
    // upvotes) — a viral off-topic post can otherwise outrank them.
    const cityLower = city.toLowerCase();
    const titleHasCity = (post) =>
      post.title.toLowerCase().includes(cityLower) ? 1 : 0;
    posts.sort((a, b) => titleHasCity(b) - titleHasCity(a) || b.score - a.score);
    // Specific place names usually live in the comments, not the post body.
    // Pull top comments from the few most-relevant threads (safe within the
    // app's 60s function budget).
    const topPosts = posts.slice(0, 3).filter((post) => post.permalink);
    for (const post of topPosts) {
      post.comments = await page.evaluate(async (permalink) => {
        try {
          const response = await fetch(`${permalink}.json?limit=10&sort=top`, {
            headers: { Accept: "application/json" },
          });
          if (!response.ok) return [];
          const json = await response.json();
          const items = (json[1] && json[1].data && json[1].data.children) || [];
          return items
            .map((item) => item.data && item.data.body)
            .filter(Boolean)
            .map((body) => body.slice(0, 400))
            .slice(0, 6);
        } catch {
          return [];
        }
      }, post.permalink);
    }
    return posts;
  } finally {
    await context.close();
  }
}

const server = http.createServer((req, res) => {
  const json = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };

  if (req.method === "GET" && req.url === "/health") return json(200, { ok: true });

  if (req.method === "POST" && req.url.startsWith("/reddit")) {
    if (TOKEN && (req.headers.authorization || "").trim() !== `Bearer ${TOKEN}`) {
      return json(401, { error: "unauthorized" });
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      let city = "";
      try {
        city = String(JSON.parse(body || "{}").city || "").trim();
      } catch {
        /* invalid body */
      }
      if (!city) return json(400, { error: "city required" });
      try {
        const posts = await fetchRedditPosts(city);
        json(200, { city, count: posts.length, posts });
      } catch (error) {
        // Never hard-fail: the app degrades to its other gem sources.
        json(200, { city, count: 0, posts: [], error: String(error?.message || error) });
      }
    });
    return;
  }

  json(404, { error: "not found" });
});

server.listen(PORT, () => console.log(`Safar gem scraper listening on :${PORT}`));
