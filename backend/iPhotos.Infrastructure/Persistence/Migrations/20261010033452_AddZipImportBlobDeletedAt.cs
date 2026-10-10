using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace iPhotos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddZipImportBlobDeletedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "blob_deleted_at",
                table: "zip_import_jobs",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "blob_deleted_at",
                table: "zip_import_jobs");
        }
    }
}
