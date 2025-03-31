import { load } from "cheerio";

export class Crawler {
  visited = new Set<string>();
  #maxConcurrent: number = 5;

  constructor() {}

  async crawl(url: string) {
    return this.#crawlUrl(url);
  }

  async #crawlUrl(url: string) {
    const shouldCrawl = !this.visited.has(url);

    if (!shouldCrawl) {
      return;
    }

    const reqUrl = new URL(url);
    const res = await fetch(url, {
      headers: { "user-agent": "Mz-Webcrawler/1.0 (testing)" },
    });

    this.visited.add(url);

    const contentType = res.headers.get("content-type");

    // could also check any text, e.g. markdown
    if (!contentType?.includes("text/html")) {
      return;
    }

    const resUrl = new URL(res.url);

    const isSameDomain = resUrl.host === reqUrl.host;
    if (!isSameDomain) {
      return;
    }

    const body = await res.text();
    const $ = load(body);

    const toCrawl: string[] = [];
    for (const element of $("a[href]")) {
      const href = $(element).attr("href");
      if (!href) {
        return;
      }

      try {
        const resolvedUrl = new URL(href, reqUrl);
        const isMatchingDomain = resolvedUrl.host === reqUrl.host;
        if (isMatchingDomain) {
          toCrawl.push(resolvedUrl.href);
        }
      } catch {
        // skip invalid URLs
      }
    }

    return toCrawl;
  }
}

async function main() {
  const args = Bun.argv;

  const url = args[2];

  const crawler = new Crawler();

  const body = await crawler.crawl(url);
  console.log({ body });
}

main();
