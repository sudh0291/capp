import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Tilt from 'react-parallax-tilt';
import axios from 'axios';
import { Terminal, Coffee, Settings, Wrench, Zap, Hand, BarChart, GraduationCap, Target, CheckCircle, TrendingUp, Flame, Circle, AlertTriangle, Rocket } from 'lucide-react';

// ── Dynamic fallback question generator (avoids repeats) ────────────────────
function generateFallbackQuestion(lang: string, diff: string, seed: number) {
  const timeLimitMinutes = diff === 'easy' ? 15 : diff === 'medium' ? 30 : 45;
  const rng = (offset = 0) => Math.abs(Math.sin(seed * 7919 + offset * 13));
  const randInt = (min: number, max: number, off = 0) => min + Math.floor(rng(off) * (max - min + 1));

  const templates: (() => {
    id: string; problemStatement: string; constraints: string;
    sampleInput: string; sampleOutput: string;
    testCases: { input: string; expectedOutput: string }[];
    hints: string[]; solution: string;
  })[] = [
    // Sum of multiples of K up to N
    () => {
      const k = randInt(2, 5, 1);
      const n = randInt(20, 100, 2);
      let total = 0;
      for (let i = k; i <= n; i += k) total += i;
      const sols: Record<string, string> = {
        python: `k=int(input())\nn=int(input())\nprint(sum(range(k,n+1,k)))`,
        javascript: `const[k,n]=require('fs').readFileSync('/dev/stdin','utf8').trim().split('\\n').map(Number);\nlet t=0;for(let i=k;i<=n;i+=k)t+=i;console.log(t);`,
        java: `import java.util.Scanner;\npublic class Main{public static void main(String[]a){Scanner s=new Scanner(System.in);int k=s.nextInt(),n=s.nextInt();long t=0;for(int i=k;i<=n;i+=k)t+=i;System.out.println(t);}}`,
        cpp: `#include<iostream>\nusing namespace std;int main(){int k,n;cin>>k>>n;long long t=0;for(int i=k;i<=n;i+=k)t+=i;cout<<t<<endl;}`,
        c: `#include<stdio.h>\nint main(){int k,n;scanf("%d%d",&k,&n);long long t=0;for(int i=k;i<=n;i+=k)t+=i;printf("%lld\\n",t);}`,
      };
      const input = `${k}\n${n}`;
      return {
        id: `offline-multiples-${seed}`,
        problemStatement: `Write a program that reads two integers K and N and prints the sum of all multiples of K that are ≤ N.`,
        constraints: '1 ≤ K ≤ 10, 1 ≤ N ≤ 10^4',
        sampleInput: input, sampleOutput: String(total),
        testCases: [
          { input, expectedOutput: String(total) },
          { input: `${k}\n${k}`, expectedOutput: String(k) },
          { input: `${k}\n1`, expectedOutput: '0' },
          { input: `${k+1}\n20`, expectedOutput: String((()=>{let t=0;for(let i=k+1;i<=20;i+=k+1)t+=i;return t;})()) },
          { input: '2\n10', expectedOutput: '30' },
        ],
        hints: ['Start from K and increment by K.', 'Use a loop with step K.'],
        solution: sols[lang] || sols['python'],
      };
    },
    // Sum of digits
    () => {
      const num = randInt(100, 9999, 1);
      const digitSum = String(num).split('').reduce((a, b) => a + +b, 0);
      const sols: Record<string, string> = {
        python: 'n=int(input())\nt=0\nwhile n>0:t+=n%10;n//=10\nprint(t)',
        javascript: `const n=+require('fs').readFileSync('/dev/stdin','utf8');let t=0,x=n;while(x>0){t+=x%10;x=Math.floor(x/10)}console.log(t);`,
        java: `import java.util.Scanner;\npublic class Main{public static void main(String[]a){Scanner s=new Scanner(System.in);int n=s.nextInt(),t=0;while(n>0){t+=n%10;n/=10;}System.out.println(t);}}`,
        cpp: `#include<iostream>\nusing namespace std;int main(){int n,t=0;cin>>n;while(n>0){t+=n%10;n/=10;}cout<<t<<endl;}`,
        c: `#include<stdio.h>\nint main(){int n,t=0;scanf("%d",&n);while(n>0){t+=n%10;n/=10;}printf("%d\\n",t);}`,
      };
      return {
        id: `offline-digitsum-${seed}`,
        problemStatement: 'Write a program that reads a non-negative integer N and prints the sum of its digits.',
        constraints: '0 ≤ N ≤ 10^6',
        sampleInput: String(num), sampleOutput: String(digitSum),
        testCases: [
          { input: String(num), expectedOutput: String(digitSum) },
          { input: '0', expectedOutput: '0' },
          { input: '999', expectedOutput: '27' },
          { input: '10', expectedOutput: '1' },
          { input: '12345', expectedOutput: '15' },
        ],
        hints: ['Extract digits using modulo 10.', 'Use a while loop.'],
        solution: sols[lang] || sols['python'],
      };
    },
    // Max element
    () => {
      const len = randInt(3, 6, 1);
      const arr: number[] = [];
      for (let i = 0; i < len; i++) arr.push(randInt(1, 50, i + 2));
      const maxVal = Math.max(...arr);
      const sols: Record<string, string> = {
        python: 'n=int(input())\narr=list(map(int,input().split()))\nprint(max(arr))',
        javascript: `const[_,...a]=require('fs').readFileSync('/dev/stdin','utf8').trim().split(/\\s+/).map(Number);\nconsole.log(Math.max(...a));`,
        java: `import java.util.Scanner;\npublic class Main{public static void main(String[]a){Scanner s=new Scanner(System.in);int n=s.nextInt(),max=Integer.MIN_VALUE;for(int i=0;i<n;i++){int x=s.nextInt();if(x>max)max=x;}System.out.println(max);}}`,
        cpp: `#include<iostream>\n#include<algorithm>\n#include<vector>\nusing namespace std;int main(){int n;cin>>n;vector<int>v(n);for(int i=0;i<n;i++)cin>>v[i];cout<<*max_element(v.begin(),v.end())<<endl;}`,
        c: `#include<stdio.h>\n#include<limits.h>\nint main(){int n,x,m=INT_MIN;scanf("%d",&n);for(int i=0;i<n;i++){scanf("%d",&x);if(x>m)m=x;}printf("%d\\n",m);}`,
      };
      return {
        id: `offline-max-${seed}`,
        problemStatement: 'Write a program that reads N followed by N integers and prints the maximum value.',
        constraints: '1 ≤ N ≤ 1000',
        sampleInput: `${len}\n${arr.join(' ')}`,
        sampleOutput: String(maxVal),
        testCases: [
          { input: `${len}\n${arr.join(' ')}`, expectedOutput: String(maxVal) },
          { input: '1\n-5', expectedOutput: '-5' },
          { input: '3\n0 0 0', expectedOutput: '0' },
          { input: '4\n-100 -50 -1 -200', expectedOutput: '-1' },
          { input: '5\n7 14 3 21 5', expectedOutput: '21' },
        ],
        hints: ['Initialize max with the first element.', 'Compare each element.'],
        solution: sols[lang] || sols['python'],
      };
    },
    // Count divisible by K
    () => {
      const n = randInt(10, 100, 1);
      const k = randInt(2, 5, 2);
      const sols: Record<string, string> = {
        python: 'n=int(input())\nk=int(input())\nprint(n//k)',
        javascript: `const[n,k]=require('fs').readFileSync('/dev/stdin','utf8').trim().split('\\n').map(Number);\nconsole.log(Math.floor(n/k));`,
        java: `import java.util.Scanner;\npublic class Main{public static void main(String[]a){Scanner s=new Scanner(System.in);int n=s.nextInt(),k=s.nextInt();System.out.println(n/k);}}`,
        cpp: `#include<iostream>\nusing namespace std;int main(){int n,k;cin>>n>>k;cout<<n/k<<endl;}`,
        c: `#include<stdio.h>\nint main(){int n,k;scanf("%d%d",&n,&k);printf("%d\\n",n/k);}`,
      };
      return {
        id: `offline-divcount-${seed}`,
        problemStatement: 'Write a program that reads N and K and prints the count of numbers from 1 to N divisible by K.',
        constraints: '1 ≤ N ≤ 10^4, 1 ≤ K ≤ 10',
        sampleInput: `${n}\n${k}`,
        sampleOutput: String(Math.floor(n / k)),
        testCases: [
          { input: `${n}\n${k}`, expectedOutput: String(Math.floor(n / k)) },
          { input: '10\n3', expectedOutput: '3' },
          { input: '5\n10', expectedOutput: '0' },
          { input: '100\n1', expectedOutput: '100' },
          { input: '7\n2', expectedOutput: '3' },
        ],
        hints: ['The answer is N // K.', 'No loop needed.'],
        solution: sols[lang] || sols['python'],
      };
    },
    // Vowel count
    () => {
      const strings = ['Hello World', 'Programming', 'AEIOU', 'Why dry sky', 'Quick brown fox'];
      const s = strings[randInt(0, strings.length - 1, 1)];
      const vowelCount = [...s.toLowerCase()].filter(c => 'aeiou'.includes(c)).length;
      const sols: Record<string, string> = {
        python: "s=input().lower()\nprint(sum(1 for c in s if c in 'aeiou'))",
        javascript: `const s=require('fs').readFileSync('/dev/stdin','utf8').trim().toLowerCase();console.log((s.match(/[aeiou]/g)||[]).length);`,
        java: `import java.util.Scanner;\npublic class Main{public static void main(String[]a){Scanner s=new Scanner(System.in);String t=s.nextLine().toLowerCase();int c=0;for(char ch:t.toCharArray())if("aeiou".indexOf(ch)>=0)c++;System.out.println(c);}}`,
        cpp: `#include<iostream>\n#include<string>\nusing namespace std;int main(){string s;getline(cin,s);int c=0;for(char ch:s){ch=tolower(ch);if(ch=='a'||ch=='e'||ch=='i'||ch=='o'||ch=='u')c++;}cout<<c<<endl;}`,
        c: `#include<stdio.h>\n#include<ctype.h>\nint main(){char s[1001];fgets(s,sizeof(s),stdin);int c=0;for(int i=0;s[i];i++){char ch=tolower(s[i]);if(ch=='a'||ch=='e'||ch=='i'||ch=='o'||ch=='u')c++;}printf("%d\\n",c);}`,
      };
      return {
        id: `offline-vowel-${seed}`,
        problemStatement: 'Write a program that reads a string and prints the number of vowels (a, e, i, o, u) in it. Ignore case.',
        constraints: '1 ≤ len(s) ≤ 1000',
        sampleInput: s,
        sampleOutput: String(vowelCount),
        testCases: [
          { input: s, expectedOutput: String(vowelCount) },
          { input: 'AEIOU', expectedOutput: '5' },
          { input: 'xyz', expectedOutput: '0' },
          { input: 'a', expectedOutput: '1' },
          { input: 'The quick brown fox', expectedOutput: '5' },
        ],
        hints: ['Convert to lowercase.', 'Check each character.'],
        solution: sols[lang] || sols['python'],
      };
    },
  ];

  const idx = randInt(0, templates.length - 1, 0);
  const q = templates[idx]();
  return { ...q, language: lang, difficulty: diff, timeLimitMinutes };
}

