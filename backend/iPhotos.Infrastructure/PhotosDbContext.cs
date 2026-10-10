using iPhotos.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Pgvector;

namespace iPhotos.Infrastructure;

public sealed class PhotosDbContext(DbContextOptions<PhotosDbContext> options) : DbContext(options)
{
    /// <summary>float[] ↔ pgvector conversion: keeps the Pgvector dependency out of Domain.</summary>
    private static readonly ValueConverter<float[], Vector> EmbeddingConverter = new(
        embedding => new Vector(embedding),
        vector => vector.ToArray());

    private static readonly ValueConverter<float[], Vector?> NullableEmbeddingConverter = new(
        embedding => new Vector(embedding),
        vector => vector!.ToArray());

    /// <summary>Element-wise snapshot/compare so EF change tracking sees embedding edits.</summary>
    private static readonly ValueComparer<float[]> EmbeddingComparer = new(
        (left, right) => left == right || (left != null && right != null && left.SequenceEqual(right)),
        value => value == null
            ? 0
            : (value.Length * 397) ^ (value.Length == 0 ? 0 : BitConverter.SingleToInt32Bits(value[0])),
        value => value == null ? null : value.ToArray());

    public DbSet<User> Users => Set<User>();

    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    public DbSet<Photo> Photos => Set<Photo>();

    public DbSet<PhotoVariant> PhotoVariants => Set<PhotoVariant>();

    public DbSet<VariantJob> VariantJobs => Set<VariantJob>();

    public DbSet<ZipImportJob> ZipImportJobs => Set<ZipImportJob>();

    public DbSet<BillingPurchase> BillingPurchases => Set<BillingPurchase>();

    public DbSet<Person> Persons => Set<Person>();

    public DbSet<PhotoFace> PhotoFaces => Set<PhotoFace>();

    public DbSet<PhotoLabel> PhotoLabels => Set<PhotoLabel>();

