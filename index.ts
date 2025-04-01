import { parseArgs } from "util";
import { Crawler, type CrawlerOptions } from "./crawler";

function parseNumber(s: string | undefined) {
  if (typeof s === "undefined") {
    return undefined;
  }

  try {
    const num = Number(s);
    if (num < 0) {
      throw new Error();
    }

    return num;
  } catch {
    throw new Error(`Invalid value: ${s}, must be a number greater than zero`);
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv,
    options: {
      concurrency: {
        type: "string",
      },
      maxRequestsPerSecond: {
        type: "string",
      },
      followDepth: {
        type: "string",
      },
      timeout: {
        type: "string",
      },
    },
    allowPositionals: true,
  });

  const url = positionals[2];

  if (!url) {
    return;
  }

  const crawlerOptions: Partial<CrawlerOptions> = {
    onVisited: ({ url, urls }) => {
      console.log(`- ${url}`);
      for (const u of urls) {
        console.log(` - ${u}`);
      }
    },
  };

  const maxDepth = parseNumber(values.followDepth);
  if (maxDepth !== undefined) {
    crawlerOptions.maxDepth = maxDepth;
  }

  const timeoutMs = parseNumber(values.timeout);
  if (timeoutMs !== undefined) {
    crawlerOptions.timeoutMs = timeoutMs;
  }

  const maxConcurrentRequests = parseNumber(values.concurrency);
  if (maxConcurrentRequests !== undefined) {
    crawlerOptions.maxConcurrentRequests = maxConcurrentRequests;
  }

  const maxRps = parseNumber(values.maxRequestsPerSecond);
  if (maxRps !== undefined) {
    crawlerOptions.maxRps = maxRps;
  }

  const crawler = new Crawler(crawlerOptions);
  crawler.crawl(url);

  while (crawler.crawling()) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

main();
