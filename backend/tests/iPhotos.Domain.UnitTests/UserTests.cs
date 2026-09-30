using iPhotos.Domain;

namespace iPhotos.Domain.UnitTests;

public class UserTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Create_NormalizesEmailToLowercase()
    {
        var user = User.Create("Lucas@Example.COM", "hash", "Lucas", 15_000_000_000L, Now);

        user.Email.ShouldBe("lucas@example.com");
    }

    [Fact]
    public void Create_SetsIdentityPlanAndTimestamps()
    {
        var user = User.Create("lucas@example.com", "hash", "Lucas", 15_000_000_000L, Now);

        user.Id.ShouldNotBe(Guid.Empty);
        user.PasswordHash.ShouldBe("hash");
        user.DisplayName.ShouldBe("Lucas");
        user.Plan.ShouldBe("free");
        user.StorageQuotaBytes.ShouldBe(15_000_000_000L);
        user.CreatedAt.ShouldBe(Now);
        user.UpdatedAt.ShouldBe(Now);
    }

    [Fact]
    public void Create_RejectsInvalidEmail()
    {
        Should.Throw<ArgumentException>(() => User.Create("not-an-email", "hash", null, 1, Now));
        Should.Throw<ArgumentException>(() => User.Create("", "hash", null, 1, Now));
        Should.Throw<ArgumentException>(() => User.Create("  ", "hash", null, 1, Now));
    }

    [Fact]
    public void E2EFields_AreNullByDefault()
    {
        var user = User.Create("lucas@example.com", "hash", null, 1, Now);

        user.WrappedMasterKey.ShouldBeNull();
        user.KdfSalt.ShouldBeNull();
        user.KdfParams.ShouldBeNull();
    }
}
