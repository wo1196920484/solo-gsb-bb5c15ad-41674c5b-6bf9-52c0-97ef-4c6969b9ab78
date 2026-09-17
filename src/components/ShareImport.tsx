import { useState } from 'react';
import type { Rule } from '../types';
import { decryptShare } from '../share';
import type { ShareContent } from '../share';

interface Props {
  token: string;
  /** 用户确认导入：由调用方替换状态并清空旧轨迹 */
  onConfirm: (content: ShareContent) => void;
  /** 用户取消：由调用方退出分享流程，不改变任何状态 */
  onCancel: () => void;
}

const ACTION_LABEL: Record<Rule['action']['type'], string> = {
  rewrite: '重写',
  redirect: '重定向',
  stop: '停止',
};

/**
 * 打开分享链接时的独占界面：
 * 1. 只显示口令框，解密失败（口令错误 / 篡改 / 版本不支持）停留在本步；
 * 2. 解密并校验成功后展示预览，由用户确认才导入，取消则原样返回。
 */
export function ShareImport({ token, onConfirm, onCancel }: Props) {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<ShareContent | null>(null);

  const unlock = async () => {
    if (passphrase === '' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const decoded = await decryptShare(passphrase, token);
      setContent(decoded);
      setPassphrase(''); // 口令用完即弃
    } catch (err) {
      // 口令错误、密文篡改、版本不支持：只提示，不改变任何状态
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (content === null) {
    return (
      <div className="app share-gate">
        <section className="panel share-gate-panel">
          <h1>🔒 加密分享</h1>
          <p className="muted">
            这个链接包含加密的规则配置。请输入口令解锁——解密完全在本地浏览器进行，
            口令不会被保存或上传。
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void unlock();
            }}
          >
            <input
              type="password"
              autoFocus
              value={passphrase}
              placeholder="输入口令"
              autoComplete="off"
              onChange={(e) => setPassphrase(e.target.value)}
            />
            <div className="modal-actions">
              <button type="button" onClick={onCancel}>
                取消
              </button>
              <button
                type="submit"
                className="primary"
                disabled={passphrase === '' || busy}
              >
                {busy ? '解密中…' : '解锁'}
              </button>
            </div>
          </form>
          {error && <div className="banner error">{error}</div>}
        </section>
      </div>
    );
  }

  return (
    <div className="app share-gate">
      <section className="panel share-gate-panel">
        <h1>📥 导入预览</h1>
        <p className="muted">
          解密成功，共 {content.rules.length} 条规则。确认后将
          <strong>替换当前规则表、请求方法和 URL，并清空现有执行轨迹</strong>
          ；取消则保持现状不变。
        </p>

        <div className="share-request">
          模拟请求：<code>{content.method}</code>{' '}
          <code className="share-url">{content.url}</code>
        </div>

        {content.rules.length === 0 ? (
          <p className="empty">分享内容是一张空规则表。</p>
        ) : (
          <ul className="share-rules">
            {content.rules.map((r, i) => (
              <li key={r.id}>
                <div className="share-rule-head">
                  <span className="rule-order">#{i + 1}</span>
                  <strong>{r.name}</strong>
                  {!r.enabled && <em className="share-rule-off">（未启用）</em>}
                </div>
                <div className="share-rule-detail">
                  <code>{r.method}</code> · 主机{' '}
                  <code>{r.host.trim() === '' ? '*' : r.host}</code> · 路径{' '}
                  <code>{r.pathTemplate.trim() === '' ? '*' : r.pathTemplate}</code>
                  {' → '}
                  {ACTION_LABEL[r.action.type]}
                  {r.action.type !== 'stop' && (
                    <>
                      {' '}
                      <code>{r.action.target}</code>
                    </>
                  )}
                  {r.action.type === 'redirect' && `（${r.action.status}）`}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button onClick={onCancel}>取消</button>
          <button className="primary" onClick={() => onConfirm(content)}>
            确认导入（替换当前状态）
          </button>
        </div>
      </section>
    </div>
  );
}
