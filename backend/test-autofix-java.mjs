
import axios from 'axios';

const testAutoFix = async () => {
  console.log('=== Testing Auto Fix (Java) ===');
  try {
    const res = await axios.post(
      'http://localhost:3000/api/questions/auto-fix',
      {
        code: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String input = sc.hasNextLine() ? sc.nextLine() : "";
        int a = Integer.parseInt(input);
        int b = Integer.parseInt(input);
        System.out.println(a + b);
        sc.close();
    }
}`,
        language: 'java',
        problemStatement: 'Write a program in java that reads two integers and prints their sum.',
        sampleInput: '3 5',
        sampleOutput: '8',
      },
      { headers: { Authorization: 'Bearer demo-jwt-student' }, timeout: 60000 }
    );
    console.log('✅ Auto Fix success! Fixed code:');
    console.log('---------------------------------');
    console.log(res.data.code);
    console.log('---------------------------------');
  } catch (err) {
    console.error('❌ Auto Fix error:', err.response?.data || err.message);
  }
};

testAutoFix();
