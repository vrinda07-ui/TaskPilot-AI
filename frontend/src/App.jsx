import { useState } from 'react';
import { Bot, Send, Globe, LoaderCircle, CheckCircle2, AlertCircle, Copy, Sparkles } from 'lucide-react';

const API = 'http://localhost:5000/api/tasks/execute';
const starter = 'Crawl https://example.com, extract the important information, summarize the website and return the extracted data in JSON format.';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([{ role: 'assistant', text: 'Hi! I am TaskPilot AI. Give me a public website URL and tell me what information you want extracted. I will execute a real Python crawler through the backend CLI.' }]);
  const [busy, setBusy] = useState(false);

  async function submit(value = prompt) {
    const task = value.trim();
    if (!task || busy) return;
    setMessages(m => [...m, { role: 'user', text: task }]);
    setPrompt('');
    setBusy(true);
    try {
      const response = await fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: task })
      });
      const result = await response.json();
      setMessages(m => [...m, { role: 'assistant', result, error: !response.ok }]);
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: 'Could not connect to the backend. Make sure the Express server is running on port 5000.', error: true }]);
    } finally { setBusy(false); }
  }

  async function copyJson(data) {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  }

  return <main className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brandIcon"><Sparkles size={20}/></div><div><b>TaskPilot AI</b><small>CLI task execution</small></div></div>
      <div className="sideLabel">WORKSPACE</div>
      <div className="nav active"><Globe size={17}/> Website crawler</div>
      <div className="sideNote"><b>How it works</b><p>Your request is validated, sent to an approved Python CLI process, and the real execution output is returned here.</p></div>
      <div className="sideFoot">BUILDSPRINT · ROUND 2</div>
    </aside>
    <section className="main">
      <header><div><span className="eyebrow">TASK EXECUTION</span><h1>Website research assistant</h1></div><span className="online"><i/> Backend workflow</span></header>
      <div className="chat">
        <div className="intro"><div className="heroIcon"><Bot size={27}/></div><h2>What should I research?</h2><p>Describe a website crawling task in natural language.</p><button className="example" onClick={() => submit(starter)}>Try the example <span>↗</span></button></div>
        {messages.map((m,i)=><div className={`message ${m.role}`} key={i}>
          <div className="avatar">{m.role === 'assistant' ? <Bot size={17}/> : 'You'}</div>
          <div className="bubble">{m.text && <p>{m.text}</p>}
            {m.result && <Result result={m.result} onCopy={copyJson}/>}
          </div>
        </div>)}
        {busy && <div className="message assistant"><div className="avatar"><Bot size={17}/></div><div className="bubble running"><LoaderCircle className="spin" size={17}/> Running Python crawler through backend CLI…</div></div>}
      </div>
      <div className="composerWrap"><div className="composer"><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit();}}} placeholder="e.g. Crawl https://example.com and return the main headings as JSON" rows={2}/><button disabled={busy || !prompt.trim()} onClick={()=>submit()}><Send size={17}/></button></div><p>Only crawl public websites you are permitted to access. Maximum 5 pages per task.</p></div>
    </section>
  </main>;
}

function Result({ result, onCopy }) {
  const ok = result.status === 'SUCCESS' || result.status === 'PARTIAL';
  return <div className="result">
    <div className={`status ${ok?'good':'bad'}`}>{ok?<CheckCircle2 size={16}/>:<AlertCircle size={16}/>} {result.status || 'FAILED'}</div>
    {result.error && <p className="error">{result.error}</p>}
    {result.summary && <><h3>Website summary</h3><p>{result.summary}</p></>}
    {result.execution && <div className="execution"><span>CLI: {result.execution.cli}</span><span>Exit code: {String(result.execution.exitCode)}</span><span>Duration: {result.execution.durationMs ?? 0} ms</span></div>}
    {result.data && <><div className="jsonHead"><h3>Extracted JSON</h3><button onClick={()=>onCopy(result.data)}><Copy size={14}/> Copy JSON</button></div><pre>{JSON.stringify(result.data,null,2)}</pre><p className="pages">Pages successfully crawled: {result.data.pages_crawled}</p></>}
    {result.execution?.stderr && <details><summary>Execution diagnostics</summary><pre>{result.execution.stderr}</pre></details>}
  </div>;
}
