import { parseArgs } from "node:util";
import { Crawler, type CrawlerOptions } from "./crawler";

function parseNumber(s: string | undefined) {
  if (typeof s === "undefined") {
    return undefined;
  }

  const num = Number(s);
  if (isNaN(num) || num < 0) {
    throw new Error(`Invalid value: ${s}, must be a number greater than zero`);
  }

  return num;
}

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv,
    options: {
      help: {
        type: "boolean",
      },
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

  if (values.help) {
    console.log(`Usage: crawler [options] <url>

Options:
  --help                           Show help information
  --concurrency <number>           Set the maximum number of concurrent requests
  --maxRequestsPerSecond <number>  Set the maximum number of requests per second
  --followDepth <number>           Set the maximum depth to follow links
  --timeout <number>               Set the timeout in milliseconds

Example:
  crawl --concurrency 5 --maxRequestsPerSecond 10 --followDepth 3 --timeout 5000 https://example.com
`);
    process.exit(0);
  }

  const url = positionals[2];
  if (!url) {
    console.error("Error: No URL provided. Please specify a URL to crawl.");
    process.exit(1);
  }

  const crawlerOptions: Partial<CrawlerOptions> = {
    onVisited: ({ url, urls }) => {
      console.log(`- ${url}`);
      for (const u of urls) {
        console.log(` = ${u}`);
      }
    },
    onError: ({ url, error }) => {
      console.error(`Error while visiting URL: ${url}, ${error}`);
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
}

main();
