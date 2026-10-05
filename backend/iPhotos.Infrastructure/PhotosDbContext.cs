using iPhotos.Domain;
using Microsoft.EntityFrameworkCore;

namespace iPhotos.Infrastructure;

public sealed class PhotosDbContext(DbContextOptions<PhotosDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();

    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    public DbSet<Photo> Photos => Set<Photo>();

    public DbSet<PhotoVariant> PhotoVariants => Set<PhotoVariant>();

    public DbSet<VariantJob> VariantJobs => Set<VariantJob>();

    public DbSet<ZipImportJob> ZipImportJobs => Set<ZipImportJob>();

    public DbSet<BillingPurchase> BillingPurchases => Set<BillingPurchase>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(u => u.Id);
            entity.Property(u => u.Email).HasMaxLength(320).IsRequired();
            entity.HasIndex(u => u.Email).IsUnique();
            entity.Property(u => u.DisplayName).HasMaxLength(200);
            entity.Property(u => u.PasswordHash).IsRequired();
            entity.Property(u => u.Plan).HasMaxLength(50).IsRequired();
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
    }
}
