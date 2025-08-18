import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import { getAllQueries } from '@/queries/ldap';

async function verifyLDAPTemplates() {
  logger.info('Verifying LDAP templates...');
  
  try {
    // Get all LDAP query definitions
    const ldapQueries = getAllQueries();
    const queryIds = ldapQueries.map(q => q.id);
    logger.info(`Found ${queryIds.length} LDAP query definitions`);
    
    // Get all AD templates from database
    const result = await db.query(
      "SELECT report_type, name, query_template FROM report_templates WHERE category = 'ad' ORDER BY report_type"
    );
    const templates = result.rows;
    logger.info(`Found ${templates.length} AD templates in database`);
    
    // Check for missing templates
    const templateTypes = templates.map((t: any) => t.report_type);
    const missingTemplates = queryIds.filter(id => !templateTypes.includes(id));
    
    if (missingTemplates.length > 0) {
      logger.warn('Missing templates for queries:', missingTemplates);
    } else {
      logger.info('✅ All LDAP queries have corresponding templates');
    }
    
    // Check for extra templates (templates without queries)
    const extraTemplates = templateTypes.filter((type: string) => !queryIds.includes(type));
    if (extraTemplates.length > 0) {
      logger.warn('Templates without corresponding queries:', extraTemplates);
    }
    
    // Verify template structure
    let invalidTemplates = 0;
    for (const template of templates) {
      try {
        const queryTemplate = template.query_template;
        
        // Check if it's a valid LDAP query template
        if (!queryTemplate.type || queryTemplate.type !== 'ldap') {
          logger.error(`Template ${template.report_type} is not an LDAP query`);
          invalidTemplates++;
          continue;
        }
        
        // Check required fields
        const requiredFields = ['filter', 'attributes', 'scope'];
        for (const field of requiredFields) {
          if (!queryTemplate[field]) {
            logger.error(`Template ${template.report_type} missing required field: ${field}`);
            invalidTemplates++;
          }
        }
        
        // Check if template matches the query definition
        const queryDef = ldapQueries.find(q => q.id === template.report_type);
        if (queryDef) {
          // Compare attributes
          const templateAttrs = new Set<string>(queryTemplate.attributes);
          const queryAttrs = new Set<string>(queryDef.query.attributes);
          
          const missingAttrs = [...queryAttrs].filter(attr => !templateAttrs.has(attr));
          const extraAttrs = [...templateAttrs].filter(attr => !queryAttrs.has(attr));
          
          if (missingAttrs.length > 0) {
            logger.warn(`Template ${template.report_type} missing attributes:`, missingAttrs);
          }
          if (extraAttrs.length > 0) {
            logger.warn(`Template ${template.report_type} has extra attributes:`, extraAttrs);
          }
          
          // Compare filters
          if (queryTemplate.filter !== queryDef.query.filter) {
            logger.warn(`Template ${template.report_type} has different filter than query definition`);
            logger.debug(`  Template: ${queryTemplate.filter}`);
            logger.debug(`  Query:    ${queryDef.query.filter}`);
          }
        }
        
      } catch (error) {
        logger.error(`Error validating template ${template.report_type}:`, error);
        invalidTemplates++;
      }
    }
    
    if (invalidTemplates > 0) {
      logger.error(`❌ Found ${invalidTemplates} invalid templates`);
    } else {
      logger.info('✅ All templates are structurally valid');
    }
    
    // Summary
    logger.info('\n=== VERIFICATION SUMMARY ===');
    logger.info(`Total LDAP Queries: ${queryIds.length}`);
    logger.info(`Total AD Templates: ${templates.length}`);
    logger.info(`Missing Templates: ${missingTemplates.length}`);
    logger.info(`Extra Templates: ${extraTemplates.length}`);
    logger.info(`Invalid Templates: ${invalidTemplates}`);
    
    if (missingTemplates.length === 0 && extraTemplates.length === 0 && invalidTemplates === 0) {
      logger.info('\n✅ All LDAP templates are properly configured!');
    } else {
      logger.warn('\n⚠️  Some issues found with LDAP templates');
    }
    
  } catch (error) {
    logger.error('Failed to verify templates:', error);
    throw error;
  }
}

// Run verification if this file is executed directly
if (require.main === module) {
  verifyLDAPTemplates()
    .then(() => {
      logger.info('Verification completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Verification failed:', error);
      process.exit(1);
    });
}

export { verifyLDAPTemplates };