import * as path from 'path';
import * as fs from 'fs/promises';
import { tridentLog } from '../utils.js';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
]);

const EXTENSION_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

async function resolveSecurePath(filePath: string, workspaceRoot: string): Promise<string | Error> {
  if (!filePath || typeof filePath !== 'string') {
    return new Error('resolveSecurePath: filePath is required');
  }
  if (!workspaceRoot || typeof workspaceRoot !== 'string') {
    return new Error('resolveSecurePath: workspaceRoot is required');
  }

  const resolvedInput = path.resolve(filePath);
  const resolvedRoot = path.resolve(workspaceRoot);

  let realPath: string;
  try {
    await fs.access(resolvedInput);
    realPath = await fs.realpath(resolvedInput);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    tridentLog('WARN', 'path-containment', `Access denied for ${resolvedInput}: ${message}`);
    return new Error(`Cannot resolve real path for ${resolvedInput}: ${message}`);
  }

  const normalizedRoot = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  if (!realPath.startsWith(normalizedRoot) && realPath !== resolvedRoot) {
    return new Error(
      `Path traversal blocked: ${realPath} is outside workspace ${resolvedRoot}`
    );
  }

  const ext = path.extname(realPath).toLowerCase();
  const expectedMime = EXTENSION_TO_MIME[ext];
  if (!expectedMime || !ALLOWED_MIME_TYPES.has(expectedMime)) {
    return new Error(
      `Invalid file type: ${ext || '(no extension)'}. Only image files are allowed: ${Array.from(ALLOWED_MIME_TYPES).join(', ')}`
    );
  }

  return realPath;
}

export { resolveSecurePath, ALLOWED_MIME_TYPES, EXTENSION_TO_MIME };
