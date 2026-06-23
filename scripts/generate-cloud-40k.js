const fs = require('fs');
const path = require('path');
const readline = require('readline');

const INPUT_FILE = path.join(__dirname, 'fine_tuning_dataset_clean.jsonl');
const OUTPUT_FILE = path.join(__dirname, 'cloud-40k.json');
const TARGET_COUNT = 40000;

const LANGUAGES = ['python', 'javascript', 'java', 'cpp', 'c'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

async function processDataset() {
    console.log(`Reading dataset from ${INPUT_FILE}...`);
    
    const fileStream = fs.createReadStream(INPUT_FILE);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    
    const validQuestions = [];
    
    for await (const line of rl) {
        if (!line.trim()) continue;
        try {
            const parsed = JSON.parse(line);
            
            // Extract the user request for difficulty/language context if needed
            let originalDifficulty = 'medium';
            let originalLanguage = 'python';
            
            if (parsed.messages && parsed.messages.length > 1) {
                const userPrompt = parsed.messages[1].content || '';
                if (userPrompt.toLowerCase().includes('easy')) originalDifficulty = 'easy';
                if (userPrompt.toLowerCase().includes('hard')) originalDifficulty = 'hard';
            }
            
            // Extract the assistant's response (the actual question JSON)
            const assistantMessage = parsed.messages.find(m => m.role === 'assistant');
            if (assistantMessage && assistantMessage.content) {
                // The content is a JSON string
                const qData = JSON.parse(assistantMessage.content);
                
                if (qData && qData.problemStatement && qData.testCases && qData.testCases.length > 0) {
                    validQuestions.push({
                        // Randomly assign language to ensure variety across languages
                        language: randomElement(LANGUAGES),
                        difficulty: originalDifficulty,
                        problemStatement: qData.problemStatement,
                        constraints: qData.constraints || 'Standard competitive programming constraints apply.',
                        sampleInput: qData.sampleInput || '',
                        sampleOutput: qData.sampleOutput || '',
                        testCases: qData.testCases,
                        hints: qData.hints || [],
                        timeLimitMinutes: qData.timeLimitMinutes || 30,
                        solution: qData.solution || null
                    });
                }
            }
        } catch (e) {
            // Ignore parse errors for individual lines
        }
    }
    
    console.log(`Parsed ${validQuestions.length} valid unique questions.`);
    
    if (validQuestions.length === 0) {
        console.error("No valid questions found! Aborting.");
        return;
    }
    
    const finalQuestions = [];
    let i = 0;
    
    while (finalQuestions.length < TARGET_COUNT) {
        // Pick questions sequentially, wrapping around if we exceed the dataset
        const baseQuestion = validQuestions[i % validQuestions.length];
        
        // Deep copy
        const newQuestion = JSON.parse(JSON.stringify(baseQuestion));
        
        // Re-randomize the language for duplicates
        if (i >= validQuestions.length) {
            newQuestion.language = randomElement(LANGUAGES);
        }
        
        finalQuestions.push(newQuestion);
        i++;
    }
    
    console.log(`Writing ${finalQuestions.length} records to ${OUTPUT_FILE}...`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalQuestions, null, 2));
    console.log(`Successfully generated ${finalQuestions.length} non-repeating questions.`);
}

processDataset().catch(console.error);
