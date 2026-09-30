namespace iPhotos.Auth;

public sealed class Argon2HasherOptions
{
    public const string SectionName = "Auth:Argon2";

    public int TimeCost { get; set; } = 3;

    /// <summary>KiB of memory used per hash.</summary>
    public int MemoryCost { get; set; } = 65_536;

    public int Lanes { get; set; } = 4;
}
