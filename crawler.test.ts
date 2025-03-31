import { test, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "bun";
import { Crawler } from "./crawler";

let server: Server;
let serverUrl: string;

beforeAll(async () => {
  server = Bun.serve({
    port: 3000,
    fetch(req) {
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

  expect(crawler.visited.size).toBe(3);
  expect(crawler.visited.has(`${serverUrl}/test_page_1.html`)).toBe(true);
  expect(crawler.visited.has(`${serverUrl}/test_page_2.html`)).toBe(true);
  expect(crawler.visited.has(`${serverUrl}/test_page_3.html`)).toBe(true);

  crawler.stop();
});

test("it does not visit external links", async () => {
  const crawler = new Crawler();
  crawler.crawl(`${serverUrl}/test_page_with_external_link.html`);

  while (crawler.crawling()) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  expect(crawler.visited.size).toBe(1);
  expect(crawler.visited.has(`https://thomasgormley.dev`)).toBe(false);

  crawler.stop();
});

test("it does nothing with non-HTML pages", async () => {
  const crawler = new Crawler();
  crawler.crawl(`${serverUrl}/not_html.txt`);

  while (crawler.crawling()) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  expect(crawler.visited.size).toBe(1);
  expect(crawler.visited.has(`${serverUrl}/not_html.txt`)).toBe(true);

  crawler.stop();
});
