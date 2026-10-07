namespace iPhotos.Storage.Host;

/// <summary>Stable machine-readable codes for the storage host error contract.</summary>
public static class StorageErrorCodes
{
    public const string InvalidKey = "storage.invalid_key";
    public const string ObjectNotFound = "storage.object_not_found";
    public const string ProviderNotConfigured = "storage.provider_not_configured";
    public const string NetworkBlocked = "storage.network_blocked";
    public const string ProviderError = "storage.provider_error";
    public const string ApiKeyMissing = "storage.api_key_missing";
    public const string PresignUnsupported = "storage.presign_unsupported";
    public const string KeyRequired = "storage.key_required";
    public const string InvalidPartRequest = "storage.invalid_part_request";
    public const string InvalidCompleteRequest = "storage.invalid_complete_request";
    public const string Internal = "internal.error";
}
