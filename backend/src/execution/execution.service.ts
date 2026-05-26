import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

// Judge0 CE language IDs
// Docs: https://ce.judge0.com/
const JUDGE0_LANG_ID: Record<string, number> = {
  python:     71,  // Python 3.8.1
  javascript: 63,  // Node.js 12.14.0
  java:       62,  // OpenJDK 13.0.1
  cpp:        54,  // C++ (GCC 9.2.0)
  c:          50,  // C (GCC 9.2.0)
  r:          80,  // R 4.0.0
  html:       43,  // Plain Text (HTML graded by AI)
  css:        43,  // Plain Text (CSS graded by AI)
};

// Judge0 status codes
const JUDGE0_STATUS: Record<number, string> = {
  1:  'In Queue',
  2:  'Processing',
  3:  'Accepted',
  4:  'Wrong Answer',
  5:  'Time Limit Exceeded',
  6:  'Compilation Error',
  7:  'Runtime Error (SIGSEGV)',
  8:  'Runtime Error (SIGFPE)',
  9:  'Runtime Error (SIGABRT)',
  10: 'Runtime Error (NZEC)',
  11: 'Runtime Error (Other)',
  12: 'Runtime Error (Internal)',
  13: 'Exec Format Error',
};

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  /** Base URL — self-hosted Judge0 in Docker, falls back to public CE for dev */
  private get judge0Base(): string {
    return process.env.JUDGE0_URL || 'https://ce.judge0.com';
  }

  // ── Step 1: Submit code, return Judge0 token ──────────────────────────────
  async submitToJudge0(code: string, language: string, input: string): Promise<string> {
    const languageId = JUDGE0_LANG_ID[language];
    if (!languageId) throw new Error(`Unsupported language: ${language}`);

    const res = await axios.post(
      `${this.judge0Base}/submissions?base64_encoded=false&wait=false`,
      {
        source_code: code,
        language_id: languageId,
        stdin: input || '',
        cpu_time_limit: 5,
        memory_limit: 262144, // 256 MB
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 },
    );

    const token: string = res.data?.token;
    if (!token) throw new Error('No token returned from Judge0');
    return token;
  }

  // ── Step 2: Poll until execution is complete ──────────────────────────────
  async pollJudge0(token: string): Promise<{
    output: string; exitCode: number; stderr: string;
    statusId: number; statusDesc: string;
  }> {
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));

      const res = await axios.get(
        `${this.judge0Base}/submissions/${token}?base64_encoded=false`,
        { timeout: 8000 },
      );

      const result = res.data;
      const statusId: number = result.status?.id ?? 0;

      // 1 = In Queue, 2 = Processing — keep waiting
      if (statusId <= 2) continue;

      const stdout    = (result.stdout || '').trim();
      const stderr    = (result.stderr || result.compile_output || '').trim();
      const statusDesc = JUDGE0_STATUS[statusId] || 'Unknown';
      const exitCode  = statusId === 3 ? 0 : 1; // 3 = Accepted

      return { output: stdout, exitCode, stderr, statusId, statusDesc };
    }

    return {
      output: '', exitCode: 1,
      stderr: 'Execution timed out waiting for result',
      statusId: 5, statusDesc: 'Time Limit Exceeded',
    };
  }

  // ── Combined helper (submit + poll) used by runCode endpoint ─────────────
  async runSingle(
    code: string,
    language: string,
    input: string,
  ): Promise<{ input: string; output: string; exitCode: number; stderr: string; statusId: number; statusDesc: string }> {
    const languageId = JUDGE0_LANG_ID[language];
    if (!languageId) {
      return {
        input, output: '', exitCode: 1,
        stderr: `Unsupported language: ${language}`,
        statusId: 11, statusDesc: 'Unsupported Language',
      };
    }

    try {
      const token  = await this.submitToJudge0(code, language, input);
      const result = await this.pollJudge0(token);
      return { input, ...result };
    } catch (err: any) {
      this.logger.error('Judge0 execution failed:', err.message);
      const isNetwork = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND';
      return {
        input, output: '', exitCode: 1,
        stderr: isNetwork
          ? 'Cannot connect to execution service. Check internet connection.'
          : err.response?.data?.message || err.message,
        statusId: 13, statusDesc: 'Connection Error',
      };
    }
  }

  // ── Run all test cases concurrently to drastically reduce wait time ──────
  async runAllTestCases(
    code: string,
    language: string,
    testCases: { input: string; expectedOutput: string }[],
  ): Promise<{ input: string; output: string; exitCode: number; stderr: string; statusId: number; statusDesc: string }[]> {
    return Promise.all(
      testCases.map((tc) => this.runSingle(code, language, tc.input))
    );
  }
}
