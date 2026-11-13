/** A scan stopped on purpose: bad input, a blocked address, or a failed fetch. */
export class ScanError extends Error {
  readonly status: number;
  readonly code: "blocked" | "fetch" | "dns" | "input";
  readonly fetches: number;
  readonly blockedUrl: string | null;

  constructor(
    message: string,
    status: number,
    code: "blocked" | "fetch" | "dns" | "input",
    fetches: number,
    blockedUrl: string | null = null,
  ) {
    super(message);
    this.name = "ScanError";
    this.status = status;
    this.code = code;
    this.fetches = fetches;
    this.blockedUrl = blockedUrl;
  }
}
