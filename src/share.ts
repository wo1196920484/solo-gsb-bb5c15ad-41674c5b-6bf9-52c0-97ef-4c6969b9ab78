import type { Rule } from './types';
import { REQUEST_METHODS } from './types';
import { validateRules } from './validate';

/**
 * 加密分享：把规则表、请求方法和 URL 序列化后，用口令派生的密钥加密，
 * 全部过程仅在浏览器端完成（Web Crypto），口令不写入链接、不进入 localStorage。
 *
 * 链接 hash 格式：`#share=<base64url(packed)>`
 * packed 二进制布局：版本(1 字节) ‖ 盐(16 字节) ‖ IV(12 字节) ‖ AES-GCM 密文
 */

/** 分享格式版本：解密时校验，不支持的版本直接拒绝 */
export const SHARE_VERSION = 1;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const PBKDF2_ITERATIONS = 150_000;
const GCM_TAG_BYTES = 16;
const HASH_PREFIX = '#share=';

/** 解密并校验后的分享内容 */
export interface ShareContent {
  rules: Rule[];
  method: string;
  url: string;
}

/** 分享流程的可预期错误（口令错误、篡改、版本不支持等），message 为中文提示 */
export class ShareError extends Error {}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBytes(token: string): Uint8Array {
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (b64.length % 4)) % 4;
  const bin = atob(b64 + '='.repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function subtle(): SubtleCrypto {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new ShareError('当前环境不支持 Web Crypto（需要 HTTPS 或 localhost 访问）');
  }
  return crypto.subtle;
}

/** PBKDF2-SHA-256 派生 256 位 AES-GCM 密钥（150000 次迭代） */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await subtle().importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * 用口令加密分享内容，返回可写入链接 hash 的 base64url token。
 * 每次调用生成新的随机盐与 IV，同一内容多次加密结果不同。
 */
export async function encryptShare(
  passphrase: string,
  content: ShareContent,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(
    JSON.stringify({
      rules: content.rules,
      method: content.method,
      url: content.url,
    }),
  );
  const ciphertext = new Uint8Array(
    await subtle().encrypt({ name: 'AES-GCM', iv }, key, plaintext),
  );

  const packed = new Uint8Array(1 + SALT_BYTES + IV_BYTES + ciphertext.length);
  packed[0] = SHARE_VERSION;
  packed.set(salt, 1);
  packed.set(iv, 1 + SALT_BYTES);
  packed.set(ciphertext, 1 + SALT_BYTES + IV_BYTES);
  return bytesToBase64Url(packed);
}

/**
 * 用口令解密 token 并校验内容。
 * 口令错误、密文篡改、版本不支持、格式损坏都会抛出 ShareError，调用方不得因此改变状态。
 */
export async function decryptShare(
  passphrase: string,
  token: string,
): Promise<ShareContent> {
  let packed: Uint8Array;
  try {
    packed = base64UrlToBytes(token);
  } catch {
    throw new ShareError('链接数据无法解码，可能已被截断或篡改');
  }
  if (packed.length < 1 + SALT_BYTES + IV_BYTES + GCM_TAG_BYTES) {
    throw new ShareError('链接数据长度不足，可能已被截断或篡改');
  }

  const version = packed[0];
  if (version !== SHARE_VERSION) {
    throw new ShareError(
      `不支持的分享版本（v${version}），当前仅支持 v${SHARE_VERSION}`,
    );
  }

  const salt = packed.slice(1, 1 + SALT_BYTES);
  const iv = packed.slice(1 + SALT_BYTES, 1 + SALT_BYTES + IV_BYTES);
  const ciphertext = packed.slice(1 + SALT_BYTES + IV_BYTES);

  const key = await deriveKey(passphrase, salt);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await subtle().decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  } catch {
    // AES-GCM 认证失败：口令错误或密文被篡改，二者不可区分也不需区分
    throw new ShareError('解密失败：口令错误或数据已被篡改');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new ShareError('解密结果不是有效的 JSON，数据已损坏');
  }
  return validateShareContent(parsed);
}

/** 校验解密出的分享内容：规则复用 validateRules，另校验方法和 URL */
export function validateShareContent(data: unknown): ShareContent {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ShareError('分享内容格式不正确：顶层必须是对象');
  }
  const obj = data as Record<string, unknown>;

  const rules = validateRules(obj.rules);

  const method = obj.method;
  if (
    typeof method !== 'string' ||
    !(REQUEST_METHODS as readonly string[]).includes(method)
  ) {
    throw new ShareError(
      `分享内容的方法必须是 ${REQUEST_METHODS.join(' / ')} 之一`,
    );
  }

  const url = obj.url;
  if (typeof url !== 'string' || url.trim() === '') {
    throw new ShareError('分享内容的 URL 必须是非空字符串');
  }
  try {
    new URL(url);
  } catch {
    throw new ShareError(`分享内容的 URL 无法解析：${url}`);
  }

  return { rules, method, url };
}

/** 由 token 拼出完整可复制链接（保留当前路径与查询串，数据全部放在 hash 里） */
export function buildShareLink(token: string): string {
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}${HASH_PREFIX}${token}`;
}

/** 从 hash 中读出分享 token；不是分享链接时返回 null */
export function readShareToken(hash: string = window.location.hash): string | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const token = hash.slice(HASH_PREFIX.length);
  return token === '' ? null : token;
}

/** 导入成功（或用户取消）后移除 hash，不触发页面跳转 */
export function clearShareHash(): void {
  window.history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search,
  );
}
