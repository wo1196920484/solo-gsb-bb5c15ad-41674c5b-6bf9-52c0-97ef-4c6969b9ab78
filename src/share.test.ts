import { describe, expect, it } from 'vitest';
import {
  SHARE_VERSION,
  ShareError,
  decryptShare,
  encryptShare,
  readShareToken,
  validateShareContent,
} from './share';
import type { ShareContent } from './share';
import { SAMPLE_RULES } from './samples';

const CONTENT: ShareContent = {
  rules: SAMPLE_RULES,
  method: 'POST',
  url: 'http://api.example.com/v1/users/42?debug=1',
};

/** 测试侧独立实现的 base64url 解码，用于构造篡改 / 版本异常的 token */
function tokenToBytes(token: string): Uint8Array {
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function bytesToToken(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('encryptShare / decryptShare', () => {
  it('正确口令可往返还原规则、方法和 URL', async () => {
    const token = await encryptShare('口令-123', CONTENT);
    const back = await decryptShare('口令-123', token);
    expect(back.rules).toEqual(CONTENT.rules);
    expect(back.method).toBe(CONTENT.method);
    expect(back.url).toBe(CONTENT.url);
  });

  it('token 为 base64url（无 + / =），口令不会进入链接', async () => {
    const token = await encryptShare('口令-123', CONTENT);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain('口令');
  });

  it('随机盐与 IV：同一内容同一口令两次加密结果不同', async () => {
    const a = await encryptShare('pw', CONTENT);
    const b = await encryptShare('pw', CONTENT);
    expect(a).not.toBe(b);
    // 但都能用同一口令解开
    expect(await decryptShare('pw', a)).toEqual(await decryptShare('pw', b));
  });

  it('错误口令解密失败', async () => {
    const token = await encryptShare('right', CONTENT);
    await expect(decryptShare('wrong', token)).rejects.toBeInstanceOf(ShareError);
    await expect(decryptShare('wrong', token)).rejects.toThrow(
      /口令错误或数据已被篡改/,
    );
  });

  it('密文被篡改时解密失败', async () => {
    const token = await encryptShare('pw', CONTENT);
    // 翻转密文区域（token 中段）的一个字符
    const at = Math.floor(token.length / 2);
    const flipped = token[at] === 'A' ? 'B' : 'A';
    const tampered = token.slice(0, at) + flipped + token.slice(at + 1);
    await expect(decryptShare('pw', tampered)).rejects.toBeInstanceOf(ShareError);
    await expect(decryptShare('pw', tampered)).rejects.toThrow(
      /口令错误或数据已被篡改/,
    );
  });

  it('版本不受支持时报版本错误', async () => {
    const token = await encryptShare('pw', CONTENT);
    const bytes = tokenToBytes(token);
    bytes[0] = SHARE_VERSION + 1;
    await expect(decryptShare('pw', bytesToToken(bytes))).rejects.toThrow(
      /不支持的分享版本/,
    );
  });

  it('截断或非法编码的 token 报数据损坏', async () => {
    const token = await encryptShare('pw', CONTENT);
    await expect(decryptShare('pw', token.slice(0, 8))).rejects.toBeInstanceOf(
      ShareError,
    );
    await expect(decryptShare('pw', '!!!not-base64url!!!')).rejects.toBeInstanceOf(
      ShareError,
    );
  });
});

describe('validateShareContent', () => {
  it('接受合法内容并复用 validateRules 规范化', () => {
    const out = validateShareContent({
      rules: [{ host: 'a.com', action: { type: 'rewrite', target: '/x' } }],
      method: 'GET',
      url: 'http://a.com/x',
    });
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0].method).toBe('ANY'); // validateRules 的默认值
    expect(out.method).toBe('GET');
    expect(out.url).toBe('http://a.com/x');
  });

  it('拒绝非法方法', () => {
    expect(() =>
      validateShareContent({ rules: [], method: 'ANY', url: 'http://a.com/' }),
    ).toThrow(ShareError);
    expect(() =>
      validateShareContent({ rules: [], method: 'SMUGGLE', url: 'http://a.com/' }),
    ).toThrow(ShareError);
  });

  it('拒绝非法 URL', () => {
    expect(() =>
      validateShareContent({ rules: [], method: 'GET', url: 'not a url' }),
    ).toThrow(/URL 无法解析/);
    expect(() =>
      validateShareContent({ rules: [], method: 'GET', url: '' }),
    ).toThrow(ShareError);
  });

  it('拒绝非法规则与非对象顶层', () => {
    expect(() =>
      validateShareContent({
        rules: [{ action: { type: 'explode' } }],
        method: 'GET',
        url: 'http://a.com/',
      }),
    ).toThrow(Error);
    expect(() => validateShareContent([1, 2, 3])).toThrow(ShareError);
    expect(() => validateShareContent(null)).toThrow(ShareError);
  });
});

describe('readShareToken', () => {
  it('识别 #share= 前缀', () => {
    expect(readShareToken('#share=abc-DEF_123')).toBe('abc-DEF_123');
  });

  it('非分享 hash 返回 null', () => {
    expect(readShareToken('')).toBeNull();
    expect(readShareToken('#other')).toBeNull();
    expect(readShareToken('#share=')).toBeNull();
  });
});
