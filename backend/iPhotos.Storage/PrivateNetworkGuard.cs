using System.Net;
using System.Net.Sockets;

namespace iPhotos.Storage;

/// <summary>An outbound URL points at a forbidden network (SSRF protection).</summary>
public sealed class BlockedNetworkException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>
/// Validates outbound URLs before the service issues requests: http/https only, and the
/// resolved host must not be loopback, private, link-local or otherwise reserved — unless
/// explicitly allowed for on-prem deployments (MinIO, in-network WebDAV, docker compose).
/// </summary>
public static class PrivateNetworkGuard
{
    public static async Task<Uri> ValidateAsync(
        string url,
        bool allowPrivate,
        CancellationToken cancellationToken = default)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https"))
        {
            throw new BlockedNetworkException($"URL '{url}' must use http or https.");
        }

        if (allowPrivate)
        {
            return uri;
        }

        var host = uri.Host;
        if (host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
            || host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase))
        {
            throw new BlockedNetworkException($"Host '{host}' is loopback and not allowed.");
        }

        if (IPAddress.TryParse(host, out var literal))
        {
            Check(literal);
            return uri;
        }

        IPAddress[] addresses;
        try
        {
            addresses = await Dns.GetHostAddressesAsync(host, cancellationToken);
        }
        catch (SocketException e)
        {
            throw new BlockedNetworkException($"Host '{host}' could not be resolved.", e);
        }

        if (addresses.Length == 0)
        {
            throw new BlockedNetworkException($"Host '{host}' could not be resolved.");
        }

        foreach (var address in addresses)
        {
            Check(address);
        }

        return uri;
    }

    private static void Check(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }

        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            var b = address.GetAddressBytes();
            var blocked =
                b[0] == 0                                  // 0.0.0.0/8 "this network"
                || b[0] == 10                              // 10.0.0.0/8
                || (b[0] == 100 && (b[1] & 0xC0) == 64)   // 100.64.0.0/10 CGNAT
                || b[0] == 127                             // 127.0.0.0/8 loopback
                || (b[0] == 169 && b[1] == 254)            // 169.254.0.0/16 link-local (incl. cloud metadata)
                || (b[0] == 172 && (b[1] & 0xF0) == 16)    // 172.16.0.0/12
                || (b[0] == 192 && b[1] == 168)            // 192.168.0.0/16
                || (b[0] == 192 && b[1] == 0 && b[2] == 0) // 192.0.0.0/24
                || (b[0] == 192 && b[1] == 0 && b[2] == 2) // 192.0.2.0/24 TEST-NET-1
                || (b[0] == 198 && (b[1] & 0xFE) == 18)    // 198.18.0.0/15 benchmark
                || b[0] >= 224;                            // multicast 224/4 + reserved 240/4
            if (blocked)
            {
                throw new BlockedNetworkException($"Address {address} is private or reserved and not allowed.");
            }
        }
        else if (address.AddressFamily == AddressFamily.InterNetworkV6)
        {
            var b = address.GetAddressBytes();
            var blocked =
                IPAddress.IsLoopback(address)
                || address.IsIPv6LinkLocal
                || address.IsIPv6SiteLocal
                || address.IsIPv6Multicast
                || (b[0] & 0xFE) == 0xFC                   // fc00::/7 unique local
                || (b[0] == 0x20 && b[1] == 0x01 && b[2] == 0x0D && b[3] == 0xB8) // 2001:db8::/32 documentation
                || b.All(x => x == 0);                     // ::
            if (blocked)
            {
                throw new BlockedNetworkException($"Address {address} is loopback, private or reserved and not allowed.");
            }
        }
    }
}
