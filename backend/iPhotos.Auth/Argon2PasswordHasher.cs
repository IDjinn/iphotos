using System.Security.Cryptography;
using System.Text;
using iPhotos.Application.Abstractions;
using Isopoh.Cryptography.Argon2;

namespace iPhotos.Auth;

/// <summary>
/// Argon2id password hashing with self-describing PHC strings:
/// $argon2id$v=19$m={memory},t={time},p={lanes}${saltB64}${digestB64}
/// </summary>
public sealed class Argon2PasswordHasher(Argon2HasherOptions options) : IPasswordHasher
{
    private const int SaltSizeBytes = 16;
    private const int HashSizeBytes = 32;

    public string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSizeBytes);
        var digest = Compute(password, salt, options.TimeCost, options.MemoryCost, options.Lanes);

        return $"$argon2id$v=19$m={options.MemoryCost},t={options.TimeCost},p={options.Lanes}$"
            + ToUnpaddedBase64(salt)
            + "$"
            + ToUnpaddedBase64(digest);
    }

    public bool Verify(string password, string hash)
    {
        var parts = hash.Split('$', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 5 || parts[0] != "argon2id" || parts[1] != "v=19")
        {
            return false;
        }

        var parameters = parts[2].Split(',');
        if (parameters.Length != 3
            || !parameters[0].TryStartsWithNumber("m=", out var memory)
            || !parameters[1].TryStartsWithNumber("t=", out var time)
            || !parameters[2].TryStartsWithNumber("p=", out var lanes))
        {
            return false;
        }

        byte[] salt;
        byte[] expected;
        try
        {
            salt = FromUnpaddedBase64(parts[3]);
            expected = FromUnpaddedBase64(parts[4]);
        }
        catch (FormatException)
        {
            return false;
        }

        if (salt.Length == 0 || expected.Length == 0)
        {
            return false;
        }

        var actual = Compute(password, salt, time, memory, lanes);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }

    private static byte[] Compute(string password, byte[] salt, int timeCost, int memoryCost, int lanes)
    {
        var config = new Argon2Config
        {
            Type = Argon2Type.DataIndependentAddressing,
            Version = Argon2Version.Nineteen,
            TimeCost = timeCost,
            MemoryCost = memoryCost,
            Lanes = lanes,
            Threads = Math.Max(1, lanes / 2),
            Password = Encoding.UTF8.GetBytes(password),
            Salt = salt,
            HashLength = HashSizeBytes,
        };

        using var argon2 = new Argon2(config);
        using var secureHash = argon2.Hash();
        return (byte[])secureHash.Buffer.Clone();
    }

    private static string ToUnpaddedBase64(byte[] data) =>
        Convert.ToBase64String(data).TrimEnd('=');

    private static byte[] FromUnpaddedBase64(string value) =>
        Convert.FromBase64String(value.PadRight(value.Length + ((4 - value.Length % 4) % 4), '='));
}

internal static class Argon2ParameterParser
{
    public static bool TryStartsWithNumber(this string value, string prefix, out int number)
    {
        number = 0;
        return value.StartsWith(prefix, StringComparison.Ordinal)
            && int.TryParse(value[prefix.Length..], out number);
    }
}
