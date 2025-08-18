import { MigrationInterface, QueryRunner } from "typeorm";

export class AddExpiresAtToCredentials1753869568016 implements MigrationInterface {
    name = 'AddExpiresAtToCredentials1753869568016'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add expires_at column to service_credentials table for token expiration tracking
        await queryRunner.query(`
            ALTER TABLE service_credentials
            ADD COLUMN expires_at TIMESTAMPTZ
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove expires_at column
        await queryRunner.query(`
            ALTER TABLE service_credentials
            DROP COLUMN expires_at
        `);
    }

}
