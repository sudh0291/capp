
import axios from 'axios';

const test = async () => {
  const LANG_DEFAULTS_JAVA = 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        // TODO: Fix this code to solve the problem\n        Scanner sc = new Scanner(System.in);\n        String input = sc.hasNextLine() ? sc.nextLine() : "";\n        // This is intentionally incomplete\n        System.out.println("wrong_output");\n        sc.close();\n    }\n}\n';
  
  console.log('Calling auto-fix for Java factorial...');
  try {
    const response = await axios.post('http://localhost:3000/api/questions/auto-fix', {
      code: LANG_DEFAULTS_JAVA,
      language: 'java',
      problemStatement: 'Write a Java program that takes an integer N and prints the factorial of N.',
      sampleInput: '5',
      sampleOutput: '120'
    });
    
    console.log('✅ Success! Fixed code:');
    console.log(response.data.code);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
};

test();
