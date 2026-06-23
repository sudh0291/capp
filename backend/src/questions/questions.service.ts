import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Question } from './question.entity';
import { UserQuestionHistory } from './user-question-history.entity';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { AiService } from '../common/ai.service';

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  constructor(
    @InjectRepository(Question)
    private questionsRepo: Repository<Question>,
    @InjectRepository(UserQuestionHistory)
    private historyRepo: Repository<UserQuestionHistory>,
    @Inject(REDIS_CLIENT)
    private redis: Redis,
    private aiService: AiService,
  ) {}

  async getQuestion(id: string): Promise<Question | null> {
    try {
      const cacheKey = `question:${id}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as Question;
      const question = await this.questionsRepo.findOne({ where: { id } });
      if (question) {
        await this.redis.setex(cacheKey, 3600, JSON.stringify(question));
      }
      return question ?? null;
    } catch {
      return null;
    }
  }

  async generateQuestion(
    language: string,
    difficulty: string,
    userId?: string,
  ): Promise<Question> {
    this.logger.log(
      `[QS] Generating ${difficulty} ${language} question for user ${userId || 'anon'}`,
    );

    const seenHistory = userId
      ? await this.historyRepo.find({
          where: { userId, language, difficulty },
          relations: ['question'],
        })
      : [];
    const seenQuestionIds = seenHistory.map((entry) => entry.questionId);
    const seenQuestionSignatures = new Set(
      seenHistory
        .map((entry) => entry.question)
        .filter(Boolean)
        .map((question) => this.buildQuestionSignature(question)),
    );

    if (userId) {
      const existingQuestion = await this.findRandomUnseenQuestion(
        language,
        difficulty,
        seenQuestionIds,
      );
      if (existingQuestion) {
        await this.recordHistory(userId, existingQuestion, language, difficulty);
        return existingQuestion;
      }
    }

    // Step 1: Generate a brand-new question via Mistral AI only!
    let question: Question | null = null;
    for (let attempt = 0; attempt < 3 && !question; attempt++) {
      try {
        const aiData = await this.aiService.generateQuestion(
          language,
          difficulty,
        );
        if (!aiData) continue;

        const candidate = this.questionsRepo.create({
          language,
          difficulty,
          problemStatement: aiData.problemStatement,
          constraints: aiData.constraints,
          sampleInput: aiData.sampleInput,
          sampleOutput: aiData.sampleOutput,
          testCases: aiData.testCases,
          hints: aiData.hints,
          timeLimitMinutes: aiData.timeLimitMinutes,
          solution: aiData.solution,
          used: false,
        });

        const signature = this.buildQuestionSignature(candidate);
        if (seenQuestionSignatures.has(signature)) {
          this.logger.warn(
            `[QS] AI generated a repeated question signature, retrying (${attempt + 1}/3)`,
          );
          continue;
        }

        question = await this.questionsRepo.save(candidate);
      } catch (err: any) {
        this.logger.error(`[QS] Mistral AI generation failed: ${err.message}`);
      }
    }

    // Fallback: if AI failed, use a unique offline question
    if (!question) {
      this.logger.warn(`[QS] Using offline fallback for ${language}/${difficulty}`);
      const offlineData = this.offlineQuestion(language, difficulty);
      question = await this.questionsRepo.save(
        this.questionsRepo.create(offlineData as Partial<Question>),
      );
    }

    if (!question) {
      throw new Error(`Could not build a question for ${language}/${difficulty}`);
    }

    // If we have a userId, track this question in their history so they don't see it again
    if (userId) {
      await this.recordHistory(userId, question, language, difficulty);
    }

    return question;
  }

  private buildQuestionSignature(
    question: Pick<Question, 'problemStatement' | 'sampleInput' | 'sampleOutput'>,
  ) {
    return [
      question.problemStatement,
      question.sampleInput,
      question.sampleOutput,
    ]
      .map((value) => String(value || '').trim().replace(/\s+/g, ' '))
      .join('::');
  }

  private async findRandomUnseenQuestion(
    language: string,
    difficulty: string,
    seenQuestionIds: string[],
  ) {
    const query = this.questionsRepo
      .createQueryBuilder('question')
      .where('question.language = :language', { language })
      .andWhere('question.difficulty = :difficulty', { difficulty });

    if (seenQuestionIds.length > 0) {
      query.andWhere('question.id NOT IN (:...seenQuestionIds)', {
        seenQuestionIds,
      });
    }

    return query.orderBy('RANDOM()').limit(1).getOne();
  }

  private async recordHistory(
    userId: string,
    question: Question,
    language: string,
    difficulty: string,
  ) {
    const alreadySeen = await this.historyRepo.findOne({
      where: { userId, questionId: question.id },
    });

    if (alreadySeen) {
      return;
    }

    const history = this.historyRepo.create({
      userId,
      questionId: question.id,
      language,
      difficulty,
    });
    await this.historyRepo.save(history);
  }

  private offlineQuestion(language: string, difficulty: string) {
    const timeMap: Record<string, number> = { easy: 15, medium: 30, hard: 45 };
    const timeLimitMinutes = timeMap[difficulty] || 30;

    const problems: Record<string, Record<string, any>> = {
      python: {
        easy: {
          problemStatement: 'Write a Python program that reads an integer N and prints the sum of all even numbers from 1 to N.',
          constraints: '1 <= N <= 10^5',
          sampleInput: '10',
          sampleOutput: '30',
          testCases: [
            { input: '10', expectedOutput: '30' },
            { input: '1', expectedOutput: '0' },
            { input: '2', expectedOutput: '2' },
            { input: '5', expectedOutput: '6' },
            { input: '100', expectedOutput: '2550' },
          ],
          hints: ['Loop from 2 to N with step 2.', 'Or use sum(range(2, N+1, 2)).', 'Handle N=1 edge case (sum is 0).'],
          solution: 'n = int(input())\nprint(sum(range(2, n+1, 2)))',
        },
        medium: {
          problemStatement: 'Write a Python program that reads N and prints the first N Fibonacci numbers space-separated.',
          constraints: '1 <= N <= 50',
          sampleInput: '7',
          sampleOutput: '0 1 1 2 3 5 8',
          testCases: [
            { input: '7', expectedOutput: '0 1 1 2 3 5 8' },
            { input: '1', expectedOutput: '0' },
            { input: '2', expectedOutput: '0 1' },
            { input: '5', expectedOutput: '0 1 1 2 3' },
            { input: '10', expectedOutput: '0 1 1 2 3 5 8 13 21 34' },
          ],
          hints: ['Start with a=0, b=1.', 'Each next term = a + b.', 'Collect terms in a list.'],
          solution: 'n = int(input())\na, b = 0, 1\nres = []\nfor _ in range(n):\n    res.append(a)\n    a, b = b, a + b\nprint(*res)',
        },
        hard: {
          problemStatement: 'Given a string, find the length of the longest substring without repeating characters.',
          constraints: '0 <= len(s) <= 5*10^4',
          sampleInput: 'abcabcbb',
          sampleOutput: '3',
          testCases: [
            { input: 'abcabcbb', expectedOutput: '3' },
            { input: 'bbbbb', expectedOutput: '1' },
            { input: 'pwwkew', expectedOutput: '3' },
            { input: 'a', expectedOutput: '1' },
            { input: 'abcdefg', expectedOutput: '7' },
          ],
          hints: ['Use sliding window.', 'Keep a set of characters.', 'Move left pointer on duplicate.'],
          solution: 's = input()\nleft = 0\nbest = 0\nseen = set()\nfor right in range(len(s)):\n    while s[right] in seen:\n        seen.remove(s[left]); left += 1\n    seen.add(s[right])\n    best = max(best, right - left + 1)\nprint(best)',
        },
      },
      javascript: {
        easy: {
          problemStatement: 'Write a Node.js program that reads two integers and prints their sum.',
          constraints: '-10^4 <= a, b <= 10^4',
          sampleInput: '5 7',
          sampleOutput: '12',
          testCases: [
            { input: '5 7', expectedOutput: '12' },
            { input: '-5 5', expectedOutput: '0' },
            { input: '0 0', expectedOutput: '0' },
            { input: '100 200', expectedOutput: '300' },
            { input: '-1000 -2000', expectedOutput: '-3000' },
          ],
          hints: ['Use readline.', 'Split the line by space.', 'Parse as numbers with Number().'],
          solution: 'const rl=require("readline").createInterface({input:process.stdin});\nrl.on("line",(l)=>{const[a,b]=l.split(" ").map(Number);console.log(a+b);rl.close();});',
        },
        medium: {
          problemStatement: 'Read a string of brackets and print "true" if balanced, "false" otherwise.',
          constraints: '1 <= len <= 1000',
          sampleInput: '{[()]}',
          sampleOutput: 'true',
          testCases: [
            { input: '{[()]}', expectedOutput: 'true' },
            { input: '{[(])}', expectedOutput: 'false' },
            { input: '()', expectedOutput: 'true' },
            { input: ']', expectedOutput: 'false' },
            { input: '{{[[((  ))]]}}', expectedOutput: 'false' },
          ],
          hints: ['Use a stack.', 'Push opening brackets.', 'Pop and match on closing.'],
          solution: 'const rl=require("readline").createInterface({input:process.stdin});\nrl.on("line",(line)=>{const stack=[],m={")":"(","}":"{","]":"["};\nlet ok=true;\nfor(const c of line){if("({[".includes(c))stack.push(c);else if(stack.pop()!==m[c]){ok=false;break;}}\nconsole.log(ok&&stack.length===0);rl.close();});',
        },
        hard: {
          problemStatement: 'Find the number of pairs (i,j) where i<j and arr[i]+arr[j]==T. First line: N T. Second line: N integers.',
          constraints: '1 <= N <= 10^4',
          sampleInput: '5 9\n2 7 4 5 3',
          sampleOutput: '2',
          testCases: [
            { input: '5 9\n2 7 4 5 3', expectedOutput: '2' },
            { input: '3 6\n1 2 3', expectedOutput: '1' },
            { input: '2 5\n2 3', expectedOutput: '1' },
            { input: '4 10\n1 2 3 4', expectedOutput: '0' },
            { input: '1 5\n5', expectedOutput: '0' },
          ],
          hints: ['Use a HashMap for O(n).', 'For each num check if (T-num) exists.', 'Count each complement found.'],
          solution: 'const lines=[];\nconst rl=require("readline").createInterface({input:process.stdin});\nrl.on("line",l=>lines.push(l));\nrl.on("close",()=>{const[n,t]=lines[0].split(" ").map(Number);const arr=lines[1].split(" ").map(Number);const map=new Map();let count=0;\nfor(const num of arr){const comp=t-num;if(map.has(comp))count+=map.get(comp);map.set(num,(map.get(num)||0)+1);}\nconsole.log(count);});',
        },
      },
      java: {
        easy: {
          problemStatement: 'Write a Java program that reads an integer N and prints its factorial.',
          constraints: '0 <= N <= 15',
          sampleInput: '5',
          sampleOutput: '120',
          testCases: [
            { input: '5', expectedOutput: '120' },
            { input: '0', expectedOutput: '1' },
            { input: '10', expectedOutput: '3628800' },
            { input: '1', expectedOutput: '1' },
            { input: '6', expectedOutput: '720' },
          ],
          hints: ['Use a loop from 1 to N.', 'Use long for large values.', '0! = 1.'],
          solution: 'import java.util.Scanner;\npublic class Main{\npublic static void main(String[] args){Scanner sc=new Scanner(System.in);int n=sc.nextInt();long f=1;for(int i=1;i<=n;i++)f*=i;System.out.println(f);}}',
        },
        medium: {
          problemStatement: 'Read N integers and print them sorted ascending, space-separated.',
          constraints: '1 <= N <= 10^5',
          sampleInput: '5\n3 1 4 1 5',
          sampleOutput: '1 1 3 4 5',
          testCases: [
            { input: '5\n3 1 4 1 5', expectedOutput: '1 1 3 4 5' },
            { input: '1\n7', expectedOutput: '7' },
            { input: '3\n-1 0 1', expectedOutput: '-1 0 1' },
            { input: '4\n4 3 2 1', expectedOutput: '1 2 3 4' },
            { input: '2\n5 5', expectedOutput: '5 5' },
          ],
          hints: ['Use Arrays.sort().', 'Print with spaces between.'],
          solution: 'import java.util.*;\npublic class Main{\npublic static void main(String[] args){Scanner sc=new Scanner(System.in);int n=sc.nextInt();int[] a=new int[n];for(int i=0;i<n;i++)a[i]=sc.nextInt();Arrays.sort(a);StringBuilder sb=new StringBuilder();for(int i=0;i<n;i++){if(i>0)sb.append(" ");sb.append(a[i]);}System.out.println(sb);}}',
        },
        hard: {
          problemStatement: 'Print the N-th row of Pascal\'s Triangle (0-indexed), space-separated.',
          constraints: '0 <= N <= 30',
          sampleInput: '4',
          sampleOutput: '1 4 6 4 1',
          testCases: [
            { input: '4', expectedOutput: '1 4 6 4 1' },
            { input: '0', expectedOutput: '1' },
            { input: '1', expectedOutput: '1 1' },
            { input: '5', expectedOutput: '1 5 10 10 5 1' },
            { input: '3', expectedOutput: '1 3 3 1' },
          ],
          hints: ['Use combination formula.', 'row[k] = row[k-1]*(n-k+1)/k', 'Start with row=[1].'],
          solution: 'import java.util.Scanner;\npublic class Main{\npublic static void main(String[] args){Scanner sc=new Scanner(System.in);int n=sc.nextInt();long[] row=new long[n+1];row[0]=1;for(int k=1;k<=n;k++)row[k]=row[k-1]*(n-k+1)/k;StringBuilder sb=new StringBuilder();for(int i=0;i<=n;i++){if(i>0)sb.append(" ");sb.append(row[i]);}System.out.println(sb);}}',
        },
      },
      cpp: {
        easy: {
          problemStatement: 'Write a C++ program that reads two integers and prints their sum.',
          constraints: '-10^4 <= a, b <= 10^4',
          sampleInput: '5 7',
          sampleOutput: '12',
          testCases: [
            { input: '5 7', expectedOutput: '12' },
            { input: '-5 5', expectedOutput: '0' },
            { input: '0 0', expectedOutput: '0' },
            { input: '100 200', expectedOutput: '300' },
            { input: '-1000 -2000', expectedOutput: '-3000' },
          ],
          hints: ['Use cin.', 'Add two integers.', 'Print with cout.'],
          solution: '#include<iostream>\nusing namespace std;\nint main(){int a,b;cin>>a>>b;cout<<a+b<<endl;}',
        },
        medium: {
          problemStatement: 'Find the maximum subarray sum (Kadane\'s). First line: N. Second line: N integers.',
          constraints: '1 <= N <= 10^5',
          sampleInput: '5\n1 -2 3 4 -1',
          sampleOutput: '7',
          testCases: [
            { input: '5\n1 -2 3 4 -1', expectedOutput: '7' },
            { input: '4\n-1 -2 -3 -4', expectedOutput: '-1' },
            { input: '3\n1 2 3', expectedOutput: '6' },
            { input: '1\n5', expectedOutput: '5' },
            { input: '6\n-2 1 -3 4 -1 2', expectedOutput: '5' },
          ],
          hints: ['Track cur and best.', 'cur=max(arr[i], cur+arr[i]).', 'Init both to arr[0].'],
          solution: '#include<iostream>\n#include<vector>\nusing namespace std;\nint main(){int n;cin>>n;vector<int>v(n);for(int i=0;i<n;i++)cin>>v[i];int cur=v[0],best=v[0];for(int i=1;i<n;i++){cur=max(v[i],cur+v[i]);best=max(best,cur);}cout<<best<<endl;}',
        },
        hard: {
          problemStatement: 'Binary search: given sorted array and target T, print its 0-based index or -1. First line: N T. Second line: N integers.',
          constraints: '1 <= N <= 10^6',
          sampleInput: '5 7\n1 3 5 7 9',
          sampleOutput: '3',
          testCases: [
            { input: '5 7\n1 3 5 7 9', expectedOutput: '3' },
            { input: '5 6\n1 3 5 7 9', expectedOutput: '-1' },
            { input: '1 1\n1', expectedOutput: '0' },
            { input: '3 5\n1 3 5', expectedOutput: '2' },
            { input: '4 4\n1 2 3 5', expectedOutput: '-1' },
          ],
          hints: ['lo=0, hi=n-1.', 'mid=(lo+hi)/2.', 'Return mid or -1.'],
          solution: '#include<iostream>\n#include<vector>\nusing namespace std;\nint main(){int n,t;cin>>n>>t;vector<int>v(n);for(int i=0;i<n;i++)cin>>v[i];int lo=0,hi=n-1;while(lo<=hi){int mid=(lo+hi)/2;if(v[mid]==t){cout<<mid;return 0;}else if(v[mid]<t)lo=mid+1;else hi=mid-1;}cout<<-1;}',
        },
      },
      c: {
        easy: {
          problemStatement: 'Write a C program that reads two integers and prints their sum.',
          constraints: '-10^4 <= a, b <= 10^4',
          sampleInput: '5 7',
          sampleOutput: '12',
          testCases: [
            { input: '5 7', expectedOutput: '12' },
            { input: '-5 5', expectedOutput: '0' },
            { input: '0 0', expectedOutput: '0' },
            { input: '100 200', expectedOutput: '300' },
            { input: '-1000 -2000', expectedOutput: '-3000' },
          ],
          hints: ['Use scanf().', 'Add and print.', 'Use printf().'],
          solution: '#include<stdio.h>\nint main(){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);}',
        },
        medium: {
          problemStatement: 'Check if a string is a palindrome. Print YES or NO.',
          constraints: '1 <= len <= 1000',
          sampleInput: 'racecar',
          sampleOutput: 'YES',
          testCases: [
            { input: 'racecar', expectedOutput: 'YES' },
            { input: 'hello', expectedOutput: 'NO' },
            { input: 'a', expectedOutput: 'YES' },
            { input: 'abba', expectedOutput: 'YES' },
            { input: 'abc', expectedOutput: 'NO' },
          ],
          hints: ['Compare from both ends.', 'Use strlen().', 'Stop at middle.'],
          solution: '#include<stdio.h>\n#include<string.h>\nint main(){char s[1001];scanf("%s",s);int n=strlen(s),ok=1;for(int i=0;i<n/2;i++)if(s[i]!=s[n-1-i]){ok=0;break;}printf(ok?"YES":"NO");}',
        },
        hard: {
          problemStatement: 'Find the second largest unique value in array. Print -1 if none exists. First line: N. Second line: N integers.',
          constraints: '1 <= N <= 10^5',
          sampleInput: '5\n3 1 4 1 5',
          sampleOutput: '4',
          testCases: [
            { input: '5\n3 1 4 1 5', expectedOutput: '4' },
            { input: '3\n5 5 5', expectedOutput: '-1' },
            { input: '2\n2 1', expectedOutput: '1' },
            { input: '1\n7', expectedOutput: '-1' },
            { input: '4\n1 2 3 4', expectedOutput: '3' },
          ],
          hints: ['Track first and second largest.', 'Skip duplicates of first.', 'Use INT_MIN.'],
          solution: '#include<stdio.h>\n#include<limits.h>\nint main(){int n;scanf("%d",&n);int first=INT_MIN,second=INT_MIN;for(int i=0;i<n;i++){int x;scanf("%d",&x);if(x>first){second=first;first=x;}else if(x>second&&x!=first)second=x;}printf("%d",second==INT_MIN?-1:second);}',
        },
      },
    };

    const langData = problems[language] || problems['python'];
    const diffData = langData[difficulty] || langData['easy'];
    return { ...diffData, language, difficulty, timeLimitMinutes, used: false };
  }
}
