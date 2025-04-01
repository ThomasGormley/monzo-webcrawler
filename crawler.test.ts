import { test, expect, beforeAll, afterAll, mock } from "bun:test";
import type { Server } from "bun";
import { Crawler } from "./crawler";
import { JobProcessor } from "./job-processor";

let server: Server;
let serverUrl: string;

beforeAll(async () => {
  server = Bun.serve({
    port: 3000,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/test_page_1.html") {
        return new Response(
          `
          <!DOCTYPE html>
          <html>
          <head><title>Test Page 1</title></head>
          <body>
            <a href="/test_page_2.html">Link to Page 2</a>
            <a href="/test_page_3.html">Link to Page 3</a>
          </body>
          </html>
        `,
          { headers: { "Content-Type": "text/html" } },
        );
      } else if (url.pathname === "/test_page_2.html") {
        return new Response(
          `
          <!DOCTYPE html>
          <html>
          <head><title>Test Page 2</title></head>
          <body>
            <a href="/test_page_3.html">Link to Page 3</a>
          </body>
          </html>
        `,
          { headers: { "Content-Type": "text/html" } },
        );
      } else if (url.pathname === "/test_page_3.html") {
        return new Response(
          `
          <!DOCTYPE html>
          <html>
          <head><title>Test Page 3</title></head>
          <body>
            <a href="/test_page_1.html">Link to Page 1</a>
          </body>
          </html>
        `,
          { headers: { "Content-Type": "text/html" } },
        );
      } else if (url.pathname === "/test_page_with_external_link.html") {
        return new Response(
          `
          <!DOCTYPE html>
          <html>
          <head><title>Test Page With External Link</title></head>
          <body>
            <a href="https://thomasgormley.dev">Link to External</a>
          </body>
          </html>
        `,
          { headers: { "Content-Type": "text/html" } },
        );
      } else if (url.pathname === "/not_html.txt") {
        return new Response(
          `
          <a href="/test_page_1.html">Link</a>
        `,
        );
      } else if (url.pathname === "/slow_handler.html") {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        return new Response(
          `
          <a href="/test_page_1.html">Link</a>
        `,
          { headers: { "Content-Type": "text/html" } },
        );
      } else if (url.pathname === "/505.html") {
        return new Response("505!", { status: 505 });
      }
      return new Response("404!", { status: 404 });
    },
  });
  serverUrl = `http://${server.hostname}:${server.port}`;
});

afterAll(() => {
  server.stop();
});

test("it visits all pages", async () => {
  const crawler = new Crawler();
  crawler.crawl(`${serverUrl}/test_page_1.html`);

  while (crawler.crawling()) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  expect(crawler.urlManager.allVisited().length).toBe(3);
  expect(crawler.urlManager.hasVisited(`${serverUrl}/test_page_1.html`)).toBe(
    true,
  );
  expect(crawler.urlManager.hasVisited(`${serverUrl}/test_page_2.html`)).toBe(
    true,
  );
  expect(crawler.urlManager.hasVisited(`${serverUrl}/test_page_3.html`)).toBe(
    true,
  );

  crawler.stop();
});

test("it does not visit external links", async () => {
  const crawler = new Crawler();
  crawler.crawl(`${serverUrl}/test_page_with_external_link.html`);

  while (crawler.crawling()) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  expect(crawler.urlManager.allVisited().length).toBe(1);
  expect(crawler.urlManager.hasVisited(`https://thomasgormley.dev`)).toBe(
    false,
  );

  crawler.stop();
});

test("it does nothing with non-HTML pages", async () => {
  const crawler = new Crawler();
  crawler.crawl(`${serverUrl}/not_html.txt`);

  while (crawler.crawling()) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  expect(crawler.urlManager.allVisited().length).toBe(1);
  expect(crawler.urlManager.hasVisited(`${serverUrl}/not_html.txt`)).toBe(true);

  crawler.stop();
});

test("it stops after configured timeout", async () => {
  const abortController = new AbortController();
  const timeoutMs = 200;
  const crawler = new Crawler({
    timeoutMs,
    abortController,
  });
  crawler.crawl(`${serverUrl}/slow_handler.html`);

  while (crawler.crawling()) {
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  }

  expect(crawler.timedout()).toBe(true);
  expect(abortController.signal.aborted).toBe(true);
  expect(crawler.urlManager.allVisited().length).toBe(0);
  expect(crawler.urlManager.hasVisited(`${serverUrl}/slow_handler.html`)).toBe(
    false,
  );
});

test("it calls onVisited when it visits a URL", async () => {
  let gotArgs = { url: "", urls: [""] } satisfies {
    url: string;
    urls: string[];
  };
  let callCount = 0;
  const crawler = new Crawler({
    onVisited: (args) => {
      callCount++;
      gotArgs = args;
    },
  });

  crawler.crawl(`${serverUrl}/test_page_1.html`);

  while (crawler.crawling()) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  expect(callCount).toBe(3);
  expect(gotArgs).toEqual({
    url: `${serverUrl}/test_page_3.html`,
    urls: [`${serverUrl}/test_page_1.html`],
  });
});

test("it does not record 4xx errors", async () => {
  const crawler = new Crawler();
  crawler.crawl(`${serverUrl}/does_not_exist.html`);

  while (crawler.crawling()) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  expect(crawler.urlManager.allVisited().length).toBe(0);
});

test.skip("it retries 5xx errors", async () => {
  const processor = new JobProcessor();
  const crawler = new Crawler({ jobProcessor: processor });
  crawler.crawl(`${serverUrl}/505.html`);

  // TODO invert control of processor delay function
  while (crawler.crawling()) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const dlq = processor.deadletterQueue();
  expect(dlq.length).toBe(1);
  expect(dlq[0].retryCount).toBeGreaterThan(1);
});
