type URLMetadataState = "visited" | "queued" | "errored";
type URLMetadata =
  | {
      state: "visited";
      visitedAt: number;
    }
  | { state: "errored"; status: number };

export class URLManager {
  #metadata = new Map<string, URLMetadata>();
  #queuedUrls = new Set<string>();

  persistVisited(url: string) {
    this.#metadata.set(url, {
      state: "visited",
      visitedAt: Date.now(),
    });
  }

  hasVisited(url: string) {
    return this.#metadata.get(url)?.state === "visited";
  }

  allVisited() {
    return Array.from(this.#metadata.entries())
      .filter(([key, meta]) => meta.state === "visited")
      .map(([key, meta]) => ({ key, ...meta }));
  }

  error(url: string, status: number) {
    this.#metadata.set(url, {
      state: "errored",
      status: status,
    });
  }

  allErrored() {
    return Array.from(
      this.#metadata.values().filter((meta) => meta.state === "errored"),
    );
  }

  queued(url: string) {
    this.#queuedUrls.add(url);
  }

  dequeued(url: string) {
    this.#queuedUrls.delete(url);
  }

  inQueue(url: string) {
    return this.#queuedUrls.has(url);
  }
}
