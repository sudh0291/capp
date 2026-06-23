
import 'dotenv/config';
import axios from 'axios';

async function testMistral() {
  console.log('Testing Mistral API...');
  console.log('MISTRAL_API_KEY:', process.env.MISTRAL_API_KEY ? 'Set' : 'Not set');
  console.log('MISTRAL_MODEL:', process.env.MISTRAL_MODEL || 'mistral-small-latest');

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.error('MISTRAL_API_KEY not found in environment variables');
    return;
  }

  try {
    const response = await axios.post(
      'https://api.mistral.ai/v1/chat/completions',
      {
        model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
        messages: [
          {
            role: 'user',
            content: 'Hello, Mistral! Please write a simple Python program that prints "Hello, World!"'
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));

    const content = response.data.choices[0].message.content;
    console.log('Generated content:', content);

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testMistral();
