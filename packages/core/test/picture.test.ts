import { deflateSync } from "node:zlib";
import { expect, test } from "vitest";
import { pictureSize } from "../src/index.ts";

/** A real PNG of w×h, one grey pixel repeated. */
function png(w: number, h: number): Uint8Array {
  const chunk = (type: string, data: Buffer) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, "ascii"); data.copy(b, 8); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  const rows = Buffer.alloc((w + 1) * h, 0x80); for (let y = 0; y < h; y++) rows[y * (w + 1)] = 0;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]));
}

test("a picture's size in pixels, from the head of its file (M22)", () => {
  expect(pictureSize(png(37, 12), "image/png")).toEqual({ width: 37, height: 12 });
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x01, 0x20, 0x00, 0, 0, 0]);
  expect(pictureSize(gif, "image/gif")).toEqual({ width: 272, height: 32 });
  // A JPEG: SOI, an APP0 of 16 bytes, then SOF0 with height 300 and width 400.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...new Array(14).fill(0), 0xff, 0xc0, 0, 17, 8, 0x01, 0x2c, 0x01, 0x90, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  expect(pictureSize(jpeg, "image/jpeg")).toEqual({ width: 400, height: 300 });
  const svg = (s: string) => new TextEncoder().encode(s);
  expect(pictureSize(svg('<svg xmlns="http://www.w3.org/2000/svg" width="260" height="120px">'), "image/svg+xml")).toEqual({ width: 260, height: 120 });
  expect(pictureSize(svg('<?xml version="1.0"?>\n<svg viewBox="0 0 64.5 32">'), "image/svg+xml")).toEqual({ width: 65, height: 32 });
  expect(pictureSize(svg('<svg width="100%" height="50%">'), "image/svg+xml")).toBeNull();
  // Not what its name says, cut short, or a type not read.
  expect(pictureSize(new Uint8Array([1, 2, 3]), "image/png")).toBeNull();
  expect(pictureSize(png(5, 5).subarray(0, 20), "image/png")).toBeNull();
  expect(pictureSize(png(5, 5), "image/avif")).toBeNull();
});
