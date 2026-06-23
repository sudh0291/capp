
import axios from 'axios';

const testRepeats = async () => {
  console.log('=== Testing for Repeated Questions ===');
  const questions = [];
  const seen = new Set();
  const userId = 'test-user-123'; // Using a test user ID
  const authHeader = 'Bearer demo-jwt-student';

  for (let i = 0; i < 10; i++) {
    try {
      const res = await axios.post(
        'http://localhost:3000/api/questions/generate',
        { language: 'java', difficulty: 'easy' },
        { headers: { Authorization: authHeader }, timeout: 30000 }
      );

      const problem = res.data.problemStatement;
      const isRepeat = seen.has(problem);
      questions.push({ i, problem, isRepeat });
      seen.add(problem);

      console.log(`Q${i+1}: ${problem.substring(0, 80)}... [${isRepeat ? 'REPEAT' : 'NEW'}]`);
    } catch (err) {
      console.error(`❌ Q${i+1} Error:`, err.response?.data || err.message);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total Questions: ${questions.length}`);
  console.log(`Unique Questions: ${seen.size}`);
  console.log(`Repeats Found: ${questions.length - seen.size}`);
};

testRepeats();
