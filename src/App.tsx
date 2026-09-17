import { useEffect, useState } from 'react';
import type { Rule, Simulation } from './types';
import { simulate } from './engine';
import { validateRules } from './validate';
import { SAMPLE_RULES, PRESETS } from './samples';
import { RulesPanel } from './components/RulesPanel';
import { Simulator } from './components/Simulator';
import { TraceView } from './components/TraceView';

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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  }, [rules]);

  const run = () => setSim(simulate(rules, method, url));

  return (
    <div className="app">
      <header className="app-header">
        <h1>URL 路由规则调试台</h1>
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
    </div>
  );
}
