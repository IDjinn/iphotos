using iPhotos.Storage;

namespace iPhotos.Storage.UnitTests;

public class PrivateNetworkGuardTests
{
    private const bool PrivateAllowed = true;
    private const bool PrivateBlocked = false;

    [Theory]
    [InlineData("ftp://example.com/file")]
    [InlineData("file:///etc/passwd")]
    [InlineData("not a url")]
    public void Validate_NonHttpScheme_Throws(string url)
    {
        Should.ThrowAsync<BlockedNetworkException>(() =>
            PrivateNetworkGuard.ValidateAsync(url, PrivateAllowed));
    }

    [Fact]
    public async Task Validate_PrivateAllowed_ReturnsUriEvenForLoopback()
    {
        var uri = await PrivateNetworkGuard.ValidateAsync("http://localhost:9000", PrivateAllowed);

        uri.Host.ShouldBe("localhost");
    }

    [Fact]
    public async Task Validate_LoopbackLiteral_BlockedWhenPrivateDisallowed()
    {
        await Should.ThrowAsync<BlockedNetworkException>(() =>
            PrivateNetworkGuard.ValidateAsync("http://127.0.0.1:9000", PrivateBlocked));
    }

    [Theory]
    [InlineData("http://10.1.2.3")]
    [InlineData("http://192.168.0.10")]
    [InlineData("http://172.16.5.4")]
    [InlineData("http://169.254.169.254")] // cloud metadata endpoint
    [InlineData("http://100.64.0.1")] // CGNAT
    [InlineData("http://0.0.0.0")]
    [InlineData("http://[::1]")]
    [InlineData("http://[fe80::1]")]
    [InlineData("http://[fd00::1]")]
    public async Task Validate_ReservedAddressLiteral_Blocked(string url)
    {
        await Should.ThrowAsync<BlockedNetworkException>(() =>
            PrivateNetworkGuard.ValidateAsync(url, PrivateBlocked));
    }

    [Theory]
    [InlineData("https://93.184.216.34")] // literal public IP — no DNS, hermetic
    [InlineData("https://1.1.1.1")]
    [InlineData("https://8.8.8.8/dns-query")]
    public async Task Validate_PublicAddressLiteral_Passes(string url)
    {
        var uri = await PrivateNetworkGuard.ValidateAsync(url, PrivateBlocked);

        uri.Scheme.ShouldBeOneOf("http", "https");
    }

    [Fact]
    public async Task Validate_PublicHostnameWithPrivateCheckDisabled_Passes()
    {
        var uri = await PrivateNetworkGuard.ValidateAsync("https://wasabi.eu-central-1.wasabisys.com", PrivateAllowed);

        uri.Scheme.ShouldBe("https");
    }

    [Fact]
    public async Task Validate_UnresolvableHost_Throws()
    {
        await Should.ThrowAsync<BlockedNetworkException>(() =>
            PrivateNetworkGuard.ValidateAsync("http://iphotos-does-not-exist.invalid", PrivateBlocked));
    }

    [Fact]
    public async Task Validate_PrivateHostnameResolution_Blocked()
    {
        // 'localhost' resolves to loopback even though the literal is a hostname.
        await Should.ThrowAsync<BlockedNetworkException>(() =>
            PrivateNetworkGuard.ValidateAsync("http://localhost", PrivateBlocked));
    }
}
