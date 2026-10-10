using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Pgvector;

#nullable disable

namespace iPhotos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPeopleAndFaces : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:vector", ",,");

            migrationBuilder.CreateTable(
                name: "ml_jobs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    owner_id = table.Column<Guid>(type: "uuid", nullable: false),
                    photo_id = table.Column<Guid>(type: "uuid", nullable: true),
                    kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    state = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    max_attempts = table.Column<int>(type: "integer", nullable: false),
                    last_error = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    processed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_ml_jobs", x => x.id);
                    table.ForeignKey(
                        name: "fk_ml_jobs_photos_photo_id",
                        column: x => x.photo_id,
                        principalTable: "photos",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "persons",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    owner_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    cover_face_id = table.Column<Guid>(type: "uuid", nullable: true),
                    face_count = table.Column<int>(type: "integer", nullable: false),
                    centroid = table.Column<Vector>(type: "vector(512)", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_persons", x => x.id);
                    table.ForeignKey(
                        name: "fk_persons_users_owner_id",
                        column: x => x.owner_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "photo_labels",
                columns: table => new
                {
                    photo_id = table.Column<Guid>(type: "uuid", nullable: false),
                    label = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    owner_id = table.Column<Guid>(type: "uuid", nullable: false),
                    score = table.Column<float>(type: "real", nullable: false),
                    model = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_photo_labels", x => new { x.photo_id, x.label });
                    table.ForeignKey(
                        name: "fk_photo_labels_photos_photo_id",
                        column: x => x.photo_id,
                        principalTable: "photos",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "photo_faces",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    photo_id = table.Column<Guid>(type: "uuid", nullable: false),
                    owner_id = table.Column<Guid>(type: "uuid", nullable: false),
                    person_id = table.Column<Guid>(type: "uuid", nullable: true),
                    model = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    bbox_x = table.Column<float>(type: "real", nullable: false),
                    bbox_y = table.Column<float>(type: "real", nullable: false),
                    bbox_w = table.Column<float>(type: "real", nullable: false),
                    bbox_h = table.Column<float>(type: "real", nullable: false),
                    det_score = table.Column<float>(type: "real", nullable: false),
                    embedding = table.Column<Vector>(type: "vector(512)", nullable: false),
                    crop_blob_path = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_photo_faces", x => x.id);
                    table.ForeignKey(
                        name: "fk_photo_faces_persons_person_id",
                        column: x => x.person_id,
                        principalTable: "persons",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_photo_faces_photos_photo_id",
                        column: x => x.photo_id,
                        principalTable: "photos",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_ml_jobs_photo_id",
                table: "ml_jobs",
                column: "photo_id");

            migrationBuilder.CreateIndex(
                name: "ix_ml_jobs_state_created_at",
                table: "ml_jobs",
                columns: new[] { "state", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_persons_owner_id_face_count",
                table: "persons",
                columns: new[] { "owner_id", "face_count" });

            migrationBuilder.CreateIndex(
                name: "ix_photo_faces_owner_id_model",
                table: "photo_faces",
                columns: new[] { "owner_id", "model" });

            migrationBuilder.CreateIndex(
                name: "ix_photo_faces_person_id",
                table: "photo_faces",
                column: "person_id");

            migrationBuilder.CreateIndex(
                name: "ix_photo_faces_photo_id",
                table: "photo_faces",
                column: "photo_id");

            migrationBuilder.CreateIndex(
                name: "ix_photo_labels_owner_id_label",
                table: "photo_labels",
                columns: new[] { "owner_id", "label" });

            // Domain-level integrity the EF model can't express (doc 18 §5.1).
            // Values match the EF string conversions (MlJobKind/MlJobState enums).
            migrationBuilder.Sql("""
                ALTER TABLE ml_jobs ADD CONSTRAINT ml_jobs_kind_check CHECK (kind IN ('Faces','Labels','Cluster'));
                ALTER TABLE ml_jobs ADD CONSTRAINT ml_jobs_state_check CHECK (state IN ('Queued','Processing','Done','Failed'));

                -- Queue wake-ups for the AI workers: same channel and function the variant
                -- and zip-import triggers use (migration AddPhotoMetadataAndQueueNotifications).
                DROP TRIGGER IF EXISTS trg_ml_jobs_queued ON ml_jobs;
                CREATE TRIGGER trg_ml_jobs_queued
                    AFTER INSERT ON ml_jobs
                    FOR EACH STATEMENT EXECUTE FUNCTION iphotos_notify_jobs_queued();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TRIGGER IF EXISTS trg_ml_jobs_queued ON ml_jobs;
                ALTER TABLE ml_jobs DROP CONSTRAINT IF EXISTS ml_jobs_kind_check;
                ALTER TABLE ml_jobs DROP CONSTRAINT IF EXISTS ml_jobs_state_check;
                """);

            migrationBuilder.DropTable(
                name: "ml_jobs");

            migrationBuilder.DropTable(
                name: "photo_faces");

            migrationBuilder.DropTable(
                name: "photo_labels");

            migrationBuilder.DropTable(
                name: "persons");

            migrationBuilder.AlterDatabase()
                .OldAnnotation("Npgsql:PostgresExtension:vector", ",,");
        }
    }
}