// Our local question bank — all language × difficulty combos covered.
// Zero network calls, zero latency, works offline.
const PERFECT_QUESTIONS = [
  // ── PYTHON EASY ────────────────────────────────────────────────────────────
  {
    id: 'py-easy-1',
    language: 'python', difficulty: 'easy',
    problemStatement: 'Write a Python program that reads an integer N and prints the sum of all positive even numbers less than or equal to N.',
    constraints: '1 <= N <= 10^5',
    sampleInput: '5', sampleOutput: '6',
    testCases: [
      { input: '5', expectedOutput: '6' },
      { input: '10', expectedOutput: '30' },
      { input: '1', expectedOutput: '0' },
      { input: '2', expectedOutput: '2' },
      { input: '100', expectedOutput: '2550' },
    ],
    hints: ['Use a loop with step 2.', 'Start from 2, end at N+1.', 'Sum = N/2 * (N/2 + 1).'],
    solution: 'n = int(input())\ntotal = sum(range(2, n+1, 2))\nprint(total)',
    timeLimitMinutes: 15,
  },
  {
    id: 'py-easy-2',
    language: 'python', difficulty: 'easy',
    problemStatement: 'Write a Python program that reads a string and prints the number of vowels (a, e, i, o, u). Ignore case.',
    constraints: '1 <= len(string) <= 1000',
    sampleInput: 'Hello World', sampleOutput: '3',
    testCases: [
      { input: 'Hello World', expectedOutput: '3' },
      { input: 'AEIOU', expectedOutput: '5' },
      { input: 'xyz', expectedOutput: '0' },
      { input: 'a', expectedOutput: '1' },
      { input: 'The quick brown fox', expectedOutput: '5' },
    ],
    hints: ['Convert to lowercase.', 'Check if each character is in "aeiou".', 'Use a counter.'],
    solution: 's = input().lower()\nprint(sum(1 for c in s if c in "aeiou"))',
    timeLimitMinutes: 15,
  },
  // ── PYTHON MEDIUM ──────────────────────────────────────────────────────────
  {
    id: 'py-medium-1',
    language: 'python', difficulty: 'medium',
    problemStatement: 'Given a list of integers, find the length of the longest increasing subsequence (LIS). The first line contains N, the second line contains N space-separated integers.',
    constraints: '1 <= N <= 1000, -10^4 <= arr[i] <= 10^4',
    sampleInput: '6\n10 9 2 5 3 7', sampleOutput: '3',
    testCases: [
      { input: '6\n10 9 2 5 3 7', expectedOutput: '3' },
      { input: '1\n5', expectedOutput: '1' },
      { input: '5\n1 2 3 4 5', expectedOutput: '5' },
      { input: '4\n4 3 2 1', expectedOutput: '1' },
      { input: '7\n0 1 0 3 2 3 3', expectedOutput: '4' },
    ],
    hints: ['Use dynamic programming.', 'dp[i] = length of LIS ending at index i.', 'For each i, check all j < i where arr[j] < arr[i].'],
    solution: 'n = int(input())\narr = list(map(int, input().split()))\ndp = [1]*n\nfor i in range(n):\n    for j in range(i):\n        if arr[j] < arr[i]:\n            dp[i] = max(dp[i], dp[j]+1)\nprint(max(dp))',
    timeLimitMinutes: 30,
  },
  {
    id: 'py-medium-2',
    language: 'python', difficulty: 'medium',
    problemStatement: 'Write a Python program that reads a number N and prints the first N prime numbers, space-separated.',
    constraints: '1 <= N <= 200',
    sampleInput: '5', sampleOutput: '2 3 5 7 11',
    testCases: [
      { input: '5', expectedOutput: '2 3 5 7 11' },
      { input: '1', expectedOutput: '2' },
      { input: '3', expectedOutput: '2 3 5' },
      { input: '10', expectedOutput: '2 3 5 7 11 13 17 19 23 29' },
    ],
    hints: ['Use a helper function is_prime().', 'Check divisibility up to sqrt(n).', 'Keep counting until you have N primes.'],
    solution: 'def is_prime(n):\n    if n < 2: return False\n    for i in range(2, int(n**0.5)+1):\n        if n % i == 0: return False\n    return True\nn = int(input())\nprimes = []\nnum = 2\nwhile len(primes) < n:\n    if is_prime(num): primes.append(num)\n    num += 1\nprint(*primes)',
    timeLimitMinutes: 30,
  },
  // ── PYTHON HARD ────────────────────────────────────────────────────────────
  {
    id: 'py-hard-1',
    language: 'python', difficulty: 'hard',
    problemStatement: 'Given a string, find the length of the longest substring without repeating characters. Read the string from stdin.',
    constraints: '0 <= len(s) <= 5*10^4',
    sampleInput: 'abcabcbb', sampleOutput: '3',
    testCases: [
      { input: 'abcabcbb', expectedOutput: '3' },
      { input: 'bbbbb', expectedOutput: '1' },
      { input: 'pwwkew', expectedOutput: '3' },
      { input: '', expectedOutput: '0' },
      { input: 'abcdefg', expectedOutput: '7' },
    ],
    hints: ['Use sliding window technique.', 'Keep a set of characters in current window.', 'Move left pointer when duplicate found.'],
    solution: 's = input()\nleft = 0\nmax_len = 0\nchar_set = set()\nfor right in range(len(s)):\n    while s[right] in char_set:\n        char_set.remove(s[left])\n        left += 1\n    char_set.add(s[right])\n    max_len = max(max_len, right - left + 1)\nprint(max_len)',
    timeLimitMinutes: 45,
  },
  // ── JAVA EASY ──────────────────────────────────────────────────────────────
  {
    id: 'java-easy-1',
    language: 'java', difficulty: 'easy',
    problemStatement: 'Write a Java program that reads an integer N and prints its factorial.',
    constraints: '0 <= N <= 15',
    sampleInput: '5', sampleOutput: '120',
    testCases: [
      { input: '5', expectedOutput: '120' },
      { input: '0', expectedOutput: '1' },
      { input: '1', expectedOutput: '1' },
      { input: '10', expectedOutput: '3628800' },
      { input: '6', expectedOutput: '720' },
    ],
    hints: ['Use a loop from 1 to N.', 'Use long for large numbers.', 'Factorial of 0 is 1.'],
    solution: 'import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        long fact = 1;\n        for (int i = 1; i <= n; i++) fact *= i;\n        System.out.println(fact);\n    }\n}',
    timeLimitMinutes: 15,
  },
  // ── JAVA MEDIUM ────────────────────────────────────────────────────────────
  {
    id: 'java-medium-1',
    language: 'java', difficulty: 'medium',
    problemStatement: 'Write a Java program that reads N integers and prints them sorted in ascending order (space-separated).',
    constraints: '1 <= N <= 10^5, -10^9 <= arr[i] <= 10^9',
    sampleInput: '5\n3 1 4 1 5', sampleOutput: '1 1 3 4 5',
    testCases: [
      { input: '5\n3 1 4 1 5', expectedOutput: '1 1 3 4 5' },
      { input: '1\n7', expectedOutput: '7' },
      { input: '3\n-1 0 1', expectedOutput: '-1 0 1' },
      { input: '4\n4 3 2 1', expectedOutput: '1 2 3 4' },
    ],
    hints: ['Use Arrays.sort().', 'Read N then N integers.', 'Print with spaces between numbers.'],
    solution: 'import java.util.*;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        int[] arr = new int[n];\n        for (int i = 0; i < n; i++) arr[i] = sc.nextInt();\n        Arrays.sort(arr);\n        StringBuilder sb = new StringBuilder();\n        for (int i = 0; i < n; i++) { if (i > 0) sb.append(" "); sb.append(arr[i]); }\n        System.out.println(sb);\n    }\n}',
    timeLimitMinutes: 30,
  },
  // ── JAVA HARD ──────────────────────────────────────────────────────────────
  {
    id: 'java-hard-1',
    language: 'java', difficulty: 'hard',
    problemStatement: 'Given N, print the N-th row of Pascal\'s Triangle (0-indexed) as space-separated integers.',
    constraints: '0 <= N <= 30',
    sampleInput: '4', sampleOutput: '1 4 6 4 1',
    testCases: [
      { input: '4', expectedOutput: '1 4 6 4 1' },
      { input: '0', expectedOutput: '1' },
      { input: '1', expectedOutput: '1 1' },
      { input: '5', expectedOutput: '1 5 10 10 5 1' },
      { input: '3', expectedOutput: '1 3 3 1' },
    ],
    hints: ['Use combination formula C(n,k) = n!/(k!(n-k)!).', 'Or build iteratively: row[k] = row[k-1]*(n-k+1)/k.', 'Start with row = [1].'],
    solution: 'import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        long[] row = new long[n+1];\n        row[0] = 1;\n        for (int k = 1; k <= n; k++) row[k] = row[k-1] * (n-k+1) / k;\n        StringBuilder sb = new StringBuilder();\n        for (int i = 0; i <= n; i++) { if (i > 0) sb.append(" "); sb.append(row[i]); }\n        System.out.println(sb);\n    }\n}',
    timeLimitMinutes: 45,
  },
  // ── C++ EASY ───────────────────────────────────────────────────────────────
  {
    id: 'cpp-easy-1',
    language: 'cpp', difficulty: 'easy',
    problemStatement: 'Write a C++ program that reads two integers and prints their sum.',
    constraints: '-10^4 <= a, b <= 10^4',
    sampleInput: '5 7', sampleOutput: '12',
    testCases: [
      { input: '5 7', expectedOutput: '12' },
      { input: '-5 5', expectedOutput: '0' },
      { input: '0 0', expectedOutput: '0' },
      { input: '100 200', expectedOutput: '300' },
      { input: '-1000 -2000', expectedOutput: '-3000' },
    ],
    hints: ['Use cin.', 'Store in int variables.', 'Print with cout.'],
    solution: '#include<iostream>\nusing namespace std;\nint main(){\n    int a,b; cin>>a>>b;\n    cout<<a+b<<endl;\n}',
    timeLimitMinutes: 15,
  },
  // ── C++ MEDIUM ─────────────────────────────────────────────────────────────
  {
    id: 'cpp-medium-1',
    language: 'cpp', difficulty: 'medium',
    problemStatement: 'Given an array, find the maximum subarray sum (Kadane\'s Algorithm). First line: N. Second line: N integers.',
    constraints: '1 <= N <= 10^5, -10^4 <= arr[i] <= 10^4',
    sampleInput: '5\n1 -2 3 4 -1', sampleOutput: '7',
    testCases: [
      { input: '5\n1 -2 3 4 -1', expectedOutput: '7' },
      { input: '4\n-1 -2 -3 -4', expectedOutput: '-1' },
      { input: '3\n1 2 3', expectedOutput: '6' },
      { input: '1\n5', expectedOutput: '5' },
      { input: '6\n-2 1 -3 4 -1 2', expectedOutput: '5' },
    ],
    hints: ['Track current sum and max sum.', 'Reset current sum to 0 if it goes negative.', 'Initialize max to first element.'],
    solution: '#include<iostream>\n#include<vector>\n#include<algorithm>\nusing namespace std;\nint main(){\n    int n; cin>>n;\n    vector<int> arr(n);\n    for(int i=0;i<n;i++) cin>>arr[i];\n    int cur=arr[0],best=arr[0];\n    for(int i=1;i<n;i++){\n        cur=max(arr[i],cur+arr[i]);\n        best=max(best,cur);\n    }\n    cout<<best<<endl;\n}',
    timeLimitMinutes: 30,
  },
  // ── C++ HARD ───────────────────────────────────────────────────────────────
  {
    id: 'cpp-hard-1',
    language: 'cpp', difficulty: 'hard',
    problemStatement: 'Given a sorted array of N integers and a target T, find the index of the target using binary search. Print the 0-based index, or -1 if not found. First line: N and T. Second line: N integers.',
    constraints: '1 <= N <= 10^6',
    sampleInput: '5 7\n1 3 5 7 9', sampleOutput: '3',
    testCases: [
      { input: '5 7\n1 3 5 7 9', expectedOutput: '3' },
      { input: '5 6\n1 3 5 7 9', expectedOutput: '-1' },
      { input: '1 1\n1', expectedOutput: '0' },
      { input: '3 5\n1 3 5', expectedOutput: '2' },
      { input: '4 4\n1 2 3 5', expectedOutput: '-1' },
    ],
    hints: ['lo=0, hi=n-1.', 'mid=(lo+hi)/2. Compare arr[mid] to target.', 'Return mid if equal, else adjust lo or hi.'],
    solution: '#include<iostream>\n#include<vector>\nusing namespace std;\nint main(){\n    int n,t; cin>>n>>t;\n    vector<int> arr(n);\n    for(int i=0;i<n;i++) cin>>arr[i];\n    int lo=0,hi=n-1;\n    while(lo<=hi){\n        int mid=(lo+hi)/2;\n        if(arr[mid]==t){cout<<mid;return 0;}\n        else if(arr[mid]<t) lo=mid+1;\n        else hi=mid-1;\n    }\n    cout<<-1;\n}',
    timeLimitMinutes: 45,
  },
  // ── C EASY ─────────────────────────────────────────────────────────────────
  {
    id: 'c-easy-1',
    language: 'c', difficulty: 'easy',
    problemStatement: 'Write a C program that takes two integers as input and prints their sum.',
    constraints: '-10^4 <= A, B <= 10^4',
    sampleInput: '5 7', sampleOutput: '12',
    testCases: [
      { input: '5 7', expectedOutput: '12' },
      { input: '-5 5', expectedOutput: '0' },
      { input: '0 0', expectedOutput: '0' },
      { input: '100 200', expectedOutput: '300' },
      { input: '-1000 -2000', expectedOutput: '-3000' },
    ],
    hints: ['Use scanf().', 'Store in int variables.', 'Use printf() with %d.'],
    solution: '#include<stdio.h>\nint main(){\n    int a,b;\n    scanf("%d %d",&a,&b);\n    printf("%d\\n",a+b);\n    return 0;\n}',
    timeLimitMinutes: 15,
  },
  // ── C MEDIUM ───────────────────────────────────────────────────────────────
  {
    id: 'c-medium-1',
    language: 'c', difficulty: 'medium',
    problemStatement: 'Write a C program to check if a given string is a palindrome. Print "YES" or "NO".',
    constraints: '1 <= len <= 1000',
    sampleInput: 'racecar', sampleOutput: 'YES',
    testCases: [
      { input: 'racecar', expectedOutput: 'YES' },
      { input: 'hello', expectedOutput: 'NO' },
      { input: 'a', expectedOutput: 'YES' },
      { input: 'abba', expectedOutput: 'YES' },
      { input: 'abc', expectedOutput: 'NO' },
    ],
    hints: ['Compare characters from both ends.', 'Use strlen() to get length.', 'Stop at the middle.'],
    solution: '#include<stdio.h>\n#include<string.h>\nint main(){\n    char s[1001];\n    scanf("%s",s);\n    int n=strlen(s),ok=1;\n    for(int i=0;i<n/2;i++)\n        if(s[i]!=s[n-1-i]){ok=0;break;}\n    printf(ok?"YES":"NO");\n}',
    timeLimitMinutes: 30,
  },
  // ── C HARD ─────────────────────────────────────────────────────────────────
  {
    id: 'c-hard-1',
    language: 'c', difficulty: 'hard',
    problemStatement: 'Write a C program that reads N integers and finds the second largest unique value. If no second largest exists, print -1.',
    constraints: '1 <= N <= 10^5',
    sampleInput: '5\n3 1 4 1 5', sampleOutput: '4',
    testCases: [
      { input: '5\n3 1 4 1 5', expectedOutput: '4' },
      { input: '3\n5 5 5', expectedOutput: '-1' },
      { input: '2\n2 1', expectedOutput: '1' },
      { input: '1\n7', expectedOutput: '-1' },
      { input: '4\n1 2 3 4', expectedOutput: '3' },
    ],
    hints: ['Track first and second largest.', 'Only update second when value is less than first but greater than second.', 'Use INT_MIN for initialization.'],
    solution: '#include<stdio.h>\n#include<limits.h>\nint main(){\n    int n; scanf("%d",&n);\n    int first=INT_MIN,second=INT_MIN;\n    for(int i=0;i<n;i++){\n        int x; scanf("%d",&x);\n        if(x>first){second=first;first=x;}\n        else if(x>second&&x!=first) second=x;\n    }\n    printf("%d",second==INT_MIN?-1:second);\n}',
    timeLimitMinutes: 45,
  },
  // ── JAVASCRIPT EASY ────────────────────────────────────────────────────────
  {
    id: 'js-easy-1',
    language: 'javascript', difficulty: 'easy',
    problemStatement: 'Write a Node.js program that reads two integers and prints their sum.',
    constraints: '-10^4 <= a, b <= 10^4',
    sampleInput: '5 7', sampleOutput: '12',
    testCases: [
      { input: '5 7', expectedOutput: '12' },
      { input: '-5 5', expectedOutput: '0' },
      { input: '0 0', expectedOutput: '0' },
      { input: '100 200', expectedOutput: '300' },
    ],
    hints: ['Use readline.', 'Split by space.', 'Parse with Number().'],
    solution: 'const rl=require("readline").createInterface({input:process.stdin});\nrl.on("line",(line)=>{\n    const [a,b]=line.split(" ").map(Number);\n    console.log(a+b);\n    rl.close();\n});',
    timeLimitMinutes: 15,
  },
  // ── JAVASCRIPT MEDIUM ──────────────────────────────────────────────────────
  {
    id: 'js-medium-1',
    language: 'javascript', difficulty: 'medium',
    problemStatement: 'Write a Node.js script that reads a string of brackets (only \'()\', \'{}\', \'[]\') and prints "true" if balanced, "false" otherwise.',
    constraints: '1 <= len <= 1000',
    sampleInput: '{[()]}', sampleOutput: 'true',
    testCases: [
      { input: '{[()]}', expectedOutput: 'true' },
      { input: '{[(])}', expectedOutput: 'false' },
      { input: '{{[[(())]]}}'  , expectedOutput: 'true' },
      { input: ']', expectedOutput: 'false' },
      { input: '()', expectedOutput: 'true' },
    ],
    hints: ['Use a stack.', 'Push opening brackets.', 'Pop and match for closing brackets.'],
    solution: 'const rl=require("readline").createInterface({input:process.stdin});\nrl.on("line",(line)=>{\n    const stack=[];\n    const m={")":"(","}":"{","]":"["};\n    let ok=true;\n    for(const c of line){\n        if("({[".includes(c)) stack.push(c);\n        else if(stack.pop()!==m[c]){ok=false;break;}\n    }\n    console.log(ok&&stack.length===0);\n    rl.close();\n});',
    timeLimitMinutes: 30,
  },
  // ── JAVASCRIPT HARD ────────────────────────────────────────────────────────
  {
    id: 'js-hard-1',
    language: 'javascript', difficulty: 'hard',
    problemStatement: 'Given N numbers, find the number of pairs (i, j) where i < j and arr[i] + arr[j] equals a target T. First line: N and T. Second line: N integers.',
    constraints: '1 <= N <= 10^4',
    sampleInput: '5 9\n2 7 4 5 3', sampleOutput: '2',
    testCases: [
      { input: '5 9\n2 7 4 5 3', expectedOutput: '2' },
      { input: '3 5\n1 2 3', expectedOutput: '1' },
      { input: '4 10\n1 2 3 4', expectedOutput: '0' },
      { input: '2 5\n2 3', expectedOutput: '1' },
    ],
    hints: ['Use a HashMap to count complements.', 'For each num, check if (target - num) exists.', 'Careful with duplicates.'],
    solution: 'const rl=require("readline").createInterface({input:process.stdin});\nconst lines=[];\nrl.on("line",l=>lines.push(l));\nrl.on("close",()=>{\n    const [n,t]=lines[0].split(" ").map(Number);\n    const arr=lines[1].split(" ").map(Number);\n    const map=new Map();\n    let count=0;\n    for(const num of arr){\n        const comp=t-num;\n        if(map.has(comp)) count+=map.get(comp);\n        map.set(num,(map.get(num)||0)+1);\n    }\n    console.log(count);\n});',
    timeLimitMinutes: 45,
  },
];

