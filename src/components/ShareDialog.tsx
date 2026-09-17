import { useState } from 'react';
import type { Rule } from '../types';
import { buildShareLink, encryptShare } from '../share';

interface Props {
  rules: Rule[];
  method: string;
  url: string;
  onClose: () => void;
}

/**
 * 「加密分享」弹窗：输入口令 → 本地加密 → 生成可复制链接。
 * 口令只用于派生密钥，生成成功后立即从组件状态中丢弃。
 */
export function ShareDialog({ rules, method, url, onClose }: Props) {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (passphrase === '' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const token = await encryptShare(passphrase, { rules, method, url });
      setLink(buildShareLink(token));
      setPassphrase(''); // 口令用完即弃，不留在界面状态里
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError('自动复制失败，请手动全选链接复制');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>🔗 加密分享</h2>
        <p className="muted">
          将当前规则表（{rules.length} 条）、请求方法 {method} 和 URL
          用口令加密后生成链接。加密在本地浏览器完成，口令不会写入链接，
          也不会被保存；请把「链接」和「口令」通过不同渠道分别发给对方。
        </p>

        {link === null ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void generate();
            }}
          >
            <input
              type="password"
              autoFocus
              value={passphrase}
              placeholder="输入口令（对方解密时需要）"
              autoComplete="off"
              onChange={(e) => setPassphrase(e.target.value)}
            />
            <div className="modal-actions">
              <button type="button" onClick={onClose}>
                取消
              </button>
              <button
                type="submit"
                className="primary"
                disabled={passphrase === '' || busy}
              >
                {busy ? '加密中…' : '生成加密链接'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
            <div className="modal-actions">
              <button onClick={onClose}>关闭</button>
              <button className="primary" onClick={() => void copy()}>
                {copied ? '已复制 ✓' : '复制链接'}
              </button>
            </div>
          </>
        )}

        {error && <div className="banner error">{error}</div>}
      </div>
    </div>
  );
}
