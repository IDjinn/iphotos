using System.Security.Cryptography;
using System.Text;

namespace iPhotos.Storage;

/// <summary>Constant-time comparison of the configured service API key.</summary>
public static class ApiKeyValidator
{
    public static bool IsValid(string? provided, string expected)
    {
        if (string.IsNullOrEmpty(provided) || string.IsNullOrEmpty(expected))
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(provided),
            Encoding.UTF8.GetBytes(expected));
    }
}
