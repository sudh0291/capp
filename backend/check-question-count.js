
const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '6432'),
  user: process.env.DB_USER || 'platform_user',
  password: process.env.DB_PASS || 'yourpassword',
  database: process.env.DB_NAME || 'coding_platform',
});

async function checkQuestionCount() {
  const client = await pool.connect();
  try {
    // Count total questions
    const totalResult = await client.query('SELECT COUNT(*) FROM questions');
    console.log(`Total questions in DB: ${totalResult.rows[0].count}`);

    // Count per language and difficulty
    const breakdownResult = await client.query(`
      SELECT language, difficulty, COUNT(*) 
      FROM questions 
      GROUP BY language, difficulty 
      ORDER BY language, difficulty
    `);
    console.log('\nQuestions per language and difficulty:');
    breakdownResult.rows.forEach(row => {
      console.log(`${row.language} (${row.difficulty}): ${row.count}`);
    });
  } catch (err) {
    console.error('Error checking question count:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

checkQuestionCount();
