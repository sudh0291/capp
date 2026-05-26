import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as http from 'http';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Question } from './question.entity';
import { ChromaClient } from 'chromadb';
import { REDIS_CLIENT } from '../common/redis/redis.module';

const DIFFICULTY_RULES: Record<string, string> = {
  easy: `Single concept only (loops, basic conditions, simple string/array operations). No complex data structures. Expected O(n) or O(1). Suitable for first/second year students.`,
  medium: `Two concepts combined (arrays+hashing, strings+sorting). May use lists, maps, stacks. O(n log n) acceptable. At least one edge case.`,
  hard: `Algorithmic thinking required (DP, graph traversal, backtracking, binary search). Complex data structures. Optimal time complexity expected. Multiple tricky edge cases.`,
};

const LANGUAGE_NOTES: Record<string, string> = {
  python: 'Python 3. No external libraries. Use input() for stdin, print() for stdout.',
  java: 'Java 11+. Class named Solution with public static void main(String[] args). Use Scanner for input.',
  cpp: 'C++17. Include necessary headers. Use cin/cout.',
  c: 'C99. Include stdio.h, stdlib.h. Use scanf/printf.',
  javascript: 'Node.js ES2020. Use process.stdin for input, console.log for output.',
  html: 'Valid HTML5. CSS may be inline. Task should involve creating a specific UI structure.',
  css: 'Write CSS rules targeting provided HTML structure.',
  r: 'Base R only. Use readline() for input, cat()/print() for output.',
};

/**
 * Call Ollama /api/chat with streaming using Node's native http module.
 * Uses role-based messages (system + user) which match the fine-tuning format.
 */
function ollamaChat(
  baseUrl: string,
  model: string,
  system: string,
  prompt: string,
  options: Record<string, any>,
  timeoutMs = 15 * 60 * 1000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ];
    const body = JSON.stringify({ model, messages, stream: true, options });
    const url = new URL(`${baseUrl}/api/chat`);

    const req = http.request(
      {
        hostname: url.hostname,
        port: Number(url.port) || 11434,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let accumulated = '';
        let done = false;

        res.setEncoding('utf8');

        res.on('data', (chunk: string) => {
          const lines = chunk.split('\n').filter((l) => l.trim());
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.error) {
                if (!done) { done = true; clearTimeout(timer); reject(new Error(`Ollama API Error: ${parsed.error}`)); }
                return;
              }
              if (parsed.message?.content) accumulated += parsed.message.content;
              if (parsed.done && !done) { done = true; clearTimeout(timer); resolve(accumulated); }
            } catch { /* partial line */ }
          }
        });

        res.on('end', () => {
          if (!done) {
            done = true; clearTimeout(timer);
            if (res.statusCode && res.statusCode !== 200) {
              reject(new Error(`Ollama HTTP Error ${res.statusCode}: ${accumulated || 'Unknown error'}`));
            } else { resolve(accumulated); }
          }
        });

        res.on('error', (err) => {
          if (!done) { done = true; clearTimeout(timer); reject(err); }
        });
      },
    );

    const timer = setTimeout(() => {
      req.destroy(new Error(`Ollama did not respond within ${Math.round(timeoutMs / 60000)} minutes`));
    }, timeoutMs);

    req.on('error', (err) => { clearTimeout(timer); reject(err); });
    req.write(body);
    req.end();
  });
}

/**
 * Extract a section from plain-text competitive-programming output.
 * Looks for startMarkers and cuts at the next known section header.
 */
function extractSection(text: string, ...startMarkers: string[]): string {
  const endMarkers = [
    'SAMPLE INPUT', 'SAMPLE OUTPUT', 'INPUT FORMAT', 'OUTPUT FORMAT',
    'CONSTRAINTS', 'Constraints', 'EXAMPLES', 'TEST CASES', 'HINTS',
    'Note that', 'NOTE:', '---', '===',
  ];
  let best = '';
  for (const start of startMarkers) {
    const idx = text.search(new RegExp(start, 'i'));
    if (idx === -1) continue;
    const after = text.indexOf('\n', idx);
    if (after === -1) continue;
    let snippet = text.substring(after).trimStart();
    for (const end of endMarkers) {
      const endIdx = snippet.search(new RegExp('^' + end, 'im'));
      if (endIdx > 0) snippet = snippet.substring(0, endIdx);
    }
    if (snippet.trim().length > best.length) best = snippet.trim();
  }
  return best;
}

/**
 * Strip trailing artifact labels that appear in raw JSONL training data.
 * e.g. "3\nSdfgAe\nOut\nGet\n\nSAMPLE" → "3\nSdfgAe\nOut\nGet"
 */
