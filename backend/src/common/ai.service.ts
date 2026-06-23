import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

/**
 * AiService — multi-provider AI with automatic fallback chain:
 *
 *   1. xAI Grok  (PRIMARY — grok-3-mini, OpenAI-compatible)
 *      → set XAI_API_KEY in .env
 *
 *   2. Groq  (FREE — llama-3.3-70b-versatile, fastest inference)
 *      → get free key at https://console.groq.com
 *      → set GROQ_API_KEY in .env
 *
 *   3. Google Gemini  (FREE — gemini-1.5-flash, 15 RPM)
 *      → get free key at https://aistudio.google.com/app/apikey
 *      → set GEMINI_API_KEY in .env
 *
 *   4. OpenAI  (paid fallback — gpt-4o-mini)
 *      → set OPENAI_API_KEY in .env
 *
 *   5. Smart offline fallback (always works, zero API needed)
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly mistralUrl = 'https://api.mistral.ai/v1/chat/completions'; // Mistral AI
  private readonly xAiUrl = 'https://api.x.ai/v1/chat/completions'; // xAI Grok
  private readonly groqUrl = 'https://api.groq.com/openai/v1/chat/completions'; // Groq
  private readonly openAiUrl = 'https://api.openai.com/v1/chat/completions'; // OpenAI
  private readonly geminiUrl = (model: string) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  // ─── chat: general AI assistant (called by /api/questions/chat) ─────────────
  async chat(
    userMessage: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    assessmentLanguage: string,
  ): Promise<string> {
    this.logger.log(`[AI-CHAT] "${userMessage.substring(0, 80)}"`);

    const systemPrompt = `You are an expert programming tutor and coding assistant — like ChatGPT specialized in coding.
The student is working on an assessment in ${assessmentLanguage.toUpperCase()}, but you must answer ANY programming question in ANY language they ask about.

Rules:
- ALWAYS use the language the user explicitly asks for in their message
- If user says "write in Java", respond in Java — not ${assessmentLanguage}
- Give clear explanations + working code examples
- Use markdown code blocks: \`\`\`java  \`\`\`python  \`\`\`cpp etc.
- Be helpful, encouraging, and concise`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.slice(-8),
      { role: 'user' as const, content: userMessage },
    ];

    // Fallback chain: Mistral → xAI → Groq → Gemini → OpenAI → offline
    const mistralResult = await this.tryOpenAICompatible(
      this.mistralUrl,
      process.env.MISTRAL_API_KEY,
      process.env.MISTRAL_MODEL || 'mistral-small-latest',
      messages,
      0.7,
      'Mistral',
    );
    if (mistralResult) return mistralResult;

    const xAiResult = await this.tryOpenAICompatible(
      this.xAiUrl,
      process.env.XAI_API_KEY,
      process.env.XAI_MODEL || 'grok-2-1212',
      messages,
      0.7,
      'xAI',
    );
    if (xAiResult) return xAiResult;

    const groqResult = await this.tryOpenAICompatible(
      this.groqUrl,
      process.env.GROQ_API_KEY,
      process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages,
      0.7,
      'Groq',
    );
    if (groqResult) return groqResult;

    const geminiResult = await this.tryGemini(
      userMessage,
      history,
      systemPrompt,
    );
    if (geminiResult) return geminiResult;

    const openAiResult = await this.tryOpenAICompatible(
      this.openAiUrl,
      process.env.OPENAI_API_KEY,
      process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      0.7,
      'OpenAI',
    );
    if (openAiResult) return openAiResult;

    this.logger.warn('[AI-CHAT] All providers failed, using offline fallback');
    return this.offlineChatResponse(userMessage, assessmentLanguage);
  }

  // ─── generateQuestion: create a fresh random coding question via Mistral ────
  // Returns a full question object with test cases, hints, and solution.
  // Called by QuestionsService when DB has no questions for the requested lang/difficulty.
  async generateQuestion(
    language: string,
    difficulty: string,
  ): Promise<{
    problemStatement: string;
    constraints: string;
    sampleInput: string;
    sampleOutput: string;
    testCases: { input: string; expectedOutput: string }[];
    hints: string[];
    solution: string;
    timeLimitMinutes: number;
  } | null> {
    this.logger.log(`[AI-QUESTION] Generating ${difficulty} ${language} question`);

    const difficultyGuide: Record<string, string> = {
      easy: 'simple logic, basic loops/conditions, string manipulation, math (e.g. sum, factorial, count vowels, reverse string, check palindrome)',
      medium: 'algorithms and data structures (e.g. sorting, binary search, stacks, queues, two-pointer, prefix sum, HashMap)',
      hard: 'advanced algorithms (e.g. dynamic programming, graph traversal, recursion with memoization, sliding window, Kadane\'s)',
    };

    const langIOGuide: Record<string, string> = {
      python: 'Python 3: read input with input(), split(), map(int, ...). Print with print().',
      javascript: 'Node.js: use readline to read ALL lines into an array, process in rl.on("close", ...). For multi-line input collect all lines first.',
      java: 'Java: use Scanner(System.in). public class Main with main method.',
      cpp: 'C++: use #include<iostream>, cin/cout, using namespace std.',
      c: 'C: use #include<stdio.h>, scanf/printf.',
    };

    // Use a random seed topic to ensure variety across requests
    const topics: Record<string, string[]> = {
      easy: ['sum of numbers', 'count characters', 'reverse a string', 'check palindrome', 'factorial', 'fibonacci', 'find maximum', 'check prime', 'count vowels', 'sum of digits', 'power of two', 'GCD of two numbers', 'even or odd check', 'celsius to fahrenheit', 'multiplication table'],
      medium: ['find all prime factors', 'sort array', 'binary search', 'stack operations', 'balanced brackets', 'two sum problem', 'maximum subarray', 'rotate array', 'anagram check', 'matrix transpose', 'merge sorted arrays', 'find duplicates', 'sliding window maximum', 'prefix sum queries', 'group anagrams'],
      hard: ['longest increasing subsequence', 'minimum edit distance', 'coin change', 'knapsack problem', 'longest common subsequence', 'number of ways to climb stairs', 'word break', 'unique paths in grid', 'merge intervals', 'meeting rooms', 'serialize and deserialize binary tree', 'find median from data stream', 'trapping rain water', 'minimum window substring', 'decode ways'],
    };

    const topicList = topics[difficulty] || topics['easy'];
    const randomTopic = topicList[Math.floor(Math.random() * topicList.length)];

    const prompt = `You are a competitive programming problem setter. Generate a UNIQUE and ORIGINAL ${difficulty.toUpperCase()} level coding problem about: "${randomTopic}"

Language: ${language}
I/O: ${langIOGuide[language] || 'Standard stdin/stdout'}
Difficulty guide: ${difficultyGuide[difficulty]}

STRICT REQUIREMENTS:
1. Create a self-contained problem — no external libraries, no GUI
2. Input MUST come from stdin, output MUST go to stdout
3. Generate exactly 5 test cases — the first 2 are visible to student, last 3 are hidden
4. Each test case must have a clear, correct expected output
5. The solution MUST be correct and handle all edge cases

Return a JSON object with EXACTLY this structure:
{
  "problemStatement": "Clear problem description with input/output format explained",
  "constraints": "Constraints like 1 <= N <= 10^5",
  "sampleInput": "exact stdin for first test case",
  "sampleOutput": "exact expected stdout for first test case",
  "testCases": [
    {"input": "...", "expectedOutput": "..."},
    {"input": "...", "expectedOutput": "..."},
    {"input": "...", "expectedOutput": "..."},
    {"input": "...", "expectedOutput": "..."},
    {"input": "...", "expectedOutput": "..."}
  ],
  "hints": ["hint 1", "hint 2", "hint 3"],
  "solution": "Complete working ${language} solution code that reads from stdin and writes to stdout",
  "timeLimitMinutes": ${difficulty === 'easy' ? 15 : difficulty === 'medium' ? 30 : 45}
}

IMPORTANT: Return ONLY the JSON object, no markdown, no explanation.`;

    const messages = [{ role: 'user' as const, content: prompt }];

    // Try Mistral first (best for structured JSON)
    const raw = await this.tryOpenAICompatible(
      this.mistralUrl, process.env.MISTRAL_API_KEY,
      process.env.MISTRAL_MODEL || 'mistral-small-latest',
      messages, 0.8, 'Mistral',
    ) || await this.tryOpenAICompatible(
      this.groqUrl, process.env.GROQ_API_KEY,
      process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages, 0.8, 'Groq',
    ) || await this.tryOpenAICompatible(
      this.openAiUrl, process.env.OPENAI_API_KEY,
      process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages, 0.8, 'OpenAI',
    );

    if (!raw) {
      this.logger.error('[AI-QUESTION] All providers failed');
      return null;
    }

    try {
      // Extract JSON — handle cases where model wraps it in markdown
      let jsonStr = raw.trim();
      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) jsonStr = fenceMatch[1].trim();
      // Find first { to last } in case of extra text
      const start = jsonStr.indexOf('{');
      const end = jsonStr.lastIndexOf('}');
      if (start !== -1 && end > start) jsonStr = jsonStr.slice(start, end + 1);

      const q = JSON.parse(jsonStr);

      // Validate required fields
      if (!q.problemStatement || !q.sampleInput || !q.sampleOutput || !Array.isArray(q.testCases) || q.testCases.length === 0) {
        this.logger.error('[AI-QUESTION] Invalid JSON structure from AI');
        return null;
      }

      this.logger.log(`[AI-QUESTION] ✓ Generated: "${q.problemStatement.substring(0, 60)}..."`);
      return {
        problemStatement: q.problemStatement,
        constraints: q.constraints || 'Standard constraints apply',
        sampleInput: q.sampleInput,
        sampleOutput: q.sampleOutput,
        testCases: q.testCases.slice(0, 5).map((tc: any) => ({
          input: String(tc.input || ''),
          expectedOutput: String(tc.expectedOutput || ''),
        })),
        hints: Array.isArray(q.hints) ? q.hints.slice(0, 3) : ['Think about the problem carefully.', 'Try with the sample input first.', 'Consider edge cases.'],
        solution: q.solution || '',
        timeLimitMinutes: q.timeLimitMinutes || (difficulty === 'easy' ? 15 : difficulty === 'medium' ? 30 : 45),
      };
    } catch (parseErr: any) {
      this.logger.error(`[AI-QUESTION] JSON parse failed: ${parseErr.message}`);
      return null;
    }
  }

  // ─── fixCode: fix assessment code to pass test cases ────────────────────────
  //    errorDetail is optional — when set, it's appended to the prompt as
  //    feedback from the previous attempt's execution output.
  async fixCode(
    code: string,
    language: string,
    problemStatement: string,
    sampleInput: string,
    sampleOutput: string,
    errorDetail?: string,
    testCases?: { input: string; expectedOutput: string }[],
  ): Promise<string> {
    this.logger.log(`[AI-FIX] Fixing ${language} code`);

    try {
      const ioGuide: Record<string, string> = {
        javascript: `IMPORTANT for JavaScript/Node.js:
  - For SINGLE-LINE input: use rl.on('line', (line) => { ... rl.close(); })
  - For MULTI-LINE input (2+ lines): collect all lines first, then process in rl.on('close', () => { ... })
    Example:
      const lines = [];
      rl.on('line', l => lines.push(l.trim()));
      rl.on('close', () => {
        const [n, t] = lines[0].split(' ').map(Number);
        const arr = lines[1].split(' ').map(Number);
        console.log(result);
      });`,
        python: `IMPORTANT for Python: use input() for each line. For multiple values on one line use split().`,
        java: `IMPORTANT for Java: use Scanner. For multiple lines call sc.nextLine() or sc.nextInt() as needed.`,
        cpp: `IMPORTANT for C++: use cin >> for values, getline(cin, s) for full lines.`,
        c: `IMPORTANT for C: use scanf() for values, fgets() for lines.`,
      };

      const escapedLang = language;
      const promptParts = [
        `You are an expert ${escapedLang} programmer solving a coding assessment. Think through the problem carefully, then write a complete working solution.`,
        '',
        '## Problem',
        problemStatement,
        '',
        '## Sample Input',
        '```',
        sampleInput,
        '```',
        '',
        '## Sample Output',
        '```',
        sampleOutput,
        '```',
        '',
      ];

      if (testCases && testCases.length > 0) {
        promptParts.push('## Additional Test Cases for verification');
        testCases.forEach((tc, idx) => {
          if (tc.input.trim() === sampleInput.trim()) return;
          promptParts.push(`### Test Case ${idx + 1}`);
          promptParts.push('Input:');
          promptParts.push('```');
          promptParts.push(tc.input);
          promptParts.push('```');
          promptParts.push('Expected Output:');
          promptParts.push('```');
          promptParts.push(tc.expectedOutput);
          promptParts.push('```');
          promptParts.push('');
        });
      }

      promptParts.push(
        '## Previous (broken) code for I/O reference',
        '```' + escapedLang,
        code,
        '```',
        '',
        ioGuide[escapedLang] || '',
      );
      if (errorDetail) {
        promptParts.push('', errorDetail, '');
      }
      promptParts.push(
        '',
        '## Requirements',
        '',
        '1. **Read from stdin, write to stdout** — all input values come from stdin, none from the problem description.',
        '2. **Every variable must be defined** — if the problem says "target T", you must parse T from input, not use it as an undefined variable.',
        '3. **Output must match sample output exactly** — same value, same formatting.',
        '4. **Handle all input lines** — if the sample has multiple lines, read every one.',
        '5. **Complete working code** — no TODOs, no placeholders, no infinite loops.',
        '',
        'First, reason about the problem step by step. Then write your solution in a markdown code block:',
        '',
        '```' + escapedLang,
        '<your code>',
        '```',
      );
      const prompt = promptParts.join('\n');

      const messages = [{ role: 'user' as const, content: prompt }];
      // Some providers (Mistral) accept content as either string or array.
      // Using the array format is more widely compatible across provider API versions:
      const messagesArray = [
        {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: prompt }],
        },
      ];

      // Try Mistral with array content format (more compatible with newer API versions)
      const mistralFix = await this.tryOpenAICompatible(
        this.mistralUrl,
        process.env.MISTRAL_API_KEY,
        process.env.MISTRAL_MODEL || 'mistral-small-latest',
        messagesArray,
        0.2,
        'Mistral',
      );
      if (mistralFix) return this.extractCode(mistralFix, 'Mistral');

      const xAiResult = await this.tryOpenAICompatible(
        this.xAiUrl,
        process.env.XAI_API_KEY,
        process.env.XAI_MODEL || 'grok-2-1212',
        messages,
        0.2,
        'xAI',
      );
      if (xAiResult) return this.extractCode(xAiResult, 'xAI');

      const groqResult = await this.tryOpenAICompatible(
        this.groqUrl,
        process.env.GROQ_API_KEY,
        process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages,
        0.2,
        'Groq',
      );
      if (groqResult) return this.extractCode(groqResult, 'Groq');

      const geminiResult = await this.tryGeminiRaw(prompt);
      if (geminiResult) return this.extractCode(geminiResult, 'Gemini');

      const openAiResult = await this.tryOpenAICompatible(
        this.openAiUrl,
        process.env.OPENAI_API_KEY,
        process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages,
        0.2,
        'OpenAI',
      );
      if (openAiResult) return this.extractCode(openAiResult, 'OpenAI');
    } catch (err: any) {
      this.logger.error(
        `[AI-FIX] Unexpected error in provider chain: ${err.message || err}`,
      );
    }

    return this.offlineFixCode(problemStatement, language);
  }

  // ─── generateCode: generate code from a prompt ──────────────────────────────
  async generateCode(prompt: string, language: string): Promise<string> {
    this.logger.log(`[AI-GEN] "${prompt.substring(0, 60)}" lang=${language}`);

    const p = `You are an expert ${language} programmer. Write a complete working ${language} program for:

${prompt}

Return ONLY the code — no markdown fences, no explanations. Must read stdin and write stdout.`;

    const messages = [{ role: 'user' as const, content: p }];

    const mistralGen = await this.tryOpenAICompatible(
      this.mistralUrl,
      process.env.MISTRAL_API_KEY,
      process.env.MISTRAL_MODEL || 'mistral-small-latest',
      messages,
      0.3,
      'Mistral',
    );
    if (mistralGen) return this.extractCode(mistralGen, 'Mistral');

    const xAiResultGen = await this.tryOpenAICompatible(
      this.xAiUrl,
      process.env.XAI_API_KEY,
      process.env.XAI_MODEL || 'grok-2-1212',
      messages,
      0.3,
      'xAI',
    );
    if (xAiResultGen) return this.extractCode(xAiResultGen, 'xAI');

    const groqResultGen = await this.tryOpenAICompatible(
      this.groqUrl,
      process.env.GROQ_API_KEY,
      process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages,
      0.3,
      'Groq',
    );
    if (groqResultGen) return this.extractCode(groqResultGen, 'Groq');

    const geminiResultGen = await this.tryGeminiRaw(p);
    if (geminiResultGen) return this.extractCode(geminiResultGen, 'Gemini');

    const openAiResultGen = await this.tryOpenAICompatible(
      this.openAiUrl,
      process.env.OPENAI_API_KEY,
      process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      0.3,
      'OpenAI',
    );
    if (openAiResultGen) return this.extractCode(openAiResultGen, 'OpenAI');

    return this.offlineGenerateCode(prompt, language);
  }

  // ─── Provider: unified OpenAI-compatible call (xAI, Groq, OpenAI all use same format) ──
  private async tryOpenAICompatible(
    url: string,
    apiKey: string | undefined,
    model: string,
    messages: { role: string; content: any }[],
    temperature: number,
    providerName: string,
  ): Promise<string | null> {
    // Skip if key is missing, empty, or still a placeholder
    if (
      !apiKey ||
      apiKey.trim() === '' ||
      apiKey.startsWith('PASTE_') ||
      apiKey === 'your_key_here'
    ) {
      this.logger.debug(`[${providerName}] API key not configured — skipping`);
      return null;
    }

    // Skip if this provider was recently exhausted (quota limit)
    const exhaustedUntil = (this as any)[`_${providerName}_exhaustedUntil`];
    if (exhaustedUntil && Date.now() < exhaustedUntil) {
      this.logger.debug(
        `[${providerName}] Quota exhausted — skipping until ${new Date(exhaustedUntil).toISOString()}`,
      );
      return null;
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await axios.post(
          url,
          { model, messages, temperature, max_tokens: 4096, stream: false },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 45000,
          },
        );
        const content = res.data?.choices?.[0]?.message?.content;
        if (content) {
          this.logger.log(
            `[${providerName}] ✓ Response (${content.length} chars): ${content.substring(0, 120)}`,
          );
          return content;
        }
      } catch (err: any) {
        const status = err.response?.status;
        const errMsg = err.response?.data?.error?.message || err.message;

        if (status === 429 && attempt < 2) {
          // After 2 429s in a row, assume quota exhausted — mark for 10 min
          if (attempt === 1) {
            (this as any)[`_${providerName}_exhaustedUntil`] =
              Date.now() + 10 * 60 * 1000;
            this.logger.warn(
              `[${providerName}] Repeated 429 — marking exhausted for 10 min`,
            );
            return null;
          }
          const retryAfter = parseInt(
            err.response?.headers?.['retry-after'] || '2',
            10,
          );
          const wait = Math.min(retryAfter * 1000, 4000);
          this.logger.warn(`[${providerName}] 429 rate limit — wait ${wait}ms`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (status === 429) {
          return null;
        }
        if (status === 401) {
          this.logger.error(`[${providerName}] 401 Invalid API key`);
          return null;
        }
        if (
          status === 402 ||
          (errMsg &&
            (errMsg.includes('quota') ||
              errMsg.includes('billing') ||
              errMsg.includes('exceeded')))
        ) {
          this.logger.warn(
            `[${providerName}] Quota/billing limit — skipping permanently`,
          );
          // Mark as exhausted so we don't retry this provider for 5 minutes
          (this as any)[`_${providerName}_exhaustedUntil`] =
            Date.now() + 5 * 60 * 1000;
          return null;
        }
        this.logger.error(`[${providerName}] Error (${status}): ${errMsg}`);
        return null;
      }
    }
    this.logger.warn(`[${providerName}] All attempts exhausted`);
    return null;
  }

  // ─── Provider: Google Gemini (secondary — free tier, 15 RPM) ────────────────
  private async tryGemini(
    userMessage: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    systemPrompt: string,
  ): Promise<string | null> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      this.logger.warn('[Gemini] GEMINI_API_KEY not set — skipping');
      return null;
    }

    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

    // Gemini uses a different message format
    const geminiContents = [
      // include history
      ...history.slice(-6).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    try {
      const res = await axios.post(
        `${this.geminiUrl(model)}?key=${key}`,
        {
          contents: geminiContents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
        },
        { timeout: 30000 },
      );
      const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        this.logger.log(`[Gemini] ✓ Response received (${text.length} chars)`);
        return text;
      }
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 429) this.logger.warn('[Gemini] 429 rate limited');
      else
        this.logger.error(
          `[Gemini] Error: ${err.response?.data?.error?.message || err.message}`,
        );
    }
    return null;
  }

  // Simplified Gemini call for code generation (no history needed)
  private async tryGeminiRaw(prompt: string): Promise<string | null> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;

    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    try {
      const res = await axios.post(
        `${this.geminiUrl(model)}?key=${key}`,
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
        },
        { timeout: 30000 },
      );
      const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
      if (text)
        this.logger.log(
          `[Gemini-raw] ✓ Response (${text.length} chars): ${text.substring(0, 120)}`,
        );
      return text;
    } catch (err: any) {
      this.logger.error(
        `[Gemini-raw] ${err.response?.data?.error?.message || err.message}`,
      );
      return null;
    }
  }

  // ─── Utility: extract raw code from markdown-fenced response ────────────────
  private extractCode(response: string, providerName = 'AI'): string {
    const text = response.trim();
    this.logger.debug(
      `[${providerName}] extractCode input (first 300): ${text.substring(0, 300)}`,
    );

    // Match fenced code blocks with any language tag (including non-word chars like c++, c#)
    // Handles both ```lang\ncode``` and ```code``` formats
    const langTagRe = /```(\w+(?:\+\+|#)?)\n?([\s\S]*?)```/;
    const m = text.match(langTagRe);
    if (m) {
      const code = m[2].trim();
      this.logger.debug(
        `[${providerName}] Extracted code from fenced block (lang=${m[1]}): ${code.substring(0, 100)}`,
      );
      return code;
    }

    // Try without language tag
    const noLangRe = /```\n?([\s\S]*?)```/;
    const m2 = text.match(noLangRe);
    if (m2) {
      const code = m2[1].trim();
      this.logger.debug(
        `[${providerName}] Extracted code from bare fence: ${code.substring(0, 100)}`,
      );
      return code;
    }

    // No fences found — assume raw code
    this.logger.debug(`[${providerName}] No fences found, returning raw text`);
    return text;
  }

  // ─── Offline smart fallback (works with zero API) ───────────────────────────
  private offlineChatResponse(message: string, assessmentLang: string): string {
    const msg = message.toLowerCase();

    // Detect which language the user is asking ABOUT
    const langMap: Record<string, string> = {
      java: 'java',
      python: 'python',
      javascript: 'javascript',
      js: 'javascript',
      'c++': 'cpp',
      cpp: 'cpp',
      c: 'c',
      ruby: 'ruby',
      go: 'go',
      rust: 'rust',
      kotlin: 'kotlin',
      typescript: 'typescript',
      ts: 'typescript',
      php: 'php',
      swift: 'swift',
      scala: 'scala',
      r: 'r',
    };
    let lang = assessmentLang;
    for (const [kw, l] of Object.entries(langMap)) {
      if (msg.includes(kw + ' ') || msg.endsWith(kw)) {
        lang = l;
        break;
      }
    }

    // Circle / graphics
    if (msg.includes('circle') || msg.includes('draw')) {
      if (lang === 'java') {
        return `Here's how to draw a circle in Java using **Swing**:\n\n\`\`\`java\nimport javax.swing.*;\nimport java.awt.*;\n\npublic class DrawCircle extends JPanel {\n    @Override\n    protected void paintComponent(Graphics g) {\n        super.paintComponent(g);\n        g.setColor(Color.BLUE);\n        g.drawOval(50, 50, 200, 200); // circle (equal width/height)\n        g.setColor(Color.RED);\n        g.fillOval(300, 50, 100, 100); // filled circle\n    }\n    public static void main(String[] args) {\n        JFrame f = new JFrame(\"Circle\");\n        f.setSize(500, 350);\n        f.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);\n        f.add(new DrawCircle());\n        f.setVisible(true);\n    }\n}\n\`\`\`\n\n**Key:** \`drawOval(x, y, width, height)\` draws a circle when width == height.`;
      }
      if (lang === 'python') {
        return `Draw a circle in Python using **turtle** (simplest):\n\n\`\`\`python\nimport turtle\nt = turtle.Turtle()\nt.circle(100)  # radius = 100\nturtle.done()\n\`\`\`\n\nOr with **matplotlib**:\n\n\`\`\`python\nimport matplotlib.pyplot as plt\ncircle = plt.Circle((0, 0), 1, fill=False)\nfig, ax = plt.subplots()\nax.add_patch(circle)\nax.set_aspect('equal'); ax.set_xlim(-2,2); ax.set_ylim(-2,2)\nplt.show()\n\`\`\``;
      }
      return `To draw circles:\n- **Java**: \`g.drawOval(x, y, w, h)\` in a JPanel\n- **Python**: \`turtle.circle(r)\` or matplotlib\n- **C++**: SFML library: \`sf::CircleShape circle(50)\`\n\nWhich language would you like a full example in?`;
    }

    // Fibonacci
    if (msg.includes('fibonacci') || msg.includes('fib')) {
      const code = this.offlineGenerateCode('fibonacci', lang);
      return `Here's **Fibonacci** in ${lang}:\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n**Time complexity:** O(n) iterative.\n**Recursive** is O(2^n) — avoid for large n.`;
    }

    // Factorial
    if (msg.includes('factorial')) {
      const code = this.offlineGenerateCode('factorial', lang);
      return `Here's **Factorial** in ${lang}:\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n**Time complexity:** O(n)`;
    }

    // Hello world
    if (msg.includes('hello')) {
      const code = this.offlineGenerateCode('hello world', lang);
      return `Hello World in **${lang}**:\n\n\`\`\`${lang}\n${code}\n\`\`\``;
    }

    // Sorting
    if (
      msg.includes('bubble sort') ||
      msg.includes('quicksort') ||
      msg.includes('sort')
    ) {
      if (lang === 'python')
        return `**Bubble Sort** in Python:\n\n\`\`\`python\ndef bubble_sort(arr):\n    n = len(arr)\n    for i in range(n):\n        for j in range(n-i-1):\n            if arr[j] > arr[j+1]:\n                arr[j], arr[j+1] = arr[j+1], arr[j]\n    return arr\nprint(bubble_sort([64,34,25,12,22]))\n\`\`\`\n\nO(n²) — for production, use Python's built-in \`sorted()\` which runs O(n log n).`;
      if (lang === 'java')
        return `**Bubble Sort** in Java:\n\n\`\`\`java\npublic class Sort {\n    static void bubbleSort(int[] a) {\n        int n = a.length;\n        for (int i = 0; i < n-1; i++)\n            for (int j = 0; j < n-i-1; j++)\n                if (a[j] > a[j+1]) { int t=a[j]; a[j]=a[j+1]; a[j+1]=t; }\n    }\n    public static void main(String[] args) {\n        int[] a = {64,34,25,12,22};\n        bubbleSort(a);\n        for (int x : a) System.out.print(x+\" \");\n    }\n}\n\`\`\``;
    }

    // Recursion
    if (msg.includes('recursion') || msg.includes('recursive')) {
      return `## Recursion\n\nA function that **calls itself** with a simpler input until it hits a base case.\n\n\`\`\`python\ndef factorial(n):\n    if n == 0: return 1       # base case — stops recursion\n    return n * factorial(n-1)  # recursive case\n\nprint(factorial(5))  # 120\n\`\`\`\n\n**Call stack:**\nfactorial(3) → 3 × factorial(2) → 3 × 2 × factorial(1) → 3 × 2 × 1 × factorial(0) → 6\n\n**Warning:** Deep recursion causes stack overflow. Use iteration for large inputs.`;
    }

    // Binary search
    if (msg.includes('binary search')) {
      return `## Binary Search — O(log n)\n\nWorks on **sorted arrays** by halving the search space each step.\n\n\`\`\`python\ndef binary_search(arr, target):\n    lo, hi = 0, len(arr) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if arr[mid] == target: return mid\n        elif arr[mid] < target: lo = mid + 1\n        else: hi = mid - 1\n    return -1\n\nprint(binary_search([1,3,5,7,9], 7))  # 3\n\`\`\``;
    }

    // Time complexity
    if (
      msg.includes('time complexity') ||
      msg.includes('big o') ||
      msg.includes('o(n')
    ) {
      return `## Big-O Complexities\n\n| Notation | Name | Example |\n|---|---|---|\n| O(1) | Constant | Array index, HashMap get |\n| O(log n) | Logarithmic | Binary search |\n| O(n) | Linear | Single loop |\n| O(n log n) | Linearithmic | Merge/Quick sort |\n| O(n²) | Quadratic | Nested loops |\n| O(2^n) | Exponential | Recursive Fibonacci |`;
    }

    // Linked list
    if (msg.includes('linked list')) {
      return `## Linked List\n\nA sequence of **nodes** where each node stores data + pointer to next.\n\n\`\`\`python\nclass Node:\n    def __init__(self, val):\n        self.val = val\n        self.next = None\n\nclass LinkedList:\n    def __init__(self): self.head = None\n\n    def append(self, val):\n        node = Node(val)\n        if not self.head: self.head = node; return\n        cur = self.head\n        while cur.next: cur = cur.next\n        cur.next = node\n\n    def print_all(self):\n        cur = self.head\n        while cur: print(cur.val, end=\" → \"); cur = cur.next\n\nll = LinkedList()\nll.append(1); ll.append(2); ll.append(3)\nll.print_all()  # 1 → 2 → 3\n\`\`\``;
    }

    // Stack / queue
    if (msg.includes('stack') || msg.includes('queue')) {
      return `## Stack vs Queue\n\n**Stack** — LIFO (Last In, First Out):\n\`\`\`python\nstack = []\nstack.append(1)  # push\nstack.append(2)\nprint(stack.pop())  # 2 — last in, first out\n\`\`\`\n\n**Queue** — FIFO (First In, First Out):\n\`\`\`python\nfrom collections import deque\nq = deque()\nq.append(1)  # enqueue\nq.append(2)\nprint(q.popleft())  # 1 — first in, first out\n\`\`\``;
    }

    // Generic fallback
    return `I understand you're asking: **"${message}"**\n\n⚠️ All AI providers are currently unavailable (rate limits). I can answer questions about:\n\n- **Code examples**: fibonacci, factorial, sorting, hello world, draw circle\n- **Data structures**: linked list, stack, queue, binary search tree\n- **Algorithms**: binary search, bubble sort, recursion\n- **Concepts**: time complexity, Big-O notation\n\nTry rephrasing your question using these keywords, or wait 1 minute for rate limits to reset!`;
  }

  private offlineGenerateCode(prompt: string, language: string): string {
    const p = prompt.toLowerCase();
    const t: Record<string, Record<string, string>> = {
      python: {
        sum: `a, b = map(int, input().split())\nprint(a + b)`,
        fibonacci: `n = int(input())\na, b = 0, 1\nfor _ in range(n):\n    print(a, end=' ')\n    a, b = b, a + b`,
        factorial: `n = int(input())\nresult = 1\nfor i in range(1, n+1): result *= i\nprint(result)`,
        'hello world': `print("Hello, World!")`,
        reverse: `s = input()\nprint(s[::-1])`,
        palindrome: `s = input().lower().replace(' ','')\nprint(s == s[::-1])`,
        even: `n = int(input())\ntotal = sum(range(2, n+1, 2))\nprint(total)`,
        vowel: `s = input().lower()\nprint(sum(1 for c in s if c in "aeiou"))`,
        prime: `n = int(input())\ndef is_prime(n):\n    if n < 2: return False\n    for i in range(2, int(n**0.5)+1):\n        if n % i == 0: return False\n    return True\nprint(is_prime(n))`,
        sort: `n = int(input())\narr = list(map(int, input().split()))\nprint(*sorted(arr))`,
        default: `data = input()\nprint(data)`,
      },
      javascript: {
        sum: `const rl=require('readline').createInterface({input:process.stdin});\nrl.on('line',line=>{const[a,b]=line.split(' ').map(Number);console.log(a+b);rl.close();});`,
        fibonacci: `const n = parseInt(require('fs').readFileSync('/dev/stdin','utf8').trim());\nlet a=0,b=1; for(let i=0;i<n;i++){process.stdout.write(a+' ');[a,b]=[b,a+b];}`,
        factorial: `const n = parseInt(require('fs').readFileSync('/dev/stdin','utf8').trim());\nlet f=1; for(let i=2;i<=n;i++) f*=i; console.log(f);`,
        'hello world': `console.log("Hello, World!");`,
        palindrome: `const rl=require('readline').createInterface({input:process.stdin});\nrl.on('line',l=>{const s=l.toLowerCase().replace(/ /g,'');console.log(s===s.split('').reverse().join(''));rl.close();});`,
        even: `const n = parseInt(require('fs').readFileSync('/dev/stdin','utf8').trim());\nlet total=0; for(let i=2;i<=n;i+=2) total+=i; console.log(total);`,
        vowel: `const rl=require('readline').createInterface({input:process.stdin});\nrl.on('line',l=>{console.log((l.toLowerCase().match(/[aeiou]/g)||[]).length);rl.close();});`,
        sort: `const rl=require('readline').createInterface({input:process.stdin});\nconst lines=[];\nrl.on('line',l=>lines.push(l));\nrl.on('close',()=>{const arr=lines[1].split(' ').map(Number);arr.sort((a,b)=>a-b);console.log(arr.join(' '));});`,
        default: `const rl=require('readline').createInterface({input:process.stdin});\nrl.on('line',l=>{console.log(l);rl.close();});`,
      },
      java: {
        sum: `import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int a = sc.nextInt(); int b = sc.nextInt();\n        System.out.println(a + b);\n        sc.close();\n    }\n}`,
        fibonacci: `import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        long a=0, b=1;\n        for(int i=0;i<n;i++){System.out.print(a+" ");long t=a;a=b;b=t+b;}\n    }\n}`,
        factorial: `import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt(); long f=1;\n        for(int i=2;i<=n;i++) f*=i;\n        System.out.println(f);\n    }\n}`,
        'hello world': `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}`,
        palindrome: `import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        String s = sc.nextLine().toLowerCase().replaceAll(" ","");\n        String r = new StringBuilder(s).reverse().toString();\n        System.out.println(s.equals(r));\n        sc.close();\n    }\n}`,
        even: `import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt(); long total = 0;\n        for(int i=2;i<=n;i+=2) total+=i;\n        System.out.println(total);\n        sc.close();\n    }\n}`,
        vowel: `import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        String s = sc.nextLine().toLowerCase();\n        int count = 0;\n        for(char c : s.toCharArray()) if("aeiou".indexOf(c)>=0) count++;\n        System.out.println(count);\n        sc.close();\n    }\n}`,
        sort: `import java.util.*;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        int[] arr = new int[n];\n        for(int i=0;i<n;i++) arr[i]=sc.nextInt();\n        Arrays.sort(arr);\n        StringBuilder sb=new StringBuilder();\n        for(int i=0;i<n;i++){if(i>0)sb.append(" ");sb.append(arr[i]);}\n        System.out.println(sb);\n        sc.close();\n    }\n}`,
        default: `import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println(new Scanner(System.in).nextLine());\n    }\n}`,
      },
      cpp: {
        sum: `#include<iostream>\nusing namespace std;\nint main(){int a,b;cin>>a>>b;cout<<a+b<<endl;}`,
        fibonacci: `#include<iostream>\nusing namespace std;\nint main(){int n;cin>>n;long long a=0,b=1;\nfor(int i=0;i<n;i++){cout<<a<<" ";long long t=a;a=b;b=t+b;}}`,
        factorial: `#include<iostream>\nusing namespace std;\nint main(){int n;cin>>n;long long f=1;\nfor(int i=2;i<=n;i++)f*=i;cout<<f<<endl;}`,
        'hello world': `#include<iostream>\nusing namespace std;\nint main(){cout<<"Hello, World!"<<endl;}`,
        palindrome: `#include<iostream>\n#include<string>\n#include<algorithm>\nusing namespace std;\nint main(){string s,r;cin>>s;r=s;reverse(r.begin(),r.end());cout<<(s==r?"true":"false")<<endl;}`,
        even: `#include<iostream>\nusing namespace std;\nint main(){int n;cin>>n;long long t=0;for(int i=2;i<=n;i+=2)t+=i;cout<<t<<endl;}`,
        vowel: `#include<iostream>\n#include<string>\nusing namespace std;\nint main(){string s;getline(cin,s);int c=0;for(char ch:s){ch=tolower(ch);if(ch=='a'||ch=='e'||ch=='i'||ch=='o'||ch=='u')c++;}cout<<c<<endl;}`,
        sort: `#include<iostream>\n#include<algorithm>\n#include<vector>\nusing namespace std;\nint main(){int n;cin>>n;vector<int>v(n);for(int i=0;i<n;i++)cin>>v[i];sort(v.begin(),v.end());for(int i=0;i<n;i++){if(i)cout<<" ";cout<<v[i];}}`,
        default: `#include<iostream>\n#include<string>\nusing namespace std;\nint main(){string s;getline(cin,s);cout<<s<<endl;}`,
      },
      c: {
        sum: `#include<stdio.h>\nint main(){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);}`,
        fibonacci: `#include<stdio.h>\nint main(){int n;scanf("%d",&n);long long a=0,b=1;\nfor(int i=0;i<n;i++){printf("%lld ",a);long long t=a;a=b;b=t+b;}}`,
        'hello world': `#include<stdio.h>\nint main(){printf("Hello, World!\\n");}`,
        palindrome: `#include<stdio.h>\n#include<string.h>\nint main(){char s[1001];scanf("%s",s);int n=strlen(s),ok=1;for(int i=0;i<n/2;i++)if(s[i]!=s[n-1-i]){ok=0;break;}printf(ok?"YES":"NO");}`,
        even: `#include<stdio.h>\nint main(){int n;scanf("%d",&n);long long t=0;for(int i=2;i<=n;i+=2)t+=i;printf("%lld\\n",t);}`,
        vowel: `#include<stdio.h>\n#include<string.h>\n#include<ctype.h>\nint main(){char s[1001];fgets(s,sizeof(s),stdin);int c=0;for(int i=0;s[i];i++){char ch=tolower(s[i]);if(ch=='a'||ch=='e'||ch=='i'||ch=='o'||ch=='u')c++;}printf("%d\\n",c);}`,
        sort: `#include<stdio.h>\n#include<stdlib.h>\nint cmp(const void*a,const void*b){return *(int*)a-*(int*)b;}\nint main(){int n;scanf("%d",&n);int arr[n];for(int i=0;i<n;i++)scanf("%d",&arr[i]);qsort(arr,n,sizeof(int),cmp);for(int i=0;i<n;i++){if(i)printf(" ");printf("%d",arr[i]);}}`,
        default: `#include<stdio.h>\nint main(){char s[1024];fgets(s,sizeof(s),stdin);printf("%s",s);}`,
      },
    };
    const lt = t[language] || t['python'];
    // Check each keyword; also handle compound patterns
    for (const [k, v] of Object.entries(lt)) {
      if (k !== 'default' && p.includes(k)) return v;
    }
    // For two-number operations (sum, difference, etc.), check for "two integers"
    if (
      p.includes('two integer') ||
      p.includes('2 integer') ||
      (p.includes('sum') && p.includes('integer'))
    ) {
      return lt['sum'] || lt['default'];
    }
    return lt['default'];
  }

  private offlineFixCode(problemStatement: string, language: string): string {
    this.logger.warn(
      `[OFFLINE-FIX] All AI providers failed. Using offline fallback for: "${problemStatement.substring(0, 80)}"`,
    );
    const result = this.offlineGenerateCode(problemStatement, language);
    this.logger.debug(`[OFFLINE-FIX] Generated ${result.length} chars of code`);
    return result;
  }
}
