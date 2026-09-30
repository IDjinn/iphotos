namespace iPhotos.Application.Abstractions;

public interface IPasswordHasher
{
    /// <summary>Hashes a password into a self-describing PHC string.</summary>
    string Hash(string password);

    bool Verify(string password, string hash);
}