function cleanSampleText(raw: string | undefined): string {
  if (!raw) return '';
  const LABEL_RE = /^\s*(sample\s*(input|output)?|expected\s*(output|input)?|input|output|stdin|stdout|example)\s*$/i;
  let lines = raw.split('\n');
  
  // Remove trailing empty lines or label lines
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (last === '' || LABEL_RE.test(last)) {
      lines.pop();
    } else {
      break;
    }
  }
  
  // Remove leading empty lines or label lines
  while (lines.length > 0) {
    const first = lines[0].trim();
    if (first === '' || LABEL_RE.test(first)) {
      lines.shift();
    } else {
      break;
    }
  }
  
  return lines.join('\n').trim();
}

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  constructor(
    @InjectRepository(Question) private questionsRepo: Repository<Question>,
    @Inject(REDIS_CLIENT) private redis: Redis,
  ) {}

  /**
   * Fetch a question by ID with a 1-hour Redis cache.
   * During an exam 2000 students all load the same question — without caching
   * that's 2000 identical Postgres queries. With caching it's one.
   */
  async getQuestion(id: string): Promise<Question | null> {
    const cacheKey = `question:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Question;

    const question = await this.questionsRepo.findOne({ where: { id } });
    if (question) {
      await this.redis.setex(cacheKey, 3600, JSON.stringify(question)); // 1-hour TTL
    }
    return question ?? null;
  }


  async generateQuestion(language: string, difficulty: string): Promise<Question> {
    const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    const primaryModel = process.env.OLLAMA_MODEL || 'codego-generator';
    const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';

    // ── RAG APPROACH: Check ChromaDB for a verified question first ────────────
    try {
      // Use 127.0.0.1 to avoid IPv6 localhost resolution failures in Node 18+
      const safeChromaUrl = chromaUrl.replace('localhost', '127.0.0.1');
      const chroma = new ChromaClient({ path: safeChromaUrl });
      const collection = await chroma.getCollection({ name: 'coding_questions', embeddingFunction: null as any });

      const results = await collection.get({
        where: { '$and': [{ language: { '$eq': language } }, { difficulty: { '$eq': difficulty } }] },
        limit: 50,
      });

      if (results && results.documents && results.documents.length > 0) {
        const validDocs = results.documents.filter(d => d !== null) as string[];
        const randomIndex = Math.floor(Math.random() * validDocs.length);
        const rawDoc = validDocs[randomIndex];

        let qData: any = null;
        try {
          const parsed = JSON.parse(rawDoc);
          if (parsed && parsed.testCases && Array.isArray(parsed.testCases)) qData = parsed;
        } catch { /* plain-text doc, skip */ }

        if (qData) {
          this.logger.log(`[RAG] ✓ Served ${language}/${difficulty} question from ChromaDB bank (${validDocs.length} available).`);
          const question = this.questionsRepo.create({
            language,
            difficulty,
            problemStatement: qData.problemStatement,
            constraints: qData.constraints || 'None',
            sampleInput: cleanSampleText(qData.sampleInput),
            sampleOutput: cleanSampleText(qData.sampleOutput),
            testCases: qData.testCases,
            hints: Array.isArray(qData.hints) ? qData.hints : [
              'Read the problem constraints carefully.',
              'Trace through the sample input by hand.',
              'Consider edge cases.',
            ],
            timeLimitMinutes: qData.timeLimitMinutes || (difficulty === 'easy' ? 15 : difficulty === 'medium' ? 30 : 45),
          });
          return this.questionsRepo.save(question);
        }
      }
    } catch (err) {
      this.logger.warn(`[RAG] ChromaDB unavailable or collection missing. Falling back to AI. Error: ${err}`);
    }

    // ── FALLBACK: AI Generation ───────────────────────────────────────────────
    const systemPrompt =
      'You are a strict, highly accurate college programming assessment question generator. ' +
      'Return ONLY a raw, valid JSON object. DO NOT wrap the output in markdown code blocks. ' +
      'The response must start with { and end with }.';

    const userPrompt =
      `TASK: Generate ONE original coding question.\n` +
      `LANGUAGE: ${language.toUpperCase()}\n` +
      `LANGUAGE INSTRUCTIONS: ${LANGUAGE_NOTES[language] || 'Standard implementation.'}\n` +
      `DIFFICULTY: ${difficulty.toUpperCase()}\n` +
      `DIFFICULTY RULES: ${DIFFICULTY_RULES[difficulty]}\n\n` +
      `Return a JSON object with these exact keys: problemStatement, constraints, sampleInput, sampleOutput, testCases (array of 3 objects each with input and expectedOutput keys), hints (array of 3 strings), timeLimitMinutes.`;

    const ollamaOptions = {
      temperature: 0.2,
      top_p: 0.9,
      top_k: 40,
      repeat_penalty: 1.15,   // Prevents the model from looping on the same phrases
      num_predict: 2048,
      stop: ['You are also given an integer', 'You can perform the following operation on this integer any number'],
    };

    let rawResponse: string;
    try {
      this.logger.log(`Generating question with ${primaryModel} (deadline: 15 min) ...`);
      rawResponse = await ollamaChat(baseUrl, primaryModel, systemPrompt, userPrompt, ollamaOptions, 15 * 60 * 1000);
      this.logger.log(`Model responded (${rawResponse.length} chars)`);
    } catch (err: any) {
      this.logger.error(`Ollama failed: ${err.message}`);
      throw new Error('Ollama did not respond in time. Please try again in a moment.');
    }

    // ── Parse response: JSON first, plain-text fallback ───────────────────────
    let qData: any = null;

    // Attempt 1: JSON (with repair for truncated responses)
    const jsonStart = rawResponse.indexOf('{');
    const jsonEnd = rawResponse.lastIndexOf('}');
    if (jsonStart !== -1) {
      const jsonStr = jsonEnd > jsonStart ? rawResponse.substring(jsonStart, jsonEnd + 1) : rawResponse.substring(jsonStart);
      const attempts = [jsonStr, jsonStr + '"}}', jsonStr + '"]}', jsonStr + '"}', jsonStr + '}}'];
      for (const attempt of attempts) {
        try {
          const parsed = JSON.parse(attempt);
          if (parsed && typeof parsed === 'object') { qData = parsed; break; }
        } catch { /* try next */ }
      }
      if (qData) this.logger.log('Parsed AI response as JSON.');
    }

    // Attempt 2: Plain-text extraction (model outputs competitive-programming text format)
    if (!qData) {
      this.logger.warn('JSON parse failed — extracting fields from plain-text response.');
      const problemStatement = extractSection(rawResponse,
        'Problem Statement', 'PROBLEM STATEMENT', 'Description', 'Task',
      ) || rawResponse.split('\n').filter(l => l.trim()).slice(0, 10).join('\n');

      const sampleInput = extractSection(rawResponse, 'SAMPLE INPUT', 'Sample Input', 'Input:', 'INPUT');
      const sampleOutput = extractSection(rawResponse, 'SAMPLE OUTPUT', 'Sample Output', 'Output:', 'OUTPUT');
      const constraints = extractSection(rawResponse, 'Constraints', 'CONSTRAINTS', 'CONSTRAINT');

      qData = {
        problemStatement: problemStatement || 'See problem description.',
        constraints: constraints || '1 ≤ n ≤ 10⁵',
        sampleInput: sampleInput || '1',
        sampleOutput: sampleOutput || '1',
        testCases: sampleInput ? [{ input: sampleInput, expectedOutput: sampleOutput || '' }] : [],
        hints: [
          'Read the problem carefully and identify the core algorithm.',
          'Consider edge cases such as empty inputs and boundary values.',
          'Optimize your solution to meet the time limit.',
        ],
        timeLimitMinutes: difficulty === 'easy' ? 15 : difficulty === 'medium' ? 30 : 45,
      };
    }

    // ── Normalize fields ──────────────────────────────────────────────────────
    const toStr = (v: any): string => {
      if (v === null || v === undefined) return '';
      if (Array.isArray(v)) return v.join('\n');
      return String(v);
    };

    const sampleInput = toStr(qData.sampleInput ?? qData.input ?? qData.sample_input ?? '');
    const sampleOutput = toStr(qData.sampleOutput ?? qData.expectedOutput ?? qData.sample_output ?? qData.output ?? '');

    let testCases = qData.testCases ?? qData.test_cases ?? qData.examples ?? null;
    if (!testCases || !Array.isArray(testCases) || testCases.length === 0) {
      this.logger.warn('No testCases — building from sample input/output');
      testCases = sampleInput ? [{ input: sampleInput, expectedOutput: sampleOutput }] : [];
    }

    testCases = testCases
      .map((tc: any) => ({
        input: toStr(tc.input ?? tc.stdin ?? tc.in ?? ''),
        expectedOutput: toStr(tc.expectedOutput ?? tc.output ?? tc.expected ?? tc.stdout ?? ''),
      }))
      .filter((tc: any) => tc.input || tc.expectedOutput);

    // Last resort: placeholder so the question is always saved
    if (testCases.length === 0) {
      testCases = [{ input: '1', expectedOutput: '1' }];
      this.logger.warn('Created placeholder test case — model did not provide sample I/O.');
    }

    const allowedMinutes: Record<string, number> = { easy: 15, medium: 30, hard: 45 };
    const timeLimitMinutes = allowedMinutes[difficulty] ?? Math.round(Number(qData.timeLimitMinutes) || 30);

    const hints = Array.isArray(qData.hints)
      ? qData.hints.map(toStr).filter(Boolean)
      : ['Understand the constraints.', 'Dry-run the sample input.', 'Consider edge cases.'];

    const question = this.questionsRepo.create({
      language,
      difficulty,
      problemStatement: qData.problemStatement || 'Problem description missing.',
      constraints: qData.constraints || 'None',
      sampleInput,
      sampleOutput,
      testCases,
      hints,
      timeLimitMinutes,
    });

    return this.questionsRepo.save(question);
  }
}
