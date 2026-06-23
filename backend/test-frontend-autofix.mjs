
import axios from 'axios';

const testFrontendAutofix = async () => {
  console.log('=== Testing Frontend-style auto-fix...');
  try {
    const response = await axios.post(
      'http://localhost:3000/api/questions/auto-fix',
      {
        code: `const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin });
const lines = [];
rl.on("line", (line) => {
    lines.push(line.trim());
    if (lines.length === 2) {
        rl.close();
    }
});`,
        language: 'javascript',
        problemStatement: 'Given N numbers, find the number of pairs (i, j) where i < j and arr[i] + arr[j] equals a target T. First line: N and T. Second line: N integers.',
        sampleInput: '5 9\n2 7 4 5 3',
        sampleOutput: '2'
      },
      {
        headers: { Authorization: 'Bearer demo-jwt-student' },
        timeout: 60000
      }
    );
    console.log('✅ Auto-fix response:', response.data);
  } catch (error) {
    console.error('❌ Error:', error.response?.status, error.response?.data);
  }
};

testFrontendAutofix();