const LANGUAGES = [
  { id: 'python',     label: 'Python',     icon: <Terminal size={24} />, color: '#3b82f6', desc: 'v3.11' },
  { id: 'java',       label: 'Java',       icon: <Coffee size={24} />, color: '#f59e0b', desc: 'v17' },
  { id: 'cpp',        label: 'C++',        icon: <Settings size={24} />, color: '#8b5cf6', desc: 'C++17' },
  { id: 'c',          label: 'C',          icon: <Wrench size={24} />, color: '#6b7280', desc: 'C99' },
  { id: 'javascript', label: 'JavaScript', icon: <Zap size={24} />, color: '#eab308', desc: 'ES2022' },
];

const DIFFICULTIES = [
  {
    id: 'easy', label: 'Foundational', color: '#3fb950', bg: 'rgba(63,185,80,0.08)', border: 'rgba(63,185,80,0.2)',
    icon: <Circle size={8} fill="currentColor" />, time: '~15 min',
    desc: 'Core logic, data handling and implementation tasks.',
  },
  {
    id: 'medium', label: 'Intermediate', color: '#d29922', bg: 'rgba(210,153,34,0.08)', border: 'rgba(210,153,34,0.2)',
    icon: <Circle size={8} fill="currentColor" />, time: '~30 min',
    desc: 'Algorithms, search/sort, and efficient data structures.',
  },
  {
    id: 'hard', label: 'Advanced', color: '#f85149', bg: 'rgba(248,81,73,0.08)', border: 'rgba(248,81,73,0.2)',
    icon: <Circle size={8} fill="currentColor" />, time: '~45 min',
    desc: 'Complex optimization, dynamic programming & advanced algorithms.',
  },
];

