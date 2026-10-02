using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace iPhotos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddZipImportJobs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "zip_import_jobs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    owner_id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_name = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    size_bytes = table.Column<long>(type: "bigint", nullable: false),
                    blob_path = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: false),
                    state = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    max_attempts = table.Column<int>(type: "integer", nullable: false),
                    last_error = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    total_entries = table.Column<int>(type: "integer", nullable: false),
                    processed_entries = table.Column<int>(type: "integer", nullable: false),
                    imported = table.Column<int>(type: "integer", nullable: false),
                    duplicated = table.Column<int>(type: "integer", nullable: false),
                    ignored = table.Column<int>(type: "integer", nullable: false),
                    failed = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    processed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_zip_import_jobs", x => x.id);
                    table.ForeignKey(
                        name: "fk_zip_import_jobs_users_owner_id",
                        column: x => x.owner_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_zip_import_jobs_owner_id",
                table: "zip_import_jobs",
                column: "owner_id");

            migrationBuilder.CreateIndex(
                name: "ix_zip_import_jobs_state_created_at",
                table: "zip_import_jobs",
                columns: new[] { "state", "created_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "zip_import_jobs");
        }
    }
}
