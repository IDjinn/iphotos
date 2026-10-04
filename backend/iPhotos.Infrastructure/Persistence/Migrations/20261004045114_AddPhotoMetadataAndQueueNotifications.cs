using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace iPhotos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPhotoMetadataAndQueueNotifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "videos_ignored",
                table: "zip_import_jobs",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "description",
                table: "photos",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "title",
                table: "photos",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            // Queue wake-ups: the workers LISTEN on this channel instead of busy-polling.
            // Statement-scoped so a batch insert produces a single notification, and
            // idempotent so a re-run of the migration (or a re-created database) is safe.
            migrationBuilder.Sql("""
                CREATE OR REPLACE FUNCTION iphotos_notify_jobs_queued() RETURNS trigger AS $$
                BEGIN
                    PERFORM pg_notify('iphotos_jobs_queued', TG_TABLE_NAME);
                    RETURN NULL;
                END;
                $$ LANGUAGE plpgsql;

                DROP TRIGGER IF EXISTS trg_variant_jobs_queued ON variant_jobs;
                CREATE TRIGGER trg_variant_jobs_queued
                    AFTER INSERT ON variant_jobs
                    FOR EACH STATEMENT EXECUTE FUNCTION iphotos_notify_jobs_queued();

                DROP TRIGGER IF EXISTS trg_zip_import_jobs_queued ON zip_import_jobs;
                CREATE TRIGGER trg_zip_import_jobs_queued
                    AFTER INSERT ON zip_import_jobs
                    FOR EACH STATEMENT EXECUTE FUNCTION iphotos_notify_jobs_queued();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TRIGGER IF EXISTS trg_variant_jobs_queued ON variant_jobs;
                DROP TRIGGER IF EXISTS trg_zip_import_jobs_queued ON zip_import_jobs;
                DROP FUNCTION IF EXISTS iphotos_notify_jobs_queued();
                """);

            migrationBuilder.DropColumn(
                name: "videos_ignored",
                table: "zip_import_jobs");

            migrationBuilder.DropColumn(
                name: "description",
                table: "photos");

            migrationBuilder.DropColumn(
                name: "title",
                table: "photos");
        }
    }
}
