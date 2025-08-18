import { MigrationInterface, QueryRunner } from "typeorm";

export class FixTokenAuditNullConstraint1753869532351 implements MigrationInterface {
    name = 'FixTokenAuditNullConstraint1753869532351'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Allow NULL values in credential_id for cases where credential is not available
        await queryRunner.query(`
            ALTER TABLE token_encryption_audit 
            ALTER COLUMN credential_id DROP NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert to NOT NULL constraint
        await queryRunner.query(`
            ALTER TABLE token_encryption_audit 
            ALTER COLUMN credential_id SET NOT NULL
        `);
    }

}
