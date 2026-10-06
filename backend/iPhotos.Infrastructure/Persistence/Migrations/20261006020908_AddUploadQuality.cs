using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace iPhotos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddUploadQuality : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "upload_quality",
                table: "users",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "storageSaver");

            migrationBuilder.AddColumn<string>(
                name: "stored_quality",
                table: "photos",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "original");

            // Preserve the pre-choice behavior per plan: free users were always
            // storage-compressed, paid users always kept the original bytes.
            migrationBuilder.Sql("""
                UPDATE users SET upload_quality = CASE WHEN plan = 'free' THEN 'storageSaver' ELSE 'original' END
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "upload_quality",
                table: "users");

            migrationBuilder.DropColumn(
                name: "stored_quality",
                table: "photos");
        }
    }
}
