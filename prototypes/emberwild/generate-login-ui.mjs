// Uses the user's existing Image generation tool gateway, like generate-shop-art.mjs.
// No upstream credential is read or logged. Existing art is never overwritten.
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = new URL('./assets/login-v1/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('generation.json', directory), 'utf8'));
const token = process.env.IMAGEGEN_TOKEN;
if (!token) throw new Error('Set IMAGEGEN_TOKEN for the local image-generation gateway.');
await mkdir(directory, { recursive: true });
const selected = process.argv.slice(2);
const jobs = manifest.jobs.filter(job => !selected.length || selected.includes(job.file));
if (!jobs.length) throw new Error('No matching login artwork jobs.');
for (const job of jobs) {
  try { await access(new URL(job.file, directory)); throw new Error(`Refusing to overwrite ${job.file}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function generate(job) {
  console.log(`START ${job.file} (${job.size})`);
  const response = await fetch('http://127.0.0.1:8080/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ model: manifest.model, quality: manifest.quality, prompt: job.prompt,
      n: 1, size: job.size, response_format: 'b64_json' }),
    signal: AbortSignal.timeout(300000)
  });
  if (!response.ok) throw new Error(`${job.file}: local gateway HTTP ${response.status}; not automatically retrying`);
  const result = await response.json();
  if (!result.data?.[0]?.b64_json) throw new Error(`${job.file}: no image data returned`);
  const bytes = Buffer.from(result.data[0].b64_json, 'base64');
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`${job.file}: expected PNG`);
  const size = `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
  if (size !== job.size) throw new Error(`${job.file}: unexpected image dimensions ${size}`);
  const destination = new URL(job.file, directory);
  await writeFile(destination, bytes, { flag: 'wx' });
  console.log(`SAVED ${fileURLToPath(destination)} ${size} ${bytes.length} bytes`);
}

// Three requested assets, one generation per asset; no automatic paid retries.
const results = await Promise.allSettled(jobs.map(generate));
for (const result of results) {
  if (result.status === 'rejected') { console.error(result.reason.message); process.exitCode = 1; }
}
