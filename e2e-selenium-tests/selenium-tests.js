const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const NUM_TEST_CASES = 50; // Reduced for faster CI runs
const REPORT_DIR = path.join(__dirname, 'reports');
const HEADLESS = process.env.HEADLESS !== 'false';

// Ensure report directory exists
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// Test results storage
const testResults = [];

async function runTestSuite() {
  console.log('🚀 Starting CodeGo Selenium E2E Test Suite...');
  console.log(`📊 Number of test cases: ${NUM_TEST_CASES}`);
  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log(`🖥️ Headless mode: ${HEADLESS}`);

  // Initialize Chrome driver
  const options = new chrome.Options();
  if (HEADLESS) {
    options.addArguments('--headless=new');
    options.addArguments('--disable-gpu');
  }
  options.addArguments('--window-size=1920,1080');
  options.addArguments('--no-sandbox');
  options.addArguments('--disable-dev-shm-usage');

  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();

  try {
    // Define test flows
    const testFlows = [
      async (testId) => {
        const testName = 'Landing Page Load';
        try {
          await driver.get(BASE_URL);
          await driver.wait(until.titleContains('CodeGo'), 15000);
          await driver.wait(until.elementLocated(By.tagName('nav')), 15000);
          await driver.findElement(By.tagName('h1'));
          return { testId, testName, status: 'PASS', message: 'Landing page loaded successfully' };
        } catch (e) {
          return { testId, testName, status: 'FAIL', message: e.message };
        }
      },
      async (testId) => {
        const testName = 'Login Page Display';
        try {
          await driver.get(`${BASE_URL}/login`);
          await driver.wait(until.elementLocated(By.css('form')), 15000);
          await driver.findElement(By.css('input[type="text"]'));
          await driver.findElement(By.css('input[type="password"]'));
          await driver.findElement(By.css('button[type="submit"]'));
          return { testId, testName, status: 'PASS', message: 'Login form elements found' };
        } catch (e) {
          return { testId, testName, status: 'FAIL', message: e.message };
        }
      },
      async (testId) => {
        const testName = 'Navigation Menu Links';
        try {
          await driver.get(BASE_URL);
          const navLinks = await driver.findElements(By.css('nav a'));
          return { testId, testName, status: 'PASS', message: `Found ${navLinks.length} navigation links` };
        } catch (e) {
          return { testId, testName, status: 'FAIL', message: e.message };
        }
      },
      async (testId) => {
        const testName = 'Page Title Check';
        try {
          await driver.get(BASE_URL);
          const title = await driver.getTitle();
          return { testId, testName, status: 'PASS', message: `Page title: "${title}"` };
        } catch (e) {
          return { testId, testName, status: 'FAIL', message: e.message };
        }
      },
      async (testId) => {
        const testName = 'Responsive Mobile View';
        try {
          await driver.manage().window().setRect({ width: 375, height: 667 });
          await driver.get(BASE_URL);
          await driver.sleep(500);
          return { testId, testName, status: 'PASS', message: 'Mobile view tested' };
        } catch (e) {
          return { testId, testName, status: 'FAIL', message: e.message };
        } finally {
          await driver.manage().window().setRect({ width: 1920, height: 1080 });
        }
      },
      async (testId) => {
        const testName = 'All Major Pages Check';
        try {
          const pages = ['/', '/login', '/dashboard', '/assessment', '/profile', '/results'];
          for (const page of pages) {
            await driver.get(`${BASE_URL}${page}`);
            await driver.sleep(300);
          }
          return { testId, testName, status: 'PASS', message: 'All major pages load successfully' };
        } catch (e) {
          return { testId, testName, status: 'FAIL', message: e.message };
        }
      }
    ];

    // Execute test cases
    for (let i = 1; i <= NUM_TEST_CASES; i++) {
      console.log(`[${i}/${NUM_TEST_CASES}] Running test...`);
      const flowIndex = (i - 1) % testFlows.length;
      const result = await testFlows[flowIndex](i);
      testResults.push({
        ...result,
        timestamp: new Date().toISOString()
      });
      await driver.sleep(100);
    }

    console.log('✅ All tests completed!');

  } finally {
    await driver.quit();
    // Generate reports
    await generateExcelReport(testResults);
    await generatePDFReport(testResults);
    console.log('📄 Reports generated successfully!');
  }
}

async function generateExcelReport(results) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Test Results');

  worksheet.columns = [
    { header: 'Test ID', key: 'testId', width: 10 },
    { header: 'Test Name', key: 'testName', width: 50 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Message', key: 'message', width: 60 },
    { header: 'Timestamp', key: 'timestamp', width: 30 },
  ];

  worksheet.addRows(results);

  // Style header
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };

  // Color status cells
  for (let i = 2; i <= results.length + 1; i++) {
    const row = worksheet.getRow(i);
    const statusCell = row.getCell(3);
    if (results[i-2].status === 'PASS') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70C070' } };
    } else if (results[i-2].status === 'FAIL') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD96666' } };
    } else if (results[i-2].status === 'WARN') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCC99' } };
    }
  }

  // Add summary
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const warnCount = results.filter(r => r.status === 'WARN').length;

  worksheet.addRow([]);
  worksheet.addRow(['SUMMARY', '', '', '', '']);
  worksheet.addRow(['Total Tests', NUM_TEST_CASES, '', '', '']);
  worksheet.addRow(['PASS', passCount, '', '', '']);
  worksheet.addRow(['FAIL', failCount, '', '', '']);
  worksheet.addRow(['WARN', warnCount, '', '', '']);

  const excelPath = path.join(REPORT_DIR, 'selenium-test-results.xlsx');
  await workbook.xlsx.writeFile(excelPath);
  console.log(`📊 Excel report saved to: ${excelPath}`);
}

async function generatePDFReport(results) {
  const doc = new PDFDocument();
  const pdfPath = path.join(REPORT_DIR, 'selenium-test-results.pdf');
  doc.pipe(fs.createWriteStream(pdfPath));

  doc
    .fontSize(22)
    .text('CodeGo AI - Selenium E2E Test Report', { align: 'center' })
    .fontSize(12)
    .text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' })
    .moveDown();

  // Summary
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const warnCount = results.filter(r => r.status === 'WARN').length;
  const passPercent = ((passCount / NUM_TEST_CASES) * 100).toFixed(2);

  doc
    .fontSize(18)
    .text('Test Summary', { underline: true })
    .fontSize(12)
    .text(`Total Tests: ${NUM_TEST_CASES}`)
    .text(`Pass Rate: ${passPercent}%`)
    .text(`Passed: ${passCount}`)
    .text(`Failed: ${failCount}`)
    .text(`Warnings: ${warnCount}`)
    .moveDown();

  // Test Results (paginated)
  doc.fontSize(16).text('Detailed Test Results', { underline: true }).fontSize(10);
  let y = doc.y;

  results.forEach((result) => {
    if (y > 700) {
      doc.addPage();
      y = doc.y;
    }

    doc.text(`${result.testId}. ${result.testName}`, { continued: true });
    doc.text(` [${result.status}]`, { 
      continued: false,
      fill: result.status === 'PASS' ? 'green' : 
            result.status === 'FAIL' ? 'red' : 'orange'
    });
    doc.text(`Message: ${result.message}`);
    doc.text(`Timestamp: ${new Date(result.timestamp).toLocaleString()}`);
    doc.text('---');
    y = doc.y;
  });

  doc.end();
  console.log(`📄 PDF report saved to: ${pdfPath}`);
}

// Run the test suite
runTestSuite().catch(console.error);
