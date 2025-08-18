#!/usr/bin/env ts-node
/**
 * E2E Test Runner
 * 
 * Comprehensive test runner for E2E tests with database setup, cleanup, and reporting
 */

import { spawn, ChildProcess } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { logger } from '@/utils/logger';
import { TestDataManager } from './utils/test-data-manager';
import { initializeTestDatabase, initializeTestRedis } from '@/test/test-helpers';

// Test configuration
interface E2ETestConfig {
  suites: string[];
  parallel: boolean;
  timeout: number;
  retries: number;
  bail: boolean;
  coverage: boolean;
  cleanup: boolean;
  verbose: boolean;
  reportFormat: 'json' | 'junit' | 'html' | 'console';
  outputDir: string;
}

const DEFAULT_CONFIG: E2ETestConfig = {
  suites: ['auth', 'reports', 'api', 'logs'],
  parallel: false,
  timeout: 120000, // 2 minutes per test
  retries: 1,
  bail: true,
  coverage: false,
  cleanup: true,
  verbose: true,
  reportFormat: 'console',
  outputDir: './test-results/e2e'
};

class E2ETestRunner {
  private config: E2ETestConfig;
  private startTime: number = 0;
  private testResults: TestSuiteResult[] = [];

  constructor(config: Partial<E2ETestConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureOutputDir();
  }

  /**
   * Main entry point for running E2E tests
   */
  async run(): Promise<boolean> {
    this.startTime = Date.now();
    logger.info('Starting E2E Test Suite', this.config);

    try {
      // Pre-flight checks
      await this.preflightChecks();

      // Setup test environment
      await this.setupTestEnvironment();

      // Run test suites
      const success = await this.runTestSuites();

      // Generate reports
      await this.generateReports();

      // Cleanup
      if (this.config.cleanup) {
        await this.cleanup();
      }

      const duration = Date.now() - this.startTime;
      logger.info(`E2E Test Suite completed in ${duration}ms`, {
        success,
        totalTests: this.getTotalTests(),
        passed: this.getPassedTests(),
        failed: this.getFailedTests()
      });

      return success;
    } catch (error) {
      logger.error('E2E Test Suite failed:', error);
      return false;
    }
  }

  /**
   * Perform pre-flight checks before running tests
   */
  private async preflightChecks(): Promise<void> {
    logger.info('Performing pre-flight checks...');

    // Check environment variables
    const requiredEnvVars = [
      'DATABASE_URL',
      'REDIS_URL',
      'JWT_SECRET'
    ];

    const missingEnvVars = requiredEnvVars.filter(env => !process.env[env]);
    if (missingEnvVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    }

    // Test database connectivity
    try {
      const pool = await initializeTestDatabase();
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      await pool.end();
      logger.info('Database connectivity: OK');
    } catch (error) {
      throw new Error(`Database connectivity check failed: ${error}`);
    }

    // Test Redis connectivity
    try {
      const redis = await initializeTestRedis();
      await redis.ping();
      await redis.quit();
      logger.info('Redis connectivity: OK');
    } catch (error) {
      throw new Error(`Redis connectivity check failed: ${error}`);
    }

    logger.info('Pre-flight checks completed successfully');
  }

  /**
   * Setup test environment with fresh data
   */
  private async setupTestEnvironment(): Promise<void> {
    logger.info('Setting up test environment...');

    try {
      // Initialize database and Redis
      const pool = await initializeTestDatabase();
      const redis = await initializeTestRedis();

      // Setup test data
      const testDataManager = new TestDataManager(pool);
      await testDataManager.createTestDataset();

      // Verify data integrity
      const integrity = await testDataManager.verifyTestDataIntegrity();
      if (!integrity.isValid) {
        throw new Error('Test data integrity check failed');
      }

      logger.info('Test environment setup completed', integrity);

      // Cleanup connections
      await redis.quit();
      await pool.end();
    } catch (error) {
      throw new Error(`Test environment setup failed: ${error}`);
    }
  }

