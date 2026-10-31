// Original synthesized arpeggios for the design preview. No third-party recording.
// Run with `node scripts/generate-demo-music.mjs` to regenerate the bundled WAV.
import { mkdir, writeFile } from 'node:fs/promises';
const sampleRate = 22050;
const duration = 16;
const notes = [60, 64, 67, 71, 67, 64, 71, 67, 57, 60, 64, 67, 64, 60, 67, 64, 53, 57, 60, 64, 60, 57, 64, 60, 55, 59, 62, 69, 62, 59, 67, 62];
const samples = new Float64Array(sampleRate * duration);
for (let n = 0; n < notes.length; n++) {
  const frequency = 440 * 2 ** ((notes[n] - 69) / 12);
  const start = n * .5;
  for (let j = 0; j < sampleRate * 2.8 && Math.floor(start * sampleRate) + j < samples.length; j++) {
    const t = j / sampleRate;
    const attack = Math.min(1, t / .018);
    const tone = Math.sin(2 * Math.PI * frequency * t) + .24 * Math.sin(2 * Math.PI * frequency * 2 * t) + .07 * Math.sin(2 * Math.PI * frequency * 3 * t);
    samples[Math.floor(start * sampleRate) + j] += .17 * tone * attack * Math.exp(-2.1 * t);
  }
}
const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
wav.writeUInt32LE(samples.length * 2, 40);
for (let i = 0; i < samples.length; i++) {
  const t = i / sampleRate;
  const fade = Math.min(1, t / .08, (duration - t) / 1.5);
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * fade)) * 32767), 44 + i * 2);
}
await mkdir(new URL('../public/music/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/music/demo.wav', import.meta.url), wav);
console.log('Created public/music/demo.wav (original preview music).');
