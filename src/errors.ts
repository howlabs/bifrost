export class BifrostError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = "BifrostError";
  }

  toStructuredString(): string {
    return `Error: [${this.code}] ${this.message}`;
  }
}