  /**
   * Run all configured test suites
   */
  private async runTestSuites(): Promise<boolean> {
    logger.info('Running test suites:', this.config.suites);

    let overallSuccess = true;

    for (const suite of this.config.suites) {
      logger.info(`Running test suite: ${suite}`);
      
      const result = await this.runTestSuite(suite);
      this.testResults.push(result);

      if (!result.success) {
        overallSuccess = false;
        if (this.config.bail) {
          logger.warn('Bailing out due to test failure');
          break;
        }
      }
    }

    return overallSuccess;
  }

  /**
   * Run a specific test suite
   */
  private async runTestSuite(suite: string): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const testFile = path.resolve(__dirname, `${suite}.e2e.test.ts`);

    if (!existsSync(testFile)) {
      logger.error(`Test file not found: ${testFile}`);
      return {
        suite,
        success: false,
        duration: 0,
        tests: 0,
        passed: 0,
        failed: 1,
        skipped: 0,
        error: `Test file not found: ${testFile}`
      };
    }

    return new Promise((resolve) => {
      const jestArgs = [
        '--testPathPattern', testFile,
        '--testTimeout', this.config.timeout.toString(),
        '--verbose', this.config.verbose.toString(),
        '--bail', this.config.bail.toString(),
        '--maxWorkers', '1', // Run E2E tests serially
        '--forceExit',
        '--detectOpenHandles'
      ];

      if (this.config.coverage) {
        jestArgs.push('--coverage');
      }

      if (this.config.reportFormat === 'junit') {
        jestArgs.push(
          '--reporters', 'default',
          '--reporters', 'jest-junit'
        );
      }

      // Set test environment
      const env = {
        ...process.env,
        TEST_TYPE: 'integration',
        NODE_ENV: 'test',
        JEST_JUNIT_OUTPUT_DIR: this.config.outputDir,
        JEST_JUNIT_OUTPUT_NAME: `${suite}.e2e.xml`
      };

      logger.info(`Executing: jest ${jestArgs.join(' ')}`);

      const jestProcess: ChildProcess = spawn('npx', ['jest', ...jestArgs], {
        stdio: this.config.verbose ? 'inherit' : 'pipe',
        env,
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      if (jestProcess.stdout && jestProcess.stderr) {
        jestProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        jestProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      jestProcess.on('close', (code) => {
        const duration = Date.now() - startTime;
        const success = code === 0;

        let tests = 0, passed = 0, failed = 0, skipped = 0;

        // Parse Jest output for test counts
        const testResults = this.parseJestOutput(stdout + stderr);
        if (testResults) {
          tests = testResults.total;
          passed = testResults.passed;
          failed = testResults.failed;
          skipped = testResults.skipped;
        }

        const result: TestSuiteResult = {
          suite,
          success,
          duration,
          tests,
          passed,
          failed,
          skipped,
          stdout: this.config.verbose ? undefined : stdout,
          stderr: this.config.verbose ? undefined : stderr,
          error: code !== 0 ? `Jest exited with code ${code}` : undefined
        };

        logger.info(`Test suite ${suite} completed`, {
          success,
          duration,
          tests,
          passed,
          failed,
          skipped
        });

        resolve(result);
      });

      jestProcess.on('error', (error) => {
        logger.error(`Failed to start jest for suite ${suite}:`, error);
        resolve({
          suite,
          success: false,
          duration: Date.now() - startTime,
          tests: 0,
          passed: 0,
          failed: 1,
          skipped: 0,
          error: error.message
        });
      });
    });
  }

  /**
   * Parse Jest output to extract test counts
   */
  private parseJestOutput(output: string): { total: number; passed: number; failed: number; skipped: number } | null {
    // Look for Jest summary patterns
    const patterns = [
      /Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/,
      /Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/,
      /(\d+)\s+passing/,
      /(\d+)\s+failing/
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        // This is a simplified parser - in practice, you'd want more robust parsing
        const total = parseInt(match[match.length - 1] || '0');
        return {
          total,
          passed: output.includes('passed') ? total : 0,
          failed: output.includes('failed') ? total : 0,
          skipped: output.includes('skipped') ? total : 0
        };
      }
    }

    return null;
  }

  /**
   * Generate test reports in various formats
   */
  private async generateReports(): Promise<void> {
    logger.info('Generating test reports...');

    const report: TestReport = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.startTime,
      config: this.config,
      results: this.testResults,
      summary: {
        total: this.getTotalTests(),
        passed: this.getPassedTests(),
        failed: this.getFailedTests(),
        skipped: this.getSkippedTests(),
        success: this.testResults.every(r => r.success)
      }
    };

    // JSON Report
    if (this.config.reportFormat === 'json' || this.config.reportFormat === 'console') {
      const jsonReport = path.join(this.config.outputDir, 'e2e-report.json');
      writeFileSync(jsonReport, JSON.stringify(report, null, 2));
      logger.info(`JSON report written to: ${jsonReport}`);
    }

    // Console Report
    if (this.config.reportFormat === 'console') {
      this.printConsoleReport(report);
    }

    // HTML Report (basic)
    if (this.config.reportFormat === 'html') {
      const htmlReport = this.generateHTMLReport(report);
      const htmlPath = path.join(this.config.outputDir, 'e2e-report.html');
      writeFileSync(htmlPath, htmlReport);
      logger.info(`HTML report written to: ${htmlPath}`);
    }
  }

