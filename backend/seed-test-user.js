// Creates a test student user so we can test the full flow
require('dotenv').config({ path: 'c:/codego/backend/.env' });
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const axios = require('axios');

async function run() {
  const c = new Client({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });
  await c.connect();

  const password = 'College@2024';
  const hash = await bcrypt.hash(password, 10);
  const regNumber = 'TEST001';

  // Check if already exists
  const existing = await c.query('SELECT id FROM users WHERE "regNumber" = $1', [regNumber]);
  if (existing.rows.length > 0) {
    console.log('User TEST001 already exists, id:', existing.rows[0].id);
  } else {
    await c.query(`
      INSERT INTO users ("regNumber", name, department, year, role, password, "mustChangePassword", "totalAssessments", "totalPassed", "averageScore", "currentStreak", "longestStreak", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, false, 0, 0, 0, 0, 0, NOW(), NOW())
    `, [regNumber, 'Test Student', 'CS', 3, 'student', hash]);
    console.log('Created user TEST001 with password College@2024');
  }
  await c.end();

  // Now test the full flow
  console.log('\nLogging in as TEST001...');
  const lr = await axios.post('http://localhost:3000/api/auth/login',
    { regNumber, password }, { timeout: 8000 });
  const token = lr.data.access_token;
  console.log('Login OK. Token:', token.substring(0, 30) + '...');

  // Generate two different questions
  for (const [lang, diff] of [['python', 'easy'], ['javascript', 'medium'], ['java', 'hard']]) {
    console.log(`\nGenerating ${lang}/${diff}...`);
    const start = Date.now();
    try {
      const gr = await axios.post('http://localhost:3000/api/questions/generate',
        { language: lang, difficulty: diff },
        { headers: { Authorization: 'Bearer ' + token }, timeout: 40000 });
      const t = ((Date.now() - start) / 1000).toFixed(2);
      const q = gr.data;
      console.log(`  Time: ${t}s`);
      console.log(`  Problem: ${q.problemStatement?.substring(0, 100)}`);
      console.log(`  Sample: "${q.sampleInput}" → "${q.sampleOutput}"`);
      console.log(`  Test cases (visible): ${q.testCases?.length}`);
      console.log(`  Hints: ${q.hints?.length}`);
    } catch (e) {
      console.log(`  ERROR: ${e.response?.status} ${e.response?.data?.message || e.message}`);
    }
  }

  console.log('\n✅ Done! Mistral cloud question generation is working.');
}

run().catch(e => console.log('Fatal:', e.message));
