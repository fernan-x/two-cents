import type { QueryClient } from '@tanstack/react-query';

let client: QueryClient | null = null;

/** The app's query client, for code outside React (sign-out clearing the offline cache). */
export function setTrackingClient(c: QueryClient): void {
  client = c;
}

export function trackingClient(): QueryClient | null {
  return client;
}
