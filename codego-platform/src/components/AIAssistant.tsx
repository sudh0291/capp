import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { Send, Copy, Check, Loader2, Bot, User, Trash2, Sparkles } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface AIAssistantProps {
  assessmentLanguage: string;   // just for context hint in system prompt
}

// ─── Quick suggestion chips ───────────────────────────────────────────────────
const CHIPS = [
  'What is a binary search tree?',
  'Write a bubble sort in Python',
  'Explain time complexity O(n log n)',
  'How does recursion work?',
  'Write fibonacci in Java',
  'What is a hash map?',
];

// ─── Markdown renderer ────────────────────────────────────────────────────────
function MarkdownRenderer({
  content,
  isDark,
}: {
  content: string;
  isDark: boolean;
}) {
  const parts: { type: 'text' | 'code'; content: string; lang: string }[] = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push({ type: 'text', content: content.slice(last, m.index), lang: '' });
    parts.push({ type: 'code', lang: m[1] || 'code', content: m[2].trim() });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push({ type: 'text', content: content.slice(last), lang: '' });

  return (
    <div style={{ fontSize: '0.855rem', lineHeight: 1.75 }}>
      {parts.map((p, i) =>
        p.type === 'code' ? (
          <CodeBlock key={i} code={p.content} lang={p.lang} isDark={isDark} />
        ) : (
          <TextBlock key={i} text={p.content} />
        ),
      )}
    </div>
  );
}

function TextBlock({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: '0.4rem' }} />;
        if (/^#{1,3}\s/.test(t)) {
          const level = t.match(/^(#{1,3})\s/)![1].length;
          const txt = t.replace(/^#{1,3}\s/, '');
          return (
            <div key={i} style={{ fontWeight: 700, fontSize: level === 1 ? '1rem' : '0.92rem', margin: '0.5rem 0 0.2rem', color: 'var(--text-1)' }}
              dangerouslySetInnerHTML={{ __html: inlineFormat(txt) }} />
          );
        }
        if (/^[-*•]\s/.test(t)) {
          return (
            <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.15rem' }}>
              <span style={{ color: 'var(--accent)', flexShrink: 0 }}>•</span>
              <span dangerouslySetInnerHTML={{ __html: inlineFormat(t.slice(2)) }} />
            </div>
          );
        }
        if (/^\d+\.\s/.test(t)) {
          const num = t.match(/^(\d+)\./)![1];
          return (
            <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.15rem' }}>
              <span style={{ color: 'var(--accent)', flexShrink: 0, minWidth: 18 }}>{num}.</span>
              <span dangerouslySetInnerHTML={{ __html: inlineFormat(t.replace(/^\d+\.\s/, '')) }} />
            </div>
          );
        }
        return <p key={i} style={{ margin: '0 0 0.25rem' }} dangerouslySetInnerHTML={{ __html: inlineFormat(t) }} />;
      })}
    </>
  );
}

function inlineFormat(s: string) {
  return s
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(99,102,241,0.18);padding:0.08em 0.32em;border-radius:4px;font-family:JetBrains Mono,monospace;font-size:0.82em">$1</code>');
}

