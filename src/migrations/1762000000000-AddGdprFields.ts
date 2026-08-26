import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from "typeorm";

export class AddGdprFields1762000000000 implements MigrationInterface {
    name = 'AddGdprFields1762000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumns("users", [
            new TableColumn({
                name: "consentGdpr",
                type: "boolean",
                default: false,
            }),
            new TableColumn({
                name: "consentGdprAt",
                type: "timestamp with time zone",
                isNullable: true,
            }),
            new TableColumn({
                name: "consentGdprVersion",
                type: "varchar",
                length: "50",
                isNullable: true,
            }),
            new TableColumn({
                name: "isActive",
                type: "boolean",
                default: true,
            }),
            new TableColumn({
                name: "deletedAt",
                type: "timestamp with time zone",
                isNullable: true,
            }),
        ]);

        await queryRunner.createTable(new Table({
            name: "gdpr_consents",
            columns: [
                {
                    name: "id",
                    type: "uuid",
                    isPrimary: true,
                    generationStrategy: "uuid",
                    default: "uuid_generate_v4()",
                },
                {
                    name: "userId",
                    type: "uuid",
                },
                {
                    name: "version",
                    type: "varchar",
                    length: "50",
                },
                {
                    name: "consentedAt",
                    type: "timestamp with time zone",
                },
                {
                    name: "ipAddress",
                    type: "varchar",
                    length: "45",
                    isNullable: true,
                },
                {
                    name: "userAgent",
                    type: "text",
                    isNullable: true,
                },
                {
                    name: "createdAt",
                    type: "timestamp with time zone",
                    default: "now()",
                }
            ]
        }), true);

        await queryRunner.createForeignKey("gdpr_consents", new TableForeignKey({
            columnNames: ["userId"],
            referencedColumnNames: ["id"],
            referencedTableName: "users",
            onDelete: "CASCADE",
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable("gdpr_consents");
        const foreignKey = table?.foreignKeys.find(fk => fk.columnNames.indexOf("userId") !== -1);
        if (foreignKey) {
            await queryRunner.dropForeignKey("gdpr_consents", foreignKey);
        }
        await queryRunner.dropTable("gdpr_consents");

        await queryRunner.dropColumns("users", [
            "consentGdpr",
            "consentGdprAt",
            "consentGdprVersion",
            "isActive",
            "deletedAt"
        ]);
    }
}
