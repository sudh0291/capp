const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_FILE = path.join(__dirname, '../scripts/cloud-40k.json');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '6432'),
  user: process.env.DB_USER || 'platform_user',
  password: process.env.DB_PASS || 'your_secure_password',
  database: process.env.DB_NAME || 'coding_platform',
});

async function seed() {
  console.log('Connecting to PostgreSQL to seed 40,000 questions...');
  
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`File not found: ${DATA_FILE}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`Loaded ${data.length} questions from ${DATA_FILE}`);

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Optional: truncate the existing questions table to remove the repeated ones
    console.log('Clearing old questions...');
    await client.query('TRUNCATE TABLE questions CASCADE');
    
    console.log('Inserting new non-repeating questions (this may take a minute)...');
    
    // We'll insert in batches of 1000
    const BATCH_SIZE = 1000;
    
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      
      const values = [];
      const queryParams = [];
      let paramIndex = 1;
      
      for (const q of batch) {
        values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
        
        queryParams.push(
          q.language,
          q.difficulty,
          (q.problemStatement || '').replace(/\\u0000/g, '').replace(/\u0000/g, ''),
          (q.constraints || 'None').replace(/\\u0000/g, '').replace(/\u0000/g, ''),
          (q.sampleInput || '').replace(/\\u0000/g, '').replace(/\u0000/g, ''),
          (q.sampleOutput || '').replace(/\\u0000/g, '').replace(/\u0000/g, ''),
          JSON.stringify(q.testCases || []).replace(/\\u0000/g, '').replace(/\u0000/g, ''),
          JSON.stringify(q.hints || []).replace(/\\u0000/g, '').replace(/\u0000/g, ''),
          q.timeLimitMinutes || 30,
          false // used = false
        );
      }
      
      const queryStr = `
        INSERT INTO questions 
        (language, difficulty, "problemStatement", constraints, "sampleInput", "sampleOutput", "testCases", hints, "timeLimitMinutes", used) 
        VALUES ${values.join(', ')}
      `;
      
      await client.query(queryStr, queryParams);
      console.log(`Inserted batch ${i} to ${i + batch.length}`);
    }
    
    await client.query('COMMIT');
    console.log('Successfully seeded 40,000 questions to Postgres!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding data:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);
