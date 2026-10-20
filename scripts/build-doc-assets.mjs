import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist/media', { recursive: true });
for (const name of ['demo-ko.mp4', 'demo-ko.vtt', 'screenshot.png']) {
  await copyFile(`docs/assets/${name}`, `dist/media/${name}`);
}