    public DbSet<MlJob> MlJobs => Set<MlJob>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Face embeddings live in pgvector columns (D22); this emits CREATE EXTENSION
        // in the migration and is a no-op when the extension already exists.
        modelBuilder.HasPostgresExtension("vector");

        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(u => u.Id);
            entity.Property(u => u.Email).HasMaxLength(320).IsRequired();
            entity.HasIndex(u => u.Email).IsUnique();
            entity.Property(u => u.DisplayName).HasMaxLength(200);
            entity.Property(u => u.PasswordHash).IsRequired();
            entity.Property(u => u.Plan).HasMaxLength(50).IsRequired();
            entity.Property(u => u.UploadQuality).HasMaxLength(20).IsRequired();
            entity.Property(u => u.KdfParams).HasColumnType("jsonb");
        });

        modelBuilder.Entity<RefreshToken>(entity =>
        {
            entity.ToTable("refresh_tokens");
            entity.HasKey(t => t.Id);
            entity.Property(t => t.TokenHash).HasMaxLength(64).IsRequired();
            entity.HasIndex(t => t.TokenHash).IsUnique();
            entity.HasOne<User>()
                .WithMany()
                .HasForeignKey(t => t.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Photo>(entity =>
        {
            entity.ToTable("photos");
            entity.HasKey(p => p.Id);
            entity.Property(p => p.ContentHash).HasMaxLength(64).IsRequired();
            entity.Property(p => p.FileName).HasMaxLength(512).IsRequired();
            entity.Property(p => p.MimeType).HasMaxLength(100).IsRequired();
            entity.Property(p => p.MediaType).HasConversion<string>().HasMaxLength(20).IsRequired();
            entity.Property(p => p.CameraMake).HasMaxLength(100);
            entity.Property(p => p.CameraModel).HasMaxLength(200);
            entity.Property(p => p.Title).HasMaxLength(500);
            entity.Property(p => p.Description).HasMaxLength(2000);
            entity.Property(p => p.State).HasConversion<string>().HasMaxLength(20);
            entity.Property(p => p.LastError).HasMaxLength(2000);
            entity.Property(p => p.StoredQuality).HasMaxLength(20).IsRequired();

            // Dedup: same content for the same owner is stored once.
            entity.HasIndex(p => new { p.OwnerId, p.ContentHash }).IsUnique();
            // Timeline listing.
            entity.HasIndex(p => new { p.OwnerId, p.TakenAt });
            // File name search.
            entity.HasIndex(p => new { p.OwnerId, p.FileName });

            entity.HasOne<User>()
                .WithMany()
                .HasForeignKey(p => p.OwnerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PhotoVariant>(entity =>
        {
            entity.ToTable("photo_variants");
            entity.HasKey(v => v.Id);
            entity.Property(v => v.BlobPath).HasMaxLength(1024).IsRequired();
            entity.Property(v => v.Format).HasMaxLength(20).IsRequired();
            entity.Property(v => v.Kind).HasConversion<string>().HasMaxLength(20);
            entity.HasIndex(v => new { v.PhotoId, v.Kind }).IsUnique();

            entity.HasOne<Photo>()
                .WithMany()
                .HasForeignKey(v => v.PhotoId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<VariantJob>(entity =>
        {
            entity.ToTable("variant_jobs");
            entity.HasKey(j => j.Id);
            entity.Property(j => j.State).HasConversion<string>().HasMaxLength(20);
            entity.Property(j => j.LastError).HasMaxLength(2000);
            // Worker polling: oldest queued first.
            entity.HasIndex(j => new { j.State, j.CreatedAt });

            entity.HasOne<Photo>()
                .WithMany()
                .HasForeignKey(j => j.PhotoId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ZipImportJob>(entity =>
        {
            entity.ToTable("zip_import_jobs");
            entity.HasKey(j => j.Id);
            entity.Property(j => j.FileName).HasMaxLength(512).IsRequired();
            entity.Property(j => j.BlobPath).HasMaxLength(1024).IsRequired();
            entity.Property(j => j.State).HasConversion<string>().HasMaxLength(20);
            entity.Property(j => j.LastError).HasMaxLength(2000);
            // Worker polling: oldest queued first.
            entity.HasIndex(j => new { j.State, j.CreatedAt });

            entity.HasOne<User>()
                .WithMany()
                .HasForeignKey(j => j.OwnerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<BillingPurchase>(entity =>
        {
            entity.ToTable("billing_purchases");
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Provider).HasMaxLength(50).IsRequired();
            entity.Property(p => p.ProductId).HasMaxLength(200).IsRequired();
            entity.Property(p => p.PurchaseToken).HasMaxLength(512).IsRequired();
            entity.Property(p => p.State).HasConversion<string>().HasMaxLength(20);
            // One row per store purchase token (idempotent verification).
            entity.HasIndex(p => p.PurchaseToken).IsUnique();
            entity.HasIndex(p => new { p.UserId, p.State });

            entity.HasOne<User>()
                .WithMany()
                .HasForeignKey(p => p.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ── People & labels (doc 18) ────────────────────────────────────────

        modelBuilder.Entity<Person>(entity =>
        {
            entity.ToTable("persons");
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Name).HasMaxLength(Person.MaxNameLength);
            // Face embeddings/centroids: pgvector columns (D22). float[] ↔ Vector
            // conversion keeps pgvector out of the Domain project.
            entity.Property(p => p.Centroid).HasColumnType("vector(512)")
                .HasConversion(NullableEmbeddingConverter, EmbeddingComparer);
            entity.HasIndex(p => new { p.OwnerId, p.FaceCount });

            entity.HasOne<User>()
                .WithMany()
                .HasForeignKey(p => p.OwnerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PhotoFace>(entity =>
        {
            entity.ToTable("photo_faces");
            entity.HasKey(f => f.Id);
            entity.Property(f => f.Model).HasMaxLength(100).IsRequired();
            entity.Property(f => f.Embedding).HasColumnType("vector(512)").IsRequired()
                .HasConversion(EmbeddingConverter, EmbeddingComparer);
            entity.Property(f => f.CropBlobPath).HasMaxLength(1024).IsRequired();
            entity.HasIndex(f => f.PhotoId);
            entity.HasIndex(f => f.PersonId);
            entity.HasIndex(f => new { f.OwnerId, f.Model });

            entity.HasOne<Photo>()
                .WithMany()
                .HasForeignKey(f => f.PhotoId)
                .OnDelete(DeleteBehavior.Cascade);

            // Cluster membership follows the person's lifecycle (person deletion
            // unassigns faces instead of deleting them).
            entity.HasOne<Person>()
                .WithMany()
                .HasForeignKey(f => f.PersonId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<PhotoLabel>(entity =>
        {
            entity.ToTable("photo_labels");
            entity.HasKey(l => new { l.PhotoId, l.Label });
            entity.Property(l => l.Label).HasMaxLength(PhotoLabel.MaxLabelLength).IsRequired();
            entity.Property(l => l.Model).HasMaxLength(100).IsRequired();
            entity.HasIndex(l => new { l.OwnerId, l.Label });

            entity.HasOne<Photo>()
                .WithMany()
                .HasForeignKey(l => l.PhotoId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<MlJob>(entity =>
        {
            entity.ToTable("ml_jobs");
            entity.HasKey(j => j.Id);
            entity.Property(j => j.Kind).HasConversion<string>().HasMaxLength(20);
            entity.Property(j => j.State).HasConversion<string>().HasMaxLength(20);
            entity.Property(j => j.LastError).HasMaxLength(2000);
            // Worker polling: oldest queued first.
            entity.HasIndex(j => new { j.State, j.CreatedAt });

            entity.HasOne<Photo>()
                .WithMany()
                .HasForeignKey(j => j.PhotoId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