  /**
   * Print console report
   */
  private printConsoleReport(report: TestReport): void {
    console.log('\n' + '='.repeat(80));
    console.log('E2E TEST REPORT');
    console.log('='.repeat(80));
    console.log(`Duration: ${(report.duration / 1000).toFixed(2)}s`);
    console.log(`Total Tests: ${report.summary.total}`);
    console.log(`Passed: ${report.summary.passed}`);
    console.log(`Failed: ${report.summary.failed}`);
    console.log(`Skipped: ${report.summary.skipped}`);
    console.log(`Overall Success: ${report.summary.success ? 'YES' : 'NO'}`);
    console.log('\nSuite Results:');
    console.log('-'.repeat(80));

    for (const result of report.results) {
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      const duration = (result.duration / 1000).toFixed(2);
      console.log(`${status} ${result.suite.padEnd(20)} ${duration}s (${result.passed}/${result.tests} passed)`);
      
      if (result.error) {
        console.log(`      Error: ${result.error}`);
      }
    }
    
    console.log('='.repeat(80) + '\n');
  }

  /**
   * Generate basic HTML report
   */
  private generateHTMLReport(report: TestReport): string {
    const successClass = report.summary.success ? 'success' : 'failure';
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>E2E Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { margin: 20px 0; }
        .success { color: green; }
        .failure { color: red; }
        .suite { margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
        .suite.pass { border-left: 5px solid green; }
        .suite.fail { border-left: 5px solid red; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
    </style>
</head>
<body>
    <div class="header">
        <h1>E2E Test Report</h1>
        <p>Generated: ${report.timestamp}</p>
        <p>Duration: ${(report.duration / 1000).toFixed(2)} seconds</p>
    </div>
    
    <div class="summary">
        <h2>Summary</h2>
        <p class="${successClass}">Overall Result: ${report.summary.success ? 'PASSED' : 'FAILED'}</p>
        <table>
            <tr><th>Metric</th><th>Count</th></tr>
            <tr><td>Total Tests</td><td>${report.summary.total}</td></tr>
            <tr><td>Passed</td><td class="success">${report.summary.passed}</td></tr>
            <tr><td>Failed</td><td class="failure">${report.summary.failed}</td></tr>
            <tr><td>Skipped</td><td>${report.summary.skipped}</td></tr>
        </table>
    </div>
    
    <div class="suites">
        <h2>Test Suites</h2>
        ${report.results.map(result => `
            <div class="suite ${result.success ? 'pass' : 'fail'}">
                <h3>${result.suite} ${result.success ? '✅' : '❌'}</h3>
                <p>Duration: ${(result.duration / 1000).toFixed(2)}s</p>
                <p>Tests: ${result.passed}/${result.tests} passed</p>
                ${result.error ? `<p class="failure">Error: ${result.error}</p>` : ''}
            </div>
        `).join('')}
    </div>
</body>
</html>
    `.trim();
  }

  /**
   * Cleanup test environment
   */
  private async cleanup(): Promise<void> {
    logger.info('Cleaning up test environment...');

    try {
      // Initialize connections for cleanup
      const pool = await initializeTestDatabase();
      const testDataManager = new TestDataManager(pool);
      
      // Clean up test data
      await testDataManager.cleanupTestDataset();
      
      // Close connections
      await pool.end();
      
      logger.info('Test environment cleanup completed');
    } catch (error) {
      logger.error('Test environment cleanup failed:', error);
      // Don't throw on cleanup failure
    }
  }

  /**
   * Ensure output directory exists
   */
  private ensureOutputDir(): void {
    if (!existsSync(this.config.outputDir)) {
      mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  /**
   * Get total number of tests across all suites
   */
  private getTotalTests(): number {
    return this.testResults.reduce((sum, result) => sum + result.tests, 0);
  }

  /**
   * Get total number of passed tests
   */
  private getPassedTests(): number {
    return this.testResults.reduce((sum, result) => sum + result.passed, 0);
  }

  /**
   * Get total number of failed tests
   */
  private getFailedTests(): number {
    return this.testResults.reduce((sum, result) => sum + result.failed, 0);
  }

  /**
   * Get total number of skipped tests
   */
  private getSkippedTests(): number {
    return this.testResults.reduce((sum, result) => sum + result.skipped, 0);
  }
}

// Type definitions
interface TestSuiteResult {
  suite: string;
  success: boolean;
  duration: number;
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

interface TestReport {
  timestamp: string;
  duration: number;
  config: E2ETestConfig;
  results: TestSuiteResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    success: boolean;
  };
}

/**
 * CLI Entry Point
 */
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const config: Partial<E2ETestConfig> = {};

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--suites':
        if (nextArg) {
          config.suites = nextArg.split(',');
          i++;
        }
        break;
      case '--timeout':
        if (nextArg) {
          config.timeout = parseInt(nextArg);
          i++;
        }
        break;
      case '--parallel':
        config.parallel = true;
        break;
      case '--no-cleanup':
        config.cleanup = false;
        break;
      case '--coverage':
        config.coverage = true;
        break;
      case '--bail':
        config.bail = true;
        break;
      case '--no-bail':
        config.bail = false;
        break;
      case '--verbose':
        config.verbose = true;
        break;
      case '--quiet':
        config.verbose = false;
        break;
      case '--format':
        if (nextArg && ['json', 'junit', 'html', 'console'].includes(nextArg)) {
          config.reportFormat = nextArg as any;
          i++;
        }
        break;
      case '--output':
        if (nextArg) {
          config.outputDir = nextArg;
          i++;
        }
        break;
      case '--help':
        console.log(`
Usage: npm run test:e2e [options]

Options:
  --suites <suites>     Comma-separated list of test suites to run (default: auth,reports,api,logs)
  --timeout <ms>        Test timeout in milliseconds (default: 120000)
  --parallel            Run tests in parallel (default: false)
  --coverage            Generate code coverage report (default: false)
  --bail                Stop on first failure (default: true)
  --no-bail             Continue on failures
  --verbose             Verbose output (default: true)
  --quiet               Minimal output
  --format <format>     Report format: json, junit, html, console (default: console)
  --output <dir>        Output directory (default: ./test-results/e2e)
  --no-cleanup          Skip test data cleanup
  --help                Show this help message

Examples:
  npm run test:e2e                           # Run all tests
  npm run test:e2e -- --suites auth,api     # Run only auth and api tests
  npm run test:e2e -- --format html         # Generate HTML report
  npm run test:e2e -- --no-cleanup          # Skip cleanup for debugging
        `);
        process.exit(0);
        break;
    }
  }

  // Run E2E tests
  const runner = new E2ETestRunner(config);
  const success = await runner.run();
  
  process.exit(success ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('E2E Test Runner failed:', error);
    process.exit(1);
  });
}

export { E2ETestRunner, E2ETestConfig };