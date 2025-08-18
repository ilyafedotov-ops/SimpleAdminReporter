import { db } from '../src/config/database';

async function checkCustomReports() {
  try {
    // Wait a moment for database connection to establish
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('Checking custom_report_templates table...\n');
    
    const result = await db.query(`
      SELECT 
        id,
        name,
        description,
        source,
        is_public,
        category,
        tags,
        created_at,
        updated_at
      FROM custom_report_templates
      ORDER BY created_at DESC
    `);
    
    if (result.rows.length === 0) {
      console.log('No custom reports found in the database.');
    } else {
      console.log(`Found ${result.rows.length} custom report(s):\n`);
      
      result.rows.forEach((report: any, index: number) => {
        console.log(`${index + 1}. ${report.name}`);
        console.log(`   ID: ${report.id}`);
        console.log(`   Description: ${report.description || 'No description'}`);
        console.log(`   Source: ${report.source}`);
        console.log(`   Public: ${report.is_public ? 'Yes' : 'No'}`);
        console.log(`   Category: ${report.category || 'None'}`);
        console.log(`   Tags: ${report.tags ? JSON.stringify(report.tags) : '[]'}`);
        console.log(`   Created: ${report.created_at}`);
        console.log(`   Updated: ${report.updated_at}\n`);
      });
    }
    
    // Also check execution count
    const execCount = await db.query(`
      SELECT 
        crt.name,
        COUNT(rh.id) as execution_count
      FROM custom_report_templates crt
      LEFT JOIN report_history rh ON rh.report_id = crt.id
      GROUP BY crt.id, crt.name
      ORDER BY execution_count DESC
    `);
    
    if (execCount.rows.length > 0) {
      console.log('\nExecution counts:');
      execCount.rows.forEach((row: any) => {
        console.log(`- ${row.name}: ${row.execution_count} executions`);
      });
    }
    
  } catch (error) {
    console.error('Error checking custom reports:', error);
  } finally {
    process.exit(0);
  }
}

checkCustomReports();