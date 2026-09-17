import { useEffect, useState } from 'react';
import type { Rule, Simulation } from './types';
import { simulate } from './engine';
import { validateRules } from './validate';
import { SAMPLE_RULES, PRESETS } from './samples';
import { clearShareHash, readShareToken } from './share';
import type { ShareContent } from './share';
import { RulesPanel } from './components/RulesPanel';
import { Simulator } from './components/Simulator';
import { TraceView } from './components/TraceView';
import { ShareDialog } from './components/ShareDialog';
import { ShareImport } from './components/ShareImport';

const STORAGE_KEY = 'url-route-debugger.rules.v1';

function loadRules(): Rule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return validateRules(JSON.parse(raw));
  } catch {
    // 本地缓存损坏时回退到示例规则
  }
  return structuredClone(SAMPLE_RULES);
}

export default function App() {
  const [rules, setRules] = useState<Rule[]>(loadRules);
  const [method, setMethod] = useState(PRESETS[0].method);
  const [url, setUrl] = useState(PRESETS[0].url);
  const [sim, setSim] = useState<Simulation | null>(null);
  // 地址栏 hash 中的分享 token：存在时只显示口令解锁界面
  const [shareToken, setShareToken] = useState<string | null>(() => readShareToken());
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  }, [rules]);

  // 同一标签页里粘贴新的分享链接（hash 变化）也能进入解锁流程
  useEffect(() => {
    const onHashChange = () => setShareToken(readShareToken());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const run = () => setSim(simulate(rules, method, url));

  /** 退出分享流程：移除 hash，不触碰规则 / 请求 / 轨迹等任何状态 */
  const exitShare = () => {
    clearShareHash();
    setShareToken(null);
  };

  /** 确认导入：替换规则表、方法和 URL，清空旧轨迹，并移除 hash */
  const confirmImport = (content: ShareContent) => {
    setRules(content.rules);
    setMethod(content.method);
    setUrl(content.url);
    setSim(null);
    exitShare();
  };

  // 打开分享链接：只显示口令框（解密成功后为导入预览），不渲染主界面
  if (shareToken !== null) {
    return (
      <ShareImport
        key={shareToken}
        token={shareToken}
        onConfirm={confirmImport}
        onCancel={exitShare}
      />
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-row">
          <h1>URL 路由规则调试台</h1>
          <button onClick={() => setShareOpen(true)}>🔗 加密分享</button>
        </div>
        <p>
          编排有序规则（方法 / 主机 / 路径模板 → 重写、重定向或停止），模拟请求逐步追踪命中过程。
          重写后从第一条规则重新匹配；以「方法 + URL」识别循环，最多执行 20 步。
        </p>
      </header>
      <main className="layout">
        <RulesPanel rules={rules} onRulesChange={setRules} />
        <div className="right-col">
          <Simulator
            method={method}
            url={url}
            onMethodChange={setMethod}
            onUrlChange={setUrl}
            onRun={run}
          />
          {sim && <TraceView sim={sim} />}
        </div>
      </main>
      {shareOpen && (
        <ShareDialog
          rules={rules}
          method={method}
          url={url}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}
