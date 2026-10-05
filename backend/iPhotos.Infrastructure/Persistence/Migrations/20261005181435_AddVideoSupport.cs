using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace iPhotos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddVideoSupport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "videos_imported",
                table: "zip_import_jobs",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<double>(
                name: "duration_seconds",
                table: "photos",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "media_type",
                table: "photos",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "photo");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "videos_imported",
                table: "zip_import_jobs");

            migrationBuilder.DropColumn(
                name: "duration_seconds",
                table: "photos");

            migrationBuilder.DropColumn(
                name: "media_type",
                table: "photos");
        }
    }
}
