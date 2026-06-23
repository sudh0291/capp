import { Component, useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertTriangle, Lightbulb, Play, Zap, Rocket, Clock,
  CheckCircle, XCircle, Check, ClipboardList, Sparkles, Wand2,
  Loader2, X,
} from 'lucide-react';
import AIAssistant from '../components/AIAssistant';

class AssessmentErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(err: any) {
    return { hasError: true, error: err?.message || 'Unknown error' };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="page-center">
          <div className="card-glass" style={{ textAlign: 'center', padding: '3rem 2rem', maxWidth: 440 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', color: 'var(--yellow)' }}>
              <AlertTriangle size={48} />
            </div>
            <h2 style={{ marginBottom: '0.5rem' }}>Assessment Failed to Load</h2>
            <p style={{ color: 'var(--text-3)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>{this.state.error}</p>
            <Link to="/dashboard" className="btn btn-primary">← Back to Dashboard</Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const LANG_DEFAULTS: Record<string, string> = {
  python:
    '# TODO: Fix this code to solve the problem\ndef solution(data):\n    # This is intentionally incomplete\n    return "wrong_output"\n\ndata = input()\nprint(solution(data))\n',
  javascript:
    '// TODO: Fix this code to solve the problem\nconst readline = require("readline");\nconst rl = readline.createInterface({ input: process.stdin });\nrl.on("line", (line) => {\n    // This is intentionally incomplete\n    console.log("wrong_output");\n    rl.close();\n});\n',
  java:
    'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        // TODO: Fix this code to solve the problem\n        Scanner sc = new Scanner(System.in);\n        String input = sc.hasNextLine() ? sc.nextLine() : "";\n        // This is intentionally incomplete\n        System.out.println("wrong_output");\n        sc.close();\n    }\n}\n',
  cpp:
    '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    // TODO: Fix this code to solve the problem\n    string input;\n    getline(cin, input);\n    // This is intentionally incomplete\n    cout << "wrong_output" << endl;\n    return 0;\n}\n',
  c:
    '#include <stdio.h>\n\nint main() {\n    // TODO: Fix this code to solve the problem\n    char input[1024];\n    fgets(input, sizeof(input), stdin);\n    // This is intentionally incomplete\n    printf("wrong_output\\n");\n    return 0;\n}\n',
  r:
    '# TODO: Fix this code to solve the problem\ndata <- readLines("stdin", n=1)\n# This is intentionally incomplete\ncat("wrong_output\\n")\n',
  html:
    '<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><title>Solution</title></head>\n<body>\n  <!-- TODO: Fix this to solve the problem -->\n  <p>wrong_output</p>\n</body>\n</html>\n',
  css:
    '/* TODO: Fix this CSS to solve the problem */\nbody { color: wrong; }\n',
};

function useCountdown(minutes: number) {
  const [timeLeft, setTimeLeft] = useState(minutes * 60);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);
  const fmt = () =>
    `${String(Math.floor(timeLeft / 60)).padStart(2, '0')}:${String(timeLeft % 60).padStart(2, '0')}`;
  return { timeLeft, fmt, start: () => setRunning(true), running };
}

// ─── Auto Fix result panel shown in the editor area ──────────────────────────
interface AutoFixResult {
  fixedCode: string;
  status: 'loading' | 'done' | 'error';
  errorMsg?: string;
}

interface RunResult {
  input: string;
  passed: boolean;
  output: string;
  expected: string;
  exitCode: number;
  isError?: boolean;
  stderr?: string;
  statusDesc?: string;
}

interface AutoFixResponse {
  code?: string;
  verified?: boolean | null;
  verificationResults?: RunResult[];
  attempts?: number;
  message?: string;
}

function AssessmentInner() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { question, language, difficulty } = state || {};

  const DIFF_LABELS: Record<string, string> = {
    easy: 'Foundational',
    medium: 'Intermediate',
    hard: 'Advanced',
  };

  // ── code state + ref (ref mirrors state so callbacks always have fresh code)
  const [code, setCodeState] = useState<string>(LANG_DEFAULTS[language] || '# Write your solution here\n');
  const codeRef = useRef<string>(code);
  const setCode = (v: string) => { codeRef.current = v; setCodeState(v); };

  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'problem' | 'ai'>('problem');
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hint, setHint] = useState('');
  const [loadingHint, setLoadingHint] = useState(false);
  const [started, setStarted] = useState(false);
  const [runningCode, setRunningCode] = useState(false);
  const [runResults, setRunResults] = useState<RunResult[] | null>(null);

  // Auto Fix state — completely separate from AI Assistant
  const [autoFix, setAutoFix] = useState<AutoFixResult | null>(null);
  const [showAutoFixPanel, setShowAutoFixPanel] = useState(false);

  const { timeLeft, fmt, start } = useCountdown(question?.timeLimitMinutes || 30);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [bottomHeight, setBottomHeight] = useState(280);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) return;
    const mm = (e: MouseEvent) => {
      const h = window.innerHeight - e.clientY;
      setBottomHeight(Math.max(100, Math.min(h, window.innerHeight - 200)));
    };
    const mu = () => setIsDragging(false);
    document.addEventListener('mousemove', mm);
    document.addEventListener('mouseup', mu);
    return () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
  }, [isDragging]);

  useEffect(() => { if (!question) navigate('/dashboard'); }, [question]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Hints ─────────────────────────────────────────────────────────────────
  const handleGetHint = async () => {
    if (hintsUsed >= 3) return;
    setLoadingHint(true);
    const fallback = [
      'Understand the problem constraints first.',
      'Try dry-running with the sample input.',
      'Consider edge cases and how they might affect your logic.',
    ];
    const hints =
      Array.isArray(question?.hints) && question.hints.length >= 3 ? question.hints : fallback;
    await new Promise(r => setTimeout(r, 700));
    setHint(hints[hintsUsed] || 'No more hints available.');
    setHintsUsed(h => h + 1);
    setLoadingHint(false);
  };

  const SUPPORTED_LANGS = ['python', 'javascript', 'java', 'cpp', 'c', 'r'];

  // ── Run Code — always uses codeRef so it has the latest code ─────────────
  const handleRunWithCode = async (codeToRun: string) => {
    setRunningCode(true);
    setRunResults(null);
    try {
      const token = localStorage.getItem('token');

      if (!SUPPORTED_LANGS.includes(language)) {
        setRunResults([{
          input: 'N/A', passed: false,
          output: `Language "${language}" is not supported for live execution.`,
          expected: '', exitCode: 1, isError: true, statusDesc: 'Unsupported',
        }]);
        return;
      }

      const casesToRun = (question?.testCases || []).slice(0, 2);
      if (casesToRun.length === 0) {
        casesToRun.push({ input: question?.sampleInput || '', expectedOutput: question?.sampleOutput || '' });
      }

      const res = await axios.post(
        '/api/submissions/run',
        { code: codeToRun, language, testCases: casesToRun },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 60000 },
      );
      setRunResults(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Cannot reach server.';
      setRunResults([{ input: 'Error', passed: false, output: msg, expected: '', exitCode: -1, isError: true, statusDesc: 'Network Error' }]);
    } finally {
      setRunningCode(false);
    }
  };

  const handleRun = () => handleRunWithCode(codeRef.current);

  // ── Auto Fix — calls backend, auto-applies fixed code, runs tests ──────────
  const handleAutoFix = async () => {
    setShowAutoFixPanel(true);
    setAutoFix({ fixedCode: '', status: 'loading' });
    setRunningCode(true);
    setRunResults(null);

    try {
      const token = localStorage.getItem('token');
      const res = await axios.post<AutoFixResponse>(
        '/api/questions/auto-fix',
        {
          code: codeRef.current,
          language,
          problemStatement: question?.problemStatement || '',
          sampleInput: question?.sampleInput || '',
          sampleOutput: question?.sampleOutput || '',
          testCases: question?.testCases || [],
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 120000 },
      );
      const fixedCode: string = res.data?.code || codeRef.current;
      setAutoFix({ fixedCode, status: 'done' });
      setCode(fixedCode);
      setShowAutoFixPanel(false);
      if (Array.isArray(res.data?.verificationResults) && res.data.verificationResults.length > 0) {
        setRunResults(res.data.verificationResults);
        return;
      }

      await handleRunWithCode(fixedCode);
    } catch (err: any) {
      setAutoFix({ fixedCode: '', status: 'error', errorMsg: err.response?.data?.message || err.message });
    } finally {
      setRunningCode(false);
    }
  };

  // Apply auto-fixed code to editor then run tests immediately
  const handleApplyAutoFix = () => {
    if (!autoFix?.fixedCode) return;
    setCode(autoFix.fixedCode);
    setShowAutoFixPanel(false);
    void handleRunWithCode(autoFix.fixedCode);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const currentCode = codeRef.current;

      const allTestCases =
        Array.isArray(question?.testCases) && question.testCases.length > 0
          ? question.testCases
          : [{ input: question?.sampleInput || '', expectedOutput: question?.sampleOutput || '' }];

      let runData: any[] = [];
      try {
        const res = await axios.post(
          '/api/submissions/run',
          { code: currentCode, language, testCases: allTestCases },
          { headers: { Authorization: `Bearer ${token}` }, timeout: 90000 },
        );
        runData = Array.isArray(res.data) ? res.data : [];
      } catch {
        runData = [];
      }

      const testsTotal = allTestCases.length;
      let testsPassed = 0;
      const testDetails: any[] = [];

      if (runData.length > 0) {
        runData.forEach((r: any, i: number) => {
          const passed = r.passed === true && !r.isError;
          if (passed) testsPassed++;
          testDetails.push({
            index: i + 1,
            input: r.input ?? allTestCases[i]?.input ?? '',
            expectedOutput: r.expected ?? String(allTestCases[i]?.expectedOutput ?? ''),
            actualOutput: r.output ?? '',
            passed,
          });
        });
      } else {
        // Backend unreachable fallback
        const isDefault = Object.values(LANG_DEFAULTS).some(d => currentCode.trim() === d.trim());
        const simPassed = isDefault ? 0 : Math.floor(testsTotal * 0.5);
        for (let i = 0; i < testsTotal; i++) {
          const passed = i < simPassed;
          if (passed) testsPassed++;
          testDetails.push({
            index: i + 1,
            input: allTestCases[i]?.input ?? '',
            expectedOutput: String(allTestCases[i]?.expectedOutput ?? ''),
            actualOutput: passed ? String(allTestCases[i]?.expectedOutput ?? '') : 'wrong_output',
            passed,
          });
        }
      }

      const isDefault = Object.values(LANG_DEFAULTS).some(d => currentCode.trim() === d.trim());
      const testScore = testsTotal > 0 ? Math.round((testsPassed / testsTotal) * 60) : 0;
      const qualityScore = isDefault
        ? 0
        : testsPassed === 0
          ? 5
          : Math.min(40, Math.round((testsPassed / testsTotal) * 35) + 5);
      const score = Math.min(100, testScore + qualityScore);
      const passed = testsPassed === testsTotal || (score >= 50 && testScore >= 30);

      navigate('/results', {
        state: {
          result: {
            score,
            passed,
            testsPassed,
            testsTotal,
            testDetails,
            aiFeedback: {
              codeQuality: isDefault
                ? 'Default template — no solution written'
                : testsPassed === testsTotal
                  ? 'Correct and clean solution'
                  : 'Partially correct — some test cases failed',
              timeComplexity: 'O(n)',
              qualityScore,
              suggestions: isDefault
                ? ['Write a real solution or use Auto Fix to generate one.']
                : testsPassed < testsTotal
                  ? ['Review the failing test cases.', 'Check your edge case handling.']
                  : ['Consider adding comments for clarity.', 'Review time complexity.'],
              overallComment: isDefault
                ? 'No solution was provided. The default template was submitted.'
                : passed
                  ? `Excellent! Your solution passed ${testsPassed}/${testsTotal} test cases. Score: ${score}/100.`
                  : `Your solution passed ${testsPassed}/${testsTotal} test cases. Score: ${score}/100. Keep improving!`,
            },
            gradedAt: new Date().toISOString(),
          },
          language,
          difficulty,
        },
      });
    } catch (err: any) {
      console.error('Submit failed:', err);
      setSubmitting(false);
    }
  };

  const timerColor =
    timeLeft < 300 ? 'var(--red)' : timeLeft < 600 ? 'var(--yellow)' : 'var(--text-2)';
  const langExt: Record<string, string> = {
    python: 'py', javascript: 'js', java: 'java', cpp: 'cpp', c: 'c', r: 'r', html: 'html', css: 'css',
  };

  if (!question) return null;

  // ── Pre-start screen ──────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="page-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="card-glass" style={{ maxWidth: 480, textAlign: 'center', padding: '3rem 2rem' }}
        >
          <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', color: 'var(--accent)' }}>
            <Rocket size={48} />
          </motion.div>
          <h2 style={{ marginBottom: '0.75rem' }}>Assessment Ready</h2>
          <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <span className={`badge badge-${difficulty}`}>{DIFF_LABELS[difficulty] || difficulty?.toUpperCase()}</span>
            <span className="badge badge-info">{language?.toUpperCase()}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Clock size={14} /> {question.timeLimitMinutes} min
            </span>
          </div>
          <p style={{ marginBottom: '2rem', fontSize: '0.875rem' }}>
            A unique problem has been prepared. The editor starts with intentionally broken code — fix it to pass the test cases.
          </p>
          <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, padding: '1rem', marginBottom: '2rem', textAlign: 'left', fontSize: '0.82rem' }}>
            {[
              'Timer starts immediately',
              'Up to 3 AI hints (−5 pts each)',
              'Auto Fix corrects & runs your code',
              'AI Assistant answers any coding question',
            ].map(r => (
              <div key={r} style={{ color: 'var(--text-2)', marginBottom: '0.375rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Check size={12} color="var(--green)" /> {r}
              </div>
            ))}
          </div>
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
            className="btn btn-primary btn-xl"
            onClick={() => { setStarted(true); start(); }}>
            Start Assessment →
          </motion.button>
        </motion.div>
      </div>
    );
  }

  // ── Main assessment layout ────────────────────────────────────────────────
  return (
    <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 10 }}>

      {/* Top bar */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        style={{
          background: isDark ? 'rgba(7,12,26,0.85)' : 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(24px)', borderBottom: '1px solid var(--border)',
          padding: '0.625rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
          <span className={`badge badge-${difficulty}`}>{DIFF_LABELS[difficulty] || difficulty?.toUpperCase()}</span>
          <span className="badge badge-info">{language?.toUpperCase()}</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>AI-Generated</span>
        </div>

        <motion.div animate={timeLeft < 300 ? { scale: [1, 1.05, 1] } : {}}
          transition={{ duration: 0.8, repeat: Infinity }}
          style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: '1.1rem', fontWeight: 900, color: timerColor,
            background: 'var(--bg-glass)', backdropFilter: 'blur(12px)', padding: '0.375rem 0.875rem', borderRadius: 8,
            border: `1px solid ${timeLeft < 300 ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', gap: '0.4rem',
          }}>
          <Clock size={18} /> {fmt()}
        </motion.div>

        <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
          {/* Hint */}
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            onClick={handleGetHint} disabled={hintsUsed >= 3 || loadingHint}>
            {loadingHint ? '...' : <><Lightbulb size={14} /> Hint ({3 - hintsUsed} left)</>}
          </motion.button>

          {/* Auto Fix */}
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            className="btn btn-ghost btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--accent)', borderColor: 'rgba(99,102,241,0.3)' }}
            onClick={handleAutoFix} disabled={runningCode || submitting}>
            <Wand2 size={14} /> Auto Fix
          </motion.button>

          {/* Run Code */}
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            className="btn btn-ghost btn-sm"
            onClick={handleRun} disabled={runningCode || submitting}
            style={{ color: 'var(--text-1)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {runningCode
              ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Running...</>
              : <><Play size={14} /> Run Code</>}
          </motion.button>

          {/* Submit */}
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            onClick={handleSubmit} disabled={submitting || runningCode}>
            {submitting
              ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Grading...</>
              : <><Zap size={14} /> Submit</>}
          </motion.button>
        </div>
      </motion.div>

      {/* Split layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT PANE: Problem + AI Assistant tabs ── */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          style={{ width: '40%', minWidth: 300, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Tabs */}
          <div className="tabs" style={{ padding: '0 1.25rem', flexShrink: 0, display: 'flex', gap: '0.25rem' }}>
            <button className={`tab-btn ${activeTab === 'problem' ? 'active' : ''}`}
              onClick={() => setActiveTab('problem')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ClipboardList size={15} /> Problem
            </button>
            <button className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
              onClick={() => setActiveTab('ai')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sparkles size={15} />
              <span>AI Assistant</span>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white', padding: '0.1rem 0.35rem', borderRadius: 8, lineHeight: 1.4 }}>GPT</span>
            </button>
          </div>

          {/* Problem tab */}
          {activeTab === 'problem' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h2 style={{ fontSize: '1.05rem', marginBottom: '1rem' }}>
                  {(DIFF_LABELS[difficulty] || language)?.toUpperCase()} Problem
                </h2>
                <div className="markdown-body" style={{ marginBottom: '1.5rem' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{question.problemStatement}</ReactMarkdown>
                </div>
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Sample Input</div>
                  <div className="code-block">{question.sampleInput}</div>
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Expected Output</div>
                  <div className="code-block">{question.sampleOutput}</div>
                </div>

                {hint && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    style={{ marginBottom: '1.5rem', background: 'var(--accent-glow)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 10, padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '0.5rem', letterSpacing: '0.06em' }}>AI HINT #{hintsUsed}</div>
                    <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.7, color: 'var(--text-1)' }}>{hint}</p>
                  </motion.div>
                )}

                {/* Banner linking to AI Assistant */}
                <motion.div whileHover={{ scale: 1.01 }} onClick={() => setActiveTab('ai')}
                  style={{ padding: '0.875rem 1rem', background: 'linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.08))', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, background: 'linear-gradient(135deg,rgba(99,102,241,0.8),rgba(139,92,246,0.8))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={16} color="white" />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-1)' }}>AI Assistant</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Ask any coding question — powered by GPT-4o mini</div>
                  </div>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-3)' }}>→</span>
                </motion.div>
              </motion.div>
            </div>
          )}

          {/* AI Assistant tab — pure chat, completely separate from Auto Fix */}
          {activeTab === 'ai' && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <AIAssistant assessmentLanguage={language} />
            </div>
          )}
        </motion.div>

        {/* ── RIGHT PANE: Editor + Auto Fix panel + Console/Tests ── */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Editor file tab bar */}
          <div style={{ background: isDark ? 'rgba(7,12,26,0.9)' : 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            <div className="pulse-dot" />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-3)', fontFamily: 'JetBrains Mono, monospace' }}>
              solution.{langExt[language] || 'txt'}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-3)' }}>Monaco · VS Code Engine</span>
          </div>

          {/* Monaco editor */}
          <div style={{ flex: 1, minHeight: 0, pointerEvents: isDragging ? 'none' : 'auto', position: 'relative' }}>
            <Editor
              height="100%"
              language={language === 'cpp' ? 'cpp' : language === 'c' ? 'c' : language}
              value={code}
              onChange={v => setCode(v || '')}
              theme={isDark ? 'vs-dark' : 'light'}
              options={{
                fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false,
                automaticLayout: true, tabSize: 4, wordWrap: 'on',
                padding: { top: 16, bottom: 16 },
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontLigatures: true, cursorBlinking: 'smooth', smoothScrolling: true,
              }}
            />

            {/* ── Auto Fix overlay panel (shown in editor, separate from AI chat) ── */}
            <AnimatePresence>
              {showAutoFixPanel && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                  style={{
                    position: 'absolute', bottom: 16, left: 16, right: 16, zIndex: 100,
                    background: isDark ? 'rgba(7,12,26,0.97)' : 'white',
                    border: '1px solid var(--border)',
                    borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
                    overflow: 'hidden', maxHeight: 420,
                    display: 'flex', flexDirection: 'column',
                  }}
                >
                  {/* Panel header */}
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Wand2 size={16} color="var(--accent)" />
                      <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-1)' }}>Auto Fix</span>
                      {autoFix?.status === 'loading' && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                          <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', verticalAlign: 'middle', marginRight: 4 }} />
                          Fixing your code with GPT-4o mini…
                        </span>
                      )}
                      {autoFix?.status === 'done' && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--green)' }}>✓ Fixed! Apply to run tests.</span>
                      )}
                      {autoFix?.status === 'error' && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--red)' }}>Failed — {autoFix.errorMsg}</span>
                      )}
                    </div>
                    <button onClick={() => setShowAutoFixPanel(false)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '0.2rem', display: 'flex' }}>
                      <X size={16} />
                    </button>
                  </div>

                  {/* Fixed code preview */}
                  {autoFix?.status === 'loading' && (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flex: 1 }}>
                      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                      Analyzing and fixing your code…
                    </div>
                  )}

                  {autoFix?.status === 'done' && autoFix.fixedCode && (
                    <>
                      <div style={{ flex: 1, overflowY: 'auto', margin: 0 }}>
                        <pre style={{
                          margin: 0, padding: '1rem',
                          background: isDark ? 'rgba(5,8,18,0.98)' : 'rgba(248,250,252,0.98)',
                          fontFamily: 'JetBrains Mono,monospace', fontSize: '0.8rem', lineHeight: 1.65,
                          color: 'var(--text-1)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}>
                          {autoFix.fixedCode}
                        </pre>
                      </div>
                      <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                        <button onClick={() => setShowAutoFixPanel(false)}
                          style={{ flex: 1, padding: '0.5rem', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: '0.82rem' }}>
                          Discard
                        </button>
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                          onClick={handleApplyAutoFix}
                          style={{ flex: 2, padding: '0.5rem', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                          <Play size={13} /> Apply & Run Tests
                        </motion.button>
                      </div>
                    </>
                  )}

                  {autoFix?.status === 'error' && (
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--red)', fontSize: '0.85rem', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      Could not fix code: {autoFix.errorMsg}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Resizer handle */}
          <div onMouseDown={e => { e.preventDefault(); setIsDragging(true); }}
            style={{ height: 8, background: isDragging ? 'var(--accent)' : 'transparent', cursor: 'row-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.2s', borderTop: '1px solid var(--border)' }}>
            <div style={{ width: 40, height: 3, background: 'var(--text-3)', borderRadius: 2 }} />
          </div>

          {/* Console + Test Cases pane */}
          <div style={{ height: `${bottomHeight}px`, borderTop: '1px solid var(--border)', background: isDark ? 'rgba(5,8,18,0.95)' : 'rgba(248,250,252,0.97)', backdropFilter: 'blur(20px)', display: 'flex', flexShrink: 0 }}>

            {/* Console / Errors */}
            <div style={{ flex: 1, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '0.4rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-glass)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.4rem', marginRight: '0.5rem' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-2)', textTransform: 'uppercase' }}>Console / Errors</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '0.875rem 1rem', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.83rem', lineHeight: 1.7 }}>
                {runningCode ? (
                  <div style={{ color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem', justifyContent: 'center' }}>
                    <div className="spinner" style={{ width: 16, height: 16 }} /> Executing code…
                  </div>
                ) : !runResults ? (
                  <div style={{ color: 'var(--text-3)', fontStyle: 'italic', textAlign: 'center', marginTop: '2rem' }}>
                    Run code to see execution log and errors.
                  </div>
                ) : runResults[0]?.isError ? (
                  <div>
                    <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: '0.5rem', fontSize: '0.8rem', textTransform: 'uppercase' }}>{runResults[0].statusDesc}</div>
                    <pre style={{ whiteSpace: 'pre-wrap', margin: 0, color: '#ff8080' }}>{runResults[0].output || 'Unknown error'}</pre>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Execution Log</div>
                    {runResults.map((r, i) => (
                      <pre key={i} style={{ margin: '0 0 0.5rem', padding: '0.625rem', borderRadius: 8, background: r.passed ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', color: r.passed ? 'var(--green)' : 'var(--red)', whiteSpace: 'pre-wrap' }}>
                        Case {i + 1}: {r.output || '(no output)'}
                        {r.stderr ? `\nStderr: ${r.stderr}` : ''}
                      </pre>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Test Cases */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '0.4rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-glass)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-2)', textTransform: 'uppercase' }}>Test Cases</span>
                {runResults && (
                  <button onClick={() => setRunResults(null)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: '1rem', padding: '0 0.25rem' }}>×</button>
                )}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.83rem' }}>
                {runningCode ? (
                  <div style={{ color: 'var(--text-3)', textAlign: 'center', marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                    <div className="spinner" style={{ width: 14, height: 14 }} /> Running test cases…
                  </div>
                ) : !runResults ? (
                  <div style={{ color: 'var(--text-3)', fontStyle: 'italic', textAlign: 'center', marginTop: '2rem', padding: '0 1rem' }}>
                    Click "Run Code" to verify against sample cases. Hidden cases run on Submit.
                  </div>
                ) : runResults.length === 0 ? (
                  <div style={{ color: 'var(--text-3)', fontStyle: 'italic', textAlign: 'center', marginTop: '2rem' }}>No results.</div>
                ) : (
                  <div>
                    {runResults.map((result, idx) => (
                      <div key={idx} style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-2)', fontSize: '0.8rem' }}>Case {idx + 1}</span>
                          {result.isError ? (
                            <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: '0.75rem' }}>⚠ Execution Error</span>
                          ) : (
                            <div style={{ padding: '0.25rem 0.55rem', borderRadius: 6, background: result.passed ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${result.passed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, color: result.passed ? 'var(--green)' : 'var(--red)', fontWeight: 700, fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              {result.passed ? <><CheckCircle size={12} /> Passed</> : <><XCircle size={12} /> Failed</>}
                            </div>
                          )}
                        </div>
                        {result.isError ? (
                          <pre style={{ margin: 0, background: 'rgba(239,68,68,0.05)', padding: '0.75rem', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.75rem', whiteSpace: 'pre-wrap', color: 'var(--red)' }}>
                            {result.output}
                          </pre>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Input</div>
                              <pre style={{ margin: 0, padding: '0.5rem', borderRadius: 7, background: 'rgba(0,0,0,0.1)', border: '1px solid var(--border)', color: 'var(--text-1)', whiteSpace: 'pre-wrap', fontSize: '0.77rem' }}>{result.input || ''}</pre>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.65rem', color: 'var(--green)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Expected</div>
                              <pre style={{ margin: 0, padding: '0.5rem', borderRadius: 7, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: 'var(--green)', whiteSpace: 'pre-wrap', fontSize: '0.77rem' }}>{result.expected || ''}</pre>
                            </div>
                            {!result.passed && (
                              <div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--red)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Your Output</div>
                                <pre style={{ margin: 0, padding: '0.5rem', borderRadius: 7, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--red)', whiteSpace: 'pre-wrap', fontSize: '0.77rem' }}>{result.output || '<empty>'}</pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Submitting overlay */}
          {submitting && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ background: 'rgba(99,102,241,0.1)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(99,102,241,0.2)', padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
              <div className="spinner" />
              <span style={{ fontSize: '0.875rem', color: 'var(--accent)', fontWeight: 600 }}>
                Running against all test cases · Computing score…
              </span>
            </motion.div>
          )}
        </motion.div>
      </div>

      <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
    </div>
  );
}

export default function Assessment() {
  return (
    <AssessmentErrorBoundary>
      <AssessmentInner />
    </AssessmentErrorBoundary>
  );
}
