# CodeGo AI Advanced E2E Test Suite

This directory contains comprehensive end-to-end (E2E) and API test tools for CodeGo AI, including detailed report generation in Excel and PDF formats.

## 📁 Files & Directories

### Test Runners
- `advanced-test-runner.js`: Main test runner - generates 250 test cases with detailed reports
- `test-reports.js`: Simple report generator
- `selenium-tests.js`: Complete Selenium browser test framework (20 test flows!)
- `reports/`: Directory containing all generated reports

### Backend Tests
- `../backend/test/api-tests.spec.ts`: API E2E tests for backend endpoints

## 📦 Installation

```bash
cd e2e-selenium-tests
npm install
```

## 🚀 Usage

### Run Advanced Test Suite (Recommended)
Generates 250 comprehensive test cases with detailed reports:
```bash
npm run test
```
**Reports Generated:**
  - `reports/advanced-test-results.xlsx`
  - `reports/advanced-test-results.pdf`

### Run Complete Selenium Tests
Runs browser-based E2E tests (requires Chrome and running frontend/backend):
```bash
npm run test:selenium
```
**Reports Generated:**
  - `reports/selenium-test-results.xlsx`
  - `reports/selenium-test-results.pdf`

### Simple Report Generation
```bash
npm run test:simple
```

## 📊 Test Coverage

### Selenium Browser Tests (20 Test Flows!)
- ✅ Landing Page Load & Navigation
- ✅ Login Form Display
- ✅ Invalid Login Error Handling
- ✅ Dashboard Page Load
- ✅ Assessment Page - Language/Difficulty Selection
- ✅ Profile Page Display
- ✅ Results Page Display
- ✅ Browser Console Errors Check
- ✅ Page Title Validation
- ✅ Local Storage Check
- ✅ Responsive Design - Mobile View (375x667)
- ✅ Responsive Design - Tablet View (768x1024)
- ✅ 404 Page Check (Invalid Routes)
- ✅ All Major Pages Status Check
- ✅ Faculty Dashboard Access Check
- ✅ Dark/Light Theme Toggle Check
- ✅ Navigation Menu Items Count
- ✅ Page Refresh Functionality
- ✅ Browser Back/Forward Navigation
- ✅ Form Input Focus Check

### Backend API Test Coverage
- ✅ Authentication (login)
- ✅ Questions API (generate, chat, auto-fix)
- ✅ Submissions API
- ✅ Progress API
- ✅ Faculty API

### Frontend Tests (Comprehensive)
- ✅ Landing Page
- ✅ Navigation
- ✅ Login
- ✅ Dashboard
- ✅ Question Generation
- ✅ Code Submission
- ✅ AI Chat
- ✅ Results
- ✅ Responsive Design

## 📈 Report Features

### Excel Report
- Two sheets: Overview and Detailed Results
- Colored status indicators (green=PASS, red=FAIL, orange=WARN)
- Complete metrics summary
- Test duration tracking
- Timestamps for all tests

### PDF Report
- Executive summary
- Pass percentage
- Results by test type (backend/frontend)
- Detailed results per test case

## 📂 Reports Location
All generated reports are saved in `c:\codego\e2e-selenium-tests\reports`!
