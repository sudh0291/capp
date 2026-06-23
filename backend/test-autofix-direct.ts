import 'dotenv/config';
import { AiService } from './src/common/ai.service';
import { ExecutionService } from './src/execution/execution.service';

async function testAutoFixDirect() {
  const aiService = new AiService();
  const executionService = new ExecutionService();

  const body = {
    code: `// TODO: Fix this code to solve the problem
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
    // This is intentionally incomplete
    console.log("wrong_output");
    rl.close();
});`,
    language: 'javascript',
    problemStatement: 'Given N numbers, find the number of pairs (i, j) where i < j and arr[i] + arr[j] equals a target T. First line: N and T. Second line: N integers.',
    sampleInput: '5 9\n2 7 4 5 3',
    sampleOutput: '2',
  };

  console.log(`Auto-fix hit | lang=${body.language}`);
  const maxAttempts = 3;
  let currentCode = body.code;
  let errorDetail = '';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(`Auto-fix attempt ${attempt + 1}/${maxAttempts}`);

    const fixedCode = await aiService.fixCode(
      currentCode,
      body.language,
      body.problemStatement,
      body.sampleInput,
      body.sampleOutput,
      errorDetail,
    );

    console.log(`AI response (fixedCode):\n${fixedCode}\n`);

    if (attempt === maxAttempts - 1) {
      console.log(`Auto-fix returning after ${attempt + 1} attempts (last attempt, no validation)`);
      return { code: fixedCode };
    }

    try {
      const result = await executionService.runSingle(
        fixedCode,
        body.language,
        body.sampleInput || '',
      );

      console.log('Execution result status:', result.statusId, result.statusDesc);
      console.log('Execution stdout:', JSON.stringify(result.output));
      console.log('Execution stderr:', JSON.stringify(result.stderr));

      const actual   = (result.output || '').trim();
      const expected = (body.sampleOutput || '').trim();

      let passed = false;
      if (result.statusId === 3 && result.exitCode === 0) {
        try {
          const a = JSON.parse(actual);
          const e = JSON.parse(expected);
          passed = JSON.stringify(a) === JSON.stringify(e);
        } catch {
          const actualTokens   = actual.split(/\s+/).filter(t => t.length > 0);
          const expectedTokens = expected.split(/\s+/).filter(t => t.length > 0);
          passed = actualTokens.length === expectedTokens.length &&
                   actualTokens.every((t, i) => t === expectedTokens[i]);
        }
      }

      if (passed) {
        console.log(`Auto-fix validated ✓ — attempt ${attempt + 1} passed`);
        return { code: fixedCode };
      }

      const lines = [`## Previous Attempt (attempt ${attempt + 1}) - Issues found:`];

      if (result.statusId === 6) {
        lines.push('Your code had a COMPILATION ERROR:');
        lines.push('```');
        lines.push(result.stderr || 'Unknown compilation error');
        lines.push('```');
      } else if (result.statusId >= 7 && result.statusId <= 14) {
        lines.push('Your code had a RUNTIME ERROR:');
        lines.push('```');
        lines.push(result.stderr || result.statusDesc || 'Runtime error');
        lines.push('```');
        if (actual) {
          lines.push('Partial output before crash:');
          lines.push(actual);
        }
      } else {
        lines.push('Your code produced WRONG OUTPUT.');
        lines.push('');
        lines.push('=== YOUR OUTPUT ===');
        lines.push(actual || '(empty)');
        lines.push('');
        lines.push('=== EXPECTED OUTPUT ===');
        lines.push(expected);
        if (result.stderr) {
          lines.push('');
          lines.push('=== STDERR ===');
          lines.push(result.stderr);
        }
      }

      lines.push('');
      lines.push('Fix the code so the output matches the expected output exactly.');

      errorDetail = lines.join('\n');
      currentCode = fixedCode;
      console.log(`Attempt ${attempt + 1} failed. Error feedback for next attempt:\n${errorDetail}\n`);
    } catch (execErr: any) {
      console.warn(`Judge0 unavailable during validation: ${execErr.message} — returning fixed code`);
      return { code: fixedCode };
    }
  }
}

testAutoFixDirect().catch(console.error);
