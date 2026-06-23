import { Controller, Post, Body, UseGuards, Get, Req, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { QuestionsService } from './questions.service';
import { AiService } from '../common/ai.service';
import { ExecutionService } from '../execution/execution.service';
import type { Request } from 'express';

type VerificationResult = {
  input: string;
  passed: boolean;
  output: string;
  expected: string;
  exitCode: number;
  statusId: number;
  statusDesc: string;
  stderr?: string;
  isError: boolean;
};

@Controller('api/questions')
export class QuestionsController {
  private readonly logger = new Logger(QuestionsController.name);

  constructor(
    private questionsService: QuestionsService,
    private aiService: AiService,
    private executionService: ExecutionService,
  ) {}

  @Get('test')
  testEndpoint() {
    this.logger.log('Test endpoint hit!');
    return { message: 'Test endpoint works! No auth required!' };
  }

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  async generate(
    @Req() request: Request,
    @Body() body: { language: string; difficulty: string },
  ) {
    const userId = (request as any).user?.userId || (request as any).user?.sub;
    const question = await this.questionsService.generateQuestion(
      body.language,
      body.difficulty,
      userId,
    );
    const publicTestCases = Array.isArray(question.testCases)
      ? question.testCases.slice(0, 2)
      : [];
    const publicQuestion = { ...question, testCases: publicTestCases };
    return publicQuestion;
  }

  @Post('auto-fix')
  async autoFix(
    @Body()
    body: {
      code: string;
      language: string;
      problemStatement: string;
      sampleInput: string;
      sampleOutput: string;
      testCases?: { input: string; expectedOutput: string }[];
    },
  ) {
    this.logger.log(`Auto-fix endpoint hit | lang=${body.language}`);
    this.logger.log(`Problem: ${body.problemStatement?.substring(0, 100)}`);
    this.logger.log(
      `Sample Input: "${body.sampleInput}" | Output: "${body.sampleOutput}"`,
    );

    const testCases =
      body.testCases && body.testCases.length > 0
        ? body.testCases
        : [
            {
              input: body.sampleInput || '',
              expectedOutput: body.sampleOutput || '',
            },
          ];

    const maxAttempts = 3;
    let currentCode = body.code;
    let errorDetail = '';

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      this.logger.log(`Auto-fix attempt ${attempt + 1}/${maxAttempts}`);

      const fixedCode = await this.aiService.fixCode(
        currentCode,
        body.language,
        body.problemStatement,
        body.sampleInput,
        body.sampleOutput,
        errorDetail,
        testCases,
      );

      if (body.language === 'html' || body.language === 'css') {
        this.logger.log(
          'Auto-fix: AI-graded language, returning AI code directly',
        );
        return {
          code: fixedCode,
          verified: null,
          verificationResults: [],
          attempts: attempt + 1,
        };
      }

      try {
        const rawResults = await this.executionService.runAllTestCases(
          fixedCode,
          body.language,
          testCases,
        );
        const verificationResults = rawResults.map((result, index) =>
          this.toVerificationResult(
            result,
            testCases[index]?.expectedOutput || '',
          ),
        );
        const allPassed = verificationResults.every(
          (result) => result.passed && !result.isError,
        );

        if (allPassed) {
          this.logger.log(
            `Auto-fix verified on attempt ${attempt + 1} for ${verificationResults.length} test cases`,
          );
          return {
            code: fixedCode,
            verified: true,
            verificationResults,
            attempts: attempt + 1,
          };
        }

        currentCode = fixedCode;
        errorDetail = this.buildAutoFixFeedback(verificationResults, attempt);

        if (attempt === maxAttempts - 1) {
          this.logger.warn(
            `Auto-fix exhausted ${maxAttempts} attempts without full verification`,
          );
          return {
            code: fixedCode,
            verified: false,
            verificationResults,
            attempts: attempt + 1,
            message: 'Auto-fix could not verify every test case yet.',
          };
        }
      } catch (execErr: any) {
        this.logger.warn(
          `Judge0 unavailable during validation: ${execErr.message} - returning fixed code`,
        );
        return {
          code: fixedCode,
          verified: null,
          verificationResults: [],
          attempts: attempt + 1,
          message: 'Verification service is unavailable right now.',
        };
      }
    }

    return { code: currentCode };
  }

  @Post('generate-code')
  async generateCode(@Body() body: { prompt: string; language: string }) {
    this.logger.log(
      'Generate-code endpoint hit with body:',
      JSON.stringify(body, null, 2),
    );
    const generatedCode = await this.aiService.generateCode(
      body.prompt,
      body.language,
    );
    this.logger.log('Generated code:', generatedCode);
    return { code: generatedCode };
  }

  @Post('chat')
  async chat(
    @Body()
    body: {
      message: string;
      history: { role: 'user' | 'assistant'; content: string }[];
      assessmentLanguage: string;
    },
  ) {
    this.logger.log(`Chat endpoint: "${body.message?.substring(0, 60)}"`);
    const reply = await this.aiService.chat(
      body.message,
      body.history || [],
      body.assessmentLanguage || 'python',
    );
    return { reply };
  }

  private toVerificationResult(
    result: {
      input: string;
      output: string;
      exitCode: number;
      stderr?: string;
      statusId: number;
      statusDesc: string;
    },
    expectedOutput: string,
  ): VerificationResult {
    const expected = String(expectedOutput || '').trim();
    const actual = (result.output || '').trim();
    const isError = result.exitCode !== 0 || result.statusId === 6;

    if (isError) {
      return {
        input: result.input,
        passed: false,
        output: result.stderr || result.statusDesc || actual,
        expected,
        exitCode: result.exitCode,
        statusId: result.statusId,
        statusDesc: result.statusDesc,
        stderr: result.stderr,
        isError: true,
      };
    }

    let passed = false;
    try {
      const actualParsed = JSON.parse(actual);
      const expectedParsed = JSON.parse(expected);
      passed = JSON.stringify(actualParsed) === JSON.stringify(expectedParsed);
    } catch {
      const actualTokens = actual.split(/\s+/).filter((token) => token.length > 0);
      const expectedTokens = expected
        .split(/\s+/)
        .filter((token) => token.length > 0);
      passed =
        actualTokens.length === expectedTokens.length &&
        actualTokens.every((token, index) => token === expectedTokens[index]);
    }

    return {
      input: result.input,
      passed,
      output: actual,
      expected,
      exitCode: result.exitCode,
      statusId: result.statusId,
      statusDesc: result.statusDesc,
      stderr: result.stderr,
      isError: false,
    };
  }

  private buildAutoFixFeedback(
    verificationResults: VerificationResult[],
    attempt: number,
  ) {
    const failedCasesInfo: string[] = [];

    verificationResults.forEach((result, index) => {
      if (result.passed && !result.isError) {
        return;
      }

      failedCasesInfo.push(`### Test Case ${index + 1}:`);
      failedCasesInfo.push('INPUT:');
      failedCasesInfo.push('```');
      failedCasesInfo.push(result.input);
      failedCasesInfo.push('```');

      if (result.statusId === 6) {
        failedCasesInfo.push('Status: COMPILATION ERROR');
        failedCasesInfo.push('Error message:');
        failedCasesInfo.push('```');
        failedCasesInfo.push(
          result.output || result.stderr || 'Unknown compilation error',
        );
        failedCasesInfo.push('```');
      } else if (result.isError) {
        failedCasesInfo.push('Status: RUNTIME ERROR');
        failedCasesInfo.push('Error message:');
        failedCasesInfo.push('```');
        failedCasesInfo.push(
          result.output || result.stderr || result.statusDesc || 'Runtime error',
        );
        failedCasesInfo.push('```');
      } else {
        failedCasesInfo.push('Status: WRONG OUTPUT');
        failedCasesInfo.push('Your Output:');
        failedCasesInfo.push('```');
        failedCasesInfo.push(result.output || '(empty)');
        failedCasesInfo.push('```');
        failedCasesInfo.push('Expected Output:');
        failedCasesInfo.push('```');
        failedCasesInfo.push(result.expected);
        failedCasesInfo.push('```');
        if (result.stderr) {
          failedCasesInfo.push('Stderr:');
          failedCasesInfo.push('```');
          failedCasesInfo.push(result.stderr);
          failedCasesInfo.push('```');
        }
      }

      failedCasesInfo.push('');
    });

    return [
      `## Previous Attempt (attempt ${attempt + 1}) - Issues found:`,
      ...failedCasesInfo,
      'Fix the code so that it passes ALL test cases above.',
    ].join('\n');
  }
}
