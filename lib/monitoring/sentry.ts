/**
 * Server-only Sentry error reporter.
 * Sends error events to SENTRY_DSN when configured; safe no-op otherwise.
 * Never exposes DSN or secrets to the browser.
 */

export async function reportServerError(err: unknown, context: Record<string, unknown> = {}): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    const parsed = new URL(dsn);
    const projectId = parsed.pathname.replace(/\//g, '');
    const publicKey = parsed.username;
    if (!projectId || !publicKey) return;

    const endpoint = `${parsed.protocol}//${parsed.host}/api/${projectId}/envelope/`;
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;

    const header = JSON.stringify({
      event_id: crypto.randomUUID().replace(/-/g, ''),
      sent_at: new Date().toISOString(),
    });
    const itemHeader = JSON.stringify({ type: 'event' });
    const payload = JSON.stringify({
      platform: 'javascript',
      level: 'error',
      message,
      extra: { ...context, stack },
      timestamp: Math.floor(Date.now() / 1000),
    });

    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=awn-server/1.0`,
      },
      body: `${header}\n${itemHeader}\n${payload}`,
    });
  } catch {
    // Never throw from error monitoring
  }
}