const stagger = { visible: { transition: { staggerChildren: 0.06 } } };
const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 350, damping: 28 } },
};

const USED_QUESTIONS_STORAGE_KEY = 'usedQuestions';
const BACKEND_QUESTION_RETRY_LIMIT = 3;
const GENERATED_FALLBACK_RETRY_LIMIT = 12;

function normalizeQuestionPart(value?: string) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function buildQuestionKey(
  question: { id?: string; problemStatement?: string; sampleInput?: string; sampleOutput?: string },
  language: string,
  difficulty: string,
) {
  const signature = [
    language,
    difficulty,
    normalizeQuestionPart(question.problemStatement),
    normalizeQuestionPart(question.sampleInput),
    normalizeQuestionPart(question.sampleOutput),
  ].join('::');

  return signature !== `${language}::${difficulty}::::`
    ? signature
    : `${language}::${difficulty}::${question.id || Date.now()}`;
}

export default function Dashboard() {
  const rawUser = localStorage.getItem('user');
  let user: any = {};
  try { user = rawUser ? JSON.parse(rawUser) : {}; } catch { user = {}; }

  const [lang, setLang] = useState('');
  const [diff, setDiff] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Track used questions by language and difficulty
  const [usedQuestions, setUsedQuestions] = useState<Record<string, Set<string>>>(() => {
    try {
      const saved = localStorage.getItem(USED_QUESTIONS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const result: Record<string, Set<string>> = {};
        for (const key in parsed) {
          result[key] = new Set(parsed[key]);
        }
        return result;
      }
    } catch (e) {
      console.error('Failed to load used questions', e);
    }
    return {};
  });
  const navigate = useNavigate();

  // Helper: mark a question as used (state + localStorage) ──────────────────────
  const markUsed = (qId: string) => {
    const key = `${lang}-${diff}`;
    setUsedQuestions(prev => {
      const next = { ...prev };
      const updated = new Set(next[key] || []);
      updated.add(qId);
      next[key] = updated;
      try { localStorage.setItem(USED_QUESTIONS_STORAGE_KEY, JSON.stringify(
        Object.fromEntries(Object.entries(next).map(([k, v]) => [k, [...v]]))
      )); } catch {}
      return next;
    });
  };

  const handleStart = async () => {
    if (!lang || !diff) return;
    setLoading(true);
    setError('');

    const seenForSelection = new Set(usedQuestions[`${lang}-${diff}`] || []);
    const startAssessment = (question: any) => {
      const questionKey = buildQuestionKey(question, lang, diff);
      markUsed(questionKey);
      navigate('/assessment', {
        state: { question, language: lang, difficulty: diff },
      });
    };

    const pickFallbackQuestion = () => {
      const matches = PERFECT_QUESTIONS.filter(
        (q) => q.language === lang && q.difficulty === diff,
      );
      const unseenMatches = matches.filter(
        (q) => !seenForSelection.has(buildQuestionKey(q, lang, diff)),
      );

      if (unseenMatches.length > 0) {
        return unseenMatches[Math.floor(Math.random() * unseenMatches.length)];
      }

      const seedBase = Date.now();
      for (let attempt = 0; attempt < GENERATED_FALLBACK_RETRY_LIMIT; attempt++) {
        const generated = generateFallbackQuestion(lang, diff, seedBase + attempt);
        const generatedKey = buildQuestionKey(generated, lang, diff);
        if (!seenForSelection.has(generatedKey)) {
          return generated;
        }
      }

      return null;
    };

    try {
      // Primary: generate a random unseen question via backend
      const token = localStorage.getItem('token');
      for (let attempt = 0; attempt < BACKEND_QUESTION_RETRY_LIMIT; attempt++) {
        const res = await axios.post(
          '/api/questions/generate',
          { language: lang, difficulty: diff },
          { headers: { Authorization: `Bearer ${token}` }, timeout: 35000 },
        );
        const questionKey = buildQuestionKey(res.data, lang, diff);
        if (!seenForSelection.has(questionKey)) {
          setLoading(false);
          startAssessment(res.data);
          return;
        }
        seenForSelection.add(questionKey);
      }

      console.warn('Backend returned repeated questions, switching to fallback');
    } catch (err: any) {
      console.warn('Backend question generation failed, using local fallback');
    }

    const fallbackQuestion = pickFallbackQuestion();
    if (fallbackQuestion) {
      setLoading(false);
      startAssessment(fallbackQuestion);
    } else {
      setError('Could not load a new question right now. Please try again.');
      setLoading(false);
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const canStart = lang && diff && !loading;

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '3rem', position: 'relative', zIndex: 10 }}>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className="flex-between"
        style={{ marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}
      >
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: '0.2rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {greeting},
          </div>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>{user.name?.split(' ')[0] || user.regNumber || 'Student'} <Hand size={28} color="var(--yellow)" /></h1>
          {user.regNumber && (
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--text-3)' }}>
              {user.regNumber} · {user.department || 'CS'} · Year {user.year || '—'}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.625rem' }}>
          <Link to="/profile">
            <motion.span whileHover={{ scale: 1.04 }} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><BarChart size={16} /> Progress</motion.span>
          </Link>
          {(user.role === 'faculty' || user.role === 'admin') && (
            <Link to="/faculty">
              <motion.span whileHover={{ scale: 1.04 }} className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><GraduationCap size={16} /> Faculty</motion.span>
            </Link>
          )}
        </div>
      </motion.div>

      {/* Stat cards */}
      <motion.div variants={stagger} initial="hidden" animate="visible" className="grid-4" style={{ marginBottom: '2rem' }}>
        {[
          { icon: <Target size={24} />, label: 'Assessments', value: user.totalAssessments ?? '—', color: 'var(--accent)' },
          { icon: <CheckCircle size={24} />, label: 'Passed',       value: user.totalPassed ?? '—',       color: 'var(--green)' },
          { icon: <TrendingUp size={24} />, label: 'Avg Score',    value: user.averageScore ? `${Math.round(user.averageScore)}%` : '—', color: 'var(--neon-amber)' },
          { icon: <Flame size={24} />, label: 'Streak',       value: user.currentStreak != null ? `${user.currentStreak}d` : '—', color: 'var(--red)' },
        ].map(s => (
          <motion.div key={s.label} variants={item}>
            <Tilt tiltMaxAngleX={7} tiltMaxAngleY={7} scale={1.02} transitionSpeed={500} style={{ height: '100%' }}>
              <div className="stat-card">
                <div style={{ fontSize: '1.2rem', marginBottom: '0.375rem' }}>{s.icon}</div>
                <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            </Tilt>
          </motion.div>
        ))}
      </motion.div>

      {/* Assessment configurator */}
      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.12 }}
        className="card-glass"
        style={{ padding: '2rem' }}
      >
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '0.35rem' }}>Start New Assessment</h2>
          <p style={{ color: 'var(--text-3)', fontSize: '0.875rem', margin: 0 }}>
            AI generates a unique, professional-grade question. Every attempt is distinct.
          </p>
        </div>

        {/* Step 1 — Language */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: lang ? 'var(--accent)' : 'var(--bg-3)',
              border: `2px solid ${lang ? 'var(--accent)' : 'var(--border-mid)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.68rem', fontWeight: 800,
              color: lang ? '#fff' : 'var(--text-3)',
              transition: 'all 0.25s',
              flexShrink: 0,
            }}>1</div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Choose Language</h3>
          </div>

          <motion.div variants={stagger} initial="hidden" animate="visible"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.625rem' }}>
            {LANGUAGES.map(l => (
              <motion.div key={l.id} variants={item}>
                <motion.button
                  id={`lang-${l.id}`}
                  onClick={() => setLang(l.id)}
                  whileTap={{ scale: 0.96 }}
                  whileHover={{ scale: 1.03 }}
                  style={{
                    width: '100%', padding: '0.875rem 0.5rem',
                    background: lang === l.id ? `${l.color}14` : 'var(--bg-card)',
                    border: `1px solid ${lang === l.id ? l.color : 'var(--border)'}`,
                    borderRadius: 10, cursor: 'pointer',
                    fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem',
                    boxShadow: lang === l.id ? `0 0 0 1px ${l.color}30, 0 4px 16px ${l.color}20` : 'var(--card-shadow)',
                    transition: 'all 0.2s ease',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <span style={{ fontSize: '1.4rem' }}>{l.icon}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: lang === l.id ? l.color : 'var(--text-1)' }}>{l.label}</span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-3)', fontWeight: 500 }}>{l.desc}</span>
                </motion.button>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Step 2 — Difficulty */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: diff ? 'var(--accent)' : 'var(--bg-3)',
              border: `2px solid ${diff ? 'var(--accent)' : 'var(--border-mid)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.68rem', fontWeight: 800,
              color: diff ? '#fff' : 'var(--text-3)',
              transition: 'all 0.25s', flexShrink: 0,
            }}>2</div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Choose Difficulty</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.625rem' }}>
            {DIFFICULTIES.map(d => (
              <motion.button
                key={d.id}
                id={`diff-${d.id}`}
                onClick={() => setDiff(d.id)}
                whileTap={{ scale: 0.97 }}
                whileHover={{ scale: 1.02 }}
                style={{
                  padding: '1.125rem 1.25rem', textAlign: 'left',
                  background: diff === d.id ? d.bg : 'var(--bg-card)',
                  border: `1px solid ${diff === d.id ? d.border : 'var(--border)'}`,
                  borderRadius: 10, cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'all 0.2s ease',
                  boxShadow: diff === d.id ? `0 0 0 1px ${d.border}, 0 4px 20px ${d.bg}` : 'var(--card-shadow)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: d.color, display: 'flex', alignItems: 'center' }}>{d.icon}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.875rem', color: diff === d.id ? d.color : 'var(--text-1)' }}>{d.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--text-3)', fontWeight: 500 }}>{d.time}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', lineHeight: 1.5 }}>{d.desc}</div>
              </motion.button>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="alert alert-error" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            ><AlertTriangle size={16} /> {error}</motion.div>
          )}
        </AnimatePresence>

        <motion.button
          id="startAssessmentBtn"
          onClick={handleStart}
          disabled={!canStart}
          className="btn btn-primary btn-xl"
          whileHover={canStart ? { scale: 1.01 } : {}}
          whileTap={canStart ? { scale: 0.99 } : {}}
          style={{ fontSize: '0.95rem', fontWeight: 700 }}
        >
          {loading
            ? <><div className="spinner" /> Mistral is generating a unique question...</>
            : (!lang || !diff)
              ? 'Select language and difficulty above'
              : <><Rocket size={18} /> Start {DIFFICULTIES.find(d => d.id === diff)?.label} {LANGUAGES.find(l => l.id === lang)?.label} Assessment</>
          }
        </motion.button>
      </motion.div>
    </div>
  );
}
