import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { z } from 'zod';

export const imageAssetPath = z.string().regex(/^assets\/[a-z0-9][a-z0-9/_-]*\.(?:jpe?g|png|webp)$/);
const maximumImageBytes = 20 * 1024 * 1024;

export function readImageAsset(sourcePath: string, projectDirectory = process.cwd()) {
  if (!imageAssetPath.safeParse(sourcePath).success) {
    throw new Error('assets 폴더의 PNG·JPEG·WebP 파일 위치를 입력하세요.');
  }
  let path: string;
  let metadata;
  try {
    path = realpathSync(resolve(projectDirectory,sourcePath));
    metadata = statSync(path);
  } catch (error) {
    throw new Error('이미지 파일을 찾거나 읽을 수 없습니다. 파일 위치를 확인하세요.',{cause:error});
  }
  if (!path.startsWith(`${realpathSync(resolve(projectDirectory,'assets'))}${sep}`) || !metadata.isFile() || metadata.size > maximumImageBytes) {
    throw new Error('이미지 경로 또는 파일 크기를 확인하세요. 20MB 이하의 assets 폴더 파일만 사용합니다.');
  }
  const data = readFileSync(path);
  const extension = extname(sourcePath);
  const isPng = data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const isJpeg = data[0] === 255 && data[1] === 216 && data[2] === 255;
  const isWebp = data.toString('ascii',0,4) === 'RIFF' && data.toString('ascii',8,12) === 'WEBP';
  const mimeType = extension === '.png' && isPng ? 'image/png'
    : extension === '.webp' && isWebp ? 'image/webp'
    : ['.jpg','.jpeg'].includes(extension) && isJpeg ? 'image/jpeg' : null;
  if (!mimeType) throw new Error('파일 내용과 확장자가 일치하는 PNG·JPEG·WebP 이미지를 선택하세요.');
  return { data, mimeType, hash:createHash('sha256').update(data).digest('hex'), bytes:data.length };
}
