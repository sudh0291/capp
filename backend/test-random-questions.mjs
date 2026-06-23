
import axios from 'axios';

const testRandomQuestions = async () => {
  console.log('=== Testing Random Question Generation ===');
  const questions = [];
  for (let i = 0; i < 5; i++) {
    try {
      const res = await axios.post(
        'http://localhost:3000/api/questions/generate',
        { language: 'java', difficulty: 'easy' },
        { headers: { Authorization: 'Bearer demo-jwt-student' }, timeout: 60000 }
      );
      const problem = res.data.problemStatement;
      questions.push(problem);
      console.log(`Question ${i + 1}: ${problem}`);
    } catch (err) {
      console.error(`❌ Question ${i + 1} error:`, err.response?.data || err.message);
    }
  }
  
  // Check if all questions are unique (or at least not all the same)
  const uniqueQuestions = new Set(questions);
  console.log(`\n✅ Got ${uniqueQuestions.size} unique questions out of ${questions.length} generated!`);
};

testRandomQuestions();
