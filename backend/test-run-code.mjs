
import axios from 'axios';

const testRunCode = async () => {
  console.log('=== Testing Run Code ===');
  try {
    const fixedCode = `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();
        int b = sc.nextInt();
        System.out.println(a + b);
        sc.close();
    }
}`;
    console.log('Sending to Run Code...');
    const res = await axios.post(
      'http://localhost:3000/api/submissions/run',
      {
        code: fixedCode,
        language: 'java',
        testCases: [{ input: '3 5', expectedOutput: '8' }]
      },
      { headers: { Authorization: 'Bearer demo-jwt-student' }, timeout: 60000 }
    );
    console.log('✅ Run Code result:', res.data);
  } catch (err) {
    console.error('❌ Run Code error:', err.response?.data || err.message);
    if (err.response?.data) console.error('Full response:', err.response.data);
  }
};

testRunCode();
