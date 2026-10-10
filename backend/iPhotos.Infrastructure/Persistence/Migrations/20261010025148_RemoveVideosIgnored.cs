using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace iPhotos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemoveVideosIgnored : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "videos_ignored",
                table: "zip_import_jobs");

            migrationBuilder.AddColumn<bool>(
                name: "is_live",
                table: "photos",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "is_live",
                table: "photos");

            migrationBuilder.AddColumn<int>(
                name: "videos_ignored",
                table: "zip_import_jobs",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }
    }
}