function CodeBlock({ code, lang, isDark }: { code: string; lang: string; isDark: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden', margin: '0.5rem 0' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.3rem 0.75rem',
        background: isDark ? 'rgba(20,30,50,0.98)' : 'rgba(235,240,248,0.98)',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: '0.68rem', fontFamily: 'JetBrains Mono,monospace', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lang || 'code'}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', padding: '0.15rem 0.45rem', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontSize: '0.68rem', cursor: 'pointer' }}
        >
          {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: '0.75rem 1rem',
        background: isDark ? 'rgba(5,8,18,0.97)' : 'rgba(250,252,255,0.98)',
        fontFamily: 'JetBrains Mono,monospace', fontSize: '0.79rem', lineHeight: 1.65,
        color: 'var(--text-1)', overflowX: 'auto', whiteSpace: 'pre', maxHeight: 340, overflowY: 'auto',
      }}>
        {code}
      </pre>
    </div>
  );
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '0.15rem 0' }}>
      {[0, 1, 2].map(i => (
        <motion.div key={i}
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
          transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.13 }}
          style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }}
        />
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AIAssistant({ assessmentLanguage }: AIAssistantProps) {
  const { isDark } = useTheme();
  const [messages, setMessages] = useState<Message[]>([{
    id: 'welcome',
    role: 'assistant',
    content: `Hi! I'm your AI coding assistant.\n\nI can help you with:\n- **Writing code** in any language (Java, Python, C++, JS…)\n- **Explaining** algorithms and data structures\n- **Debugging** logic errors\n- **Drawing/graphics** programs\n\nType your question below and press **Enter**!\n\n> 💡 **Tip:** Ask me things like *"write fibonacci in Java"*, *"explain recursion"*, *"what is binary search"*, or *"draw a circle in Python"*`,
    timestamp: new Date(),
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // conversation history sent to backend (excludes welcome message)
  const historyRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: msg, timestamp: new Date() };
    setMessages(p => [...p, userMsg]);
    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';
    setLoading(true);

    // build history snapshot before this message
    const historySnapshot = [...historyRef.current];
    historyRef.current = [...historyRef.current, { role: 'user', content: msg }];

    try {
      const res = await axios.post('/api/questions/chat', {
        message: msg,
        history: historySnapshot,
        assessmentLanguage,
      }, { timeout: 60000 });

      const reply: string = res.data?.reply || 'I could not generate a response. Please try again.';
      historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }];

      setMessages(p => [...p, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
      }]);
    } catch (err: any) {
      const errMsg = `⚠️ ${err.response?.data?.message || err.message || 'Network error. Please check connection.'}`;
      setMessages(p => [...p, { id: `e-${Date.now()}`, role: 'assistant', content: errMsg, timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    historyRef.current = [];
    setMessages([{
      id: `welcome-${Date.now()}`,
      role: 'assistant',
      content: 'Chat cleared! Ask me anything about programming.',
      timestamp: new Date(),
    }]);
  };

  const showChips = messages.length <= 1 && !loading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0.6rem 1rem', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        background: isDark ? 'rgba(7,12,26,0.75)' : 'rgba(255,255,255,0.75)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={15} color="white" />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.2 }}>AI Assistant</div>
            <div style={{ fontSize: '0.67rem', color: 'var(--text-3)', lineHeight: 1.2 }}>GPT-4o mini · General coding help</div>
          </div>
        </div>
        <button onClick={clear} title="Clear chat"
          style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '0.25rem', borderRadius: 5, display: 'flex' }}>
          <Trash2 size={14} />
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <motion.div key={msg.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              style={{ display: 'flex', gap: '0.45rem', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-start' }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: msg.role === 'assistant' ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
              }}>
                {msg.role === 'assistant' ? <Bot size={13} color="white" /> : <User size={13} color="var(--text-2)" />}
              </div>
              <div style={{
                maxWidth: '85%',
                padding: '0.6rem 0.875rem',
                borderRadius: msg.role === 'user' ? '12px 3px 12px 12px' : '3px 12px 12px 12px',
                background: msg.role === 'user'
                  ? 'linear-gradient(135deg,rgba(99,102,241,0.8),rgba(139,92,246,0.8))'
                  : isDark ? 'rgba(15,23,42,0.85)' : 'rgba(248,250,252,0.92)',
                border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                color: msg.role === 'user' ? 'white' : 'var(--text-1)',
                wordBreak: 'break-word',
              }}>
                {msg.role === 'user'
                  ? <span style={{ fontSize: '0.855rem', whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{msg.content}</span>
                  : <MarkdownRenderer content={msg.content} isDark={isDark} />
                }
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', gap: '0.45rem', alignItems: 'flex-start' }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              <Loader2 size={13} color="white" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
            <div style={{ padding: '0.55rem 0.875rem', borderRadius: '3px 12px 12px 12px', background: isDark ? 'rgba(15,23,42,0.85)' : 'rgba(248,250,252,0.92)', border: '1px solid var(--border)' }}>
              <TypingDots />
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick chips */}
      {showChips && (
        <div style={{ padding: '0 0.875rem 0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem', flexShrink: 0 }}>
          {CHIPS.map(c => (
            <button key={c} onClick={() => send(c)}
              style={{ padding: '0.25rem 0.55rem', borderRadius: 20, border: '1px solid var(--border)', background: isDark ? 'rgba(99,102,241,0.07)' : 'rgba(99,102,241,0.05)', color: 'var(--text-2)', fontSize: '0.68rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '0.6rem 0.875rem', borderTop: '1px solid var(--border)', flexShrink: 0, background: isDark ? 'rgba(7,12,26,0.75)' : 'rgba(255,255,255,0.75)' }}>
        <div style={{
          display: 'flex', gap: '0.4rem', alignItems: 'flex-end',
          background: isDark ? 'rgba(15,23,42,0.92)' : 'rgba(248,250,252,0.97)',
          border: '1px solid var(--border)', borderRadius: 10,
          padding: '0.4rem 0.4rem 0.4rem 0.7rem',
        }}>
          <textarea ref={taRef} value={input}
            onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask anything… (e.g. write quicksort in C++, explain recursion)"
            rows={1}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', resize: 'none', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '0.855rem', lineHeight: 1.5, padding: 0, minHeight: 21, maxHeight: 120, overflowY: 'auto' }}
          />
          <motion.button whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
            onClick={() => send()} disabled={!input.trim() || loading}
            style={{
              width: 30, height: 30, borderRadius: 7, flexShrink: 0, border: 'none',
              background: input.trim() && !loading ? 'linear-gradient(135deg,rgba(99,102,241,0.92),rgba(139,92,246,0.92))' : 'var(--border)',
              color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed', transition: 'background 0.18s',
            }}>
            {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}
          </motion.button>
        </div>
        <div style={{ fontSize: '0.64rem', color: 'var(--text-3)', marginTop: '0.28rem', textAlign: 'center' }}>
          <kbd style={{ padding: '0 3px', border: '1px solid var(--border)', borderRadius: 3, fontSize: '0.63rem' }}>Enter</kbd> send ·{' '}
          <kbd style={{ padding: '0 3px', border: '1px solid var(--border)', borderRadius: 3, fontSize: '0.63rem' }}>Shift+Enter</kbd> new line
        </div>
      </div>

      <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
    </div>
  );
}
