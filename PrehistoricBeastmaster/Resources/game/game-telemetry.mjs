export function emitGameTelemetry(event, fields = {}) {
  const bridge = globalThis.pbmNative;
  if (typeof bridge?.gameTelemetry !== 'function') return;
  try {
    bridge.gameTelemetry(JSON.stringify({ event, ...fields }));
  } catch {
  }
}
